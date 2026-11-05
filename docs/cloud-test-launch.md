# Phase 2.5 — synthetic cloud launch guide

**Prepared for review; nothing has been deployed by Codex. Do not merge PR #1.** Work from the existing `phase-1/architecture-design` branch. These commands affect only the SIN portal when the checks pass. Do not run a bare `firebase deploy`, `firebase init`, `--only auth`, an unscoped Hosting command, or any command with `--force`.

The owner confirms project `gen-lang-client-0948635471` is already Blaze; database `mi-sin-portal` is Standard/Native; Hosting site `mi-sin-portal`, web app `1:1025148630135:web:75e07aa9dd751cc25e0272`, Microsoft provider and Google provider already exist. The assistant's read-only CLI remains unauthenticated: actual database location, current IAM, billing usage, provider claims and existing-app behavior were **not independently inspected**. Commands below give the owner the remaining checks. No billing/provider/account-type changes are included.

## What this release permits

At most one explicitly bootstrapped MI Microsoft administrator and five operator-approved **dedicated test accounts** can use one new callable, `miSinSynthetic`. Admin UI supports synthetic-list import, status, revoke/remove and correction requests. No private-key import, reveal, official-record transfer or disposal exists. The cloud form offers two fixture choices rather than a real SIN input. The API accepts only `fixture-a`/`fixture-b` and constructs/encrypts their fixed, unissued test values on the server. Arbitrary SIN fields, syntheticValue fields, ciphertext and extra submission fields are rejected, even when accompanied by a valid fixture ID. This is not the production browser-encryption design; local Web Crypto tests remain available separately.

Direct Firestore reads/writes remain **deny-all**, including for admins. All cloud authorization runs in the callable with dedicated runtime IAM. Client revocation checks use the callable every minute; every operation independently checks authorization. Previously returned metadata cannot be recalled and an already-authorized in-flight operation may finish. Only approved test UID + exact email + provider UID bindings qualify. An operator must independently verify ownership of each dedicated test identity; this limited test attestation does not replace the future production verification workflow.

## 1. Review costs and existing-app impact BEFORE Functions deployment

Read [cloud costs, permissions and release review](cloud-test-review.md). In Google Cloud Console, select this exact project and review **Billing → Reports / Cost table / Budgets & alerts**, existing resource usage, currency and remaining shared free allowances. No named-database free allowance is assumed. Review existing AI Studio sign-in and database permissions; shared Firebase users must not gain access to that app through its existing Rules. Do not change those Rules here. If the actual additional-spend requirement is guaranteed CAD $0, stop at local testing: a cloud launch cannot promise that.

Review APIs Cloud Functions, Cloud Run, Cloud Build and Artifact Registry already enabled/required. Firebase's deployment may offer to enable APIs or create a regional artifact repository; approve only after the financial review. Do not grant Editor or Owner to runtime/build identities or change existing repository retention/quotas. Gen 2 Functions use Cloud Run underneath; this is not a separate always-on Cloud Run application.

## 2. Update this existing checkout and use Node 22

Open Google Cloud Shell. Use the existing clone; **do not clone over a folder containing work**. This guide assumes the clone folder is `SINSecuredBucketProject` under your home folder. If yours differs, use its actual name in the first command. Stop if `git status` shows uncommitted files or `git pull` reports a conflict.

```bash
cd ~/SINSecuredBucketProject
git status --short
git switch phase-1/architecture-design
git pull --ff-only origin phase-1/architecture-design
```

Cloud Shell normally includes nvm. If `nvm` is not found, load its existing installation using the next first line. If that also fails, stop and use Cloud Shell's documented Node runtime setup; do not paste an unknown install script.

```bash
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
nvm install 22
nvm use 22
node --version
npm ci --ignore-scripts
npm test
npm run test:all
npm run build
python3 scripts/check_phase1.py
npm run check:cloud
npm run prepare:cloud
npm ci --ignore-scripts --prefix .deploy/functions
node scripts/verify-cloud-package.mjs
```

Expected: Node `v22.x`; all 42 tests pass (Java 21 is required for the emulators); ordinary build succeeds. `dist/` is the LOCAL build, **not** the cloud artifact. Functions are explicitly pinned to Node 22 regardless of Cloud Shell's earlier Node 24. `test:all` runs the old Phase 1/closed Rules/MVP suites and new cloud tests; it does not contact the real database.

