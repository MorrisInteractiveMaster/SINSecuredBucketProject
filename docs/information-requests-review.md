# Information requests upgrade

Current main includes merged PRs 3 and 4. GitHub state does not establish which revision is deployed. This branch adds an opt-in model to the existing callable, named database and Hosting site. Existing authentication, mailbox proof, KMS envelope encryption, audit logging and direct database denial remain the boundaries.

## Data and access

All paths below are inside `staffWorkspace/v1` in `mi-sin-portal`.

| Path | Purpose |
| --- | --- |
| `policy/requests-v2` | Independent rollout gate and recorded approval reference, optional file configuration |
| `requestsV2/v1/templates/{uuid}` | Stable type ID, label, instructions, maximum length, status and revision |
| `requestsV2/v1/assignments/{uuid}` | Contractor invitation ID and email fingerprint, immutable template snapshot, status and timestamps |
| `requestsV2/v1/slots/{digest}` | Unique invitation/template pairing, retained after cancellation/completion |
| `requestsV2/v1/payloads/{uuid}` | KMS-wrapped per-record AES-GCM ciphertext; no list API returns it |
| `requestsV2/v1/uploads/{uuid}` | Opaque upload reservation, authenticated UID, size and expiry |

Contractors list only their verified invitation's assignments. All reads and mutations check an active allowlist entry and existing mailbox ownership proof. Staff access reuses pinned Microsoft identities and explicit permissions. SIN requests consume/delete their payload atomically before disclosure. New non-SIN requests retain ciphertext and require an explicit fresh authorized reveal for every view. Neither list responses nor metadata exports contain confidential values. Each assignment has its own immutable validation snapshot. Editing a template affects only future assignments.

The legacy `submissions` and `sealedSin` collections are untouched. Legacy submitted/retrieved values keep their original one-time semantics, including non-SIN values. Existing tracker actions continue to serve those records. When the new gate is enabled, old global-field submission requests fail before writing. New assignments are created explicitly or through the preview/apply migration. No retrieved values are reconstructed. Disabling the new gate closes its APIs. A permanent cutover marker prevents the old global submission form from reopening after a rollout pause. A rollback must keep its records intact and must not restore consumed payloads.

## Private files

Proposed bucket ID is `gen-lang-client-0948635471-mi-secure-bucket`. No bucket is created by this branch. Runtime bucket operations verify the exact name, Montreal location, uniform bucket IAM, enforced public-access prevention and the approved Canadian default KMS key. The backend signs a create-only PUT with the same absolute expiry as its five-minute server reservation for one opaque object, content type and exact content length. It rechecks object metadata, generation, CMEK and PDF header/size, hashes the exact object generation, and requires an authenticated scanner verdict tied to that generation and hash. Both before inspecting and after scanning, the backend rechecks the current reservation, authenticated UID, active contractor approval, assignment ownership/status and expiry. Only then does the assignment become submitted. A signing operation also rechecks authorization before returning a URL. Expired attempts cannot be finalized; the contractor must select the file again for a new reservation.

PDF is the only enabled file type. DOCX, PNG and JPG need separately reviewed validators/scanner support and are rejected today. File names are bounded and validated before signing, then discarded. Object paths contain opaque assignment/upload UUIDs. No Firebase download token is created. Staff receive a one-minute signed URL pinned to the clean generation, with a PDF content type and generic name. Preview is sandboxed. Deletion is an explicit owner-only, fresh-authenticated two-phase operation, independent of viewing. A partial deletion leaves the assignment inaccessible until retried. Backup/soft-delete/version retention remains a separate operator decision.

**File release blocker.** This repository includes the scanner client contract and fail-closed gate, not a deployed antivirus engine. A private scanner must independently read the specified generation, verify the SHA-256 and actual PDF structure, scan with an approved current malware engine, and return `{clean,bucket,object,generation,sha256,engine,definitionsAt}`. A clean verdict requires definitions less than 24 hours old. Unknown, infected, stale, mismatched and unavailable results remain quarantined. No client API accepts scanner verdicts. Files must stay disabled until the actual service and adversarial file tests pass.

