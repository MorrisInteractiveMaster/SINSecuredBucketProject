# IAM-authenticated PDF scanner — deployment checklist and runbook

This branch stacks on PR 6, which stacks on PR 5. It does not modify either branch, deploy anything, enable files, migrate records or create resources. The existing bucket **already exists**: `gen-lang-client-0948635471-mi-secure-bucket`, Montreal (`northamerica-northeast1`), with its separate `request-files` CMEK. Do not recreate or repurpose it. Live configuration and live scanner operation have not been independently verified by this development environment.

## Short deployment checklist

After recorded deployment approval, in this order:

1. Keep `filesEnabled:false`; inspect the existing private bucket/CMEK and save current dedicated Function/Hosting/scanner revisions.
2. Build, test and review the scanner image; push its immutable digest using section 1.
3. Configure the dedicated scanner account with bucket-only object-get access using section 2. Keep the existing portal storage/signing permissions unchanged.
4. Render and deploy **only** `mi-secure-pdf-scanner` using section 4: HTTPS ingress `all`, Invoker IAM check enabled, and the exact portal-only policy in `scanner/invoker-policy.json`. Discover the actual service URL and runtime subject automatically. Never grant `allUsers` or `allAuthenticatedUsers` access.
5. Deploy the 90-second dedicated Function through the existing scoped Firebase launcher, then review/publish only the dedicated Hosting update if needed (section 5). No connector, private DNS, VPC, NAT, staff UID collection or network input file is required.
6. Run fictional live acceptance tests in section 6: anonymous/wrong identities denied, approved portal call succeeds, clean PDF accepted, EICAR/malformed/stale/mismatched/expired cases stay quarantined, and existing sign-in/email/App Check/SIN workflows remain intact.
7. Record live results and obtain the separate file-release approval. This PR does not authorize file activation. Keep uploads disabled until live tests pass and required approval is recorded.

All commands below are operator instructions, **not executed by this PR**. Do not create/recreate the existing bucket, alter shared settings, or deploy other functions/sites.

## Security boundary

The portal still authenticates Microsoft/Google contractors, establishes mailbox ownership, checks active contractor approval and the exact active file assignment before signing and finalizing uploads. Phone/SIN-only assignments cannot upload. Neither scanner nor client can accept an assignment, change a clean verdict in Firestore, list files or bypass quarantine. The scanner receives only `{bucket,object,generation,sha256}` plus the backend's absolute lease deadline header. It never trusts an email supplied by a caller.

`mi-secure-pdf-scanner` is a new **IAM-authenticated HTTPS** Cloud Run service in this project and region. Its HTTPS endpoint is network reachable (`ingress: all`), while `run.googleapis.com/invoker-iam-disabled: 'false'` explicitly requires Cloud Run IAM authentication. Reachability does not grant invocation. Only `mi-sin-cloud-test@gen-lang-client-0948635471.iam.gserviceaccount.com` receives service-level `roles/run.invoker`. Application code additionally verifies the complete Google-signed ID token, issuer, exact audience, email verification, exact service-account email and its automatically discovered numeric subject. The subject is a service identity, not a staff UID. End-user Microsoft/Google/Firebase tokens cannot invoke the scanner. Both auth headers carry the same short-lived metadata-issued token; Cloud Run checks `X-Serverless-Authorization` while the application verifies the intact `Authorization` token. No keys are downloaded.

A separate `mi-bucket-scanner` service account gets **only `storage.objects.get` on this bucket**, through `iam/mi-bucket-scanner-reader-role.yaml`. No list, create, overwrite, delete, Firestore, signBlob, text-key decryption or cross-project grants. Storage's existing service agent handles the bucket CMEK; the scanner does not receive direct KMS permissions. Audit effective inherited grants and who can impersonate these identities. Project/IAM administrators remain trusted operators; application checks cannot eliminate their infrastructure control.

For each scan, the service:

