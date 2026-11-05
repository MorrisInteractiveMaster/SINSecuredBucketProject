# Morris Interactive | Secure SIN Collection Portal

**Phase 1: architecture and design review. No real SIN collection is authorized.**

The original repository was empty and public on November 5, 2026. This proposal uses Azure for the application/backend/database/key management and GitHub for source/review/CI/CD. GitHub Pages is not the production backend.

## Review package

- [Security architecture and data flow](docs/architecture.md)
- [Threat model and remaining risks](docs/threat-model.md)
- [Privacy, retention and decisions requiring approval](docs/privacy-and-decisions.md)
- [Cost assumptions](docs/costs.md)
- [Phased implementation and acceptance plan](docs/implementation-plan.md)
- [Screen layout notes](docs/screen-layouts.md)
- [Responsive screen-layout prototype](design/index.html)
- [Proposed policy values — unapproved](config/policy.proposed.json)

Open `design/index.html` in a browser to review all contractor/admin states. It has no SIN entry capability, backend, external network dependencies or persistent storage. Genuine logo/font assets remain to be supplied; organization text is only a labelled asset slot.

Run `python3 scripts/check_phase1.py` for structural checks. These are documentation/prototype checks, not application security tests. The application source, real migrations, authentication/encryption integrations, security tests and deployment workflows are future phase deliverables detailed in the plan.

Never commit personal information, invitation credentials, passwords, private certificates, encryption material or deployment secrets. This design is not a production readiness claim. Independent privacy/security review and explicit production approval must precede collection.