## Operator-only provisioning and release

1. Inspect actual deployed Function revision, Hosting version, database rules, KMS and runtime IAM read-only. Record the current version for rollback and smoke-test the unrelated AI Studio app through its approved procedure. This environment has no authenticated cloud session to perform those checks.
2. Review the metadata-only migration preview. Apply only after review. It never touches legacy payloads or consumed states. Independently test with fictional identities and values.
3. For files, approve creation of the dedicated private Montreal bucket, its Canadian default CMEK, retention and CORS for only the portal origins. CORS needs PUT and headers `Content-Type` and `x-goog-if-generation-match`; test browser-generated signed Content-Length. Enforce uniform access and public-access prevention. Keep Firebase client Storage access denied. The separate `storage.mi-secure-bucket.rules` and single-bucket `firebase.mi-secure-bucket.storage.json` provide explicit deny-all rules for this bucket only. Do not replace any shared Storage rules. Verify the Firebase endpoint denies reads, lists, writes, overwrites, metadata/token changes and deletes using anonymous, contractor and staff test identities before enabling files.
4. Grant the portal runtime only object create/get/delete on this bucket and signing permission on its own dedicated signer identity. Prefer a bucket-scoped custom role over project-wide storage roles. Grant the Storage service agent encrypt/decrypt only on the dedicated file CMEK. Do not grant runtime Storage Admin. File signing requires keyless `iam.serviceAccounts.signBlob` on the approved signer, never a downloaded key.
5. Deploy/validate an approved private Canadian scanner service. Grant its identity read-only access to the dedicated bucket and the portal runtime Cloud Run Invoker on that scanner service only. The scanner URL must be an approved `https://…a.run.app` origin. No unauthenticated scanner invocation. The scanner follow-up uses normal HTTPS ingress with mandatory Cloud Run IAM and strict portal-runtime token verification; no VPC setup is required. Its identity must not read Firestore or unwrap text values.
6. Keep `filesEnabled:false` unless all file controls pass. A reviewed `policy/requests-v2` includes `enabled`, actual `approvalReference`, and optional `filesEnabled`, `storageBucket`, `filesKmsKey`, `scannerUrl`. Never fabricate a release decision. All existing staff and SIN release gates must also remain valid.
7. Build and use only the existing scoped launcher for this codebase and Hosting target. No shared Firestore rules, Auth or other-app changes are needed. Dedicated file-bucket rules, if deployed, use only the separate single-bucket configuration below; the ordinary launcher never deploys Storage. Never use a project-wide deploy.

```sh
npm ci --ignore-scripts
npm run test:all
npm run build:cloud-test
node scripts/check-ui-artifact.mjs
node scripts/launch-cloud-test.mjs functions --execute
node scripts/launch-cloud-test.mjs live --execute
```

Before live promotion, verify two separate fictional contractors, independent requests, role revocation, mailbox verification, cross-user denial, SIN reveal races/failure, persistent views, quarantined uploads, clean generation-pinned delivery and explicit deletion retries. Signed URLs remain bearer access until their short expiry even after role revocation. Hide/sign-out clears browser state but cannot revoke already issued URLs or external copies. Closing the feature gate does not erase data. For rollback, close the new gate and pause the existing SIN release gate before restoring a pre-upgrade Functions revision. Keep both gates closed until compatibility is reviewed. Retain all request, audit and legacy records. Never re-enable an older global-submission backend for contractors already cut over to assignments. Do not roll back the database or shared authentication settings.


## Migration and gate commands

Create a private ignored `operator-input.requests.json` containing the recorded `approvalReference` UUID and `filesEnabled:false`. No contractor emails or UIDs go into this file. Use the approved operator ADC for the dedicated database. Preview reads counts only. Apply requires a typed confirmation.