1. Validates exact fields, opaque path format, generation, hash and unexpired deadline; serializes work with signature updates.
2. Reads metadata and media pinned to that exact numeric generation, with a generation-match precondition and CRC32C checking. Enforces PDF MIME, the exact Montreal `request-files` key, 10 MiB maximum, streamed byte limits and SHA-256 equality.
3. Runs the maintained ClamAV 1.4 LTS branch, using vendor-signed main/daily/bytecode definitions obtained and tested by FreshClam. Clean is only exit status zero; infection, scan limits, encryption alerts, process failures and timeouts fail closed. DB age is the engine-reported **build timestamp**, never file mtime or download time. Daily definitions must be younger than 24 hours and cannot be future-dated. The reviewed branch fails closed at its published 2027-08-15 maintenance deadline until updated.
4. Runs pikepdf/libqpdf in a separate bounded native-parser process without repair. Rejects syntax warnings, encrypted PDFs, attachments, JavaScript/actions, forms/XFA, external URI/actions, excessive pages/objects/depth and decompression/resource limits. This intentionally supports static PDFs; rejected interactive agreements must be flattened through an approved process and resubmitted. Files are never rewritten into a purportedly safe copy.
5. Rechecks definitions and deadline and returns the existing `{clean,bucket,object,generation,sha256,engine,definitionsAt}` contract. The backend independently validates the verdict and rechecks identity, ownership, status and lease before accepting. No scanner callback writes database state.

Gunicorn runs one sync worker, finite HTTP limits and a hard 55-second worker timeout. Pipeline work has a 45-second budget; engine/parser subprocesses have narrower deadlines and the parser has CPU/address-space limits. The service has no persistent volume: private random temporary directories are removed on success/failure; a restarted single worker removes orphan scan directories. Container memory, process/kernel copies and prior external copies are not claimed to be cryptographically erased. No document, filename, object path, hash, engine output, token or request body is put in application logs. Cloud audit logs may contain opaque resource identifiers. Keep support/error tooling from capturing request bodies.

Antivirus and structure checks reduce risk; they cannot prove every PDF harmless or detect all zero-days. Continue sandboxed preview, short-lived generation-pinned delivery and patched clients/engines. The native processors share the restricted scanner identity, so parser compromise remains a residual risk. Its permissions, non-root user, memory/CPU limits and dedicated instance minimize exposure but are not a complete native-code sandbox.

## Timeouts, cold starts and retries

| Boundary | Limit / behavior |
| --- | --- |
| Existing signed upload and reservation | Same absolute five-minute deadline; never extended by scanning or retry |
| Scanner startup | Vendor DB seeded into image, FreshClam startup update bounded to 120 seconds, startup probe up to 240 seconds; no scan admission until definitions are usable |
| Definition updates | Hourly while instance runs, serialized with scans; prior still-fresh signed definitions can be used if mirror update fails; stale/missing DB always rejected |
| Scanner pipeline | At most 45 seconds and at most the remaining lease minus one second |
| Gunicorn worker / Cloud Run request | 55 / 60 seconds |
| Backend scanner client | One overall 60-second budget, also bounded by lease; at most two read-only attempts, 500 ms backoff; only network failures or 429/502/503/504 can retry with sufficient remaining budget |
| Existing portal Function | 90 seconds (was 15); App Check/auth/roles unchanged |
| Browser callable | 100 seconds only for file finalization; other operations keep their existing timeout |

A cold start can exceed a single scan call. The response stays quarantined, never accepted on timeout. The contractor can retry the check **only while the original lease remains valid**. Once expired, the existing UI asks for a fresh file selection/new reservation. Both before and after scanning, finalization rejects an expired lease. Failed calls may duplicate read-only scan work but cannot create duplicate submissions or reopen a consumed SIN. The current bounded API/Function concurrency can delay other portal calls during a scan; existing session-stability handling must remain enabled. Benchmark this in cloud acceptance.

The template uses min instances zero, max instances one, two CPUs and 4 GiB with instance-based billing (`cpu-throttling:false`) so a running instance can refresh definitions while idle. Scale-to-zero loses local updates; the next startup refreshes the seeded definitions. Failed updates do not produce a new timestamp. Do not change to request-only CPU without reviewing updater/freshness behavior. Optional min instances one reduces cold-start delays but incurs ongoing charges and needs separate financial approval.

## Prerequisites and read-only inventory

These instructions are **for an authorized operator after review**, not automatic deployment authorization. Record approval, current Function/Hosting revisions and scanner/image/config changes in the release record. Keep `filesEnabled:false` throughout provisioning and validation. Do not alter the existing AI Studio app, shared Auth/App Check, default Firestore/Hosting or other Storage rules. Do not print tokens, use service-account keys or run `gcloud projects add-iam-policy-binding`.

