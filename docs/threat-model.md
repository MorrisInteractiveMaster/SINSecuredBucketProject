# Threat model — named database inside shared Blaze project

November 5, 2026. Proposal/model tests, no real collection. Assets: SIN in endpoint memory, ciphertext, approved emails, bearer tokens, portal roles/assignments, offline private keys, immutable submission/release/disposal evidence, existing app records/configuration and shared billing availability.

| Threat | Proposed mitigation/evidence | Residual risk |
| --- | --- | --- |
| Default DB fallback / wrong project | Explicit immutable SDK database ID and emulator-only gate; target tests | Malicious/other code can create its own handle; existing DB must enforce its own policy |
| Wrong database Rules/index deploy | Dedicated config containing one DB, pinned CLI exact selector, pre/post existing resource fingerprints | Deploy permission/operator error; real release scope not tested without live authorization |
| Existing broad Rules | Portal DB has independent release; no mixing existing Rules into portal | Existing app may permit every shared Auth user into its own DB; unread configuration blocks onboarding |
| Shared project IAM/server access | Inventory and proposed narrow database-bound identities; no Owner/Editor grants | Project admins and broad existing principals can bypass Rules/alter code/data |
| Shared Auth privilege confusion | Portal-specific UID roles and record assignments, no generic existing admin flag | Providers/domains/users/quotas shared; provider changes require owner impact review |
| Typed/forged email / unverified user | Signed verified identity + permitted provider + exact active invite | Mailbox compromise defeats verification; Auth emulator claims are not real-provider proof |
| Reused/expired invitation | request.time, revision/active state, permanent deterministic slot | Full revoke/reissue lifecycle remains design work, not closed-gate functionality |
| Concurrent/partial submission | Atomic paired create + getAfter and create-only slot | Model 20-way race tests pass; encrypted content may still be garbage |
| Malicious ciphertext/plaintext masquerade | Fixed Bytes/schema/size/key in model, normal UI validates/encrypts | Rules/public-key-only backend cannot prove encrypted SIN validity. Production blocker |
| Ordinary manager reads sensitive records | Separate payload docs; all current candidate reads denied, model manager denied | Future custodian role/MFA/assignment must be reviewed; no actual live authorization deployed |
| Claim mistaken for one-time reveal | Static UI explicitly states limitation; optional broker commit-before-delivery | Retained ciphertext/key decrypt repeatedly; broker only limits one delivery attempt |
| Lost broker response/crash | Permanent consumed claim before response, no retry after claim, fresh collection recovery | Availability lost deliberately; real broker not implemented/tested |
| MFA spoof/staleness | Require actual signed second-factor/fresh auth_time evidence | Password reauth/iat/checkbox not MFA; actual provider configuration unknown |
| Frontend/public-key substitution | Controlled verified releases, CSP, no third-party code, key fingerprint checks | Compromised origin can exfiltrate future SINs; crypto doesn't neutralize malicious JS |
| Stolen/offline private key | Existing approved encryption/custody/recovery, offline verified utility, scoped rotation | Source key/process memory copyable; no remote revocation of prior copies |
| Local utility/handoff/extensions | No hosted key import, no network during offline handling; independent review | Handoff unresolved, malicious device/extensions/screenshots remain outside control |
| Retention deadline missed | Exact request-time access denial; reviewed eventual TTL/backend option | Manual cleanup not guaranteed; TTL delayed/billed, no exact-time physical erasure |
| False transfer/disposal | Authorized attestation + paired active delete/status/audit; permanent slot | Cannot verify external official record transfer; provider/device copies remain |
| Restored state reopens claim | Quarantine any later approved restore; reconcile consumption/disposal ledger | No backup/restore configured; operators can override data; offline copy remains decryptable |
| Audit gaps | Model validates state changes; optional backend can log claim attempt | Rules cannot emit read audit, offline decrypt invisible, privileged operators can alter records |
| Billing abuse / quota shock | Closed gate now; bounded queries, provider/App Check/rate controls if approved | Named DB usage billed; alerts not caps; Functions add invocation/build/artifact costs |
| Emulator false security | Explicit source load + negative tests; exact DB guard | Initial array-config run fell back open and failed tests; emulator independent-release/index/IAM limitations documented |
| Logging/browser persistence | Memory cache/Auth; no analytics/input capture; no bodies/keys in exceptions | SDK/operator/service diagnostics and malicious clients need actual inspection; GC zeroization best effort |
| Existing app rollout disruption | Separate site/app/DB artifacts and owner smoke tests; no shared settings changed now | Actual app configurations/URL/tests unavailable; model sentinel is not live regression evidence |

Independent reviewers must inspect actual project/database/Rules/IAM/Auth configurations, reverse access of new Auth users to existing DBs, crypto/custody/handoff, MFA and optional broker semantics, retention/restore, billing/abuse and controlled release scope. No independent review, model test or CSP warrants a compliance/production-readiness guarantee. See requirements-gap.md and existing-app-impact.md.

Initial cloud Rules candidate is deny-all, never deployed. Emulator functional model is a limited prototype, not the complete portal authorization/lifecycle. No private data or keys were used, no actual existing app security rules were audited, and no broad permission change was made.
