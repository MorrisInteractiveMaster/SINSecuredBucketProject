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

The legacy `submissions` and `sealedSin` collections are untouched. Legacy submitted/retrieved values keep their original one-time semantics, including non-SIN values. Existing tracker actions continue to serve those records. When the new gate is enabled, old global-field submission requests fail before writing. New assignments are created explicitly or through the preview/apply migration. No retrieved values are reconstructed. Disabling the new gate closes its APIs and returns the UI to the previous model. A rollback must keep its records intact and must not restore consumed payloads.

## Private files

Proposed bucket ID is `gen-lang-client-0948635471-mi-secure-bucket`. No bucket is created by this branch. Runtime bucket operations verify the exact name, Montreal location, uniform bucket IAM, enforced public-access prevention and the approved Canadian default KMS key. The backend signs a five-minute create-only PUT for one opaque object, content type and exact content length. It rechecks object metadata, generation, CMEK and PDF header/size, hashes the exact object generation, and requires an authenticated scanner verdict tied to that generation and hash. Only then does the assignment become submitted.

PDF is the only enabled file type. DOCX, PNG and JPG need separately reviewed validators/scanner support and are rejected today. File names are bounded and validated before signing, then discarded. Object paths contain opaque assignment/upload UUIDs. No Firebase download token is created. Staff receive a one-minute signed URL pinned to the clean generation, with a PDF content type and generic name. Preview is sandboxed. Deletion is an explicit owner-only, fresh-authenticated two-phase operation, independent of viewing. A partial deletion leaves the assignment inaccessible until retried. Backup/soft-delete/version retention remains a separate operator decision.

**File release blocker.** This repository includes the scanner client contract and fail-closed gate, not a deployed antivirus engine. A private scanner must independently read the specified generation, verify the SHA-256 and actual PDF structure, scan with an approved current malware engine, and return `{clean,bucket,object,generation,sha256,engine,definitionsAt}`. A clean verdict requires definitions less than 24 hours old. Unknown, infected, stale, mismatched and unavailable results remain quarantined. No client API accepts scanner verdicts. Files must stay disabled until the actual service and adversarial file tests pass.

## Operator-only provisioning and release

1. Inspect actual deployed Function revision, Hosting version, database rules, KMS and runtime IAM read-only. Record the current version for rollback and smoke-test the unrelated AI Studio app through its approved procedure. This environment has no authenticated cloud session to perform those checks.
2. Review the metadata-only migration preview. Apply only after review. It never touches legacy payloads or consumed states. Independently test with fictional identities and values.
3. For files, approve creation of the dedicated private Montreal bucket, its Canadian default CMEK, retention and CORS for only the portal origins. CORS needs PUT and headers `Content-Type` and `x-goog-if-generation-match`; test browser-generated signed Content-Length. Enforce uniform access and public-access prevention. Keep Firebase client Storage rules denied and do not replace any shared Storage rules.
4. Grant the portal runtime only object create/get/delete on this bucket and signing permission on its own dedicated signer identity. Prefer a bucket-scoped custom role over project-wide storage roles. Grant the Storage service agent encrypt/decrypt only on the dedicated file CMEK. Do not grant runtime Storage Admin. File signing requires keyless `iam.serviceAccounts.signBlob` on the approved signer, never a downloaded key.
5. Deploy/validate an approved private Canadian scanner service. Grant its identity read-only access to the dedicated bucket and the portal runtime Cloud Run Invoker on that scanner service only. The scanner URL must be an approved `https://…a.run.app` origin. No public scanner invocation. Its identity must not read Firestore or unwrap text values.
6. Keep `filesEnabled:false` unless all file controls pass. A reviewed `policy/requests-v2` includes `enabled`, actual `approvalReference`, and optional `filesEnabled`, `storageBucket`, `filesKmsKey`, `scannerUrl`. Never fabricate a release decision. All existing staff and SIN release gates must also remain valid.
7. Build and use only the existing scoped launcher for this codebase and Hosting target. No rules, Auth or other-app changes are needed. Never use a project-wide deploy.

```sh
npm ci --ignore-scripts
npm run test:all
npm run build:cloud-test
node scripts/check-ui-artifact.mjs
node scripts/launch-cloud-test.mjs functions --execute
node scripts/launch-cloud-test.mjs live --execute
```

Before live promotion, verify two separate fictional contractors, independent requests, role revocation, mailbox verification, cross-user denial, SIN reveal races/failure, persistent views, quarantined uploads, clean generation-pinned delivery and explicit deletion retries. Signed URLs remain bearer access until their short expiry even after role revocation. Hide/sign-out clears browser state but cannot revoke already issued URLs or external copies. Closing the feature gate does not erase data. For rollback, close the new gate, restore the recorded scoped Hosting/Function revisions, and retain all request, audit and legacy records. Do not roll back the database or shared authentication settings.


