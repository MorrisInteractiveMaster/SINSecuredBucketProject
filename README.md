# Morris Interactive | Secure SIN Collection Portal

**Phase 1 revised proposal · Firebase Spark only · CAD $0 infrastructure budget.**

PR #1 remains draft. Do not merge, deploy, activate billing, upgrade plans or modify any existing Firebase application until the revised design is reviewed. Real SIN collection/retrieval remains blocked by unmet requirements and independent security/privacy review.

## Review package

- [Firebase architecture and data flow](docs/architecture.md)
- [Verified public Spark limits and $0 feasibility](docs/costs.md)
- [Existing-project investigation — pending connection, Default Gemini first](docs/project-investigation.md)
- [Security requirements that remain unmet](docs/requirements-gap.md)
- [Threat model](docs/threat-model.md)
- [Privacy, retention and approval register](docs/privacy-and-decisions.md)
- [Firebase SDK / Emulator implementation and acceptance plan](docs/implementation-plan.md)
- [Adapted screen layouts](docs/screen-layouts.md)
- [Non-collecting 14-state prototype](design/index.html)
- [Unapproved policy configuration](config/policy.proposed.json)
- [Phase 1 validation record](docs/phase-1-validation.md)

Proposed stack: React/Vite/TypeScript/Tailwind, static Firebase Hosting, Firebase Authentication, Firestore Security Rules, browser Web Crypto and Local Emulator Suite. No server/Functions/Run, paid database/key service, purchased domain or new subscription. Manual invitations use existing corporate email.

The local HTML prototype preserves MI styling and disabled entry. It cannot accept SINs, send mail, authenticate, persist data or import keys. Genuine logo and licensed Visby assets remain pending.

No Firebase project has been selected or its plan/configuration verified. Product documentation supports a small Spark prototype, but account state, shared Rules, existing app dependencies, location and spare capacity need authenticated inspection. No live settings/rules were read or changed in this revision.

Rules can potentially enforce verified invited-user access and create-once submissions. They cannot validate encrypted SIN contents, guarantee one-time offline decryption or guarantee automatic deadline deletion. The design makes these gaps explicit; it is not production-ready.

Run `python3 scripts/check_phase1.py` for structural design-package checks. Emulator/auth/race/crypto tests are planned Phase 2 work and have not run for this documentation revision. Never commit personal information, private keys, passwords, authentication tokens or deployment credentials.
