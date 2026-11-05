# Phased implementation and acceptance plan

## Phase 1 — This review package

Delivered: repository/brand inspection, architecture and data flow, threat model, privacy decision register, operating cost allowances, proposed policy values, responsive screen-layout prototype and acceptance mapping. No backend, authentication, encryption implementation or deployed collector exists yet. All security properties below are planned, not proven by this package.

Reviewed references: all four Altitude files and all 18 pages of the MI brand guide (text extraction). The guide establishes Visby CF Regular for body, Demi Bold headings and Extra Bold emphasis; sentence-case headings, original logo proportions/clear space and the MI palette take precedence over Altitude. Altitude's serif typography, mountain art and microscopic labels are excluded. Standalone genuine logo and licensed font assets remain to be supplied through an approved source; do not commit the entire brand PDF to the public repository.

## Phase 2 — Synthetic functional MVP

1. Prove Web Crypto AES-GCM + RSA-OAEP-256 interoperability with Key Vault and canonical AAD; measure per-record key quotas and cost. Prove Entra step-up with actual tenant policies and freshness evidence. If either proof fails, record the reviewed alternative before implementing real collection.
2. Create Next.js/TypeScript/Tailwind app with no external script/font calls. Select currently supported dependencies, pin a lockfile and security headers. Keep prototype separate from actual routes.
3. Add versioned PostgreSQL migrations, constrained DB roles, sessions, invitation/OTP tables, counters, reservations, envelope tables and independent consumption/disposal ledger. Test against actual PostgreSQL, not an in-memory substitute for races.
4. Implement tenant-bound server OIDC and app roles. Add invitation creation, bounded bulk input, dispatch leases, token/OTP verification, session rotation, revoke/reissue and status endpoints.
5. Implement browser envelope encryption, isolated validation worker and atomic submission transaction. Use synthetic fixtures only; nonproduction server accepts only a closed set of fixture envelopes/identities and denies arbitrary SIN values even if the UI is modified.
6. Implement metadata-only dashboard, auditor view, record-specific step-up, claim-before-unwrap retrieval, failed-reveal recovery and transfer/disposal tasks. Never add a debug decrypt endpoint.
7. Provide actual environment variable template without credentials; runtime config must validate HTTPS origin, tenant IDs, key endpoint allowlist, approved notice/contact/purpose, protected authentication context, configured policies and provider mode. Placeholder values and simulation adapters cannot pass a production startup check.
8. Complete administrator instructions and integration tests in synthetic Azure staging, with no production federation or data.

Deliverables at Phase 2: working application source, mobile contractor screens, admin dashboard, secure APIs/workers, real migrations, tests and synthetic staging integration. These are not included in Phase 1.

## Phase 3 — Hardening and independent review

Run authorization matrix, crypto tampering/interoperability, concurrent transaction and crash tests; verify restoration cannot resurrect reveal/disposal. Review logs at every configured hop, not only application logger output. Implement incident response, operator role controls, alerts and cleanup. Dependency review, CodeQL, secret scanning and external authenticated penetration testing. Record findings/remediation and residual risks in a restricted operational system; do not include sensitive evidence in public GitHub issues.

Release evidence must identify the tested artifact SHA, schema version, tenant-policy configuration, dependency inventory and infrastructure version. Independent privacy and security sign-off are required before enabling any real collection.

## Phase 4 — Deployment preparation, then gated launch

Prepare Bicep modules for regional web/worker apps, identities, private network/endpoints, PostgreSQL, Key Vault, audit storage, monitoring, mail integration and scheduled cleanup. Verify exact service SKUs/regions rather than assuming availability. No cloud resources or billable services are provisioned during Phase 1.

Proposed GitHub Actions separation:

