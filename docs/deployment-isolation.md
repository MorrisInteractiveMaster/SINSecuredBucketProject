# Proposed Firebase configuration and deployment isolation

**Review only. None of the commands below have been deployed. No resource creation is authorized.**

Files:

- `firebase.mi-sin-portal.proposed.json`: one Firestore database entry plus dedicated unbound Hosting target; no shared Auth/Functions/storage configuration.
- `firestore.mi-sin-portal.rules`: deny-all client gate, not production functional Rules.
- `firestore.mi-sin-portal.indexes.json`: dedicated portal indexes/field overrides only; currently no composite queries, ciphertext indexing disabled.
- `config/portal-target.mjs`: immutable project/DB targets and pure manifest checks; returns plan text, never executes deploys.
- `firebase.emulator.json` and `firebase.emulator-closed.json`: local-only rule model and actual closed gate. **Never use emulator configs for a cloud deployment.**

No `firebase.json` default project selector, `.firebaserc` live alias, cloud credential, deploy script or automatic GitHub deployment is installed. `dist/` is absent and the Hosting target is not bound. Current proposed CSP has connect-src/form-action none; actual functional Firebase endpoint allowlists must be independently reviewed. The inline-script screen-layout prototype is separate from the eventual Vite build.

## Exact reviewed targets

Project: `gen-lang-client-0948635471`. Database: `mi-sin-portal`. Resource: `projects/gen-lang-client-0948635471/databases/mi-sin-portal`. Hosting target label: `mi-sin-portal`; globally unique physical site ID is unresolved and must be checked against existing sites. Do not assume target label equals site ID. A later `.firebaserc` mapping must point only this label to a newly approved separate site; no current site's target/URL/release changes.

Proposed Firestore mapping:

```json
{
  "firestore": [{
    "database": "mi-sin-portal",
    "rules": "firestore.mi-sin-portal.rules",
    "indexes": "firestore.mi-sin-portal.indexes.json"
  }]
}
```

Database creation does not follow automatically from this file and is not authorized by a Rules deploy approval. Review actual ID availability, Standard/Native mode, Canadian location, delete protection, billing and independent rule release before creation. No TTL/PITR/backup or Functions block is present.

## Commands for later approval review only

Using the tested/pinned CLI version, after actual resource/config approval and independent preflight:

```sh
npx --yes firebase-tools@15.35.0 deploy --project gen-lang-client-0948635471 --config firebase.mi-sin-portal.proposed.json --only firestore:mi-sin-portal
```

Firebase's documented database-specific selector is `firestore:<databaseId>`. It can deploy that database's configured Rules **and indexes**, so review both files and index deletion effects; do not describe it as rules-only. For a genuinely Rules-only release, prepare/review a temporary config whose only Firestore entry has database+rules and no indexes; verify behavior with pinned CLI in an approved controlled environment. Do not guess `firestore:rules:mi-sin-portal` syntax. No targeted cloud command has run in this revision.

For later dedicated Hosting approval, use the bound portal target only:

```sh
npx --yes firebase-tools@15.35.0 deploy --project gen-lang-client-0948635471 --config firebase.mi-sin-portal.proposed.json --only hosting:mi-sin-portal
```

Do not run a generic `firebase deploy`, `--only firestore`, all-configured `--only firestore:rules`, `--only auth`, default-site deployment, database deletion/update or any billing/IAM change. Actual future CI must run preflight on the exact JSON and immutable artifact/Rules hashes, explicitly pin project/selector, prevent live project config in emulator jobs and require owner review. New Functions would require a distinct reviewed codebase/selector; never add them to this static proposal to bypass approval.

## Preflight / verification / rollback

- Re-read actual project/database/site inventory and existing application configuration fingerprints; fail on unknown identity, resource collision or failed authentication.
- Review real usage and financial exposure; a budget alert is not permission or a hard cap. No billing downgrade/disconnect rollback.
- Pass emulator tests, build/config target tests, secret/dependency review and existing app regression checks. Emulator-only success does not prove live release scope/index behavior.
- Owner reviews the exact changed DB/site/rules/index/artifact versions. Prefer least-privilege deployment identity/short-lived authorization; do not grant blanket project Owner/Editor. Some deployment permissions are project-wide; document this limitation and restrict execution rather than claiming perfect isolation.
- After a later deploy, verify portal rules/index/site resource versions and that every existing resource fingerprint/smoke test is unchanged. Do not browse real SIN records to verify.
- On failure, suspend portal access and revert only its approved resource versions; don't delete/recreate a database or apply closed portal rules to another DB. Record a non-sensitive incident reference privately.

Primary references: [Firebase Rules deployment](https://firebase.google.com/docs/rules/manage-deploy), [named databases](https://firebase.google.com/docs/firestore/manage-databases), [CLI selective deploy](https://firebase.google.com/docs/cli), [Hosting multisites](https://firebase.google.com/docs/hosting/multisites). Syntax is proposed for later review; it is not approval to execute it now.


## Independent workflow proposal

A future `verify-portal` PR job checks only this repository with read-only GitHub permissions, demo emulator credentials and no cloud access. Future manual `deploy-portal-database` and `deploy-portal-hosting` jobs are separate, accept only reviewed artifact/Rules/index hashes, use the fixed project and exact selectors above, and require an owner-approved protected environment or manual owner-run fallback if policy features are unavailable. They do not call the existing app CI, reuse its target/configuration, run `--only auth`, or deploy Functions. Verify GitHub included-runner/artifact allowances before enabling even verification CI; no paid runners or automatic deployment are authorized. IAM/OIDC/federation changes need separate review and are not provisioned by this package.