```sh
mkdir -p .scanner-release

gcloud storage buckets describe gs://gen-lang-client-0948635471-mi-secure-bucket --project=gen-lang-client-0948635471 --format=json > .scanner-release/bucket-before.json
gcloud storage buckets get-iam-policy gs://gen-lang-client-0948635471-mi-secure-bucket --format=json > .scanner-release/bucket-iam-before.json

gcloud functions describe miSinSynthetic --gen2 --region=northamerica-northeast1 --project=gen-lang-client-0948635471 --format=json > .scanner-release/function-before.json

gcloud run services list --region=northamerica-northeast1 --project=gen-lang-client-0948635471

gcloud artifacts repositories list --location=northamerica-northeast1 --project=gen-lang-client-0948635471

```

Verify bucket location, uniform IAM, public-access prevention, default key ending `/cryptoKeys/request-files`, Canadian key location, retention/soft-delete policy and direct Firebase endpoint denial. **Do not recreate, rotate or change this existing key or bucket as part of scanner installation.** Inspect the current service/account/custom-role names below; if already present, stop and review instead of recreating/overwriting them. API enablement, build registry, identity creation and networking below are approval-dependent; no service activation/billing is done by tests or source preparation.

## 1. Build and inspect the immutable image

Use an approved Docker-capable workstation/CI builder. Cloud Shell does not always provide Docker. Do not deploy source with an unreviewed default Cloud Build identity. All cloud resources remain in the same project and Canadian region. If no dedicated Artifact Registry repository exists, approve it first, then create **only**:

```sh
gcloud artifacts repositories create mi-secure-bucket --repository-format=docker --location=northamerica-northeast1 --project=gen-lang-client-0948635471
```

Build/install dependencies are hash-locked. Resolve and record a maintained Python 3.12 Debian-trixie base digest; review its OS/ClamAV security advisories before release. Rebuild for security fixes and before definitions in the seed become stale. A FreshClam CDN/network failure fails the image build; do not remove signature validation to bypass it.

```sh
docker pull python:3.12-slim-trixie
SCANNER_BASE_IMAGE=$(docker inspect --format '{{index .RepoDigests 0}}' python:3.12-slim-trixie)
docker build --platform linux/amd64 --build-arg BASE_IMAGE="$SCANNER_BASE_IMAGE" -t mi-pdf-scanner-reviewed scanner

docker run --rm --network=none --entrypoint python -e MI_REQUIRE_CLAMAV=1 -e MI_REQUIRE_VENDOR_DB=1 mi-pdf-scanner-reviewed -m unittest discover -s tests -v

docker run --rm --network=none --entrypoint clamscan mi-pdf-scanner-reviewed --version
docker run --rm --network=none --entrypoint dpkg-query mi-pdf-scanner-reviewed -W clamav clamav-freshclam
docker run --rm --network=none --entrypoint pip mi-pdf-scanner-reviewed freeze
```

Review the dependency/container vulnerability report and the latest supported ClamAV patch (or documented supported distro security backports). ClamAV 1.4 LTS maintenance ends 2027-08-15; code closes after that date. The support guard does not replace patch maintenance. Record the base digest, package versions, vendor DB version/build date and final image digest. The sample tag below is only for uploading; the service renderer accepts a digest exclusively.

```sh
gcloud auth configure-docker northamerica-northeast1-docker.pkg.dev
SCANNER_IMAGE_TAG=northamerica-northeast1-docker.pkg.dev/gen-lang-client-0948635471/mi-secure-bucket/pdf-scanner:reviewed
docker tag mi-pdf-scanner-reviewed "$SCANNER_IMAGE_TAG"
docker push "$SCANNER_IMAGE_TAG"
gcloud artifacts docker images describe "$SCANNER_IMAGE_TAG" --project=gen-lang-client-0948635471 --format='value(image_summary.fully_qualified_digest)'
```

Use the printed digest in the private input below. Do not substitute `:latest`. This build/push is an operator action, not something executed by the PR workflow.

## 2. Dedicated scanner identity and bucket-only read permission

After approval and confirming the account/custom role do not already exist:

