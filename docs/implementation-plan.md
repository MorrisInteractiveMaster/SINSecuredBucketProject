# Firebase-only phased implementation and acceptance plan

November 5, 2026 · Incremental infrastructure budget **CAD $0**, Spark only. Keep PR #1 draft; no merge, live deployment or service changes before revised-design review. A design review is not production security/privacy approval.

## Phase 1 — Revised proposal (this package)

Retain MI colours, restrained Altitude-inspired structure, responsive layout, 14 screen concepts, legal-purpose analysis and all 15 original acceptance requirements. Replace paid infrastructure with React/Vite/TypeScript/Tailwind, Firebase Web SDK, Auth, Firestore/Rules, static Hosting and Web Crypto. Add project-investigation and requirements-gap registers, no-cost evidence, offline-custody design and clearly limited handling/disposal semantics.

Original brand review remains valid: Visby CF Regular body, Demi Bold headings/Extra Bold emphasis when licensed; sentence case and MI logo rules override Altitude. Original logo assets and licensed font binaries remain unavailable. Use plain labelled organization text and system-ui, not a reconstructed logo or unlicensed font.

Live project configuration remains uninspected pending Firebase connection; Default Gemini is first candidate, no project selected. No integrated live Rules patch, database, web app, Hosting site or deploy workflow is created during Phase 1. Structural prototype checks are not security-rule tests.

## Phase 2 — Local synthetic functional MVP

1. Complete read-only [project investigation](project-investigation.md) in order before considering later live synthetic hosting. Do not hold local development up on this connection. Do not turn a failed query into proof a service is absent.
2. Set up React/Vite/TypeScript/Tailwind and modular Firebase SDK with a lockfile. Minimum dependencies: react/react-dom/firebase; build TypeScript/Vite/Tailwind; tests use `@firebase/rules-unit-testing` plus a standard JS runner. Use Firebase CLI + a supported JDK for the local Firestore emulator; pin supported versions at implementation. No server framework or paid remote runner.
3. Use a `demo-mi-sin-portal` project ID and explicit Auth/Firestore emulator endpoints bound to local interfaces. Refuse to initialize a non-demo project in the synthetic build; configure SDK emulators before first network use. Test code must fail if emulator environment variables are missing. No live Firebase API keys/credentials are needed for demo emulator tests.
4. Implement a **standalone emulator-only** schema/rules proof from the architecture contract. Use default-deny for the isolated test model; it is not a replacement for any existing project's Rules. Seed roles/policy/fixtures only via test setup with `withSecurityRulesDisabled`; all assertions use normal authenticated/unauthenticated clients. Never run real tests with an Admin SDK that bypasses Rules.
5. Auth flow: email/password, Firebase verification link, `reload` + ID-token refresh, exact signed verified email and provider binding. Emulated verification does not prove production deliverability or MFA. Manual corporate invitation instructions replace an automated portal sender. No password/private key/SIN in invitations.
6. Implement metadata-only dashboard, invitation expiry/revocation/reissue, deterministic submission slot/payload batch, scoped statuses and paired disposal. Contractor cannot read payload even to check submission success; read own status instead. Preserve tombstones. Never use `addDoc` for an unconstrained number of submissions.
7. Implement Web Crypto proof with synthetic plaintext and freshly generated disposable test keys only. No private key fixtures committed. Test RSA-OAEP SHA-256 interoperability, label/context, UTF-8 size, wrong key and tampering; acknowledge arbitrary-byte writes through malicious direct clients cannot be identified as invalid encryption by Rules.
8. Prototype the separate offline local utility and custody workflow using synthetic keys only. Prove encrypted key format/unlock compatibility, no network during import, no private-key storage/console output and safe context checks. No hosted private-key upload form. Single-record ciphertext handoff remains an unresolved review requirement; no general export/download feature.
9. Test memory-only Auth/Firestore cache, no offline drafts, safe errors and CSP in actual built Vite output. UI idle sign-out supplements request.time/auth_time checks but does not become a central session service. No force-refreshed token masquerading as fresh authentication.
10. Prototype shows “handling claimed” and “transfer attested”, never “one-time reveal enforced”. All unmet guarantees remain visible in the readiness register. No real-project encrypted writes in a supposedly synthetic-only demo because Rules cannot determine the hidden data is synthetic.