- PR verification: read-only repository token; typecheck, security-focused unit tests, PostgreSQL integration/race tests, production build, dependency/secret scanning and browser accessibility tests. Synthetic fixtures only. No cloud OIDC or deployment permissions.
- Main staging deployment: build once, produce SBOM/provenance, scan and deploy that immutable artifact through a staging-bound OIDC subject. Apply reviewed migrations with separate database migration identity.
- Production: manual workflow + protected GitHub environment reviewer gate, exact release artifact SHA, independent-review evidence and privacy policy version. Federation restricts repository, branch/environment and audience. Deployment identity cannot unwrap keys or read business records. Never deploy untrusted PR code with privileged credentials.
- Startup and runtime: disabled unless reviewed configuration is complete. `NODE_ENV=production` or a single boolean approval flag is not security approval. Record approvals tied to artifact and deployed configuration and test disabled-mode behavior at ingress and API/worker layers.

Actual workflows and infrastructure templates belong to Phase 4; Phase 1 intentionally does not add an executable deployment path. Merge of this design does not authorize production collection or spending.

## Acceptance mapping

| # | Required evidence / automated test | Phase |
| --- | --- | --- |
| 1 Unknown email cannot enter | Anonymous/arbitrary-email requests, forwarded invitation, swapped invitation/session IDs all denied | 2–3 |
| 2 Expired invitation rejected | Database-clock boundary and post-verification expiry tests, including cleanup delay | 2 |
| 3 OTP expires/no replay | Time controls, race verification, resend invalidates old code, invitation-wide counters persist | 2–3 |
| 4 Invalid SIN rejected | Separators, forbidden Unicode, wrong length/checksum, all-zero; bypass client and submit malformed encrypted payload to validator | 2 |
| 5 Submit once | Normal retry returns completed status; revoke/reissue/refresh never changes submitted value | 2 |
| 6 Concurrent submission safe | At least 20 competing real PostgreSQL requests: one submission and one consumed invitation, losers cannot insert | 2–3 |
| 7 No plaintext at rest | Synthetic canary inspection of DB, WAL/backup test copies, artifacts, browser storage and mail; expected ciphertext only | 3 |
| 8 Ordinary admin denied | Every role × protected endpoint matrix; IDs and hidden UI manipulated; worker caller identity checked | 2–3 |
| 9 Fresh step-up required | Real Entra policy integration: absent/stale context, unprotected context and fresh token without fresh auth all fail | 3 |
| 10 Reveal cannot replay | Concurrent grants/claims, instrumented unwrap count, replay after timeout; crash before/after claim/vault call; no automatic resume | 2–3 |
| 11 Deletion/expiration | Deadline denial, idempotent active purge/key task, failed cleanup alert, quarantine restore with external tombstone replay | 3 |
| 12 Logs/errors contain no SIN | Synthetic canaries through invalid requests/errors; scan configured ingress/APM/worker/DB/mail/Actions outputs; permit only event schema | 3 |
| 13 Mobile and desktop | Playwright at 390px and 1440px; actual iOS/Android numeric keyboard and device checks; no full-page horizontal overflow | 2–3 |
| 14 Keyboard/contrast | Automated accessibility scan plus manual focus/error/zoom/screen-reader testing; visible focus, 44px targets, WCAG AA contrast | 2–3 |
| 15 Fail-closed production | Missing/placeholder policy/tenant/key/contact configs fail startup; simulation adapters and arbitrary synthetic-mode input denied server-side; PR cannot deploy | 3–4 |

## Readiness checklist — all pending

- [ ] Legal purpose and SIN-versus-BN eligibility approved; privacy notice/contact published and versioned.
- [ ] Roles/official destination/transfer recovery ownership approved and staff trained.
- [ ] Region, processors, contracts, budget and backup/key retention approved.
- [ ] Genuine logo and licensed web-font assets validated.
- [ ] Backend, schema/migrations and Azure integration implemented using synthetic data.
- [ ] All 15 acceptance requirements demonstrated against the release candidate.
- [ ] Independent crypto/security/privacy review findings resolved or explicitly accepted.
- [ ] Fresh MFA tenant policy verified; operational role escalation and key administration controlled.
- [ ] Backup restoration, consumption ledger, cleanup, vault failure and incident drills pass.
- [ ] CI protections, OIDC boundaries, dependency/secret checks and immutable release evidence verified.
- [ ] Production remains disabled until the reviewed release and actual configuration receive approval.

Phase 1 QA covers only documentation completeness, proposed-policy parsing and prototype structure. It cannot demonstrate encryption, authentication or one-time semantics without the backend and actual services.
