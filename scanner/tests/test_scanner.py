import hashlib
import http.client
import io
import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pikepdf
from core import BUCKET, CALLER, PROJECT, Pipeline, ClamEngine, GenerationReader, Rejected, validate_request, run_tool
from service import State, app_for
from wsgiref.simple_server import make_server, WSGIRequestHandler
class QuietHandler(WSGIRequestHandler):
    def log_message(self, *args): pass

OBJECT = 'quarantine/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.pdf'
KEY = 'projects/' + PROJECT + '/locations/northamerica-northeast1/keyRings/portal/cryptoKeys/request-files'
NOW = 1800000000
EICAR = b'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'

def clean_pdf():
    pdf = pikepdf.new(); pdf.add_blank_page()
    stream = io.BytesIO(); pdf.save(stream)
    return stream.getvalue()

def body(data): return {'bucket': BUCKET, 'object': OBJECT, 'generation': '123', 'sha256': hashlib.sha256(data).hexdigest()}

class FakeReader:
    def __init__(self, data): self.data = data; self.path = None
    def download(self, request, target, remaining):
        remaining(); self.path = target; target.write_bytes(self.data)

class FixtureEngine:
    def __init__(self): self.reject = False; self.stale = False; self.calls = 0
    def definitions(self):
        if self.stale: raise Rejected('definitions-stale', 503)
        return 'ClamAV fixture', (NOW - 60) * 1000
    def scan(self, filename, remaining):
        self.calls += 1
        if self.reject or EICAR in filename.read_bytes(): raise Rejected('unsafe-file')

class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.data = clean_pdf(); self.reader = FakeReader(self.data); self.engine = FixtureEngine()
        self.pipeline = Pipeline(self.reader, self.engine, clock=lambda: NOW)
    def scan(self, request=None): return self.pipeline.scan(request or body(self.reader.data), (NOW + 60) * 1000)
    def test_clean_pdf_exact_contract_and_cleanup(self):
        result = self.scan()
        self.assertEqual(result, {**body(self.data), 'clean': True, 'engine': 'ClamAV fixture', 'definitionsAt': (NOW - 60) * 1000})
        self.assertFalse(self.reader.path.exists())
    def test_eicar_never_clean(self):
        self.reader.data = self.data + b'\n%' + EICAR
        with self.assertRaises(Rejected): self.scan()
        self.assertFalse(self.reader.path.exists())
    def test_malformed_header_and_structure(self):
        for data in [b'not a PDF', b'%PDF-1.7\nmalformed', self.data[:-40]]:
            self.reader.data = data
            with self.assertRaises(Rejected): self.scan()
    def test_hash_mismatch_never_scans(self):
        bad = body(self.data); bad['sha256'] = 'a' * 64
        with self.assertRaises(Rejected): self.scan(bad)
        self.assertEqual(self.engine.calls, 0)
    def test_expired_lease_and_stale_definitions(self):
        for deadline in [NOW * 1000, (NOW + 301) * 1000, '1800000000000']:
            with self.assertRaises(Rejected): self.pipeline.scan(body(self.data), deadline)
        self.engine.stale = True
        with self.assertRaises(Rejected): self.scan()
        self.assertIsNone(self.reader.path)
    def test_expiry_during_scan_and_tool_timeout(self):
        with patch('core.subprocess.run', side_effect=subprocess.TimeoutExpired('tool', 1)):
            with self.assertRaises(Rejected): run_tool(['fictional'], 1)
        with self.assertRaises(Rejected): run_tool([sys.executable, '-c', 'import time; time.sleep(1)'], 0.02)
        ticks = [0]
        self.pipeline.monotonic = lambda: ticks[0]
        self.engine.scan = lambda *args: ticks.__setitem__(0, 99)
        with self.assertRaises(Rejected): self.scan()
    def test_sensitive_active_features_encryption_and_attachments_rejected(self):
        for key in ['/OpenAction', '/AcroForm', '/EmbeddedFiles', '/JavaScript', '/AA', '/XFA']:
            pdf = pikepdf.new(); pdf.add_blank_page(); pdf.Root[key] = pikepdf.Dictionary()
            stream = io.BytesIO(); pdf.save(stream); self.reader.data = stream.getvalue()
            with self.assertRaises(Rejected): self.scan()
        pdf = pikepdf.new(); pdf.add_blank_page(); pdf.Root['/Fixture'] = pikepdf.Name('/RichMedia')
        stream = io.BytesIO(); pdf.save(stream); self.reader.data = stream.getvalue()
        with self.assertRaises(Rejected): self.scan()
        pdf = pikepdf.new(); pdf.add_blank_page(); stream = io.BytesIO()
        pdf.save(stream, encryption=pikepdf.Encryption(owner='fixture-only', user=''))
        self.reader.data = stream.getvalue()
        with self.assertRaises(Rejected): self.scan()
    def test_request_scope_no_emails_paths_other_buckets_or_extra_fields(self):
        for change in [{'bucket': 'unrelated-ai-app'}, {'object': '../document.pdf'}, {'generation': '0'}, {'generation': '124?x=1'}, {'sha256': 'bad'}, {'email': 'not-authority@example.org'}]:
            request = {**body(self.data), **change}
            with self.assertRaises(Rejected): validate_request(request)