```sh
node scripts/requests-operator.mjs migrate operator-input.requests.json
node scripts/requests-operator.mjs migrate operator-input.requests.json --apply
node scripts/requests-operator.mjs enable operator-input.requests.json
node scripts/requests-operator.mjs enable operator-input.requests.json --apply
```

On its first apply, the migration pins the global field in `policy/requests-migration-v1`. Later runs reuse that snapshot even if staff change the old global field. It creates a deterministic template and assigns it only to active, unexpired legacy invitations without any submission document. It never migrates submitted or consumed records and never edits contractor metadata. It can be rerun safely. Template or field changes during migration stop that transaction instead of guessing. Contractor assignments added by staff coexist with migrated requests. Finish the reviewed migration and assignment plan before enabling the new model, since old global submissions are then rejected.

Files additionally require the actual `fileApprovalReference`, `filesKmsKey` and approved private `scannerUrl`. Keep files off until provisioning and live adversarial tests pass. Do not add these fields to the older staff provisioning input. To close only this upgrade:

```sh
node scripts/requests-operator.mjs pause operator-input.requests.json --apply
```

## Narrow provisioning command plan

These commands are for an authorized operator **after explicit approval**. They are not executed by the application, migration or tests. The bucket does not need registration as a Firebase default Storage bucket. GCS IAM governs signed backend access; Firebase Rules do not authorize GCS signed URLs. Keep the bucket unregistered with Firebase unless that registration is explicitly reviewed. A bucket already registered with Firebase must have the dedicated deny-all rules bound to it. Public-access prevention alone does not establish Firebase client denial. Never import this bucket using instructions that grant broad project access. Existing Firebase Storage rules are not deployed or replaced.

```sh
# Use the approved Canadian KMS key resource and reviewed retention settings.
gcloud storage buckets create gs://gen-lang-client-0948635471-mi-secure-bucket --project=gen-lang-client-0948635471 --location=northamerica-northeast1 --uniform-bucket-level-access --public-access-prevention

gcloud storage buckets update gs://gen-lang-client-0948635471-mi-secure-bucket --default-encryption-key=APPROVED_MONTREAL_FILE_KMS_KEY

gcloud storage buckets update gs://gen-lang-client-0948635471-mi-secure-bucket --cors-file=config/requests-storage-cors.json

gcloud iam roles create miBucketFiles --project=gen-lang-client-0948635471 --file=iam/mi-bucket-files-role.yaml
gcloud storage buckets add-iam-policy-binding gs://gen-lang-client-0948635471-mi-secure-bucket --member=serviceAccount:mi-sin-cloud-test@gen-lang-client-0948635471.iam.gserviceaccount.com --role=projects/gen-lang-client-0948635471/roles/miBucketFiles

gcloud iam roles create miBucketSigner --project=gen-lang-client-0948635471 --file=iam/mi-bucket-signing-role.yaml
gcloud iam service-accounts add-iam-policy-binding mi-sin-cloud-test@gen-lang-client-0948635471.iam.gserviceaccount.com --project=gen-lang-client-0948635471 --member=serviceAccount:mi-sin-cloud-test@gen-lang-client-0948635471.iam.gserviceaccount.com --role=projects/gen-lang-client-0948635471/roles/miBucketSigner
```

Replace `APPROVED_MONTREAL_FILE_KMS_KEY` before use. The Storage service agent needs the separately approved key-level KMS grant. Inspect its actual identity before assigning it. The scanner service identity, deployment revision, private invocation policy, validated PDF parser and malware engine are approval-dependent inputs; no fictitious service or verdict should be configured. Review short-lived URL lease behavior, CORS, actual browser PUT signing and resource costs before `filesEnabled:true`. Do not copy provider sample deployments that enable scanning on unrelated buckets.

## Validation evidence and review boundaries

