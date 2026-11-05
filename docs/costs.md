# Spark-only CAD $0 feasibility assessment

November 5, 2026. **Approved incremental infrastructure spend: CAD $0. No payment method, trial credits, billing linkage, Blaze, paid subscription or automatic upgrade.** The earlier paid architecture and dollar estimates are withdrawn.

**Verified:** published product limits support a small no-cost static/Auth/Firestore prototype. **Not verified:** any named project's actual plan, current consumption or suitability. **Decision:** local synthetic development may proceed; no live project is selected and no real collector is approved. A public pricing page cannot certify an organization's account.

## Published service limits

| Service | Published no-cost provision | Portal decision |
| --- | --- | --- |
| Spark plan | No payment method required; paid Google Cloud features unavailable; linking Cloud Billing auto-upgrades to Blaze | Must verify Spark and no billing-enabled project before selection; never link billing |
| Firebase Hosting (not App Hosting) | 10 GB storage and 10 GB/month CDN transfer, aggregated across project sites/channels | Use a dedicated site on included Firebase subdomains; reserve headroom for existing apps; no purchased domain |
| Hosting multisite | Up to 36 sites/project; each has its own assets/config; project resources remain shared | Additional site only if capacity and owner approval confirmed; adding a site is not adding free quota |
| Firestore Standard edition | One free-quota eligible database/project; 1 GiB stored, 50,000 reads/day, 20,000 writes/day, 20,000 deletes/day, 10 GiB outbound/month | Reuse inspected eligible database with isolated namespace; no additional database; include Rules lookups, listeners/index/storage overhead and other apps in usage |
| Firebase Auth email verification | 1,000 verification emails/day on Spark | Prefer verified email/password; limits are shared/provider-controlled, not guaranteed reserved capacity |
| Firebase Auth email-link sign-in | 5 sign-in emails/day on Spark | Not baseline; manual invitation does not send an Auth sign-in link for free or bypass this quota |
| Firebase Auth password reset | 150 reset emails/day on Spark | Account for other project users; no custom paid sender |
| Email/password auth | No-cost option subject to Auth/IP/fair-use limits | No SMS; no assumption that all advanced identity features are enabled |
| TOTP MFA | Requires Identity Platform; public Firebase pricing lists an Identity Platform Spark tier | Conditional investigation only; verify exact feature/plan/limits before any activation. No Blaze/paid MFA fallback |
| Browser crypto | Web Crypto on existing supported devices | No paid KMS; existing suitable offline custody resources are a prerequisite, not a new purchase |
| Emulator Suite | Local development with no cloud service usage when all relevant emulators are connected | Use demo project and synthetic fixtures; local software prerequisites only |
| GitHub | Existing repo and included free CI allowance only | No paid runners/marketplace actions/storage upgrades; if free CI unavailable, run verification locally |
| Invitations | Existing corporate email service, manual instructions | No incremental mail service; no SIN, password or private key in email |

The core app can remain $0 **while the selected project remains Spark and stays within the shared quotas**. This is not a Blaze “free tier” budget. If capacity is exhausted, accept unavailable service or suspend the prototype; never authorize charges or delete another application's releases/data to make room. Auth and Firestore have product-specific/IP/daily limits; Hosting transfer resets monthly and storage can block deployment. Do not promise one uniform quota-reset behavior.

## Excluded services and unsafe substitutions

No Functions, Run, App Hosting, paid databases, Cloud Storage bucket, Extensions with backend dependencies, Secret Manager/KMS, TTL deletion, PITR, managed backup/restore/clone or paid/SMS authentication. Firestore explicitly requires billing for TTL/PITR/backup/restore/clone; they are not silently replaced with an always-running browser or a “free” scheduler service. No third-party paid key/mail/security service. Review may be done using existing qualified resources; if independent review is unavailable within existing arrangements, real collection stays blocked rather than assuming a new paid engagement.

Registering a Firebase web app is a configuration operation, not a separately metered backend. It still shares project Auth, IAM, Rules and quotas. Additional app/site feasibility cannot be certified until current resource counts, limits and owner dependencies are inspected. No billing-enabled existing project is an acceptable shortcut even if its additional usage might be small. Do not downgrade an existing Blaze project: that can disrupt other applications and is outside scope.

## Workload planning (assumptions, not measured usage)

For illustration, 100 invitations/month, under 100 active records, one metadata dashboard session/day and bounded page sizes are likely well below published limits in an otherwise lightly used project. Each submission batch needs several writes and Rules reads; retries and queries add reads. A malicious client or another application can consume the same quota. Avoid continuous collection-wide listeners and repeated aggregate counts; choose bounded metadata queries. No availability guarantee or guaranteed spare capacity is inferred from low SIN volume.

Before live synthetic hosting, obtain actual usage across all apps, set manual monitoring ownership and conservative operating caps, and verify the Firebase plan again immediately before any approved deployment. Budget alerts are not a hard spending cap, and this design does not activate a billing account to obtain them.

## Sources verified publicly

- [Firebase pricing](https://firebase.google.com/pricing) and [pricing-plan behavior](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans): Spark/no payment method, service eligibility and billing-link effect.
- [Hosting quotas](https://firebase.google.com/docs/hosting/usage-quotas-pricing): 10 GB storage and 10 GB monthly transfer; shared quota and shutdown behavior.
- [Hosting multisite](https://firebase.google.com/docs/hosting/multisites): separate configurations, shared resources and site limit.
- [Firestore pricing](https://firebase.google.com/docs/firestore/pricing) and [quotas](https://firebase.google.com/docs/firestore/quotas): Standard free quotas, one eligible database, paid retention/recovery features.
- [Authentication limits](https://firebase.google.com/docs/auth/limits): verification/link/reset quotas. [TOTP requirements](https://firebase.google.com/docs/auth/web/totp-mfa) and [Auth overview](https://firebase.google.com/docs/auth): Identity Platform prerequisites and additional quotas. Published Auth pricing/overview express different MAU/DAU limits; use the actual configured feature limits, not a presumed equivalence.

These sources establish product capability as of November 5, 2026; they do not establish `gen-lang-client-0948635471`, `the-hive-assistant`, or `gen-lang-client-0637098617` account state. See [project-investigation.md](project-investigation.md).
