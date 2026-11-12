# Contractors & requests: review and release

This change builds on main after merged PRs #5–#8. It does not deploy, migrate, reimport, restore or renew live records, enable files, or change infrastructure, Auth, App Check, Rules, IAM, scanner, KMS or existing retrieval behavior.

## Staff workflow

- **Contractors & requests** opens with all access states, not just active invitations. Search, filter, sort and paginate (10/20/50) without losing the chosen page size. The counts distinguish active, expired, revoked and removed access from individual request progress.
- Every row lists saved assignment labels and independent statuses. Expand it for request actions, access explanations and recorded activity. The earlier record/metadata drawer preserves access to legacy one-time records.
- **Add contractor** collects optional name, email, access expiry and checked request types. Review before saving. One backend transaction creates the contractor and assignments or writes nothing. Blank names use the email local-part. New invitations default to 30 days; administrators can choose a future date within one year.
- **Add request** works on a row or selected active contractors. Already assigned invitation/template pairs are skipped, including completed/cancelled slots. Submitted records are never reset.
- **Bulk add / assign** previews a private CSV (`name,email,status`, `email,status`, `name,email` or `email`). No file is committed or sent until the reviewed operation. Duplicate/invalid/revoked/expired/removed rows are shown and excluded. Existing contractor names, identity, expiry and records are preserved. Choose common templates and optionally customize each row. No automatic invitation email is sent; staff share the website link manually.
- Batches create at most 25 new contractors and 50 assignments, or assign at most 50 pairs. Existing backend rate/capacity limits remain. Per-batch confirmations and per-pair assignment results show saved/skipped work. On failure, later batches stop. Refresh/re-preview before retrying an uncertain batch: a duplicate creation conflicts atomically; existing assignment slots skip rather than duplicate.
- **Manage templates** edits label, instructions, validation and active/archived status. Edits affect future assignments only. Existing snapshots, historical labels and submitted data are unchanged.
- Confidential values never enter tracking lists, CSV previews, clipboard metadata or Excel exports. Existing permission/audit checks still protect copy/export. PDF upload/access remains separately gated; a disabled file gate does not mean requests are disabled. The saved PDF and its metadata are not deleted or changed by this release.

## Revocation investigation and recovery

The owner-provided live inspection reports **49 stored `revoked` records**, not 49 expired active records. No live audit connection is available in this development workspace; the actor/time/root cause cannot be established from source or GitHub alone. Do not characterize the revocations as expiry.

Source review identified these write paths: explicit administrator/bulk revoke (`invitation_revoked`), legacy CSV upsert status (`invitation_revoked` / `invitation_removed`), and a correction hold (`correction_requested`, with allowlist revocation). Expiry is computed for an active record and does not write `revoked`. The staff cloud CSV importer is create-only except explicit name edits; the retained legacy upsert now also rejects reactivation through CSV and preserves unknown existing metadata/bindings.

Expand a contractor and choose **Load recorded activity**. This uses the authorized backend audit API. Pages scan 100 global events and then filter by invitation, with **Search earlier activity** when more remain. An empty page is not evidence of the cause. Review this evidence and the business reason before restoring any of the 49. No automated repair script is necessary or supplied.

### Restore and renew are separate decisions

1. Select revoked contractors and choose **Review and restore access**.
2. Preview eligibility and existing expiry; correction holds and removed/invalid records are blocked with an explanation. A recent sign-in (5 minutes) is required by the backend.
3. Type **RESTORE ACCESS** and confirm the eligible records. This changes only stored approval to active and access audit metadata. An expired record remains expired and denied.
4. If renewal is justified, separately choose **Renew invitation(s)**, review a future expiry and type **RENEW INVITATIONS**. Revoked approval cannot be renewed without the preceding separate restoration review.

A server-side `contractorReviews/{uuid}` receipt in `staffWorkspace/v1` binds the review to its administrator, action, record access fingerprint and expiry (10 minutes). Apply rechecks pinned staff identity, active invitation-management role and import/privacy approval in the transaction. Changed access fields invalidate the review; confirmation cannot be replayed as a new change. Retries return the original acknowledgment. Each changed record gets a server audit event. Bulk review/apply uses at most 25 records per transaction and reports blocked records.

