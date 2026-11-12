"""IAM-protected Cloud Run HTTP service. Only the pinned portal SA is accepted."""
import json
import os
import re
import threading
import shutil
from pathlib import Path
import time
from core import Pipeline, ClamEngine, GenerationReader, Rejected, CALLER, PROJECT, run_tool

class State:
    def __init__(self, pipeline, verify, subject, audience, engine):
        self.pipeline, self.verify, self.subject, self.audience, self.engine = pipeline, verify, subject, audience, engine
        self.lock = threading.Lock()
        self.started = False

    def authorize(self, header):
        if self.audience == 'UNCONFIGURED': raise Rejected('configuration-unavailable', 503)
        if not isinstance(header, str) or not header.startswith('Bearer ') or len(header) > 16384: raise Rejected('unauthorized', 403)
        try: claims = self.verify(header[7:], self.audience)
        except Exception: raise Rejected('unauthorized', 403) from None
        if (claims.get('email') != CALLER or claims.get('email_verified') is not True or claims.get('sub') != self.subject
                or claims.get('iss') not in ['accounts.google.com', 'https://accounts.google.com'] or claims.get('aud') != self.audience):
            raise Rejected('unauthorized', 403)

    def refresh(self):
        while True:
            with self.lock:
                try:
                    run_tool(['freshclam', '--config-file=/app/freshclam.conf', '--stdout'], 120)
                    self.engine.definitions()
                    self.started = True
                except Exception:
                    self.started = False
                    print(json.dumps({'event': 'scanner_health', 'category': 'definitions-unavailable'}), flush=True)
            time.sleep(3600)


def app_for(state):
    def app(environ, start_response):
        status, body, acquired = 503, {'error': 'scanner-unavailable'}, False
        try:
            if environ.get('REQUEST_METHOD') == 'GET' and environ.get('PATH_INFO') == '/startup':
                status, body = (200 if state.started else 503), {}
            else:
                if environ.get('REQUEST_METHOD') != 'POST' or environ.get('PATH_INFO') != '/scan': raise Rejected('not-found', 404)
                state.authorize(environ.get('HTTP_AUTHORIZATION'))
                if environ.get('CONTENT_TYPE') != 'application/json' or environ.get('HTTP_TRANSFER_ENCODING'):
                    raise Rejected('invalid-request', 400)
                length = environ.get('CONTENT_LENGTH', '')
                if not length.isdigit() or not 1 <= int(length) <= 2048: raise Rejected('invalid-request', 400)
                raw = environ['wsgi.input'].read(int(length))
                if len(raw) != int(length): raise Rejected('invalid-request', 400)
                def unique(items):
                    result = {}
                    for key, value in items:
                        if key in result: raise ValueError()
                        result[key] = value
                    return result
                try: request = json.loads(raw, object_pairs_hook=unique)
                except (ValueError, UnicodeError): raise Rejected('invalid-request', 400) from None
                deadline = environ.get('HTTP_X_MI_SCAN_DEADLINE', '')
                if not re.fullmatch('[0-9]{13}', deadline): raise Rejected('lease-expired', 409)
                acquired = state.lock.acquire(blocking=False)
                if not acquired or not state.started: raise Rejected('scanner-busy', 503)
                body, status = state.pipeline.scan(request, int(deadline)), 200
        except Rejected as error:
            status, body = error.status, {'error': error.category}
        except Exception:
            status, body = 503, {'error': 'scanner-unavailable'}
        finally:
            if acquired: state.lock.release()
        output = json.dumps(body, separators=(',', ':')).encode()
        reason = {200: 'OK', 400: 'Bad Request', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 422: 'Unprocessable Content', 503: 'Service Unavailable'}[status]
        start_response(str(status) + ' ' + reason, [('Content-Type', 'application/json'), ('Content-Length', str(len(output))),
                       ('Cache-Control', 'no-store'), ('X-Content-Type-Options', 'nosniff')])
        return [output]
    return app


def create_app():
    from google.cloud import storage
    from google.auth.transport.requests import Request
    from google.oauth2 import id_token
    audience = os.environ['SCANNER_AUDIENCE']
    subject = os.environ['PORTAL_RUNTIME_SUBJECT']
    if not re.fullmatch('[0-9]{10,30}', subject): raise ValueError('Pinned caller subject required')
    if audience != 'UNCONFIGURED' and not re.fullmatch(r'https://[a-z0-9-]+\.a\.run\.app', audience):
        raise ValueError('Use the exact reviewed Cloud Run status.url origin')
    # Certificates/identity use finite network timeouts; never log failed claims.
    class TimedRequest(Request):
        def __call__(self, *args, **kwargs):
            kwargs['timeout'] = 5
            return super().__call__(*args, **kwargs)
    workdir = Path('/tmp/mi-scans')
    workdir.mkdir(mode=0o700, exist_ok=True)
    # One sync worker only. Remove orphaned private temp dirs after a killed worker.
    for orphan in workdir.iterdir():
        if orphan.name.startswith('scan-') and orphan.is_dir() and not orphan.is_symlink(): shutil.rmtree(orphan)
    engine = ClamEngine()
    reader = GenerationReader(storage.Client(project=PROJECT), os.environ['FILES_KMS_KEY'])
    state = State(Pipeline(reader, engine, workdir=str(workdir)), lambda token, aud: id_token.verify_oauth2_token(token, TimedRequest(), audience=aud), subject, audience, engine)
    threading.Thread(target=state.refresh, daemon=True).start()
    return app_for(state)