## Migration and gate commands

Create a private ignored `operator-input.requests.json` containing the recorded `approvalReference` UUID and `filesEnabled:false`. No contractor emails or UIDs go into this file. Use the approved operator ADC for the dedicated database. Preview reads counts only. Apply requires a typed confirmation.

```sh
node scripts/requests-operator.mjs migrate operator-input.requests.json
node scripts/requests-operator.mjs migrate operator-input.requests.json --apply
node scripts/requests-operator.mjs enable operator-input.requests.json
node scripts/requests-operator.mjs enable operator-input.requests.json --apply
```

The migration snapshots the current global field into a deterministic template and assigns it only to active, unexpired legacy invitations without any submission document. It never migrates submitted or consumed records and never edits contractor metadata. It can be rerun safely. Template or field changes during migration stop that transaction instead of guessing. Contractor assignments added by staff coexist with migrated requests. Finish the reviewed migration and assignment plan before enabling the new model, since old global submissions are then rejected.

Files additionally require the actual `fileApprovalReference`, `filesKmsKey` and approved private `scannerUrl`. Keep files off until provisioning and live adversarial tests pass. Do not add these fields to the older staff provisioning input. To close only this upgrade:

```sh
node scripts/requests-operator.mjs pause operator-input.requests.json --apply
```

## Narrow provisioning command plan

These commands are for an authorized operator **after explicit approval**. They are not executed by the application, migration or tests. The bucket does not need registration as a Firebase default Storage bucket. GCS IAM governs its backend access; existing Firebase Storage rules are not deployed or replaced.

```sh
# Use the approved Canadian KMS key resource and reviewed retention settings.
gcloud storage buckets create gs://gen-lang-client-0948635471-mi-secure-bucket --project=gen-lang-client-0948635471 --location=northamerica-northeast1 --uniform-bucket-level-access --public-access-prevention

gcloud storage buckets update gs://gen-lang-client-0948635471-mi-secure-bucket --default-encryption-key=APPROVED_MONTREAL_FILE_KMS_KEY

gcloud iam roles create miBucketFiles --project=gen-lang-client-0948635471 --file=iam/mi-bucket-files-role.yaml
gcloud storage buckets add-iam-policy-binding gs://gen-lang-client-0948635471-mi-secure-bucket --member=serviceAccount:mi-sin-cloud-test@gen-lang-client-0948635471.iam.gserviceaccount.com --role=projects/gen-lang-client-0948635471/roles/miBucketFiles

gcloud iam roles create miBucketSigner --project=gen-lang-client-0948635471 --file=iam/mi-bucket-signing-role.yaml
gcloud iam service-accounts add-iam-policy-binding mi-sin-cloud-test@gen-lang-client-0948635471.iam.gserviceaccount.com --project=gen-lang-client-0948635471 --member=serviceAccount:mi-sin-cloud-test@gen-lang-client-0948635471.iam.gserviceaccount.com --role=projects/gen-lang-client-0948635471/roles/miBucketSigner
```

Replace `APPROVED_MONTREAL_FILE_KMS_KEY` before use. The Storage service agent needs the separately approved key-level KMS grant. Inspect its actual identity before assigning it. The scanner service identity, deployment revision, private invocation policy, validated PDF parser and malware engine are approval-dependent inputs; no fictitious service or verdict should be configured. Review short-lived URL lease behavior, CORS, actual browser PUT signing and resource costs before `filesEnabled:true`. Do not copy provider sample deployments that enable scanning on unrelated buckets.

## Validation evidence and review boundaries

The Auth/Firestore emulator suite exercises the actual named-database transactions and callable runtime with fictional identities. It covers per-contractor lists, individual and duplicate bulk assignments, template snapshots, cross-user submission/reveal/upload denial, separate sign-in sessions, phone re-reveal, SIN duplicate/racing reveal/failure consumption, quarantine, file reopen/download, cancellation and disabled gates. Existing legacy and custom-domain tests remain in the same suite. Scanner and GCS adapters use controlled test doubles; these tests do not establish real cloud IAM, malware detection, browser signed-PUT interoperability or deployed status. File-adapter unit tests verify unsafe name/type/size rejection, Canadian private CMEK preflight, generation/hash/scan binding and delivery expiry. UI tests exercise independent cards, release-gated uploads, masking/hiding, authorization interruption and assignment controls, with axe semantic accessibility checks. Existing session, pagination and one-time clipboard tests remain included. Real browser visual verification and live approved cloud acceptance remain release checks.