Invitation IDs, references, revisions on restore/renew, provider/mailbox bindings, assignments, submission records, consumed slots, missing consumed payloads, encrypted records, PDF generation pointers and historical events are preserved. Restore does not regenerate an invitation or resurrect a consumed value. Revocation increments the existing access revision. No direct browser Firestore reads/writes are enabled.

## Validation

New tests cover access-state distinctions, 30-day defaults, CSV classification/name fallback, batch bounds, labels/snapshots, guided creation, duplicate prevention, template editing, selected metadata scope, restore confirmation, pagination and failure reporting. Auth/Firestore emulator integration tests exercise real runtime authorization, concurrent creation, atomic conflict rollback, permission loss before apply, expired/stale reviews, concurrent idempotent restore, separate renewal, correction/removed blocks, and preservation of consumed submissions and an existing PDF metadata record. The existing encryption, custom-domain verification, one-time retrieval, persistent reveal, session and file security suites remain in the full CI run.

jsdom interaction/axe checks are not a substitute for rendered contrast, layout or actual-cloud validation. Local Chromium cannot start because this workspace denies its required Unix socket. Before release, check keyboard, touch, focus/tooltip placement, mobile/table scrolling and dialog readability in the Hosting preview. Screenshots are unavailable from this environment; no simulated screenshot is presented as browser evidence. No live security or data inspection was performed.

## Minimal scoped deployment after PR review and release authorization

Both **Functions and Hosting** change. Use the existing owner Cloud Shell checkout and existing ignored public `.env.cloud-test.local` and `.firebaserc` configuration. No new resource, Rules, IAM or policy changes and no contractor reimport/migration are needed. Do not use broad `firebase deploy` or run initialization/provisioning scripts.

```bash
cd ~/SINSecuredBucketProject
# After review, use the approved merged commit. Confirm this is the expected checkout.
git switch main
git pull --ff-only origin main
npm ci --ignore-scripts
npm run test:all
npm run build:cloud-test
npm run check:cloud
npm run prepare:cloud
# Plan-only output: verify exact dedicated codebase/site before execution.
node scripts/launch-cloud-test.mjs functions
node scripts/launch-cloud-test.mjs preview
# Only after deployment authorization:
node scripts/launch-cloud-test.mjs functions --execute
node scripts/launch-cloud-test.mjs preview --execute
# Verify the preview with an authorized staff identity, then publish Hosting only:
node scripts/launch-cloud-test.mjs live --execute
```

The launcher targets project `gen-lang-client-0948635471`, Functions codebase `mi-sin-synthetic` (`miSinSynthetic`, Montreal), and Hosting target/site `mi-sin-portal`, using `firebase.mi-sin-portal.cloud-test.json`. Retain existing owner-approved runtime configuration and public App Check key. Stop if the preflight reports a mismatched database/site or missing existing configuration; do not recreate resources. Do not stage obsolete owner activation or scanner-network environment files. No default site, unrelated function, AI Studio resources or Firestore Rules deployment is required.

Verify: all 49 records remain revoked until explicitly reviewed; historical 45 assignments retain labels/status/IDs; previously consumed SINs remain unavailable; the existing scanned PDF metadata remains intact while files stay disabled; add only a fictional approved test account, assign two types, confirm duplicate protection, and check activity/copy/export. Do not use real confidential values for validation. Confirm separate restore/renew behavior on an intentionally created test record before reviewing actual access changes.

Rollback: check out the previously approved commit, rebuild/stage using its existing commands/configuration and deploy only the same Functions codebase and Hosting target. Restore the previous Hosting release through the dedicated site's release history if preferred. Keep newly created metadata/receipts and existing records; never roll back Firestore data, undo consumed slots or rerun migrations. Rolling back code does not undo administrator access changes already confirmed; review those through authorized operations. Leave `filesEnabled` false throughout.
