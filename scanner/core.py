"""Private PDF verdict pipeline. No logging of paths, tokens, bytes or engine output."""
from __future__ import annotations
import hashlib
import hmac
import os
import re
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

PROJECT = 'gen-lang-client-0948635471'
BUCKET = PROJECT + '-mi-secure-bucket'
CALLER = 'mi-sin-cloud-test@' + PROJECT + '.iam.gserviceaccount.com'
REGION = 'northamerica-northeast1'
UUID = r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}'
OBJECT = re.compile(r'quarantine/' + UUID + '/' + UUID + r'\.pdf\Z')
MAX_BYTES = 10 * 1024 * 1024
FRESH_SECONDS = 86400

class Rejected(Exception):
    def __init__(self, category='invalid-file', status=422):
        super().__init__(category)
        self.category, self.status = category, status


def validate_request(body):
    if not isinstance(body, dict) or set(body) != {'bucket', 'object', 'generation', 'sha256'}:
        raise Rejected('invalid-request', 400)
    if (body['bucket'] != BUCKET or not isinstance(body['object'], str) or not OBJECT.fullmatch(body['object'])
            or not isinstance(body['generation'], str) or not re.fullmatch(r'[0-9]{1,30}', body['generation'])
            or int(body['generation']) < 1 or not isinstance(body['sha256'], str)
            or not re.fullmatch(r'[a-f0-9]{64}', body['sha256'])):
        raise Rejected('invalid-request', 400)
    return body


def run_tool(args, timeout, **kwargs):
    """Never a shell; never forward parser/AV output to a caller or log."""
    try:
        return subprocess.run(args, capture_output=True, timeout=timeout, check=False,
                              env={**os.environ, 'LC_ALL': 'C', 'TZ': 'UTC'}, **kwargs)
    except (subprocess.TimeoutExpired, OSError):
        raise Rejected('tool-unavailable', 503) from None


class ClamEngine:
    def __init__(self, database='/var/lib/clamav', runner=run_tool, clock=time.time):
        self.database, self.runner, self.clock = database, runner, clock

    def definitions(self):
        result = self.runner(['clamscan', '--version', '--database=' + self.database], 5)
        # This is the database build timestamp reported by the real engine, NOT mtime
        # or the time freshclam last contacted its mirror. Lock held across this and scan.
        value = result.stdout.decode('ascii', errors='replace').strip()
        match = re.fullmatch(r'ClamAV (1\.4\.[0-9]+)(?:[^/]*)/([0-9]+)/(.+)', value)
        # Vendor LTS maintenance ends 2027-08-15. Fail closed until a new
        # supported engine branch/image is reviewed, rather than running EOL AV.
        if result.returncode or not match or self.clock() >= 1818288000:
            raise Rejected('definitions-unavailable', 503)
        try:
            stamp = datetime.strptime(match[3], '%a %b %d %H:%M:%S %Y').replace(tzinfo=timezone.utc).timestamp()
        except ValueError:
            raise Rejected('definitions-unavailable', 503) from None
        if stamp > self.clock() or self.clock() - stamp >= FRESH_SECONDS:
            raise Rejected('definitions-stale', 503)
        # Require official full databases, not an empty/test-only signature set.
        for name in ['main', 'daily', 'bytecode']:
            if not any(Path(self.database, name + ext).is_file() for ext in ['.cvd', '.cld']):
                raise Rejected('definitions-unavailable', 503)
        return 'ClamAV ' + match[1], int(stamp * 1000)

    def scan(self, filename, remaining):
        result = self.runner(['clamscan', '--database=' + self.database,
            '--no-summary', '--infected', '--alert-exceeds-max=yes', '--alert-encrypted=yes',
            '--max-filesize=10M', '--max-scansize=40M', '--max-recursion=8', '--max-files=500',
            '--max-scantime=15000', str(filename)], min(25, remaining))
        if result.returncode == 1:
            raise Rejected('unsafe-file')
        if result.returncode != 0:
            raise Rejected('engine-unavailable', 503)