```sh
gcloud iam service-accounts create mi-bucket-scanner --project=gen-lang-client-0948635471 --display-name='MI private PDF scanner'
gcloud iam roles create miBucketScannerReader --project=gen-lang-client-0948635471 --file=iam/mi-bucket-scanner-reader-role.yaml

gcloud storage buckets add-iam-policy-binding gs://gen-lang-client-0948635471-mi-secure-bucket --member=serviceAccount:mi-bucket-scanner@gen-lang-client-0948635471.iam.gserviceaccount.com --role=projects/gen-lang-client-0948635471/roles/miBucketScannerReader
```

No project-level role binding, KMS grant to the scanner, object listing or service-account key is required. The deployer needs approved `actAs` on this scanner identity; do not grant it to contractors. Check inherited project/folder roles and service-account impersonators before proceeding.

## 3. Standard authenticated HTTPS — no VPC setup

The portal calls the scanner's normal HTTPS `a.run.app` origin with a short-lived metadata-issued Google identity token. Cloud Run enforces service-level IAM, and the existing scanner independently verifies the signed token, exact audience, issuer, verified service-account email and pinned numeric subject. Do not disable either check. Do not grant anonymous invocation.

No Direct VPC egress, connector, Private Google Access change, private DNS, subnet or Cloud NAT is required. The default VPC and its `10.162.0.0/20` subnet are untouched. Existing Microsoft/Google authentication, Resend verification email, App Check and Google APIs keep ordinary internet/Google HTTPS egress. The scanner can fetch official antivirus updates without a customer VPC/NAT.

The Firebase-owned Function source explicitly resets VPC configuration with the supported SDK `networkInterface: RESET_VALUE`; deployment-package checks verify the emitted `vpc:null` reset and 90-second timeout. Therefore future **scoped Firebase deployments** keep the reviewed no-VPC configuration rather than retaining an external network patch. Do not run a separate `gcloud functions deploy` or patch the Firebase-managed Cloud Run service. The old `MI_STAGE_SCANNER_NETWORK`, `MI_PDF_SCANNER_CONNECTOR` and ignored connector-input file are obsolete; unset those environment variables and do not stage the old input. The preparer rejects obsolete staging flags. No live setting is changed during local preparation or tests.

## 4. Authenticated Cloud Run service deployment and caller binding

Create ignored `operator-input.pdf-scanner.json` with keys `image`, `runtimeSubject`, `filesKey`, `scannerOrigin`. The subject and existing key are discovered automatically; staff never collect UIDs/OIDs. Set `SCANNER_IMAGE_DIGEST` to the exact approved digest printed above, then:

```sh
SCANNER_RUNTIME_SUBJECT=$(gcloud iam service-accounts describe mi-sin-cloud-test@gen-lang-client-0948635471.iam.gserviceaccount.com --project=gen-lang-client-0948635471 --format='value(uniqueId)')
SCANNER_FILES_KEY=$(gcloud storage buckets describe gs://gen-lang-client-0948635471-mi-secure-bucket --project=gen-lang-client-0948635471 --format='value(default_kms_key)')
export SCANNER_IMAGE_DIGEST SCANNER_RUNTIME_SUBJECT SCANNER_FILES_KEY
python3 - <<'PY'
import json, os
from pathlib import Path
Path('operator-input.pdf-scanner.json').write_text(json.dumps({
 'image': os.environ['SCANNER_IMAGE_DIGEST'],
 'runtimeSubject': os.environ['SCANNER_RUNTIME_SUBJECT'],
 'filesKey': os.environ['SCANNER_FILES_KEY'],
 'scannerOrigin': 'UNCONFIGURED'
}))
PY
python3 scanner/render_config.py operator-input.pdf-scanner.json
```

Review `.scanner-release/service.yaml`: exact service/account/project/region, HTTPS ingress `all`, Invoker IAM check enabled (`invoker-iam-disabled:'false'`), no unauthenticated invocation, concurrency/max instances one, min zero, immutable image, 4 GiB, two CPUs, startup probe. `UNCONFIGURED` is an initial **closed** audience used only to discover the actual generated service origin. It always rejects scans and does not enable any portal feature. No invoker binding is added until the real origin is configured.