Expected local commands after dependency setup: `firebase emulators:exec --project demo-mi-sin-portal --only auth,firestore 'npm run test:rules'`; `npm run test:crypto`; `npm run build`. These are planned Phase 2 commands, not executed during this documentation revision. Full browser/system checks require supported browser tooling and manual accessibility tests.

## Phase 3 — Security/rules proof and independent review

Test the entire Rules permission matrix, direct SDK calls, races, revoked invitations/roles and failed operations, not hidden UI only. Include unsupported properties as explicit failing requirements rather than weaken tests. Read deployed Rules and original app regression fixtures before proposing any future integration. Simulate a permissive recursive allow to show namespace-only protection fails. Verify changed Rules preserve other app authorization; do not deploy a standalone test ruleset to production.

Inspect real-project settings read-only for Auth/Identity Platform/TOTP, quotas, regional privacy, IAM and other backend clients. TOTP cannot be assumed paid or already safe/free; prove no-billing configuration and signed second-factor/freshness semantics before proposing a change. No change to providers, users, rules or billing as part of this inspection. Emulator claims are test inputs, not proof Firebase will issue corresponding real MFA evidence.

Independent reviewers examine the release artifact, Rules, key custody and actual account settings. If original non-negotiable guarantees remain unmet (one-time decryption, trusted encrypted-input validation, automated disposal), the outcome is synthetic-only. No paid workaround, compliance badge or “production-ready” claim.

## Phase 4 — Preparation only after revised-design review

When and only when the candidate is confirmed Spark/no billing and owners approve a non-disruptive setup, prepare a distinct web-app registration and dedicated Hosting target on a free Firebase domain. Do not use App Hosting or connect Functions/Run. Shared Auth authorized domains, templates and providers require owner review. Preserve default site and other app configs. No service creation/deploy occurs in this phase of work.

Future configs: explicit reviewed `firebase.<portal>.json` target, merge-aware complete Firestore Rules and scoped index diff, credential-free `.env.example` with public Firebase config placeholders, emulator-only mode and restrictive Hosting headers. Public Firebase config is not a secret; private keys and service-account credentials are never VITE variables. Production-blocking Rules gate is owner-controlled and not just a client boolean. If existing broad Rules override it, no live namespace can be enabled safely until integration is resolved.

GitHub Actions later: run emulator/crypto/build/accessibility checks with read-only repo permissions and demo credentials; no cloud auth on PR workflows, no pull_request_target running untrusted code, no automatic deployment on PR/main or Firebase automatic framework rollout. Any later reviewed deployment uses explicit project/site, minimal available deployment authorization, free included CI resources only and a protected manual approval path where available without payment. Do not assume repository policy features are included: if unavailable, retain manual owner-controlled local deployment. No deploy workflow is added now; never activate billing/OIDC permissions to solve a $0 constraint.

## Original acceptance criteria — preserved with revised disposition

