"""Structural review checks, not production security certification."""
import json
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
p=json.loads((root/'config/policy.proposed.json').read_text())
assert p['projectId']=='gen-lang-client-0948635471' and p['billingPlan']=='BLAZE'
assert p['proposedDatabaseId']=='mi-sin-portal' and p['proposedEdition']=='STANDARD' and p['proposedMode']=='FIRESTORE_NATIVE'
assert p['additionalActualSpendingTargetCad']==0 and p['guaranteedZeroAdditionalSpend'] is False
for flag in ('billingConfigurationChangesAllowed','newProjectAllowed','projectInspectionComplete','resourceCreationApproved','deploymentApproved','financialExposureApproved','realCollectionEnabled','realCiphertextReadsEnabled','securityReviewApproved','privacyReviewApproved','functionsSelected'):
 assert p[flag] is False, flag
assert p['existingDatabaseIds'] is None
cfg=json.loads((root/'firebase.mi-sin-portal.proposed.json').read_text())
assert cfg['firestore']==[{'database':'mi-sin-portal','rules':'firestore.mi-sin-portal.rules','indexes':'firestore.mi-sin-portal.indexes.json'}]
assert set(cfg)=={'firestore','hosting'} and cfg['hosting']['target']=='mi-sin-portal'
assert "allow read, write: if false;" in (root/'firestore.mi-sin-portal.rules').read_text()
assert not (root/'firebase.json').exists() and not (root/'.firebaserc').exists()
html=(root/'design/index.html').read_text()
for forbidden in ('fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'serviceWorker','<form','https://','Spark-only','Microsoft Entra','Confirm and reveal once'):
 assert forbidden not in html,forbidden
assert not re.search(r'\b\d{9}\b',html)
for key in ('welcome','verify','submit','review','complete','invalid','completed','login','dashboard','invitations','submissions','retrieve','dispose','audit'):
 assert re.search(rf'\b{key}:',html),key
for m in re.finditer(r'<(?:input|textarea)\b[^>]*>',html): assert 'disabled' in m.group(),m.group()
assert 'Cannot be guaranteed' in html and 'Hosted key import is not provided' in html
for file in [root/'README.md',*(root/'docs').glob('*.md')]:
 for target in re.findall(r'\]\(([^)]+)\)',file.read_text()):
  if not target.startswith(('https://','#')): assert (file.parent/target).exists(),(file,target)
assert all(f'| {i} ' in (root/'docs/implementation-plan.md').read_text() for i in range(1,16))
for source in (root/'src').rglob('*.mjs'):
 text=source.read_text();assert 'getFirestore(' not in text
 if 'initializeFirestore' in text: assert source.name=='portal-db.mjs' and 'PORTAL_DATABASE_ID' in text
for doc in ('architecture.md','costs.md','database-isolation-plan.md','existing-app-impact.md','deployment-isolation.md','functions-comparison.md'):
 assert (root/'docs'/doc).exists()
print('PASS: existing Blaze/named DB, financial/collection gates, scoped manifest/closed Rules, 14 preserved non-collecting states, links and 15 acceptance criteria')