```sh
gcloud run services replace .scanner-release/service.yaml --project=gen-lang-client-0948635471 --region=northamerica-northeast1
SCANNER_ORIGIN=$(gcloud run services describe mi-secure-pdf-scanner --project=gen-lang-client-0948635471 --region=northamerica-northeast1 --format='value(status.url)')
export SCANNER_ORIGIN
python3 - <<'PY'
import json, os
from pathlib import Path
p=Path('operator-input.pdf-scanner.json'); data=json.loads(p.read_text())
data['scannerOrigin']=os.environ['SCANNER_ORIGIN']; p.write_text(json.dumps(data))
PY
python3 scanner/render_config.py operator-input.pdf-scanner.json
gcloud run services replace .scanner-release/service.yaml --project=gen-lang-client-0948635471 --region=northamerica-northeast1

gcloud run services set-iam-policy mi-secure-pdf-scanner scanner/invoker-policy.json --project=gen-lang-client-0948635471 --region=northamerica-northeast1

gcloud run services get-iam-policy mi-secure-pdf-scanner --project=gen-lang-client-0948635471 --region=northamerica-northeast1 --format=json > .scanner-release/scanner-iam.json
```

The reviewed policy file replaces only the dedicated scanner service policy with one `roles/run.invoker` member: the existing portal runtime. It never edits project IAM. A newly created service starts with no anonymous invoker binding; YAML replacement does not grant one. If a service with this name already exists, inspect its policy and ownership before applying; stop rather than overwriting unrelated resources. Verify the Invoker IAM check is enabled and only that portal identity is a service-level invoker, with no `allUsers`, `allAuthenticatedUsers`, other accounts, inherited broad invocation or unapproved token creators. Do not disable the Invoker IAM check. Service IAM cannot revoke inherited project/folder permissions. If another identity has effective invocation through inherited roles, stop for review; do not modify shared IAM as a workaround. The scanner application still rejects all identities except the pinned portal runtime. Project administrators remain trusted infrastructure operators. Application verification additionally pins the portal numeric subject, rejecting replacement service identities until an explicit reviewed configuration update. Keep the generated `a.run.app` origin; custom domains/public proxy paths are unsupported. Service deletion/recreation/URL changes require updated audience and backend policy, never a permissive fallback.

## 5. Scoped portal integration (keep files disabled)

After financial, security and privacy review, deploy only the existing dedicated callable. The scanner timeout changes are required; deploying only the scanner leaves the old five-second client timeout. Check existing owner activation/environment settings against the recorded current revision; do not unintentionally reapply old activation configuration.

```sh
npm ci --ignore-scripts
npm run test:all
npm run build:cloud-test
node scripts/check-ui-artifact.mjs
unset MI_STAGE_SCANNER_NETWORK MI_PDF_SCANNER_CONNECTOR
node scripts/launch-cloud-test.mjs functions --execute
```

The normal launcher stages the existing dedicated Function only; no scanner-network input is required. Verify the deployed Function timeout is 90 seconds and there is no VPC connector or Direct VPC interface. The Firebase manifest explicitly clears stale VPC settings. Keep the existing runtime identity, secret references, App Check, auth and database/Hosting targets unchanged. If existing dependencies fail, keep files disabled and roll back the dedicated revision; do not weaken authentication.

Hosting needs a scoped update for the file-finalization callable timeout only, using the already reviewed cloud build and existing dedicated site:

```sh
node scripts/launch-cloud-test.mjs preview --execute
# After review of the preview and explicit Hosting release authorization:
node scripts/launch-cloud-test.mjs live --execute
```

The scanner URL/key stay in the existing private request-policy configuration; never expose a direct scanner endpoint in contractor code. `scripts/requests-operator.mjs` remains the existing approval-controlled route for a future file release. **This task does not authorize `filesEnabled:true`.** Do not copy a UUID from a test and call it an approval. Any temporary fictional cloud acceptance window needs its own recorded owner authorization. Existing real records and the five-minute lease/one-time SIN semantics must remain unchanged.

## 6. Actual-cloud acceptance — not emulator evidence

Record image/revisions, policies, clean/error categories and opaque fictional test references, never tokens, signed URLs, file content, copied secrets or actual contractor details. These checks have not been performed by this PR:

