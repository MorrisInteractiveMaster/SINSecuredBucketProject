# Existing Firebase project investigation — read-only, pending access

November 5, 2026. First candidate: **Default Gemini Project (`gen-lang-client-0948635471`)**. No project selected, no existing configuration changed, no service created, no billing action performed.

The official Firebase integration is available but is not connected in this session. Neither the Firebase nor gcloud CLI is present/authenticated here. No Firebase credentials have been requested, read from unrelated files, or committed. This prevents live account inspection. A project label or screenshot title cannot establish Spark status, unused capacity, privacy location or safe reuse. Public Firebase documentation was reviewed separately for feasibility.

## Candidate matrix

| Candidate / evaluation order | Spark / billing | Hosting enabled / sites | Firestore usage / eligible DB / region / Rules | Auth configured / shared users/providers | Existing dependencies / spare capacity | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Default Gemini · `gen-lang-client-0948635471` | Unknown | Unknown | Unknown | Unknown | Unknown | First candidate; selection blocked pending read-only inspection |
| 2. The Hive Assistant · `the-hive-assistant` | Unknown | Unknown | Unknown | Unknown | Unknown; name is not proof of application behavior | Next if Default is proven unsuitable; not yet evaluated |
| 3. Gemini Project Paid · `gen-lang-client-0637098617` | Unknown; “Paid” is not evidence | Unknown | Unknown | Unknown | Unknown | Evaluate after earlier candidates fail; reject if billing-enabled; do not downgrade |

No candidate has been declared unsuitable merely because access is unavailable. If none meets requirements, remain emulator-only at $0. Do not create a new billable resource, delete a database or replace existing application services.

## Evidence required before project selection

For Default first, record in a restricted MI operational record (not this public repo):

1. Project identity and Firebase registration state. A Google Cloud/Gemini project may not have Firebase enabled. Capture current Spark/Blaze label plus Cloud Billing linkage/enabled state through read-only account views/API. If these disagree or cannot be verified, stop; do not unlink billing or activate Firebase as an inspection step.
2. Hosting enabled state, existing site IDs, domains, current release/configuration, app owners and storage/transfer totals. Determine whether a **new** dedicated site fits the 36-site limit and shared free capacity without editing the default site. Reading a console's “get started” state is evidence; clicking it is activation and out of scope here.
3. Firestore database inventory, edition/mode, free-quota eligibility, actual database ID and immutable location. Do not assume `(default)` is unused or the free-quota database. Record storage/read/write/delete/egress usage and dependencies; no scans of private documents for this inventory. If no database exists, any future creation/location choice needs review and must still stay Spark.
4. Read **the deployed complete Firestore Rules and deployment source owner**, not only a repository fragment. Record ruleset version/hash and effective recursive allows, collection groups and role dependencies. Inspect index/field overrides. Preserve raw configuration privately; no bulk private-data export. This revision does not include an integrated replacement ruleset because the deployed rules are unseen.
5. Authentication providers/settings, email/password enabled state, authorized domains/action URLs, Identity Platform/TOTP configuration, use/quotas and existing application owners. Inspect counts/configuration only; do not export user emails/password hashes or change verification flags. Determine whether enabling or changing any provider would affect other applications. Do not make global changes for this portal during inspection.
6. Project IAM/owners, service accounts, deployed server clients/other apps, rules deployers and incident/contact ownership. Server/IAM clients may bypass Rules; identify this privilege even if ordinary users are denied. Confirm that unrelated app code does not read arbitrary collections or expose backend credentials.
7. Existing web apps, app IDs, Hosting site capacity and per-project resource limits. Registering a new app/site must be confirmed no-cost and non-disruptive, with an explicit dedicated future deploy target. Auth authorized-domain changes are shared project changes requiring their own review. A separate origin is useful but not resource isolation.
8. Existing Google Analytics, error/performance telemetry, App Check enforcement and auth templates. Do not initialize these SDKs in portal code. Determine whether action-link and project-wide changes could accidentally affect another application or route a user to the wrong site.
9. Privacy acceptance of the actual Firestore location, Auth US processing, Hosting global delivery, Google subprocessors and administrative access. If MI requires all identity processing in Canada, this Firebase Auth design is unsuitable even with a Canadian database.
10. Owner confirmation of application dependencies and enough free quota for all apps. Record a concrete go/no-go with date, evidence source, owner and reasons before selecting a project.

## Safe inspection methods

Prefer the connected official Firebase integration for supported read-only metadata. Where it lacks plan/Rules/IAM details, use authorized read-only console/API inspection through the project's owner; do not infer a setting from an unavailable response. With an already installed/authenticated approved CLI, read-only inventory commands include `firebase projects:list`, `firebase apps:list --project PROJECT_ID`, `firebase hosting:sites:list --project PROJECT_ID`, `gcloud billing projects describe PROJECT_ID`, and `gcloud firestore databases list --project=PROJECT_ID`. These are examples for a future authenticated environment, not commands executed in this revision. CLI output fields and permission errors must be interpreted carefully; inability to list a service is not proof it is absent.

Never run `firebase init`, `firebase deploy`, `firebase use --add`, `hosting:sites:create`, database create/delete, IAM updates, Auth user modifications, Rules updates, billing link/unlink, or plan upgrades as part of this read-only investigation. No repository deploy credential should be needed to inspect metadata. Do not paste tokens, service-account JSON, private Rules evidence or personal records into public GitHub issues.

## Selection criteria and safe integration

Reject a candidate if it is not Spark, is billing enabled, has incompatible immutable database location/mode, lacks free capacity, or cannot isolate portal data without disrupting existing applications. Record the specific reason then repeat the same inspection for the next project. Do not relocate/destroy an existing database or downgrade a live project. If broad deployed Rules would expose portal collections, do not claim a namespaced deny overrides them; overlapping allows are ORed. The existing application owner must propose and regression-test any future change, or reuse is unsuitable.

Connection is the only missing input needed to continue the live project assessment. The architecture, cost-source verification, layout adaptation and test plan can be reviewed independently; they intentionally do not select a project by name.