| # | Original requirement | Firebase test/evidence needed | Current disposition |
| --- | --- | --- | --- |
| 1 | Unknown email cannot access form/data | Emulator unauthenticated/unverified/unapproved/existing other-app users; swap IDs and typed email; direct client requests denied | Planned Rules proof |
| 2 | Expired invitations rejected | request.time bounds, revoked state, stale token, known reference and delayed cleanup | Planned Rules proof |
| 3 | Verification codes expire and cannot replay | Custom numeric OTP replaced by Firebase verification link; test Auth action-link replay/expiry and token refresh; provider controls limits | Explicit flow change, production behavior unverified |
| 4 | Invalid SIN rejected | UI length/Luhn/separator/Unicode tests; direct malformed encrypted write bypass must be acknowledged | **Backend content validation not achievable in Rules** |
| 5 | Contractor submits once | Deterministic slot/payload, create-only; refresh/reissue/new UID cannot reuse; contractor no read/update | Planned Rules proof |
| 6 | Concurrent writes cannot duplicate | At least 20 simultaneous authorized batches, exactly one payload/slot/status success; failed/partial writes do not mark submitted | Planned emulator race proof |
| 7 | Database contains no plaintext SIN | Crypto fixtures + emulator stored Bytes inspection; malicious clients can put arbitrary content in allowed Bytes | Normal-client proof possible; **all-writers guarantee unmet** |
| 8 | Ordinary admin cannot retrieve | Role/assignment get-vs-list matrix; no generic other-app admin/role self-promotion; no key in hosted portal | Planned Rules proof; IAM bypass risk |
| 9 | Permitted admin completes fresh MFA | Actual no-billing Identity Platform/TOTP configuration + signed second factor and auth_time checks; reauth password alone fails MFA | **Not demonstrated; real reads disabled** |
| 10 | Retrieval cannot replay after consumption | Demonstrate repeat-read/retained-ciphertext counterexample, distinguish claim transition from data read | **Cannot guarantee; real one-time retrieval blocked** |
| 11 | Deletion/expiry follows approved retention | Paired payload delete/tombstone/event, expiry denies read, no recreation; offline/no-staff test shows purge doesn't run | **Automatic deadline deletion unmet** |
| 12 | Logs/errors never include SIN | Scan synthetic browser/error/test/build artifacts and SDK persistence; no third-party telemetry; safe fixed messages | Planned normal-client evidence; malicious origin/extension risk |
| 13 | Mobile/desktop interface | Supported browser tests at 390px/1440px + iOS/Android form behavior, no page-wide overflow | Responsive design retained; device tests pending |
| 14 | Keyboard/contrast | Labels, focus summary, visibility aria-pressed, 200% zoom, screen reader/manual AA contrast | Pending accessible functional build |
| 15 | Production cannot use insecure defaults | No live payload writes, owner-controlled Rules/policy gate, demo-only build refuses real project, unknown project/plan stops deployment | Current design/prototype disabled; deploy guard integration pending |

## Rules test matrix for Phase 2

Include unauthenticated, verified-but-uninvited, unverified invited, verified active invited, expired/revoked/consumed, other invitation/UID, verified unrelated-project-app user, invitation manager, assigned/unassigned ciphertext custodian, disposal officer, auditor and impersonated role-field clients. Assert exact get/list/create/update/delete outcomes for every namespaced path. Specific negative tests: extra/plaintext fields; oversized/wrong-type ciphertext; wrong key ID; client timestamp; altered email/owner/purpose/expiry; status-only submission; payload-only submission; slot deletion/recreation; submitted invitation reissue; deletion without tombstone/event; role self-grant; expired assignment; recent token iat but stale auth_time; replayed claim and repeated payload get. Demonstrate that read permission is reusable, not “passed one-time retrieval”.

Use `assertFails`/`assertSucceeds` on normal SDK requests with rule coverage reports. Test verification/token refresh through the Auth emulator, and Rules with fabricated signed-claim test contexts; distinguish these from real-provider evidence. Run a separate combined test model using sanitized existing app fixtures after Rules inspection. No private live data exported to run tests.

## Production readiness — blocked

- [ ] Actual project is Spark/no billing; existing services/rules/IAM/usage inspected in required order.
- [ ] No disruptive rules/Auth/Hosting change; owners approve integration; other-app regressions tested.
- [ ] Legal need, SIN-versus-BN criteria, notice/contact and official destination approved.
- [ ] Firebase region, US Auth/global processing and access terms accepted.
- [ ] Offline keys/custody/recovery/handoff independently reviewed with existing $0 resources.
- [ ] MFA and all required authorization claims demonstrated without paid activation.
- [ ] Original retrieval/content-validation/retention guarantees met; current architecture does not meet them.
- [ ] All 15 original acceptance requirements evidenced, not merely renamed or waived silently.
- [ ] Independent security/privacy review completed; no production launch on documentation approval alone.

See [requirements-gap.md](requirements-gap.md). While these blocking requirements remain unmet, functional work is limited to local synthetic development. Hosting a non-collecting static layout is separate from enabling a real collector and still requires the revised-design review before deployment.
