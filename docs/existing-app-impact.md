# Existing application impact assessment

Project: `gen-lang-client-0948635471`. Existing app is in use (owner-confirmed). No actual database ID, location, rule release, Auth provider or Hosting deployment has been verified due to missing authenticated CLI session. This is a forward impact assessment, not a completed production regression report.

| Proposed change | Isolation benefit | Possible existing-app impact / safeguard |
| --- | --- | --- |
| New named DB `mi-sin-portal` | New data plane with independent Rules/indexes | Billed usage/service quotas/admin privileges remain shared; confirm available capacity/ID and don't change other DBs |
| Dedicated Rules file/release | Portal-only data authorization | Wrong selector/config can target other DBs; manifest contains one DB, explicit CLI target, compare existing releases before/after |
| Dedicated index config | Portal query/storage changes isolated | Do not use broad project deploy or mixed index files; no existing index deletion/replacement |
| New web app | Separate frontend SDK identity/configuration | Not an Auth/IAM boundary; API key is public configuration, not an entitlement |
| New Hosting site | Existing site's URL/assets/releases remain unchanged | Target binding error can deploy over existing site; confirm site ID/target and current release hash before any future deploy |
| Shared Firebase Auth | Existing identity service reused | New accounts and authorized-domain/provider/template changes affect shared surface; prefer existing provider and no global changes until owner review |
| Portal admin roles | No automatic elevation of existing users/admins | Project operators can edit role data or bypass Rules; no client self-promotion, separate named custodians |
| Possible Functions backend | Stronger request authorization/atomic release/cleanup | Build/artifacts/compute/scheduler/IAM/quotas, broad deployed function discovery; use separate codebase and dedicated reviewed identity only after approval |
| Billing alerts | Earlier cost visibility | Alerts don't cap spend; never disable project billing to contain portal costs because existing app depends on it |

## Baseline required before activation

Privately record every actual database resource/location/edition/mode and Rules/index configuration version, every existing Hosting site release/target/domain, shared Auth/provider/domain/template settings, IAM/server clients/deploy identities, quotas and current billing usage. Map applications to DBs from real source/owners; registration name is insufficient. Obtain reproducible existing-app login, read, write and sign-out smoke tests using its approved test account/data, not real SIN fixtures. No existing business/user data export is needed.

## Non-interference change procedure (future, not authorized now)

Review a diff containing only portal artifacts. Do not run `firebase init` in an existing app checkout. Do not create/downgrade projects or alter billing. A later resource-creation approval must name the exact DB/site/app and location; a deploy approval must separately name exact target/config/artifact. No `firebase deploy` without selectors and explicit project/config. No `--only auth`, generic all-database Rules/index deployment, project-wide provider changes, broad IAM grants or default-site target reuse.

After any later approved action, compare old DB/rules/index/Hosting/Auth fingerprints, re-run existing app smoke tests and check unexpected usage/errors. Tests against synthetic emulator sentinels demonstrate a local model, not these actual baselines. Rollback affects only portal resources: close portal Rules/collection gate, revert portal release/index/Rules artifact as reviewed; never overwrite existing app config, downgrade/unlink billing, delete its users/database or apply bulk “reset”. Prior ciphertext cannot be recalled, so rollback is not disposal.

## Unresolved shared-identity hazard

A verified portal account is a Firebase project user. If existing DB Rules broadly permit every authenticated project user, that account may gain existing-app access without any portal Rule changing. Separate DBs do not fix this reverse direction. Inspect existing DB Rules and provider policies first. If this risk exists, document it and require that app owner's approved mitigation or keep cloud portal Auth onboarding disabled. Do not silently change existing Rules to meet the portal's acceptance test.

No evidence of disruption was observed because no cloud changes were made; this is not evidence the unseen project is safe for new users/resources.