## 3. Read-only inventory and exact Hosting binding

The following public resource metadata is safe to inspect. Never export or commit actual Auth users or existing application records.

```bash
npx --yes firebase-tools@15.35.0 firestore:databases:list --project gen-lang-client-0948635471
npx --yes firebase-tools@15.35.0 firestore:databases:get mi-sin-portal --project gen-lang-client-0948635471
npx --yes firebase-tools@15.35.0 hosting:sites:list --project gen-lang-client-0948635471
npx --yes firebase-tools@15.35.0 apps:list --project gen-lang-client-0948635471
npx --yes firebase-tools@15.35.0 functions:list --project gen-lang-client-0948635471
```

If Firebase CLI authentication is required, use its supported Cloud Shell login flow, `npx --yes firebase-tools@15.35.0 login --no-localhost`. This does not grant the portal administrator role. Do not run any project creation/setup wizard.

Confirm the **actual** existing database IDs without assuming `(default)`. The preflight currently requires `mi-sin-portal` in Montréal (`northamerica-northeast1`), Standard/Native, matching the callable region. If it is Toronto or elsewhere, stop and request a reviewed region adjustment; do not recreate/move the database. Confirm no unrelated Function is named `miSinSynthetic`, and no unrelated codebase is named `mi-sin-synthetic`. Existing functions must remain untouched.

Now bind the local alias to the **existing** SIN site. This writes only the local `.firebaserc` target mapping. Inspect an existing mapping before running it: if `mi-sin-portal` already points elsewhere, stop rather than overwrite it. No existing aliases should be removed.

```bash
npx --yes firebase-tools@15.35.0 target --project gen-lang-client-0948635471
npx --yes firebase-tools@15.35.0 target:apply hosting mi-sin-portal mi-sin-portal --project gen-lang-client-0948635471
node scripts/preflight-cloud-test.mjs
```

Expected binding: `targets.gen-lang-client-0948635471.hosting.mi-sin-portal = ["mi-sin-portal"]`. This is not the project's default site. The wrapper refuses to launch without this binding and a successful read-only database check. `.firebaserc` is ignored by Git; it must not be copied from another application.

## 4. Manual Console setup for this web app only

1. In Firebase Console select **Default Gemini Project**, exact project ID above. Verify Microsoft and Google remain enabled as the owner configured them. Do not replace credentials, change account-per-email/account-linking policy, delete users, change account types or add scopes. Keep existing app settings intact.
2. Confirm Auth → Settings → Authorized domains includes `mi-sin-portal.web.app`. Adding a missing portal/preview domain is a shared Auth setting change: have the owner approve the exact addition first; preserve every existing entry. Do not use domain-wide `web.app` authorization.
3. Configure **App Check for the portal's registered web app only** with **Fraud Defense / reCAPTCHA Enterprise**, using a score-based **Web** key. Select the exact project and portal domains; keep domain verification enabled and challenges/checkbox mode off. In Fraud Defense's key details, copy the public **Key ID / Site Key**, not a display name, full `projects/.../keys/...` resource name, Firebase API key or legacy secret. Enter that same public key in the Firebase App Check **reCAPTCHA Enterprise** registration for the portal web app and in `VITE_APPCHECK_SITE_KEY`. This integration does **not** ask for a Classic secret key. Confirm provider quota/billing before use; registration is owner-run, not performed by the scripts.
4. **Do not turn on project-wide Firestore/Authentication App Check enforcement.** That may block existing AI Studio clients. Only this new callable enforces App Check and checks the portal App ID. Registering the portal app does not require changing the existing app's enforcement.
5. Microsoft staff authorization also needs the MI tenant GUID, the Entra application/client GUID, and the explicitly approved MI **member** object GUID. Existing Microsoft provider UID must match that object GUID. Backend verifies the Microsoft ID-token signature, issuer, audience, freshness, tenant, object and `acct=0` member claim. If `acct` is absent, the owner must review adding the optional ID-token claim to the appropriate Entra registration; do not weaken checks or change shared credentials to force success. No Microsoft secret belongs in the repository, browser bundle or terminal commands in this guide.
6. For Microsoft, verify the existing registered **Web** redirect URI includes `https://gen-lang-client-0948635471.firebaseapp.com/__/auth/handler`. For Google, keep its existing minimal identity configuration. Any necessary provider/Entra changes require separate owner review; the scripts perform none.

