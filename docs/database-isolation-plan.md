# Database isolation plan — mi-sin-portal

Status: proposed, not provisioned/deployed. Existing project `gen-lang-client-0948635471`, owner-confirmed Blaze. Existing application's database IDs remain unverified. No default DB assumption.

## Configuration to review before resource creation

| Setting | Proposal | Gate |
| --- | --- | --- |
| Database resource | `projects/gen-lang-client-0948635471/databases/mi-sin-portal` | Inventory must prove ID unused, or establish existing ownership before any change |
| Edition/mode | Standard / Native (`FIRESTORE_NATIVE`) | Do not use Enterprise, Datastore or MongoDB compatibility without separate approval |
| Location | `northamerica-northeast1` (Montréal); Toronto `northamerica-northeast2` alternative | Actual API availability + privacy approval; immutable after creation |
| Delete protection | Enabled where supported | Database destruction protection is separate from deleting expired payload documents |
| Initial client access | Deny all, including intended contractors/admins | Dedicated file `firestore.mi-sin-portal.rules`; not a functional collection ruleset |
| Indexes | Dedicated `firestore.mi-sin-portal.indexes.json`; ciphertext indexing disabled | No assumed dashboard composite queries; add only validated query-specific indexes later |
| TTL/PITR/backup/restore | No enablement proposed now | Separate operational/billing approval; deletion/backup guarantees remain unresolved |
| Production collection | Disabled | Financial, isolation, crypto/privacy/security review and actual acceptance evidence required |

## Isolation actually provided

Named databases have separate document namespaces, Rules releases and indexes. A permissive rule in another DB does not grant access to portal records. The portal role table lives in its own DB; no existing app user/profile/admin flags are reused. Explicit SDK construction and database-only deploy configuration prevent normal code/deploy fallback to another DB. No shared default config is overwritten.

This does **not** isolate Firebase Authentication accounts/providers/domains/templates, project owners, broad IAM server identities, quotas or billing. Admin SDK/service accounts bypass Rules, so future backend/deploy credentials must be reviewed for database scope using supported IAM/database conditions, not blanket project roles. If narrow scopes cannot be demonstrated, document risk and stop rather than silently grant broader access. No IAM changes occur in Phase 1.

A portal user can deliberately create a different SDK handle. Portal Rules cannot deny that user's access to a different DB whose own Rules permit it. Existing app access requires its own correct policy. Since those rules are unread, a claim that all portal users are prevented from accessing all existing app data is **unverified**. Do not fix this by changing existing app Rules without owner impact review/approval.

## SDK/development controls

- Project and DB IDs are constants; no URL/env fallback to `(default)`, no dynamic DB selector.
- Every application document/query/batch uses the same exported named handle. Ban independent `getFirestore(app)` calls by code review/static test.
- `src/firebase/portal-db.mjs` implements only demo-emulator access at this phase; rejects the live project before SDK initialization. It explicitly calls `initializeFirestore(..., 'mi-sin-portal')` and configures memory cache/local emulator.
- Future approved production initialization must separately pin the real project and registered portal app ID; fail if database ID is missing/mismatched. No default app auto-initialization. Auth may share project while frontend app instance remains named.
- Optional server modules must explicitly use named database initialization and have tests for IAM/scope; no Admin SDK path or deploy identity exists in current prototype.

## Tests and interpretation

`npm test` checks explicit SDK DB argument/cache, missing/default/wrong DB rejection and deployment manifest/selector constraints. Emulator suites test verified matching invitation, unauthorized/unverified roles, manager-only invitation create, role escalation denial, create-only batch/20-way race and no sensitive-record reads. Closed suite tests actual deny-all candidate against all client roles.

The pinned CLI/Firestore emulator combination initially failed when an array of multi-DB configuration was used: it warned multiple databases were unsupported and fell back to open rules. Negative tests caught unauthorized successes; that run is **not** a security pass. The harness now uses a single explicitly loaded rules source with `database == 'mi-sin-portal'` and default deny for other DB IDs. This proves named SDK routing and rules conditions under the emulator, not independent production Rules-release deployment. Never accept a test run with missing/open rules. The synthetic `existing-app-sentinel` DB and emulator `(default)` are fixtures, not discovered actual resources; neither receives cloud writes. Real independent release/permissions behavior still needs approved, scoped staging verification after financial approval.

Emulator indexes, quotas, IAM, Auth-provider behavior and some transaction semantics differ from production. Do not interpret green local tests as live app non-interference or production readiness.

## Approval sequence

1. Authenticate read-only and complete inventory + existing app ownership/configuration baselines.
2. Finance reviews named-DB usage charges/no extra allowance and acknowledges CAD $0 cannot be guaranteed.
3. Privacy approves Canadian location + US Auth/global delivery terms; security reviews key custody, original acceptance gaps and chosen backend option.
4. Existing app owner approves impact/deploy/rollback plan with zero unreviewed Auth/IAM changes.
5. Review and approve exact resource configuration before **creating** DB/site/app. Separate approval before rules/Hosting deployment, with independent security/privacy approval before data collection.

Primary references: [database management](https://firebase.google.com/docs/firestore/manage-databases), [database-specific Rules](https://firebase.google.com/docs/rules/manage-deploy), [emulator limitations](https://firebase.google.com/docs/emulator-suite/connect_firestore), [locations](https://docs.cloud.google.com/firestore/native/docs/locations). No creation commands were executed.
