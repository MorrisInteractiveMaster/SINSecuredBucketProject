"""Render a reviewed service manifest locally. Never contacts Google Cloud."""
import json
import re
import sys
from pathlib import Path
from core import PROJECT, REGION

def render(data):
    if set(data) != {'image', 'runtimeSubject', 'filesKey', 'scannerOrigin'}: raise ValueError('Unexpected configuration fields')
    patterns = {
        'image': r'northamerica-northeast1-docker\.pkg\.dev/' + PROJECT + r'/mi-secure-bucket/pdf-scanner@sha256:[a-f0-9]{64}',
        'runtimeSubject': r'[0-9]{10,30}',
        'filesKey': r'projects/' + PROJECT + r'/locations/' + REGION + r'/keyRings/[A-Za-z0-9_-]+/cryptoKeys/request-files',
        'scannerOrigin': r'UNCONFIGURED|https://[a-z0-9-]+\.a\.run\.app',
    }
    for key, pattern in patterns.items():
        if not isinstance(data[key], str) or not re.fullmatch(pattern, data[key]): raise ValueError('Invalid ' + key)
    source = Path(__file__).with_name('run-service.template.yaml').read_text()
    for placeholder, key in [('IMAGE_DIGEST', 'image'), ('RUNTIME_SUBJECT', 'runtimeSubject'), ('FILES_KEY', 'filesKey'), ('SCANNER_ORIGIN', 'scannerOrigin')]:
        source = source.replace('value: ' + placeholder, 'value: "' + data[key] + '"') if key != 'image' else source.replace('image: ' + placeholder, 'image: ' + data[key])
    return source

if __name__ == '__main__':
    try:
        source = Path(sys.argv[1])
        if not re.fullmatch(r'operator-input[\w.-]*\.json', source.name): raise ValueError('Private operator input filename required')
        output = Path('.scanner-release'); output.mkdir(exist_ok=True)
        (output / 'service.yaml').write_text(render(json.loads(source.read_text())))
        print('Rendered .scanner-release/service.yaml locally. Review before applying.')
    except Exception:
        sys.exit('Scanner manifest rejected. Check the scoped image, caller identity, key and service origin.')