If the existing public API key has API/referrer restrictions that reject the portal hostname, have its owner review an exact-host addition while preserving existing restrictions and application entries. Do not remove restrictions or replace a shared key to make testing work.

## 5. Build the cloud-test frontend (local files only)

Get the public Firebase Web API key from Project settings → Your apps → the registered portal web app. Do not use a Microsoft client secret or an Admin SDK private key. Then run:

```bash
node scripts/configure-cloud-test.mjs
npm run build:cloud-test
```

The interactive helper asks for the public Firebase API key, public Fraud Defense / reCAPTCHA Enterprise Site Key and MI tenant GUID. It writes `.env.cloud-test.local`, ignored by Git, with fixed project/App ID/auth domain and `VITE_REAL_COLLECTION_ENABLED=false`. It refuses to overwrite that file. If correcting a typo, edit that local file; never add secrets to it. The build goes into `dist-cloud-test/` with a strict synthetic release manifest. Ordinary `npm run build` cannot accidentally become this deployment artifact. Rebuild with `npm run build:cloud-test` after pulling this provider update: the release manifest now requires `appCheckProvider: "recaptcha-enterprise"`, so old Classic/missing-provider artifacts fail the release check. Existing local environment files are not overwritten; update only their public `VITE_APPCHECK_SITE_KEY` value if needed.

## 6. Prepare the narrow runtime identity (owner-approved IAM changes)

These are **reviewable commands for the owner to execute**, not changes already made. Review the existing service account/role names first. If either already exists with unrelated ownership/permissions, stop; never overwrite an existing role or identity. No service-account JSON key is created.

```bash
gcloud iam service-accounts list --project gen-lang-client-0948635471 --filter='email:mi-sin-cloud-test@gen-lang-client-0948635471.iam.gserviceaccount.com'
gcloud iam roles list --project gen-lang-client-0948635471 --filter='name:miSinAuthReader'
```

For a confirmed **unused** name, create only these new portal resources:

```bash
gcloud iam service-accounts create mi-sin-cloud-test --project gen-lang-client-0948635471 --display-name='MI SIN synthetic test runtime'
gcloud iam roles create miSinAuthReader --project gen-lang-client-0948635471 --file=iam/mi-sin-auth-reader.yaml
gcloud projects add-iam-policy-binding gen-lang-client-0948635471 --member='serviceAccount:mi-sin-cloud-test@gen-lang-client-0948635471.iam.gserviceaccount.com' --role='roles/datastore.user' --condition='expression=resource.name=="projects/gen-lang-client-0948635471/databases/mi-sin-portal",title=mi-sin-only,description=Only the named SIN test database'
gcloud projects add-iam-policy-binding gen-lang-client-0948635471 --member='serviceAccount:mi-sin-cloud-test@gen-lang-client-0948635471.iam.gserviceaccount.com' --role='projects/gen-lang-client-0948635471/roles/miSinAuthReader' --condition=None
```

The database role is conditional, **not** project-wide data access. Auth get-user permission is necessarily project-wide in this shared Auth pool; it cannot create/update/delete users. Do not grant Firebase Admin, Editor, Owner, datastore.owner, Token Creator or service-agent roles to this runtime. The deployer's existing permission to act as this runtime and the project's build/service-agent permissions must be reviewed by the IAM owner; do not fix deployment permission failures by adding broad roles.

Use IAM Policy Troubleshooter (read-only) to verify runtime `datastore.entities.get/create/update` permits `mi-sin-portal` and denies every other existing database. Review actual inherited grants as well as these new bindings. Do not verify isolation by writing test records into the AI Studio database. The app's Rules cannot constrain Admin SDK; if IAM isolation is not demonstrated, keep the policy disabled. No script claims to have demonstrated actual cloud IAM from emulator tests.

## 7. Deploy Rules, then the one Function, then a Hosting preview

**Stop here unless the cost, IAM, App Check and independent synthetic-test review have approved this limited launch.** Deployment/build/artifact charges can occur even before activation. These wrapper commands print and execute only the following scoped operations. They run preflight and release-manifest checks again. Do not bypass them on an error.

```bash
node scripts/launch-cloud-test.mjs rules --execute
node scripts/launch-cloud-test.mjs functions --execute
node scripts/launch-cloud-test.mjs preview --execute
```

The exact Firebase commands they execute are:

```bash
npx --yes firebase-tools@15.35.0 deploy --only firestore:mi-sin-portal --project gen-lang-client-0948635471 --config firebase.mi-sin-portal.cloud-test.json
npx --yes firebase-tools@15.35.0 deploy --only functions:mi-sin-synthetic --project gen-lang-client-0948635471 --config firebase.mi-sin-portal.cloud-test.json
npx --yes firebase-tools@15.35.0 hosting:channel:deploy sin-test --only mi-sin-portal --expires 1d --project gen-lang-client-0948635471 --config firebase.mi-sin-portal.cloud-test.json
```

The config contains exactly one DB, one Functions codebase and one Hosting target. The codebase exports **only** `miSinSynthetic`; it does not export the old emulator handlers. Source is staged locally under `.deploy/functions`, with its own locked dependencies and Node 22 engine. Never substitute `firebase.mvp.emulator.json`, the old model fixture, or an unscoped project deployment. Do not accept deletion prompts mentioning unrelated Functions or indexes. The existing portal indexes should be empty/default; review changes if the CLI reports otherwise.

Expected: portal Rules stay deny-all; one Gen 2 Node 22 Function in Montréal uses the dedicated runtime SA, min 0/max 1 instance, 256 MiB, concurrency 1 and 15-second timeout; a temporary `mi-sin-portal--…web.app` preview URL is printed. Save the exact URL. Preview channels use the **same cloud backend**; they are not isolated staging databases. Only synthetic mode is allowed there.

Before OAuth on that preview, have the owner approve adding its **exact returned hostname** to Auth authorized domains and the Fraud Defense key's domains if needed. Do not authorize every `web.app` site, remove existing domains, disable enforcement or use a debug App Check token. Without that approval, inspect the static preview only and perform OAuth testing on the approved site after the next step.

## 8. Publish only the SIN site, then register the approved identities

After reviewing the preview and approving this **synthetic-only** live-site release:

```bash
node scripts/launch-cloud-test.mjs live --execute
```

Equivalent scoped command: `npx --yes firebase-tools@15.35.0 deploy --only hosting:mi-sin-portal --project gen-lang-client-0948635471 --config firebase.mi-sin-portal.cloud-test.json`.

Open `https://mi-sin-portal.web.app`. Expected: unmistakable synthetic-test banner, Microsoft/Google options, no real SIN collection. The intended administrator uses **MI staff sign-in → Microsoft**; dedicated contractor testers each sign in with the intended Microsoft or Google account. Backend access is initially denied because bootstrap/activation is absent. Successful provider sign-in creates a shared Firebase Auth record; it does **not** grant portal access. Owner can identify the resulting UID in Authentication → Users. Do not use actual contractor accounts or create a username/password system.

The following operator actions use your existing Google Cloud Shell Application Default Credentials, never a downloaded service-account key. If ADC is unavailable, complete Google's supported `gcloud auth application-default login` interactively as the authorized owner. Do not paste tokens into chat or source files.

```bash
node scripts/cloud-test-operator.mjs bootstrap
node scripts/cloud-test-operator.mjs add-tester
```

Bootstrap asks for the explicitly approved MI UID/email, independent identity/email-control confirmation, MI tenant GUID, member object GUID and Microsoft client GUID. Verify against Entra and Firebase before confirming. It creates exactly one role/identity plus a disabled policy and synthetic public key; existing bootstrap state is never overwritten. No default admin exists and no domain grants privileges. The private test key is discarded; this data cannot be decrypted through the portal. `add-tester` independently binds an existing dedicated test UID to its exact email and provider UID, without changing any Auth user. Run `add-tester` once per dedicated test identity, at most five. Keep actual identifiers in Firebase/operator input, out of GitHub. The operator tool cannot reset submission slots or create a second administrator.

## 9. Activate for at most 24 hours and verify

Only after the owner has reviewed actual costs, actual IAM denial for other databases, App Check/provider behavior and existing-app regression:

```bash
node scripts/cloud-test-operator.mjs activate
```

It requires explicit usage-cost and isolation acknowledgements; there is no auto-activation. Reload and sign in again. The admin should see the dashboard only with the verified MI Microsoft member assertion. Contractors remain denied until the admin imports/adds their exact operator-approved test emails. Use **Test Google**, **Test Microsoft**, **Test account** or blank as names. The [reserved-address template](../examples/cloud-test.template.csv) illustrates the format; replace its addresses locally with your operator-approved dedicated test accounts, never with real contractor data. Other free-text names/unapproved emails are rejected by cloud import; do not upload the real contractor list.