- Confirm an anonymous HTTPS request to `/scan` receives Cloud Run authentication denial (normally HTTP 403), not a clean verdict. Requests using wrong Google/Microsoft/Firebase identities and a non-portal service identity must fail. A permitted portal-runtime request must pass both Cloud Run IAM and the strict application verifier. Use an approved test runner/identity; do not grant new production invokers merely to make a smoke test pass or give Cloud Shell standing permission to impersonate the portal.
- Through the actual portal and dedicated Function, use two fictional contractors: one with an active file assignment, one with phone/SIN only. The latter cannot obtain a PUT URL even when modifying assignment IDs. Check missing/expired mailbox proof, inactive approval, revoked identity, cancellation, replaced invitation and cross-contractor attempts. Existing Auth/Firestore tests cover this locally but cannot establish live IAM or networking.
- Upload a benign static PDF to the exact assigned reservation and generation; require a matching clean verdict, accepted submission and repeated staff preview/download. Viewing must not delete. Verify plaintext/content absence from metadata output and logs. Direct Firebase operations remain denied.
- Upload the standard harmless EICAR fixture under PDF metadata: it must never become accepted (a non-PDF is rejected before AV). Also use a fictional valid PDF with EICAR as an embedded attachment: AV/structure policy must reject it. Independently run the image's vendor-DB engine smoke tests as above, which prove a clean PDF passes AV and the official standard EICAR bytes are detected. A rejected non-PDF alone does not prove antivirus detection.
- Test malformed/truncated PDFs, warnings, encrypted files, scripts, attachments, decompression limits, oversize content, wrong key, generation/hash mismatches, object replacement, stale/missing definitions, engine failures, scanner outage and request deadlines. Do not deliberately break the live scanner for real users; use a separate approved validation revision with no production traffic, then restore the reviewed digest. Never expose test hooks in production.
- Demonstrate invalid/altered/expired signed PUT rejection at GCS, overwrite generation-zero rejection, two simultaneous starts/finalizations, lease expiry during a scan and loss of the clean response. Scanner failures remain quarantined; finalization retries are idempotent; expiry requires a new reservation. Do not silently accept an old scan result for a new generation.
- Measure warm/cold startup, signature update latency, full 10 MiB PDF scan latency and memory at the configured two CPUs/4 GiB. Confirm the 45/55/60/90/100-second budgets work, session refresh remains stable, and mailbox/sign-in/App Check dependencies keep working with ordinary egress.
- Independently check the unrelated AI Studio app with its approved smoke procedure. This PR neither changes nor claims to have validated its actual cloud revision.

Only after documented actual-cloud results and independent review should the owner separately authorize the existing file-release operation. No real sensitive submission is needed to validate the scanner. Do not treat passing CI or a clean antivirus result as regulatory/security sign-off.

## 7. Costs, maintenance and rollback

This cannot promise CAD $0. Cloud Run free usage is shared at billing-account level, not an additional private allowance for this service; Canada/network/CMEK/image storage/build/logging charges can apply. Instance-based billing includes startup and idle lifetime until scale-down. Max one/min zero limits ordinary scale but **is not a hard billing cap**, and temporary overlapping revisions/instances can occur during deployment.

Use the actual Montreal rates from Google's calculator and billing account: `2 × billed_seconds × CPU_rate + 4 × billed_seconds × GiB_rate`, plus startup boost, same-region GCS reads/KMS, internet definition downloads, Artifact Registry storage/builds, and logs. At the published illustrative Tier-1 instance rates USD $0.000018/vCPU-second and $0.000002/GiB-second, 15 minutes at 2 CPU/4 GiB is about USD $0.040 before allowances, regional differences, networking, CAD conversion and tax. A continuously running min-one instance would be about USD $116/month for compute/memory alone at those illustrative rates. **No paid connector, private DNS zone, custom VPC/subnet or Cloud NAT is part of this design.** Inspect actual project usage and approve scanner compute, storage/build and network-transfer exposure before deployment. Alerts are notifications, not spending caps. Do not enable anonymous invocation to bypass errors.

Monitor scanner 4xx/5xx counts, definition age and update failures, OOM/worker timeouts and request latency without payload logging. Rebuild/scan the image regularly for OS, engine, parser and Python fixes; keep support/definition dates in the release record. Do not suppress stale-definition errors, increase file/decompression limits casually, disable malware detection or accept `clean` from a client.

