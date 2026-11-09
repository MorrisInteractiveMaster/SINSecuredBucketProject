# Phase 5 staff workspace and production release review

This draft adds a permanent staff workspace beside the existing synthetic workflow. The workspace uses separate Firestore document paths in the same named database. The synthetic callable still accepts only its existing fixtures, applies its existing approvals and expiry, and has no production payload routes. No Firebase deployment, identity provisioning, private list import or real SIN operation was performed by this change.

## Observed failure paths and operator diagnostics

The reported 400 and 403 are distinct signals. In the Phase 4 source a malformed callable envelope can return 400 before App Check is consulted. A schema or CSV validation failure can also return 400 after authentication. Phase 4 collapsed unclassified exceptions into 403, which could conceal a Firebase Auth, Firestore IAM or backend service failure. Its standard administrator context also required an active synthetic policy before checking role access. This dependency is removed for explicitly provisioned staff. Microsoft's popup warning alone does not identify any of these causes.

The exact historical request or upstream failure cannot be established from source or a browser status code. Retrieve the matching deployed revision's request timestamp and sanitized stage/code. After a separately approved preview, use the reference shown in the portal. This query returns only the fixed fields from the revised handler:

```sh
gcloud logging read 'jsonPayload.event="portal_request_rejected" AND jsonPayload.reference="REPLACE_WITH_REFERENCE"' \
  --project=gen-lang-client-0948635471 --limit=5 \
  --format='table(timestamp,jsonPayload.reference,jsonPayload.stage,jsonPayload.code)'
```

- `request-format` means the transport rejected the callable envelope. A 400 after that stage requires checking the operation's expected schema and client revision.
- `app-check` means attestation is missing or was rejected. Verify the official portal origin, registered web app, Enterprise site key and Functions app ID binding without relaxing enforcement.
- `firebase-session` is a failed Firebase session or revocation check. `firebase-auth-reader` is a dedicated runtime Auth lookup failure. For the previously reported Cloud Shell issue use the optional safe diagnostic in the [Phase 4 guide](phase-4-activation.md). Token availability alone is insufficient. Review IAM and ADC type without requesting or sharing credential files.
- `microsoft-assertion` covers signature, issuer, audience, age or proof availability. `microsoft-member-binding` covers signed tenant, linked object ID or the required member claim. Check the Entra app optional `acct` claim, which must indicate member status. Compare the OAuth client and tenant in the reviewed configuration. Do not paste ID tokens into logs or diagnostics.
- `staff-policy` or `synthetic-policy` means the corresponding workspace is paused, expired or incorrectly configured. `backend-access` identifies a backend permission or availability exception. Check the dedicated service identity's named-database IAM condition and runtime status.

The transport records only a random request reference, bounded stage and code. Rejection reasons do not include request bodies, JWTs, names, email addresses, raw upstream responses or SINs.

## Reviewed synthetic and staff-metadata preview

Only an approved deployment operator runs these steps. Normal staff use Microsoft sign-in in the portal.

1. Review CI, the [existing scoped deployment guide](cloud-test-launch.md), the cost and isolation requirements, App Check, and conditional IAM for the dedicated service account and Montreal `mi-sin-portal` database. Record the currently deployed Functions revision/source commit and Hosting version in the private change record. The current deployment revision and IAM cannot be inferred from this PR.
2. In the existing Microsoft Entra app registration used by Firebase Microsoft sign-in, verify that the app issues the `acct` optional claim in ID tokens. Create two user app roles with the exact values `MiSinPortal.Owner` and `MiSinPortal.Staff`. In the corresponding Enterprise Application, under **Users and groups**, assign the owner role directly to Dev's approved organizational account and the staff role directly to Jeremy, Trista and Mercydes. Review the exact directory accounts before assigning. Review the impact on other consumers of that registration. Leave the application-wide **Assignment required?** setting and shared Firebase Auth settings untouched. The portal checks these signed app roles independently.
3. Create the ignored local file `operator-input.staff.json` with only the Entra tenant ID and the application (client) ID from the app registration **Overview** page. Use the approved operator's scoped Firestore ADC or keyless impersonation.

   ```json
   {
     "tenantId": "<Directory (tenant) ID>",
     "microsoftClientId": "<Application (client) ID>"
   }
   ```

   The trusted backend already contains the four exact approved-account fingerprints. The operator command creates the policy and roster slots atomically. Each staff member establishes their own binding on the first verified Microsoft sign-in. Enrollment requires a valid tenant and audience, the member claim, the individually assigned app role and a Firebase account linked to the same Microsoft object. The signed account name is checked for consistency against the exact roster and Firebase email. Later requests require the pinned UID and Microsoft object, the active portal role and valid Microsoft proof. No staff IDs, setup codes or synthetic window are needed for staff access. Contractor-list changes and real SIN operations stay closed.

   A prior pinned workspace with the same tenant and app can be migrated with the same approved command. Existing bindings and revoked states are preserved. A replacement identity remains denied even if it has the old email or is assigned the same Entra role. Restore in the dashboard restores the existing binding only. Escalate replacements to the approved deployment operator for a separately reviewed identity migration. There is no self-service reset of a bound identity.
