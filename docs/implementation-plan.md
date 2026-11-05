# Named-database implementation and acceptance plan

**Phase 2 update:** The local Microsoft/Google, backend authorization, CSV and encrypted synthetic submission MVP is implemented; see [current implementation and validation](phase-2-mvp.md). The Phase 1 plan below is retained as review history. Its password baseline is superseded by OAuth plus trusted email ownership or supplementary portal verification. Cloud resources, real provider configuration, sensitive retrieval and disposal remain blocked.

November 5, 2026. Existing project `gen-lang-client-0948635471`, Blaze confirmed by owner. Proposed Standard/Native DB `mi-sin-portal`, Montréal subject to privacy/availability. No new project, billing change, merge, deployment or creation now. Additional actual spending target CAD $0; do not guarantee it for billed usage.

## Phase 1 review package

Deliver architecture, data-flow, database isolation/impact/deploy plans, usage-cost/Functions comparison, privacy/custody/threat/gap registers, dedicated closed Rules/index/config proposals, explicit named SDK helper and local automated isolation proof. Preserve all 14 screens, MI CSS and approved logo/font constraints. No finished React app, live Auth integration, crypto utility, retrieval backend or production collector is claimed.

Current live inspection blocked: pinned CLI inventory failed authentication. Database IDs/locations/rules/indexes/associated apps/Hosting/Auth/IAM/actual billing usage remain unread; owner Blaze confirmation is accepted, not re-inferred from names. Complete project-investigation.md before any resource approval.

## Phase 2 — local synthetic functional MVP

1. Complete read-only inventory and actual app/config baselines; no reset/setup/deploy as an inspection shortcut. Confirm proposed DB ID unused and review Standard/Native/Canadian location/delete protection/cost.
2. Build React/Vite/TypeScript/Tailwind with modular Firebase SDK and locked versions. Current JavaScript routing module is a small isolation proof. Integrate it into a central typed initializer later, retaining explicit named DB and memory cache. No SDK default fallback, independent db handle, user-controlled selector or live-project connection in demo build.
3. Auth: existing supported provider only after owner review; verified email/password baseline, Firebase verification link, refresh identity token, portal-specific roles/active invites. Manual corporate instructions; no password/SIN/key in mail. Auth remains shared and does not create automatic portal roles.
4. Expand emulator-only model to full invitation/revoke/reissue/status/audit/disposal schema. Enforce exact field/type/size/state/owner checks and atomic getAfter relationships; never use a client that bypasses Rules to test authorization. Permanent slot and no contractor payload reads.
5. Web Crypto synthetic test vectors and offline key/tool/handoff proof; no committed private keys, real SINs or cloud key import. Client checksum is input quality, not issuance proof. Hidden content validation gap remains explicit.
6. Metadata-only admin dashboard; distinct invitation/custodian/disposal/audit roles. Actual closed candidate remains closed until reviewed functional Rules replace it. Local-only model is never deployed using its fixture config.
7. Select static versus optional broker only after financial/security/privacy review. Broker can strengthen single delivery/audit and cleanup but doesn't validate browser ciphertext without changing trust boundaries or prevent repeated offline decryption. No backend code/deploy added merely due to Blaze.
8. Actual provider MFA/refresh/revocation/session and full privacy/logging/device checks remain required; emulator claim injection is not real MFA evidence.

Local dependencies were installed with scripts disabled; `npm ci --ignore-scripts` is the reproducible reinstall command. Verification commands run for this revision:
- `npm test`: named SDK and deployment-manifest unit checks.
- `npm run test:emulators`: local functional subset / named routing / authorization / batch race.
- `npm run test:emulators:closed`: actual deny-all candidate client closure tests.

Pinned CLI 15.35.0 uses Java 21 emulator; no login/cloud project required for demo tests. The test harness refuses absent/wrong local FIRESTORE_EMULATOR_HOST/GCLOUD_PROJECT and the SDK helper refuses real project initialization. Emulator admin REST is used only to seed synthetic fixtures on loopback; assertions use unprivileged mocked Auth clients. It is not a production endpoint or an authorization bypass test.

The pinned emulator ignored the initial multi-DB array and defaulted open; negative tests failed. Corrected harness loads one explicit rule source with named-DB guard/default deny. Both model and closed suites then passed. This is not validation of independent cloud Rules releases, indexes or existing actual permissions; see database-isolation-plan.md. Do not upgrade from this result to an actual cloud test without approval.

## Phase 3 — independent security/privacy and existing-app verification