Verify all of the following before sharing the synthetic site:

- MI staff Microsoft login succeeds; Google cannot grant the administrator role. Wrong tenant, guest/member-claim failures and provider conflicts deny access without linking accounts.
- Approved dedicated Google and Microsoft tester sign-ins succeed after operator ownership verification and allowlist import. An unapproved account is denied even after OAuth succeeds. Auth/provider success has not been live-tested by Codex.
- Submit fixture A or B. Confirmation contains no number. Reload/retry/provider switching never grants another slot. Revoke/remove and confirm the next backend action is denied. Never test by typing a real SIN.
- Database selector is `mi-sin-portal`. Inspect only this test database: payload is ciphertext, slot count is one, metadata/audit has no number. Direct browser reads/writes, even from admins, stay denied.
- Retrieval, mailbox, OTP sending and disposal endpoints are unavailable in cloud mode. No CSV exports of submissions, private keys or reveal screens exist.
- Check the new Function's selected runtime/service account/resource limits and safe error responses. Review logs for unexpected request-body/token capture; do not enable payload logging or session recording.
- Confirm the existing AI Studio application still signs in and reads/writes its own data normally, and no new portal tester can access its private data.
- Check Billing/usage after tests; expected tiny traffic is **not** a spend cap. App Check and request limits reduce abuse but cannot eliminate platform/denied-call costs. Policy expires after 24 hours. The callable allows at most 1,000 accepted identity-bound requests/day and 30/minute/UID; polling consumes that budget.

If ownership, provider claims, App Check, IAM isolation or costs cannot be demonstrated, close testing using the next command. Do not broaden permissions or relax a gate just to obtain a successful screen.

## 10. Pause and roll back safely

First close the backend gate (no deletion, Auth or billing changes):

```bash
node scripts/cloud-test-operator.mjs disable
```

Then replace **only the SIN Hosting site** with the included maintenance page and restore the dedicated closed Rules if needed:

```bash
npx --yes firebase-tools@15.35.0 deploy --only hosting:mi-sin-portal --project gen-lang-client-0948635471 --config firebase.mi-sin-portal.rollback.json
npx --yes firebase-tools@15.35.0 deploy --only firestore:mi-sin-portal --project gen-lang-client-0948635471 --config firebase.mi-sin-portal.rollback.json
```

For a previous working SIN Hosting release, Firebase Console → Hosting → **select mi-sin-portal** → release history → Roll back is an alternative. There is no previous portal release on the first launch, so the maintenance page is the safe fallback. Preview expiration does not roll back the Function, database or live channel. If a bad Function prevents the operator pause, use the privileged operator script (it writes directly through your ADC, not through that Function).

If incident containment also requires removing this newly created Function, first verify the inventory identifies it as the portal's new codebase, then explicitly approve and execute:

```bash
npx --yes firebase-tools@15.35.0 functions:delete miSinSynthetic --region northamerica-northeast1 --project gen-lang-client-0948635471
```

Do not use bulk deletion, delete a database, revoke shared Auth users/providers, change billing or alter the AI Studio app. Do not delete the shared Artifact Registry repository or apply project-wide cleanup policies. Restoring source from a previously reviewed commit and redeploying **only** this codebase is possible after the cause is understood; never redeploy the emulator source. Retain scoped non-sensitive diagnostics. Deletion/rollback is not guaranteed erasure of backups or previously obtained data.

## Remaining real-data blockers

This release cannot accept real SINs without replacing the test-only input/API design and undergoing independent review. Remaining requirements include approved business/legal purpose and privacy notice/contact; verified production email ownership without manual test attestation; actual Entra/MFA/step-up proof; reviewed browser/envelope cryptography and offline key custody/recovery/rotation; enforceable one-time delivery limits and failed-delivery recovery; controlled transfer/disposal/retention including backups; full logging/incident/abuse review; dependency remediation; mobile/keyboard/assistive-technology checks; Canadian residency/data-processing review for Auth, reCAPTCHA, Functions, logs and backups; least-privilege deployment/IAM regression evidence and approved ongoing costs. Screenshots/extensions/external copying and repeated decryption of retained ciphertext with a stolen key cannot be technically prevented by the portal.
