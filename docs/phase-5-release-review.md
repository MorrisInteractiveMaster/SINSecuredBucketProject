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