For rollback, **first close file access using the existing recorded requests policy procedure** (keep or set `filesEnabled:false` under operator review). Never delete objects or submission metadata to roll back code. Retain quarantined/accepted generations and audit records. Record the previous scanner revision before any update. Restore only this service:

```sh
gcloud run revisions list --service=mi-secure-pdf-scanner --project=gen-lang-client-0948635471 --region=northamerica-northeast1
# Replace PREVIOUS_REVIEWED_REVISION with the recorded scanner revision:
gcloud run services update-traffic mi-secure-pdf-scanner --project=gen-lang-client-0948635471 --region=northamerica-northeast1 --to-revisions=PREVIOUS_REVIEWED_REVISION=100
```

If the scanner must be isolated while investigating, remove **only** its caller binding (the application still fails closed):

```sh
gcloud run services remove-iam-policy-binding mi-secure-pdf-scanner --project=gen-lang-client-0948635471 --region=northamerica-northeast1 --member=serviceAccount:mi-sin-cloud-test@gen-lang-client-0948635471.iam.gserviceaccount.com --role=roles/run.invoker
```

For a portal regression, restore only the recorded dedicated Function source/configuration through the existing scoped Firebase launcher; do not patch the underlying Cloud Run service or use a parallel Function deployment command. Keep authentication, runtime identity and release gates intact. A rollback must preserve the reviewed no-VPC reset and 90-second scanner timeout unless the scanner remains closed under a separately reviewed rollback. Restore only the recorded portal Hosting version if required. Keep file gates closed until compatibility is verified. Do not roll back the database, shared Auth, other buckets, key versions or AI Studio resources. No destructive infrastructure cleanup is part of rollback; approve it separately after confirming dependencies and retention obligations.

## Evidence and references

Development evidence (12 November 2026): 18 Python tests passed, including real ClamAV 1.4.3 with freshly downloaded/tested official main/daily/bytecode databases, clean PDF and standard EICAR detection; real libqpdf rejection tests; real Google JWT verifier tests with ephemeral test certificates; and scoped manifest/HTTP/reader failure tests. Also passed: 9 Auth/Firestore integration tests, 9 file/migration/signature/client-network tests, 31 UI tests, 15 release checks, 20 existing identity/workflow tests, 3 routing tests, TypeScript/Vite build, structural isolation checks and Node 22 deploy-package discovery. The hash-locked Python dependency audit reported no known vulnerabilities. OS/container vulnerability review remains a separate release check. No real cloud identity, object, database or endpoint was invoked. Local container building is unavailable in this workspace; Docker image construction and required real-engine tests are separately exercised in the scanner CI and must be checked before release. Actual-cloud IAM/authenticated-HTTPS/CMEK tests remain outstanding.

Local Python tests exercise real libqpdf parsing, HTTP/identity policy, deadline/resource failures, exact-generation reader checks and real ClamAV (isolated EICAR signature and vendor definitions); they do not prove Cloud Run IAM, cloud KMS, authenticated HTTPS invocation or actual upload policy. Existing Auth/Firestore integration tests continue to enforce cross-contractor isolation and SIN one-time behavior. The new scanner CI builds a digest-resolved image and **requires** real engine and vendor-definition smoke tests offline; missing/stale definitions fail, never skip, in that stage. Dependency hashes bind installed Python packages; a successful image build is not independent production approval.

- [ClamAV scanning and exit semantics](https://docs.clamav.net/manual/Usage/Scanning.html)
- [ClamAV supported LTS lifecycle](https://docs.clamav.net/faq/faq-eol.html)
- [FreshClam configuration and signature validation](https://docs.clamav.net/manual/Usage/Configuration.html)
- [pikepdf structure validation](https://pikepdf.readthedocs.io/en/stable/api/main.html)
- [Cloud Run service authentication and headers](https://cloud.google.com/run/docs/authenticating/service-to-service)
- [Cloud Run IAM and the Invoker check](https://cloud.google.com/run/docs/securing/managing-access)
- [Cloud Run startup health checks](https://cloud.google.com/run/docs/configuring/healthchecks)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Firebase callable client timeout](https://firebase.google.com/docs/functions/callable)