class ReaderTests(unittest.TestCase):
    def test_generation_cmek_size_and_stream_limit(self):
        for failure in [None, 'generation', 'mime', 'kms', 'size', 'stream']:
            calls = []
            class Blob:
                generation = 123; content_type = 'application/pdf'; size = 20
                kms_key_name = KEY + '/cryptoKeyVersions/1'
                def reload(self, **kwargs): calls.append(('reload', kwargs))
                def download_to_file(self, stream, **kwargs):
                    calls.append(('download', kwargs)); stream.write(b'x' * (21 if failure == 'stream' else 20))
            blob = Blob()
            if failure == 'generation': blob.generation = 124
            if failure == 'mime': blob.content_type = 'image/png'
            if failure == 'kms': blob.kms_key_name = 'unrelated-key'
            if failure == 'size': blob.size = 11 * 1024 * 1024
            class Bucket:
                def blob(self, name, **kwargs):
                    self_case.assertEqual(name, OBJECT); self_case.assertEqual(kwargs, {'generation': 123}); return blob
            class Client:
                def bucket(self, name): self_case.assertEqual(name, BUCKET); return Bucket()
            self_case = self
            reader = GenerationReader(Client(), KEY)
            with tempfile.TemporaryDirectory() as directory:
                if failure:
                    with self.assertRaises(Rejected): reader.download(body(b'x'), Path(directory, 'doc'), lambda: 10)
                else:
                    reader.download(body(b'x'), Path(directory, 'doc'), lambda: 10)
                    self.assertEqual(calls[-1][1]['if_generation_match'], 123)
                    self.assertIsNone(calls[-1][1]['retry'])
        with self.assertRaises(ValueError): GenerationReader(None, KEY.replace('northamerica-northeast1', 'us-central1'))

class DefinitionsTests(unittest.TestCase):
    def test_engine_build_date_not_mtime_and_future_stale_unsupported_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            for name in ['main.cvd', 'daily.cld', 'bytecode.cvd']: Path(directory, name).touch()
            def version(date='Sun Jan 15 07:59:00 2027', engine='1.4.6'):
                return SimpleNamespace(returncode=0, stdout=f'ClamAV {engine}/28000/{date}\n'.encode())
            from datetime import datetime, timezone
            at = datetime(2027, 1, 15, 8, tzinfo=timezone.utc).timestamp()
            valid = version('Fri Jan 15 07:59:00 2027')
            engine = ClamEngine(directory, runner=lambda *args: valid, clock=lambda: at)
            self.assertEqual(engine.definitions()[1], int((at - 60) * 1000))
            for result in [version('Thu Jan 14 07:59:00 2027'), version('Sat Jan 16 07:59:00 2027'), version(engine='0.103.0'), SimpleNamespace(returncode=2, stdout=b'')]:
                engine.runner = lambda *args: result
                with self.assertRaises(Rejected): engine.definitions()
    def test_engine_infection_error_and_limit_exit_fail_closed(self):
        for code in [1, 2, -9]:
            engine = ClamEngine(runner=lambda *args: SimpleNamespace(returncode=code))
            with self.assertRaises(Rejected): engine.scan('fictional.pdf', 10)

