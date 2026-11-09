# Phase 4 owner activation and synthetic handover

## One-time deployment operator work

Use the existing [scoped launch and rollback guide](cloud-test-launch.md). Review the draft, confirm the dedicated runtime identity and existing named database binding, and complete the cost and isolation review before deploying. Keep App Check Enterprise, the closed Firestore Rules and the existing Hosting binding. Shared Authentication and the AI Studio app are outside this release.

1. Verify the dedicated Functions identity `mi-sin-cloud-test@gen-lang-client-0948635471.iam.gserviceaccount.com` is attached and has the existing narrow Auth reader permission `firebaseauth.users.get` and reviewed access to the named database. Resolve any missing binding through the existing scoped IAM review. The browser never receives these privileges.
2. Use the existing public configuration/build steps in the launch guide. Confirm that the Entra application emits `acct` for tenant membership and that its signed `preferred_username` (or `email` if absent) is the exact approved portal account. Use the tenant ID and OAuth application/client ID already registered for Microsoft sign-in. These are configuration identifiers.
3. Run `node scripts/prepare-owner-activation.mjs`. Confirm the reviewed synthetic approvals when prompted. The command creates an ignored local file containing a digest, a 24-hour deadline and the tenant/application identifiers. It saves a random single-use code in the separate ignored, owner-only `.env.owner-activation-code` file. Only the digest is staged for deployment. Send it through an approved private channel and keep it out of tickets, logs and Git. This is the only application bootstrap step for the deployment operator.
4. Plan with `node scripts/launch-cloud-test.mjs functions`. After approval, run the same command with `--execute`, then deploy the matching isolated Hosting preview following the launch guide. The scoped launcher passes the activation digest through Functions staging. The deployment and preview are manual review steps. Use live Hosting only after the preview is reviewed and approved.
5. After activation, remove both local activation files. The transactional lock prevents reactivation even while the deployed digest is present. Keep the code out of subsequent deployments. If the code expired before use, remove both local files, generate a replacement and repeat the scoped Functions deployment after review.

Existing blank environments initialize atomically. A complete legacy setup can migrate only if Dev's existing Firebase UID and organizational provider binding match and no other legacy admin binding must be migrated. Partial bootstrap, conflicting documents and multi-admin legacy setups require a private migration review. Existing invitations, ciphertext, keys and release expiry are preserved during the supported migration.

## Staff workflow

1. Dev selects **MI staff access** and uses the approved Microsoft work account. Enter the one-time code in **Set up the SIN Portal**. No UID, object ID or Firestore document entry is required. A clean setup starts with testing closed.
2. Confirm the reviewed conditions in **Open a synthetic test window**. Each window lasts two hours. To pause it, use **Security & handling → Administrator access → Close synthetic test window**. To renew after expiry, sign in again and use the window screen. Dev's verified tenant and original identity binding are checked for each action.
3. Jeremy, Trista and Mercydes sign in with their own approved Microsoft organizational accounts during the window. Their first sign-in binds the verified Firebase UID and Entra member object ID. Dev can view, revoke and restore the four approved identities under **Security & handling**. Restoring access keeps the original binding. A renamed or replaced account requiring a new binding goes through an operator review.
4. Add one dedicated test account or upload a CSV with `name,email,status`. An Excel workbook can be saved as CSV UTF-8 first. A new browser-managed tester must use a dedicated Gmail account. Dev checks the confirmation after independently confirming the account is dedicated to testing. It can bind only after verified Google sign-in with the exact address. Existing separately attested test users can still use the previous import path. Other administrators manage approved invitations through the regular tools. Real contractor roster import is deferred until production review. Keep the existing private 46-address roster outside the test portal.
5. Review tracking and activity in the dashboard. Copy and Excel exports contain permitted metadata only. Invitation revocation blocks new requests. An already delivered export cannot be recalled.

## Read-only Auth diagnosis

A working ADC token does not prove access to Firebase Authentication. Firebase documents that Identity Toolkit rejects end-user credentials generated with the standard gcloud OAuth client. Missing scoped IAM or quota configuration can also result in a failed lookup. Run `node scripts/diagnose-auth-lookup.mjs` in the affected owner shell only if diagnosis is needed. It calls the actual Identity Toolkit lookup and prints only an HTTP status and allowlisted category. It does not print or save the token, UID, user record or upstream message. The exact response from the original Cloud Shell failure has not been independently reproduced.

The guided flow uses the attached dedicated service identity and performs Firebase revocation/user checks on the server. If that identity cannot read users, requests fail closed with an operator-facing diagnostic category. This patch cannot validate a live IAM binding from a local build.

## Production workflow review candidate

`design/production/workflow.mjs` is excluded from release artifacts. Its tests use synthetic values and test adapters. It models authenticated invitation consumption, per-record AES-256-GCM encryption with a separately wrapped key, fresh MFA authorization, an atomic one-use retrieval transition before decrypting, independently verified transfer receipts and removal of ciphertext and wrapped keys from the active record. A lost response, crash or decrypt failure consumes the retrieval attempt. Escalate to the reviewed recovery process, which must not silently reissue a reveal.

Before integration or production release:

- Independently approve the collection purpose and privacy notice, including necessity, authority, use, access, retention, questions and alternatives. Establish consent or another applicable basis and approved handling procedures.
- Implement and review actual adapters for independently scoped Cloud KMS/HSM key custody, Firestore transactions, identity and permissions, authentic fresh MFA, and approved business-record receipts. Verify separation of duties, IAM, key access logging, rollback, concurrency, failure recovery, and restore behaviour. The test key adapter is deliberately unsuitable for production.
- Establish record and audit retention, overdue/untransferred record handling, legal holds, backup/PITR retention and tested restore procedures. Deleting the active record does not erase existing backups. A shared wrapping key must not be destroyed to dispose of one record. Address any per-record cryptographic erasure requirement explicitly in the key design.
- Review the eventual plaintext boundary, no-store responses, browser memory, monitoring redaction and accidental clipboard/screenshot risk. Approve manual fallback and incident response procedures, and test them independently. The candidate is not a deployed endpoint or UI.

## Review screenshots

[Owner activation](screenshots/phase-4-owner-setup.jpg) and [Administrator access](screenshots/phase-4-admin-access.jpg) show the actual React components with local mock data. They do not show a live activation or IAM check.

## Validation

The focused local run passed 41 tests (3 routing, 14 release, 7 Phase 4 backend/candidate, 17 UI). The standard and cloud-test builds, structural checks and synthetic artifact/scope checks passed. Full emulator verification is part of the draft PR CI. Live Microsoft, IAM and first activation still need an approved preview smoke test.
