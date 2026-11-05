# Phase 1 — Threat model and remaining risks

Status: proposed controls, not verified implementation. Assets: SIN, encryption material, email identity, invitation credentials, MFA/session evidence, lifecycle tombstones, mail trust and audit integrity. Adversaries include link recipients, mailbox attackers, malicious staff, external attackers, compromised dependencies and privileged platform operators.

| Threat / entry point | Proposed controls | Verification / residual risk |
| --- | --- | --- |
| Forwarded or stolen invitation | Approved-email OTP, short expiry, token digest, revocation revision | Forward link to different mailbox; reject form access. Compromised authorized mailbox defeats both steps |
| Email scanner consumes link | GET never consumes; fragment exchange grants only pending session | Scanner and browser tests; mail provider may retain link |
| OTP guessing, replay or spam | HMAC with managed pepper, atomic counters, expiry, resend invalidation, shared quotas | Concurrent verify/resend tests; network-wide abuse remains possible |
| Email enumeration | No self-enrolment; generic invitation errors; no public email lookup | Compare status/timing and messages; admin email list remains personal data |
| Cross-record access (IDOR) | Every endpoint binds invitation/session/role, reference is not authority | Swap references, cookies, revision and grant IDs |
| Duplicate submissions / replay | Unique invitation FK, locked transaction, one-use signed attestation nonce | Real PostgreSQL race tests with many concurrent clients and revoked sessions |
| Malformed crypto / forged key source | Pinned key version, fixed schema and algorithms, AAD/tag verification | Tamper each field, swap environments/records, reject oversized bodies |
| Invalid SIN in encrypted submission | Isolated server validator; checksum not identity verification | Malicious client bypasses JS; validator must reject before commit |
| Database/backup theft | Authenticated envelopes; private managed keys separate from DB | Inspect seeded database, backups and WAL; metadata and traffic remain sensitive |
| XSS / compromised frontend release | Nonce CSP, no third-party code, review, pinned dependencies | CSP/XSS tests and release provenance; malicious origin can steal future inputs |
| Ordinary admin reveals | Explicit retriever role; object-bound fresh step-up; constrained worker | Negative RBAC tests for every protected route, not just hidden UI |
| Forged or stale MFA | OIDC validation, protected auth context and fresh challenge evidence | Tenant test where context has no policy must fail readiness; token iat alone fails |
| Reveal replay / concurrent workers | Commit irreversible claim before unwrap, UNIQUE claim, no resume | Instrument unwrap count under races; require at most one attempt |
| Lost response / crash after claim | Terminal recovery state, new contractor submission | Fault injection before/after DB commit and vault call; availability sacrificed deliberately |
| Restored backup resurrects reveal | External consumption/disposal ledger, quarantined restore | Restore old backup, replay tombstones before traffic/key access; fail closed on missing ledger |
| Insider / platform compromise | Separation of roles/identities, PIM, limited key grants, audit alerts | Infrastructure admin can still bypass app controls; process and access reviews required |
| Telemetry or browser leakage | Allowlisted events, no body capture, no storage/URLs, no-store | Inject synthetic canaries, inspect ingress/APM/error/mail/CI artifacts; extensions remain uncontrolled |
| Premature deletion / false transfer | Record-specific transfer attestation, approved destination code | Double submission of disposal safe; expiry does not mean transfer completed |
| Retention/key cleanup failure | Idempotent tasks, overdue access denial, alerts, backup schedule | Clock-controlled tests and vault failure injection; soft-deleted keys/backups persist |
| CSRF / fixation / clickjacking | Origin + CSRF, cookie rotation, frame-ancestors none | Cross-origin mutation, planted session, iframe and redirect tests |
| Cloud/CI credential compromise | OIDC subject restrictions, protected environment, no PR cloud tokens | Review federation claims, workflow permissions, action pins and artifact secret scans |
| Service outage / cost exhaustion | Quotas, shared rate limiting, send/key limits, bounded queries | Load/failure tests; lockouts and unavailable mail may require staff support |

## Review requirements

Independent reviewers should inspect the crypto protocol and Web Crypto/Key Vault interoperability, authorization and step-up tenant policy, race/restore invariants, cloud least privilege, telemetry behavior, and disposal including provider retention. Conduct an authenticated penetration test and privacy impact assessment against the actual staging configuration. A design document or automated scan is not a substitute.

Unresolved before production: legal eligibility rules, privacy notice/contact, approved official destination, hosting and email processing terms, per-record HSM key cost/quotas, Entra licenses and freshness guarantees, operational ownership, incident response, monitoring coverage, retention and restored-backup reconciliation. There is no claim of compliance certification, guaranteed screenshot prevention, exactly-once human viewing, perfect memory erasure or immediate backup destruction.