class HttpTests(unittest.TestCase):
    def setUp(self):
        self.claims = {'email': CALLER, 'email_verified': True, 'sub': '123456789012345678901', 'iss': 'https://accounts.google.com', 'aud': 'https://fixture-nn.a.run.app'}
        self.engine = FixtureEngine(); self.reader = FakeReader(clean_pdf())
        self.state = State(Pipeline(self.reader, self.engine, clock=lambda: NOW), lambda *args: self.claims, self.claims['sub'], self.claims['aud'], self.engine)
        self.state.started = True
        self.server = make_server('127.0.0.1', 0, app_for(self.state), handler_class=QuietHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True); self.thread.start()
    def tearDown(self): self.server.shutdown(); self.server.server_close(); self.thread.join(2)
    def post(self, data=None, **headers):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        content = json.dumps(data if data is not None else body(self.reader.data))
        base = {'Authorization': 'Bearer fictional', 'Content-Type': 'application/json', 'X-MI-Scan-Deadline': str((NOW + 60) * 1000)}
        connection.request('POST', '/scan', content, {**base, **headers}); response = connection.getresponse()
        status, result = response.status, json.loads(response.read()); connection.close(); return status, result
    def test_clean_and_repeated_scan_contract(self):
        for _ in range(2):
            status, result = self.post(); self.assertEqual(status, 200); self.assertTrue(result['clean'])
    def test_wrong_caller_signature_or_claims_not_authorized(self):
        for field, value in [('email', 'contractor@gmail.com'), ('sub', '999999999999999999999'), ('aud', 'other-app'), ('email_verified', False), ('iss', 'untrusted')]:
            original = self.claims[field]; self.claims[field] = value
            self.assertEqual(self.post()[0], 403); self.claims[field] = original
        self.assertEqual(self.post(Authorization='')[0], 403)
        def invalid(*args): raise ValueError('invalid signature')
        self.state.verify = invalid; self.assertEqual(self.post()[0], 403)
    def test_busy_failure_expiry_invalid_and_unconfigured_fail_closed(self):
        self.state.lock.acquire()
        try: self.assertEqual(self.post()[0], 503)
        finally: self.state.lock.release()
        self.assertEqual(self.post(**{'X-MI-Scan-Deadline': str(NOW * 1000)})[0], 409)
        self.assertEqual(self.post({'bucket': BUCKET})[0], 400)
        def unavailable(*args): raise RuntimeError('fictional-private-content-never-logged')
        self.reader.download = unavailable
        self.assertEqual(self.post(), (503, {'error': 'scanner-unavailable'}))
        self.state.started = False; self.assertEqual(self.post()[0], 503)
        self.state.audience = 'UNCONFIGURED'; self.assertEqual(self.post()[0], 503)