The Auth/Firestore emulator suite exercises the actual named-database transactions and callable runtime with fictional identities. It covers per-contractor lists, individual and duplicate bulk assignments, template snapshots, cross-user submission/reveal/upload denial, separate sign-in sessions, phone re-reveal, SIN duplicate/racing reveal/failure consumption, quarantine, file reopen/download, cancellation and disabled gates. Existing legacy and custom-domain tests remain in the same suite. Scanner and GCS adapters use controlled test doubles; these tests do not establish real cloud IAM, malware detection, browser signed-PUT interoperability or deployed status. File-adapter unit tests verify unsafe name/type/size rejection, Canadian private CMEK preflight, generation/hash/scan binding and delivery expiry. UI tests exercise independent cards, release-gated uploads, masking/hiding, authorization interruption and assignment controls, with axe semantic accessibility checks. Existing session, pagination and one-time clipboard tests remain included. Real browser visual verification and live approved cloud acceptance remain release checks.

Abandoned or rejected upload objects need an explicitly reviewed cleanup job that cross-checks upload reservations and accepted file generations. Do not add a blanket delete lifecycle rule on the quarantine prefix, because accepted persistent objects remain generation-pinned in that namespace.


## Upload security review — 12 November 2026

Reviewed PR 5 (`feature/information-requests-core`) and its stacked PR 6 (`feature/information-requests-ui`). No live configuration, bucket, IAM, rules, Hosting or Functions changes were made. Deployment status is not inferred from GitHub.

Already enforced at URL issuance: Firebase ID token verification with revocation checking, current user/provider binding, Microsoft/Google-only sign-in, active unexpired contractor approval, existing provider-trusted mailbox ownership or UID/provider/session-bound mailbox challenge, exact invitation/assignment ownership, file template snapshot, pending/quarantined status, release gates, App Check at the production callable, and request budgets. Supplied emails are not accepted as authority. A phone/SIN assignment never reaches the signer. Finalization independently authorizes the same contractor, assignment and reservation. A submitted file cannot receive a second upload reservation. Authorized staff views/downloads are fresh-authenticated, audited and repeatable, never deletion triggers.

Necessary fixes in this review:

- One absolute server deadline now governs both the reservation and signed PUT; finalization rejects expiry before object inspection and again after scanning. Successful finalization retries remain acknowledgment-only and do not create a second submission.
- Authorization is rechecked after signing so revocation/cancellation during signing cannot return a grant.
- Invalid/missing size limits fail closed instead of allowing a NaN comparison; file size remains independently capped at 10 MiB. Filenames are limited to 100 total characters.
- Delivery and deletion additionally bind stored generation-pinned object references to the exact requested assignment prefix.
- Dedicated deny-all Storage rules and a separate one-bucket manifest make the required direct-client denial reviewable and testable, without overwriting other bucket rules.
- The UI clears an expired upload-check capability and asks for a fresh file selection instead of retrying the expired reservation indefinitely.

### Dedicated Storage rules plan (operator approval required)

The pinned Firebase CLI supports an explicit `bucket` in an array-form Storage configuration. This file contains exactly the portal bucket and no Hosting, Functions, database, target aliases or default-bucket fallback. The Storage emulator test asserts its exact contents. Review the bucket identity and existing access before any rules release. Do not add a Storage section to a shared Firebase configuration.

```sh
# AFTER approval and dedicated-bucket provisioning, never during this review:
npx --yes firebase-tools@15.35.0 deploy --project gen-lang-client-0948635471 --config firebase.mi-secure-bucket.storage.json --only storage
```

This command is limited by the separate configuration to `gen-lang-client-0948635471-mi-secure-bucket`. It is not a project-wide Storage deployment. It must never use another config or the existing application's bucket. For a GCS-only, non-Firebase-registered bucket, verify that direct Firebase client access is unavailable; registration is not required by the portal and must not be performed merely to enable uploads. For a Firebase-registered bucket, independently inspect the released deny-all rules and verify denial on the actual Firebase endpoint.

