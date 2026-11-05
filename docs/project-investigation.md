# Read-only inspection record — selected existing Blaze project

November 5, 2026. Target: **Default Gemini Project / `gen-lang-client-0948635471`**. Owner confirms Blaze is already active and an existing app depends on the project. This supersedes the previous Spark-only project-selection process. Do not evaluate/create another project, downgrade the plan or change billing linkage.

## Attempt and result

Installed/ran Firebase CLI 15.35.0 locally and attempted:

`firebase firestore:databases:list --project gen-lang-client-0948635471 --json`

Result: **authentication failed** (“Failed to authenticate, have you run firebase login?”). No authenticated Firebase project tool is exposed in this session despite the plugin's installed instructions. No login credentials were harvested, no user records queried/exported, and no cloud resource/setting was changed. The project owner's billing statement is accepted but has not been independently checked against billing configuration/usage.

## Current evidence matrix

| Item | Evidence / status | Consequence |
| --- | --- | --- |
| Project name/ID | User-supplied exact target | All future commands pin this project; no project switch |
| Blaze | Confirmed by project owner | Do not downgrade; additional usage can be billed |
| Existing application | Confirmed by project owner | Protect configuration/data/URL/users; live smoke tests pending |
| Existing DB IDs, editions/modes, regions | Unknown; inventory denied by missing authentication | Do not assume `(default)`; do not create `mi-sin-portal` until ID collision/current use checked |
| Proposed portal DB | `mi-sin-portal`, Standard/Native, Montréal proposed | Not created; Canadian availability/privacy/configuration approval pending |
| Existing rules/releases/indexes | Unread | No claims of actual rules audit or existing-app access protection validation |
| Web apps/Hosting sites/config/releases | Unknown | New site/app proposal unbound; preserve existing default/site releases |
| Auth providers/domains/Identity Platform/MFA | Unknown | No shared provider/domain/template/user modifications |
| IAM/server clients | Unknown | No broad IAM changes; privileged bypass and DB scope need review |
| Free-quota eligibility/current usage | Unknown | Assume named portal usage billable; no second free allowance |
| Actual billing/export/credits/currency | Not accessible | No guaranteed $0, no pricing-specific account quote |

## Next authorized read-only inspection

Use an authenticated Firebase connection/approved existing CLI login with access to the named project. Do not run setup/deploy/create as an inspection substitute. Query configuration only, avoiding document/user exports. Retrieve privately:

1. List every Firestore DB, then get each database's exact resource name, ID, edition, mode, location, free-quota status and protection/TTL/PITR/backup configuration. `firestore:databases:list/get` with explicit project; record whether `mi-sin-portal` already exists. If it exists, treat it as protected existing data until ownership/purpose confirmed; no overwrite.
2. Read deployed Rules releases and full source per DB, current indexes and owner repository/configuration. Each DB has its own rules release. Record source hashes, not private raw Rules/IAM details in this public repo.
3. Map application DB usage from owners' actual SDK initialization, backend clients, configuration and deployment records. App registration alone does not identify the DB. Do not scan private business documents to infer ownership.
4. List registered web apps, Hosting site IDs/domains/targets/releases, shared storage/transfer usage and current CI jobs/deploy credentials. Inspect source deploy configs with owner permission; identify default alias/broad deployment hazards.
5. Read Authentication providers/authorized domains/action URLs/template settings, Identity Platform/TOTP configuration and counts/quotas without exporting users/password hashes or changing any account. Determine how new portal users/provider changes could affect the existing app.
6. Review existing project and database IAM, server SDK principals, deployers, billing admins and service accounts. Identify broad existing privileges and potential database-level IAM Conditions before proposing least-privilege portal identities. Do not grant/revoke roles during review.
7. Read actual billed operations/storage/network and recent invoices/usage by database/SKU where available, currency/contract rates and billing-account aggregated free usage for possible Functions. Use a read-only billing viewer if already authorized; absence of usage data is not evidence of zero cost. Do not activate paid exports to get a report.
8. Confirm named DB Canadian availability, API/edition limits, privacy acceptance, existing app owners, baseline smoke tests and a no-disruption change/rollback owner.

Examples after authentication: `firebase firestore:databases:list --project gen-lang-client-0948635471`; `firebase firestore:databases:get VERIFIED_DATABASE_ID --project gen-lang-client-0948635471`; `firebase apps:list --project gen-lang-client-0948635471`; `firebase hosting:sites:list --project gen-lang-client-0948635471`; `firebase firestore:indexes --database VERIFIED_DATABASE_ID --project gen-lang-client-0948635471`. Verify pinned CLI help for exact syntax; these commands have not been rerun successfully here. Rules/Auth/IAM/billing details may require read-only console/APIs beyond the CLI inventory.

No `firebase init`, `deploy`, database create/delete/update, Auth export/import, provider changes, IAM modifications, billing actions, app/site registration or paid export is authorized by this inspection. Do not post credentials, user IDs/emails, private configuration or security findings into public issues.
