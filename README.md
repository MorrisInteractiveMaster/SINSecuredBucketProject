# Morris Interactive | Secure SIN Collection Portal

**Phase 1 review · existing owner-confirmed Blaze project · dedicated proposed database `mi-sin-portal`.**

Project `gen-lang-client-0948635471` already supports another application. Do not downgrade billing, create another project, alter existing app resources, merge or deploy. Named database/site/app creations and financial/security/privacy decisions remain unapproved. Cloud SIN collection stays disabled.

## Review package

- [Architecture and data flow](docs/architecture.md)
- [Read-only inspection record and pending evidence](docs/project-investigation.md)
- [Database isolation plan](docs/database-isolation-plan.md)
- [Existing application impact assessment](docs/existing-app-impact.md)
- [Database-specific configuration and safe deployment targeting](docs/deployment-isolation.md)
- [Usage costs and CAD $0 limitation](docs/costs.md)
- [Optional Functions vs static architecture](docs/functions-comparison.md)
- [Privacy and offline-key custody](docs/privacy-and-decisions.md)
- [Threat model](docs/threat-model.md) and [remaining guarantees](docs/requirements-gap.md)
- [Implementation and all 15 acceptance criteria](docs/implementation-plan.md)
- [14 screen layouts](docs/screen-layouts.md) and [non-collecting prototype](design/index.html)
- [Unapproved policy](config/policy.proposed.json) and [validation record](docs/phase-1-validation.md)

Proposed stack remains React/Vite/TypeScript/Tailwind, shared Firebase Auth, dedicated Standard/Native Firestore database/Rules/indexes, static Hosting and browser Web Crypto with offline private keys. Optional Functions are evaluated, not selected/deployed. Named DB usage is billable and cannot be guaranteed CAD $0; there is no second free allowance. No private key is stored in Firebase/GitHub or imported into the hosted app.

Live inspection failed due to missing authenticated Firebase CLI session; actual existing database IDs, regions, Rules, app associations, Auth/IAM settings and billing usage remain unverified. Do not assume the existing DB is `(default)` or claim the local sentinel tests prove actual existing-app isolation.

## Local isolation proof

Install locked dependencies with `npm ci --ignore-scripts` (Node 22+, Java 21 for emulator). Run:

- `npm test` — explicit named SDK/cache and proposed deploy scope checks.
- `npm run test:emulators` — synthetic verified-invite/role/create-once/race/routing model.
- `npm run test:emulators:closed` — actual deny-all Rules candidate closure checks.
- `python3 scripts/check_phase1.py` — document/prototype/configuration gates.

The SDK helper is emulator-only; cloud initialization is rejected. `firebase.mi-sin-portal.proposed.json` references the dedicated deny-all Rules/indexes and an unbound Hosting target; not a deployment authorization. Never deploy `firebase.emulator*.json` or the functional model fixture. No live workflow, credentials, database or site was created.

This is not a finished collector or production-readiness claim. Preserve genuine logo/Visby licensing constraints. Never commit real SINs, personal records, credentials, private keys or sensitive operational findings.