### Test evidence and remaining cloud checks

Local focused results: 9 Auth/Firestore integration tests, 7 file/migration/signature tests, 1 Storage emulator test, 31 UI tests, 3 routing tests, 15 release tests and 20 identity/workflow tests passed; TypeScript and Vite build passed. The cryptographic signature test uses the real GCS client library and an ephemeral fictional key to verify that path, exact length, expiry and the generation-zero precondition cannot be altered without invalidating the V4 signature. No test key is saved. Scanner verdicts in local tests are controlled doubles, not a real antivirus service.

Tests cover unauthorized/unverified/custom-domain-without-proof accounts, inactive/expired/replaced invitations, phone/SIN-only assignments, cross-contractor IDs, concurrent reservations, wrong/stale upload IDs, expiry before/after scanning, revocation during signing/scanning, duplicate finalization, quarantine, stale/mismatched/infected scan verdicts, unsafe names/MIME/size, assignment-bound delivery/deletion, repeated staff preview/download, and preservation of one-time SIN failure/race semantics. Direct Storage emulator operations (including list, overwrite, metadata-token mutation and delete) fail for anonymous, contractor and admin identities. Storage Rules do not govern IAM/signed-URL access, so these results do not prove live GCS policy.

Release remains blocked pending operator-approved setup and actual-cloud verification:

1. Inspect or provision **only** the dedicated Montreal private bucket; verify its actual location, uniform IAM, public-access prevention, CMEK, CORS and absence of public/unrelated-principal grants. Do not commandeer another bucket.
2. Establish direct Firebase client denial as described above; inspect any existing bucket registration/rules. Do not change other buckets or global rules.
3. Apply only the reviewed dedicated-bucket runtime/scanner roles, dedicated key-level Storage-agent permission and signer-self permission; validate effective inherited IAM. Project administrators and privileged service identities remain trusted infrastructure operators.
4. Deploy and independently validate the private Canadian PDF/malware scanner with current definitions and generation/hash binding. Missing scanner configuration, unavailable scanning or failed verdicts keep files quarantined. No public scanner or user-supplied clean verdict is acceptable.
5. Before recorded file-release approval, run fictional cloud/browser tests: issue a grant for the exact file assignment; verify other assignment/path/header changes fail; verify an expired URL fails at GCS and finalization; verify a second PUT to the same object fails the generation-zero precondition (normally HTTP 412); verify a replacement attempt cannot change an approved generation; verify scan failures remain unavailable; preview/download/reopen a clean file without deletion; verify wrong identity, revocation and direct Firebase operations fail. Record results and sanitized identifiers, never URLs/tokens/document contents.

Signed URLs are bearer capabilities: GCS does not re-run Firebase assignment checks on PUT/GET. The issuance and finalization checks are the authorization boundary. Anyone holding an already issued URL can use its exact capability until expiry; revocation cannot instantly cancel a prior lease. An expired or cancelled attempt may leave a quarantined orphan requiring the reviewed cleanup process; it cannot be finalized or read by contractors. Soft-delete/version/backups and copies already downloaded remain subject to separately approved retention. The scan service and real cloud endpoint tests are outstanding release blockers, not claims of completed live security verification.

References: [Firebase scoped deploy targets](https://firebase.google.com/docs/cli/targets), [GCS signed URL bearer semantics](https://cloud.google.com/storage/docs/access-control/signed-urls), [GCS canonical requests](https://cloud.google.com/storage/docs/authentication/canonical-requests).


## Private scanner implementation follow-up

The separate stacked scanner PR supplies the private ClamAV/libqpdf service, finite timeout/retry integration and dedicated service-account/IAM setup. See [private scanner operator runbook](private-pdf-scanner.md). It does not enable files or replace the actual-cloud release checks above. The prior five-second scanner-client and 15-second Function timeouts are superseded only when that follow-up revision is reviewed and deployed. Existing PR 5 and PR 6 remain unchanged.