4. From the reviewed revision, install locked dependencies and use the existing configuration helper and scoped launcher:

   ```sh
   npm ci --ignore-scripts
   npm run test:all
   node scripts/configure-cloud-test.mjs
   npm run build:cloud-test
   node scripts/check-ui-artifact.mjs
   npm run check:cloud
   node scripts/provision-staff-workspace.mjs operator-input.staff.json
   node scripts/launch-cloud-test.mjs functions
   node scripts/launch-cloud-test.mjs preview
   ```

   The provisioning and launch commands above are plans. After explicit change approval, run:

   ```sh
   node scripts/launch-cloud-test.mjs functions --execute
   node scripts/provision-staff-workspace.mjs operator-input.staff.json --execute
   node scripts/launch-cloud-test.mjs preview --execute
   ```

5. On the authorized preview, verify all four approved staff accounts can sign in and reach the dashboard, and verify one enrollment event per newly bound identity, that mismatched Microsoft/Google identities are rejected, that revocation prevents new operations, and that the original synthetic approval/window/fixture and direct Firestore deny rules still hold. Record only fictional identifiers in test reports. Confirm the existing AI Studio application using its own approved regression check. Do not promote a preview with failed tests or unverified IAM.
6. After a separately documented privacy decision on storing invitation metadata, add its approved UUID as `privacyApprovalReference` to the private operator input and run `node scripts/provision-staff-workspace.mjs operator-input.staff.json --approve-invitations`. The owner may then use the existing dashboard to import `name,email,status` CSV, add/revoke invitations and export allowed metadata. Verify with a fictional CSV first. This step does not enable submission of actual SINs. Live Hosting promotion remains a separate reviewed action using `node scripts/launch-cloud-test.mjs live --execute`.

## Rollback

Pause the permanent staff workspace with `node scripts/provision-staff-workspace.mjs operator-input.staff.json --pause` under scoped operator credentials. Pause synthetic testing using the existing approved operator procedure if needed. Restore the exact previously reviewed Hosting version for **mi-sin-portal** and restore the recorded Functions revision or redeploy only the prior reviewed source via its scoped launcher. Follow the [existing containment and rollback steps](cloud-test-launch.md) if the previous revision cannot be safely restored. Keep the named database and closed Rules. The workspace pause is non-destructive. If rolling back to a pre-enrollment Functions revision, pause the staff workspace first and preserve the roster and its bindings for the reviewed redeployment. Preserve audit history and review data retention separately. Do not roll back shared Auth, other Hosting sites or AI Studio.

## Production candidate and blockers

The isolated review code adds real Cloud KMS REST and named Firestore transaction adapters, an MFA assertion verifier and per-operation composition. Tests use fictional credentials and fixtures. A future approved deployment must use independently scoped identities with encrypt-only and decrypt-only permissions on an approved Canadian key. Application checks alone cannot prove that IAM separation. MFA uses Firebase's verified second-factor evidence and authentication time, with independently approved factors. It is not inferred from token issuance or a Microsoft popup.

The workflow consumes the invitation in the same transaction that creates the encrypted record. It consumes retrieval authorization before attempting unwrap. An unwrap failure or lost response cannot reset that state. Transfer requires an independently verified business-record receipt. Disposal requires independently verified retention authority and a confirmed transfer. The transaction projects status and events to metadata only. There is no bulk plaintext or export path for SIN payloads.

Before any production release, independently review and implement the live identities and IAM, verified contractor invitation bindings and notice acceptance, allowed MFA enrollment and step-up, actual business-record receipt and retention verifiers, legal holds, backup/PITR and failed-retrieval procedures, approved collection purpose and notices, and Canadian processing and residency across all participating services. Active-record disposal does not erase backups. Verify logs and exports with fictional inputs. There is no approved production deployment procedure yet. These adapters remain excluded from all current release artifacts.

## Record invitation metadata approval

The invitation policy is separate from authorization to collect SINs. The owner records the actual privacy decision in the organization's change record and supplies its existing UUID as `privacyApprovalReference` in the private operator input. A generated UUID by itself is not a decision. Keep the contractor CSV and approval documents out of GitHub and deployment logs.

Use an existing approved keyless operator credential with Firestore write access scoped to the named database. If your organization uses service account impersonation, use the approved operator identity and its established impersonation grant. Do not reuse the portal runtime identity as the operator or add a broad project-level role to work around permission errors.

```sh
node scripts/provision-staff-workspace.mjs operator-input.staff.json
node scripts/provision-staff-workspace.mjs operator-input.staff.json --approve-invitations
```