Review real DB Rules/IAM/Auth and association maps; assess new-portal-user access to existing DB separately. Owner-approved existing-app baseline/regression tests are not replaced by local sentinels. Independent crypto/custody/data-handling review, signed MFA/freshness integration, abuse/cost controls, atomic full lifecycle/crash/recovery and retention/restore tests. Scan logs/storage/build artifacts with synthetic canaries, never real SINs. Resolve hidden-input validation, one-time delivery and disposal gaps without inventing guarantees.

## Phase 4 — gated provisioning/deployment preparation

Separate approvals: (a) resource config + Canadian privacy and usage charges before creation, (b) exact database/site/app/Rules/index targets and existing-app impact before deploy, (c) real collection only after independent review and all original mandatory properties demonstrated. No auto-merge/deploy, no project downgrade/billing action/IAM/Auth change. Prepare GitHub CI read-only demo jobs first; any later portal deploy uses explicit project/config/selector and immutable reviewed artifact. Deployment credentials never appear in PR workflows/source/logs. Least-privilege database-specific backend/deploy access must be reviewed, not granted now.

## Original 15 acceptance criteria

| # | Requirement | Revised evidence / present disposition |
| --- | --- | --- |
| 1 | Unknown email denied | Model rejects anonymous/unverified/uninvited; actual Auth/provider and existing shared-user behavior still need review |
| 2 | Expired invite denied | Full expiry/revoke/reissue model boundaries remain to implement/test; active-invite expiry check exists in limited model |
| 3 | Verification short-lived and not replayable | Firebase email-verification link replaces custom OTP; real provider expiry/replay/token-refresh/delivery tests pending |
| 4 | Invalid SIN rejected | UI format/Luhn plan; Rules/public-key-only backend cannot validate hidden SIN; **unresolved server-content guarantee** |
| 5 | Submit once | Model create-only deterministic slot/paired payload; replay denied; full status/event/reissue transitions pending |
| 6 | Concurrent requests no duplicates | Model 20 competing batches yielded one successful submission; actual service transaction limits still need approved proof |
| 7 | No plaintext DB | Closed gate accepts no data; model Bytes/schema only, no real SIN; actual crypto and all-writers assurance unresolved |
| 8 | Ordinary admin cannot retrieve | Model manager/custodian no payload reads; actual gate blocks all; future assignment/MFA/Rules/IAM checks pending |
| 9 | Authorized retriever completes fresh MFA | Actual signed second-factor evidence/reauth semantics unknown; password/iat not sufficient; real reads disabled |
| 10 | One-time retrieval cannot replay | Static direct get cannot consume read; optional backend transaction-before-ciphertext delivery can strengthen operation, not repeated local decrypt; unimplemented |
| 11 | Retention/deletion correct | Proposed atomic active delete/tombstone and optional billed eventual TTL/backend; no exact-time backup/global erasure; not active |
| 12 | No SIN in logs/errors | Current prototype no input/network; synthetic proof fixtures only; full crypto/browser/backend/provider logging proof pending |
| 13 | Mobile/desktop | Existing responsive CSS/14 screens retained; real device/functional mobile tests pending |
| 14 | Keyboard/contrast | Existing labels/focus/style retained; full accessible built app, screen-reader and contrast checks pending |
| 15 | No insecure production defaults | Closed Rules, emulator-only helper and exact deploy manifest unit checks; live creation/deployment blocked; actual cloud integration still unverified |

Additional mandatory isolation tests: explicit named handle; missing/default/other DB refusal; no portal data in synthetic existing/default DBs; unauthorized get/list/write denied; existing fixture unchanged; manifest cannot add another DB or shared service block. These pass locally. Full real existing-app data denial cannot be asserted until its own Rules are inspected. A portal rule cannot fix permissions in another database.

## Production-readiness gates — all still open

- [ ] Authenticated read-only inventory, actual billing usage/rates and existing app DB/source/Rules/IAM association.
- [ ] Financial decision on nonzero usage exposure; if absolute zero required, remain emulator-only.
- [ ] Location/privacy/cross-border/legal purpose/SIN-versus-BN/notice/contact/official destination approval.
- [ ] Exact isolated resource config and owner no-disruption test/rollback plan approved before creation.
- [ ] Fully validated functional Rules/indexes, named SDK/server selection and independent deploy/permissions behavior.
- [ ] Crypto/offline custody/recovery/handoff and real MFA reviewed/demonstrated.
- [ ] Original validation/retrieval/disposal requirements met or unresolved work remains disabled; no silent weakening.
- [ ] All acceptance criteria, real-app regression and security/privacy independent review completed against release artifact.

No database migration/data move is proposed. Dedicated empty database and app/site registration are future reviewed creations; the existing app and database remain in place.