class RealEngineTests(unittest.TestCase):
    def test_real_clamav_clean_and_eicar(self):
        if not shutil.which('clamscan'):
            if os.environ.get('MI_REQUIRE_CLAMAV') == '1': self.fail('Real ClamAV is mandatory in container CI')
            self.skipTest('ClamAV unavailable in this host; container CI requires it')
        with tempfile.TemporaryDirectory() as directory:
            # Isolated EICAR NDB smoke signature, NOT production vendor database proof.
            Path(directory, 'fixture.ndb').write_text('Eicar-Test-Fixture:0:*:' + EICAR.hex() + '\n')
            filename = Path(directory, 'document.pdf'); filename.write_bytes(clean_pdf())
            engine = ClamEngine(directory)
            engine.scan(filename, 25)
            filename.write_bytes(clean_pdf() + b'\n%' + EICAR)
            with self.assertRaises(Rejected): engine.scan(filename, 25)
    def test_vendor_database_and_eicar(self):
        if os.environ.get('MI_REQUIRE_VENDOR_DB') != '1': self.skipTest('Vendor definitions are required by the container smoke stage')
        engine = ClamEngine(os.environ.get('MI_TEST_VENDOR_DB', '/var/lib/clamav')); engine.definitions()
        with tempfile.TemporaryDirectory() as directory:
            filename = Path(directory, 'document.pdf'); filename.write_bytes(clean_pdf())
            engine.scan(filename, 25)
            filename.write_bytes(EICAR)  # Official standard fixture, not an uploaded PDF.
            with self.assertRaises(Rejected): engine.scan(filename, 25)


class ManifestTests(unittest.TestCase):
    def test_manifest_is_private_scoped_and_never_defaults_to_other_resources(self):
        from render_config import render
        data = {'image': 'northamerica-northeast1-docker.pkg.dev/' + PROJECT + '/mi-secure-bucket/pdf-scanner@sha256:' + 'a' * 64,
                'runtimeSubject': '123456789012345678901', 'filesKey': KEY, 'scannerOrigin': 'https://fixture-nn.a.run.app'}
        manifest = render(data)
        for expected in ["run.googleapis.com/ingress: all", "run.googleapis.com/invoker-iam-disabled: 'false'", 'containerConcurrency: 1', "maxScale: '1'", 'mi-bucket-scanner@' + PROJECT, 'request-files', 'timeoutSeconds: 60']:
            self.assertIn(expected, manifest)
        for key, value in [('image', data['image'].replace(PROJECT, 'unrelated')), ('filesKey', KEY.replace('request-files', 'text-keys')), ('scannerOrigin', 'https://public.example.org'), ('runtimeSubject', 'email@example.org')]:
            with self.assertRaises(ValueError): render({**data, key: value})

class GoogleSignatureTests(unittest.TestCase):
    def test_real_google_verifier_accepts_signature_and_rejects_tampering_and_expiry(self):
        from google.auth import crypt, jwt
        from google.oauth2 import id_token
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
        from datetime import datetime, timedelta, timezone
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'fictional-google-cert')])
        stamp = datetime.now(timezone.utc)
        cert = x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(1).not_valid_before(stamp - timedelta(minutes=1)).not_valid_after(stamp + timedelta(hours=1)).sign(key, hashes.SHA256())
        private = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        signer = crypt.RSASigner.from_string(private, key_id='fictional')
        response = SimpleNamespace(status=200, data=json.dumps({'fictional': cert.public_bytes(serialization.Encoding.PEM).decode()}).encode())
        verifier = lambda token, aud: id_token.verify_oauth2_token(token, lambda *args, **kwargs: response, audience=aud)
        claims = {'email': CALLER, 'email_verified': True, 'sub': '123456789012345678901', 'iss': 'https://accounts.google.com',
                  'aud': 'https://fixture-nn.a.run.app', 'iat': int(time.time()), 'exp': int(time.time()) + 600}
        state = State(None, verifier, claims['sub'], claims['aud'], None)
        token = jwt.encode(signer, claims).decode()
        state.authorize('Bearer ' + token)
        signature_start = token.rfind('.') + 1
        tampered = token[:signature_start] + ('A' if token[signature_start] != 'A' else 'B') + token[signature_start + 1:]
        with self.assertRaises(Rejected): state.authorize('Bearer ' + tampered)
        with self.assertRaises(Rejected): state.authorize('Bearer ' + jwt.encode(signer, {**claims, 'exp': claims['iat'] - 600}).decode())
        with self.assertRaises(Rejected): state.authorize('Bearer ' + jwt.encode(signer, {**claims, 'aud': 'wrong'}).decode())

if __name__ == '__main__': unittest.main()
