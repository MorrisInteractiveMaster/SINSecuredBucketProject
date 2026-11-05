"""Structural review-package checks only; these do not certify application security."""
import json
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
policy = json.loads((root / 'config/policy.proposed.json').read_text())
assert policy['realCollectionEnabled'] is False
assert policy['securityReviewApproved'] is False
assert policy['privacyReviewApproved'] is False
assert policy['status'] == 'proposal-not-approved'
assert policy['infrastructureBudgetCad'] == 0
assert policy['requiredFirebasePlan'] == 'SPARK'
assert policy['billingUpgradeAllowed'] is False
assert policy['selectedProjectId'] is None
assert policy['projectInspectionComplete'] is False
for flag in ('realCiphertextReadsEnabled', 'mfaDemonstrated', 'oneTimeDecryptionEnforceable', 'automaticDeletionGuaranteed', 'serverPlaintextValidationAvailable', 'ciphertextHandoffApproved'):
    assert policy[flag] is False, flag
assert policy['developmentProjectId'].startswith('demo-')
html = (root / 'design/index.html').read_text()
for forbidden in ('fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'serviceWorker', '<form', 'https://'):
    assert forbidden not in html, forbidden
assert not re.search(r'\b\d{9}\b', html), 'No nine-digit examples in layout'
for key in ('welcome', 'verify', 'submit', 'review', 'complete', 'invalid', 'completed', 'login', 'dashboard', 'invitations', 'submissions', 'retrieve', 'dispose', 'audit'):
    assert re.search(rf'\b{key}:', html), key
for match in re.finditer(r'<(?:input|textarea)\b[^>]*>', html):
    assert 'disabled' in match.group(), match.group()
for file in root.rglob('*.md'):
    for target in re.findall(r'\]\(([^)]+)\)', file.read_text()):
        if not target.startswith(('https://', '#')):
            assert (file.parent / target).exists(), (file, target)
assert 'Microsoft Entra' not in html
assert 'Send verification code' not in html
assert 'Confirm and reveal once' not in html
assert 'Cannot be guaranteed' in html
assert 'Hosted key import is not provided' in html
for name in ('architecture.md', 'costs.md', 'threat-model.md', 'implementation-plan.md', 'privacy-and-decisions.md', 'project-investigation.md', 'requirements-gap.md'):
    document = (root / 'docs' / name).read_text()
    assert not any(term in document for term in ('Azure', 'Next.js', 'Key Vault', 'PostgreSQL', 'Bicep')), name
assert all(f'| {i} ' in (root/'docs/implementation-plan.md').read_text() for i in range(1,16))
print('PASS: Spark/$0 disabled-policy gates, 14 layout states, disabled entry, no network/storage calls, removed obsolete UI promises, document links, replaced paid stack and all 15 acceptance criteria')
