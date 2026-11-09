# Phase 3 review: interactive synthetic workspace

This change continues draft PR #1. **No merge, deployment, real contractor import, administrator provisioning, shared Authentication change or cloud resource mutation has been performed.** The live synthetic site is unaffected until an owner approves and separately deploys a reviewed build.

## What works

| Capability | Implementation and limits |
| --- | --- |
| Morris design system | Genuine, unmodified logo extracted from the supplied brand PDF. Near-black canvas, layered cards, Murrey actions, teal/blue details, system sans fallback; no unlicensed font supplied or external font request. Original `design/index.html` retains all 14 reference concepts. |
| Contractor journey | Privacy overview, Microsoft/Google provider choice, backend eligibility, supplementary email proof in the existing local workflow, instructions, fixed fixture selection, review/correction, one acknowledged submission and completion. No free-form real SIN field or private-key import. Cloud still uses only operator-attested dedicated test accounts and the existing two fixture IDs. |
| Dashboard | Ten backend-derived totals; actual allowlist/submission records, no fabricated counts. Unknown historical dates/providers remain “Not recorded.” Only recorded authentication sessions contribute to signed-in totals. Refresh retrieves current backend state; it is not a continuous subscription. |
| Metadata tracking | Search, sort, submission/provider/date/administrator/pending-action filters; configurable explicit columns; 10/20/50-row pages; record selection; details drawer and non-sensitive server timeline. Maximum 100 authorized records; backend fails closed above that limit. |
| Operational changes | CSV preview/import, approved-test-account add, revoke, assign-to-self, controlled correction request. Bulk metadata operations require confirmation, are atomic and limited to 25 records. Correction/reimport never reopen the permanent submission slot. |
| Clipboard | Copy one field, selected rows, visible page or all filtered rows. The exact count and included columns are disclosed. Backend field allowlist, role checks and preparation audit precede output; clipboard failure is reported honestly. No sensitive clipboard operation exists. |
| Excel | Selected, filtered or all authorized metadata. Backend-only `exceljs-community` 5.2.1 generates `.xlsx`, explicit string cells, formula neutralization, generated timestamp, Murrey header, widths, frozen headings and filters. Neither arbitrary fields nor ciphertext can be exported. No spreadsheet library ships to the browser. |
| Activity | Server-generated invitation/sign-in/submission/correction, bulk assignment/revocation, copy/export and blocked-workflow events. Filters by contractor, actor, event and date; 100-event scan pages and explicit earlier-page navigation. Preparation and client-reported completion are distinguished. |
| Motion/help | CSS motion, 120–220 ms for most interactions, reduced-motion alternative, visible focus, native dialogs, drawer focus containment, keyboard/touch-accessible contextual help, skeletons, status/error announcements and honest loading/failure states. |
| Burn review | Explains the exact reference, transfer prerequisites, retention/backups and authorizations. Final Burn/transfer/retrieval confirmation stays disabled. “Record review request” records a **blocked** server event; it never reads plaintext, transfers or deletes a payload. No cryptographic destruction claim. |

## Four internal administrators: owner-run, private bindings

The four user-approved MI identities are represented by server/operator-only email fingerprints, not a domain rule. Fingerprints are identifiers, **not secret values or an ownership proof**. Each account also needs an independently verified Firebase UID, exact Microsoft provider UID/Entra member object ID, tenant, active portal role and dedicated-test identity attestation. The cloud runtime still verifies the signed Microsoft assertion against the tenant, app audience and provider binding. Google cannot administer the portal. Actual UID/object-ID bindings stay in the named portal database, outside frontend configuration/GitHub.

New permissions are explicit, default-deny: `metadataCopy`, `metadataExport`, `auditViewing`, `workflowManagement`; existing invitation, status and correction permissions remain separate. Sensitive retrieval remains false. Revocation is checked on every operation, not merely at sign-in. The UI refreshes context every minute and signs out on loss of authorization; authorization denial on the server is immediate. A response already obtained cannot be recalled.

**Do not run provisioning without owner authorization and independent identity verification.** For the owner, after reviewing the code and using approved ADC permissions:

1. Keep the current live release unchanged while reviewing this PR. Inventory the current private `policy/cloud-test`, `roles` and `testIdentities` bindings using the existing owner process. Back up permitted metadata/config privately.
2. Pause portal synthetic testing (`policy/cloud-test.enabled=false`) through the approved owner process. Do not disable shared Firebase accounts or change providers/IAM.
3. Confirm the intended person controls the exact approved account and is a member of MI’s Entra tenant. Obtain the actual Firebase UID, tenant GUID and member object GUID privately from the approved Console/Entra process. Email alone or a company suffix is insufficient.
4. From a trusted owner terminal with approved ADC, run `node scripts/phase3-admin.mjs grant`. The script prompts locally; do not paste bindings into a GitHub issue, Actions log, chat screenshot or frontend environment. Repeat separately for each of the four accounts. It writes only portal role/test-identity/policy/audit documents.
5. `node scripts/phase3-admin.mjs revoke` disables the exact existing portal binding and removes it from the policy list. Shared Auth users and the AI Studio app are unchanged. The grant script does not grant retrieval permission; role changes are audited.
6. The runtime allows at most four `adminUids`, with backward compatibility for the old single `adminUid` policy. A legacy bootstrap account outside the approved four will be refused by the revised cloud runtime. Review/revoke or replace that private legacy binding before adopting this version; it counts toward the four slots. Do not remove the roster check to preserve an obsolete bootstrap identity.
7. Only after review and deployment approval should the owner renew the existing short-lived synthetic release approvals and expiration, run all preflight checks and follow the existing scoped deployment/rollback guide. This PR does not reactivate a release automatically.

The new grant tool assigns the requested operational permissions to each explicitly approved identity; finer role separation can be applied privately by the owner and is enforced independently. No administrator self-grant, role-edit endpoint, account auto-link or project-wide claim mutation is provided. Privileged Google Cloud project administrators still have the previously documented trust boundary.

## Security boundaries preserved

- Exact `mi-sin-portal` client/database selection, dedicated Hosting target and `mi-sin-synthetic` codebase. Other databases and the AI Studio application are untouched.
- Existing cloud-test Rules continue denying **all browser reads and writes**, including metadata, roles and encrypted records. New UI functionality uses the trusted backend; no Rules were opened for dashboard convenience.
- Enterprise App Check remains on the dedicated synthetic function only. No Authentication/Firestore project-wide enforcement was enabled.
- Existing fixture-ID-only trusted cloud validation/encryption, active attested identity checks, Microsoft signature/member checks, one permanent atomic submission slot, finite policy lifetime and real-data flags remain enforced.
- Output has an explicit metadata projection. No SIN, ciphertext, private key, provider token or sensitive identity binding is returned. Audit entries record actor/reference/count, never clipboard/workbook contents.
- Copy/export receipts are UID-bound, one-acknowledgment, ten-minute records. Their age limit prevents late acknowledgment; it is **not automatic database deletion**. An approved retention/cleanup process is still needed for receipts/audits and synthetic records. No TTL or scheduled paid resource was enabled.
- A browser cannot prove that a clipboard write/download reached a secure destination or stop a recipient retaining metadata. The audit distinguishes server preparation from a client’s report. A downloaded spreadsheet contains contractor contact metadata and must be handled under MI’s approved policy.

## Costs and release impact

No cloud operations or billing changes were performed. New operations use the existing bounded function (256 MiB, max one instance, concurrency one), existing App Check and the named database. Every invocation still consumes the existing global/per-user request budget; denied traffic can still incur platform cost. An overview/output reads up to 100 invitations, their submission metadata, 200 recent audit events and 10 role labels. Copy/export preparation and acknowledgment add receipt/audit writes; exports add CPU/memory and response traffic. These are additional usage-based operations, **not guaranteed $0**, and the named database has no second free allowance. Review current billing/quotas and the existing [cost review](cloud-test-review.md) before owner-run cloud testing. Alerts are not caps. No automatic polling of dashboard totals or unrestricted realtime listener was added.

Deployment is still manual and forbidden until approved. Use [the existing targeted launch and rollback instructions](cloud-test-launch.md); build/stage only this codebase. Deploy reviewed backend changes before an approved matching Hosting preview; do not change live Hosting first. Keep `policy/cloud-test.enabled=false` during migration, preserve old private configuration, and restore the prior reviewed function/Hosting release on rollback. Never use a bare `firebase deploy`, default Hosting site or broad Firestore rules deployment. Adding operations inside the existing exported function does not authorize broader IAM. The actual contractor CSV remains private and unimported; cloud import still rejects identities that are not independently attested test accounts and rejects personal free-form names.

## Remaining production blockers

Real collection, one-time plaintext retrieval, fresh verified MFA/step-up, approved decryption-key custody/recovery/rotation, official transfer confirmation, secure disposal/backup handling and legal/privacy/retention approvals are **not implemented or demonstrated by this UI release**. Neither a drawer nor a blocked-request audit establishes those guarantees. The encrypted synthetic fixtures cannot be retrieved in this release. Live Microsoft/Google configuration, App Check assessment, real service-account IAM/isolation and existing-app regressions still require an authorized cloud smoke test. No synthetic test is a claim of production readiness or WCAG certification.

See [validation and screenshots](phase-3-validation.md) for actual test results, limitations and local review instructions.