The approval command checks the input before cloud authentication. It records the reference in the policy and audit event in one transaction. Repeating the same approval is safe. A conflicting approval reference requires review. The command reports missing approval, token acquisition, named-database IAM denial, and unavailable service as separate error categories.

After a scoped release, use the staff dashboard to add an approved identity or preview and confirm the private CSV. Imports reject existing invitations atomically. Use the contractor details to update the name or revoke the invitation while retaining its existing ID and submission slot. Creating a metadata record does not send an invitation email. Confirm delivery through an approved organizational channel. The SIN workflow remains separate.

## Secure bucket deployment and activation

The existing Montreal callable and named Firestore database serve the bucket. Keep the existing Microsoft administrator bindings, App Check, Hosting target, and deny-all client rules. Use only the scoped commands below. A deployment leaves live collection closed until the operator records the release decision. Contractors use their existing approved address. Where provider sign-in alone is insufficient, the portal sends a verification code only after the contractor requests one. Staff share the portal link manually.

1. In Cloud KMS, grant **Cloud KMS CryptoKey Encrypter/Decrypter** on the approved Canadian symmetric key only to `mi-sin-cloud-test@gen-lang-client-0948635471.iam.gserviceaccount.com`. Record its full resource name. Verify a wrap and unwrap of 32 random test bytes under that runtime identity, using an already approved impersonation session or an authorized cloud smoke test. Verify that request bodies are excluded from logs and review backup/PITR retention. Keep older key versions available while their sealed records remain.
2. In Resend, verify the approved sender domain and create a sending-only API key scoped to that domain. In the approved Cloud Shell session, set the following Firebase secret. Generate the HMAC key with `openssl rand -hex 32`. Enter the JSON at the CLI prompt using the actual verified sender and API key, without putting the values in shell history or Git. Grant the same runtime service account Secret Manager Secret Accessor on this secret only if the scoped Firebase deploy has not already granted it.

   ```sh
   npx --yes firebase-tools@15.35.0 functions:secrets:set MI_BUCKET_VERIFICATION_MAIL --project gen-lang-client-0948635471
   ```

   The secret has three properties, `apiKey`, `from` (a single sender address), and `hmacKey` (64 hex characters). Resend receives the recipient address and verification code. It receives no submitted bucket values. The deployment operator must approve this sender/provider and validate delivery to an approved test mailbox.
3. Deploy from the reviewed commit using the existing Firebase web application and App Check configuration. Use the existing public configuration values when prompted. This updates only the dedicated callable codebase and portal Hosting target.

   ```sh
   npm ci --ignore-scripts
   node scripts/configure-cloud-test.mjs
   npm run build:cloud-test
   node scripts/check-ui-artifact.mjs
   node scripts/launch-cloud-test.mjs functions --execute
   node scripts/launch-cloud-test.mjs live --execute
   ```

4. Confirm the staff dashboard works with the existing Microsoft organizational accounts. Set `privacyApprovalReference` in the private operator JSON to the actual recorded contractor-metadata approval UUID. If contractor metadata access is still closed, run the first command below. Add or import the approved addresses. In **Security & handling → Requested information**, set the label and input type. The change applies to future submissions. Previously sealed values remain retrievable and submission slots are preserved.
5. After live readiness and the release decision have been verified, set `sinReleaseApprovalReference` to the recorded release decision's existing UUID and `sinKmsKey` to the approved Canadian key's full resource name in the same private `operator-input.staff.json`. Run the second command below under the approved keyless operator session. The command name and confirmation phrase are retained for compatibility.

   ```sh
   node scripts/provision-staff-workspace.mjs operator-input.staff.json --approve-invitations
   node scripts/provision-staff-workspace.mjs operator-input.staff.json --enable-sin
   ```

   Type `APPROVE LIVE SIN RELEASE` after authorization is recorded. Share the portal URL manually. For the first live check, use an approved test mailbox and a non-sensitive test value matching the configured field. Verify code delivery on a custom domain, submission, clipboard behavior, and rejection of a second reveal.

To halt submission and reveal, run `node scripts/provision-staff-workspace.mjs operator-input.staff.json --pause-sin`. The reveal transaction deletes the active ciphertext and wrapped key before returning the value. If delivery fails after that transaction, the value cannot be reopened. Clipboard copies are outside the portal's control. Backups and point-in-time copies may retain encrypted material for the configured retention period. Keep any restore isolated from the live callable.

### Backfill contractor display names

Run this once from the reviewed release checkout with the existing operator ADC for the named `mi-sin-portal` database. The first command previews counts only. The second rechecks each candidate transactionally and writes only the name field for empty names and the exact legacy placeholder `Test account`.

```sh
node scripts/backfill-contractor-names.mjs
node scripts/backfill-contractor-names.mjs --apply
```

Reload the tracker after deployment and backfill. Existing contractor records and submissions do not need to be imported again.