class GenerationReader:
    def __init__(self, client, kms_key):
        if not re.fullmatch(r'projects/' + PROJECT + r'/locations/' + REGION + r'/keyRings/[A-Za-z0-9_-]+/cryptoKeys/request-files', kms_key):
            raise ValueError('A dedicated Montreal request-files CMEK is required')
        self.client, self.kms_key = client, kms_key

    def download(self, request, target, remaining):
        # A numeric generation is pinned on BOTH metadata and media requests.
        blob = self.client.bucket(BUCKET).blob(request['object'], generation=int(request['generation']))
        blob.reload(timeout=min(10, remaining()), retry=None)
        if (str(blob.generation) != request['generation'] or blob.content_type != 'application/pdf'
                or not isinstance(blob.size, int) or not 5 <= blob.size <= MAX_BYTES
                or not (blob.kms_key_name or '').startswith(self.kms_key + '/cryptoKeyVersions/')):
            raise Rejected('object-mismatch')
        # Stream into a capped writer: never trust the metadata size alone.
        class Capped:
            def __init__(self, file): self.file, self.size = file, 0
            def write(self, chunk):
                remaining()
                self.size += len(chunk)
                if self.size > blob.size or self.size > MAX_BYTES: raise Rejected('object-too-large')
                return self.file.write(chunk)
            def __getattr__(self, name): return getattr(self.file, name)
        with open(target, 'wb') as stream:
            output = Capped(stream)
            blob.download_to_file(output, if_generation_match=int(request['generation']),
                                  checksum='crc32c', timeout=min(15, remaining()), retry=None)
            if output.size != blob.size: raise Rejected('object-mismatch')


class Pipeline:
    def __init__(self, reader, engine, parser=None, clock=time.time, monotonic=time.monotonic, workdir=None):
        self.reader, self.engine = reader, engine
        self.parser = parser or self.parse
        self.clock, self.monotonic, self.workdir = clock, monotonic, workdir

    def parse(self, filename, remaining):
        # Native parser isolation: separate bounded process, no credential files,
        # no shell, finite CPU/address-space/output, no automatic PDF repair.
        result = run_tool([os.sys.executable, '-I', str(Path(__file__).with_name('pdf_check.py')), str(filename)], min(10, remaining))
        if result.returncode != 0: raise Rejected('invalid-pdf')

    def scan(self, body, deadline_ms):
        request = validate_request(body)
        started = self.monotonic()
        if type(deadline_ms) is not int or not 0 < deadline_ms / 1000 - self.clock() <= 300:
            raise Rejected('lease-expired', 409)
        budget = min(45, deadline_ms / 1000 - self.clock() - 1)
        def remaining():
            seconds = min(budget - (self.monotonic() - started), deadline_ms / 1000 - self.clock() - 1)
            if seconds <= 0: raise Rejected('scan-timeout', 503)
            return seconds
        engine, definitions_at = self.engine.definitions()
        with tempfile.TemporaryDirectory(prefix='scan-', dir=self.workdir) as directory:
            os.chmod(directory, 0o700)
            filename = Path(directory, 'document.pdf')
            self.reader.download(request, filename, remaining)
            size = filename.stat().st_size
            if not 5 <= size <= MAX_BYTES: raise Rejected('object-too-large')
            digest = hashlib.sha256()
            with filename.open('rb') as stream:
                if stream.read(5) != b'%PDF-': raise Rejected('invalid-pdf')
                stream.seek(0)
                while block := stream.read(65536): digest.update(block); remaining()
            if not hmac.compare_digest(digest.hexdigest(), request['sha256']): raise Rejected('hash-mismatch')
            self.engine.scan(filename, remaining())
            self.parser(filename, remaining())
            # No update may occur between engine version, scan and this freshness recheck.
            after_engine, after_stamp = self.engine.definitions()
            remaining()
            if (engine, definitions_at) != (after_engine, after_stamp): raise Rejected('definitions-changed', 503)
            return {**request, 'clean': True, 'engine': engine, 'definitionsAt': definitions_at}
