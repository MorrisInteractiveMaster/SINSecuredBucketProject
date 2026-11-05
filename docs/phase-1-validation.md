# Phase 1 named-database revision — validation record

November 5, 2026. Proposal/local isolation proof only. Existing project owner confirms Blaze; no cloud resources/settings changed, no merge/deploy, no real SIN collection.

## Repository and live inspection

PR #1 inspected open/draft/unmerged at `fe955ba7474d666a42c8eb6fd2be84e4197bb6d1`. Original local tracked documents/prototype were matched against remote Git blobs before editing (only the intended ignore-file addition preceded comparison). Existing MI CSS/14 screen concepts preserved; review badge/welcome notice adapted for named Blaze DB. No original logo/font asset replaced or reconstructed.

Firebase plugin instructions are installed, but authenticated project tools are not exposed and CLI has no authenticated session. Firebase CLI 15.35.0 `firestore:databases:list --project gen-lang-client-0948635471 --json` returned authentication failure. Actual existing database IDs/locations/rules/indexes, app/Hosting associations, Auth/providers/domains/MFA, IAM and billing usage were **not** inspected. No assumption that existing DB is `(default)`. No successful live security audit, billing quote or existing-app regression test is claimed.

## Completed local checks

- `npm test`: **3 passed**. SDK initializer explicitly selects `mi-sin-portal`/memory cache, rejects missing/default/other DB and real project, and pure deployment-plan checks reject another DB, extra DB, shared service blocks or existing-site override.
- `npm run test:emulators`: **6 passed** using demo project and actual named SDK. Matching verified contractor can get invitation; unknown/unverified denied; only explicit portal manager can create a bounded invitation; role self-grant/schema pollution/partial submission denied; contractor/manager/custodian sensitive reads denied; create-only replay/update/slot deletion denied; 20 competing submission batches yielded **one** success; synthetic existing/default database sentinel unchanged with get/write denial.
- `npm run test:emulators:closed`: **2 passed** against the actual deny-all candidate file. Every tested client role (anonymous, contractor, manager, custodian, auditor) denied reads/queries/creates/updates/deletes; synthetic existing/default DB access denied and sentinels unchanged.
- `python3 scripts/check_phase1.py`: **PASS** for existing Blaze/named target, closed financial/privacy/collection gates, scoped manifest/Rules, disabled 14-state prototype, document links and original acceptance rows 1–15.
- Prototype script JavaScript syntax check passed. Its only changes are non-operational notice/badge text; prior 14-state browser navigation evidence remains relevant. No new mobile/device/accessibility certification is claimed.
- `npm audit --omit=dev --audit-level=high`: **0 vulnerabilities** after remediation described below. This does not certify the entire CLI supply chain or future production build.

## Test configuration failure caught and corrected

The first emulator run used a multi-database `firestore` array. CLI 15.35.0 / emulator 1.22.0 warned multiple databases were unsupported and loaded no Rules, falling back open. All six security tests failed, including unauthorized access and 20 successful concurrent overwrites. This was a failed configuration test, **not** an accepted result.

Corrected local harness uses one explicitly loaded Rules source, a `database == 'mi-sin-portal'` guard for positive model permissions and deny-all for all other DB IDs. Tests then pass for model and actual closed source. It does not test independent production Rules release deployment, actual existing app Rules or full production multi-database semantics. The synthetic `existing-app-sentinel` and emulator `(default)` IDs are test fixtures, not discovered cloud IDs. Do not deploy emulator configs/functional fixture, assume implicitly created emulator DBs are protected, or report these results as live regression evidence.

The limited functional model proves invitation/paired-create routing/role behavior only; production candidate remains deny-all. Full revoke/reissue/status/audit/disposal/real-MFA/cryptography and backend crash/retention guarantees remain future work. Emulator claims are fabricated test identities, not evidence of real-provider MFA. Concurrency produced transient emulator lock timeouts before the expected final outcome; actual production transaction/quotas/index behavior still needs approval-scoped proof.

## Dependency review

Pinned Firebase 13.2.0's Node Firestore dependency selected `@grpc/grpc-js` 1.9.x. npm audit reported the upstream certificate-auth-context advisory. Added a documented dependency override to patched **1.14.7**, regenerated lockfile and reran unit/model/closed tests plus production-dependency audit. Primary advisory: [grpc-node GHSA-m9gg-hp2v-232j](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j). The override exceeds the upstream dependency range and must remain compatibility-tested/reassessed on SDK updates. No blind downgrade to old Firebase was applied.

## Still unverified / blocked

No database creation, live rule/index deployment, web app/site registration, Auth user/provider/domain modification, IAM/billing change, TTL/backup/scheduler/Function activation occurred. Actual account inspection and Canadian-region rates/availability, existing-app association/regression, financial exposure, crypto/offline custody/handoff, real signed MFA and original content-validation/retrieval/disposal guarantees remain unresolved. No security/privacy independent review was completed. Cloud collection is disabled and this review does not authorize any of those actions.
