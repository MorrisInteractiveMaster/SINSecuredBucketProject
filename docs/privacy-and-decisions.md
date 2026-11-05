# Phase 1 — Privacy decisions and proposed operating policy

This is an approval register for MI's privacy/legal/security advisers, not a legal opinion or a published privacy notice. All decisions below are pending. The portal must fail closed for real collection until required decisions and independent reviews are recorded.

| Decision | Proposed position | MI owner / evidence needed |
| --- | --- | --- |
| Collection eligibility | Accounting confirms recipient/slip/purpose before invitation; do not collect from every contractor | Finance + legal: documented SIN versus BN decision tree, nonresident exceptions |
| Purpose and authority | Specific approved tax-reporting purpose, not generic identity verification | Privacy/legal: applicable authority and notice wording |
| Laws and jurisdiction | Review PIPEDA applicability, Saskatchewan circumstances, interprovincial transactions and any applicable provincial private-sector or sectoral requirements | Legal: actual operations/contractors/jurisdictions; no assumption that one statute covers all relationships |
| Official record | Transfer only into a named approved payroll/accounting/tax system | Finance + security: system owner, access controls and transfer procedure |
| Access roles | InvitationAdmin, SINRetriever, DisposalOfficer, Auditor separated where practical | MI sponsor + IT: named groups, approvers, periodic access reviews |
| MFA | Protected Entra authentication context and phishing-resistant authentication where available | IT: license, enabled policies, tested freshness and approved devices |
| Portal payload retention | Delete active payload immediately after transfer; maximum seven days awaiting transfer/recovery | Privacy + finance: approved deadline, escalation, handling of untransferred overdue records |
| Backups and keys | Proposed seven-day PITR and key soft-delete windows, purge protection, tombstones longer than recovery windows | IT/security + privacy: provider minima, restoration/retirement test and residual-copy acceptance |
| Audit metadata | Proposed 365 days for restricted event records; shorter challenge/session cleanup | Privacy/security: justified retention, permitted actor identifiers and access |
| Hosting location | Proposed Canada Central, recovery Canada East only after service review | Privacy/procurement: residency contract, service availability, support/telemetry/subprocessor mapping |
| Email | ACS Email candidate only; mail recipient, link and OTP are personal/security information | Privacy + IT: Canada geography support for selected email SKU and processing/transit terms; alternative approved mail provider if necessary |
| Browser encryption | Envelope protocol with isolated validator; no direct public unwrap | Independent security assessor: protocol review and failure-case tests |
| Production launch | Deny collection by default; reviewed configuration and artifact required | Sponsor + privacy + independent security: documented sign-off, incident plan, runbook and training |
| Brand assets | Approved standalone logo plus licensed Visby CF Regular/Demi Bold/Extra Bold | Design: original files and web-font usage rights; prototype uses plain organization label and system font |

CRA guidance allows a business number in certain recipient/slip cases, including T4A box 048 for eligible individuals with a BN. This needs an accounting decision before invitation rather than forcing a SIN. CRA RC4157 generally specifies at least six years for relevant tax records; this does not mean the temporary collection portal must keep a second copy for six years. Longer legal holds and other requirements may apply to official records and require advice.

The OPC recommends restricting SIN collection to legislated purposes and identifies SIN as personal information under relevant PIPEDA provisions. MI must confirm purpose, necessity, consent/notice obligations, safeguards, access/correction procedures, breach response and accountability. A checkbox does not create a legal basis or replace those duties.

## Draft notice structure (not approved copy)

Before entry, show: “Morris Interactive is requesting your SIN for [approved specific tax-reporting purpose]. Only [approved finance role] may retrieve it through a restricted one-time process. It is encrypted for storage. We remove the active portal copy after confirmed transfer to [approved official system], and no later than [approved maximum period]. Encrypted backups and retired keys may remain recoverable for [approved periods]. Official business records follow a separate retention policy. Privacy questions: [named privacy contact and verified address]. If you have a business number or believe this request does not apply, contact [approved finance contact] before submitting.”

No placeholder notice may be enabled in production. Do not publish names or contact addresses until verified. The approved privacy notice version/purpose code is stored with each submission, without copying the SIN into consent evidence.

## External processing inventory

| Service / party | Data it may process | Residency issue to resolve |
| --- | --- | --- |
| GitHub and Actions | Source, design docs, synthetic fixtures and build metadata only | No real contractor data or secrets in issues, artifacts or logs |
| Azure web/crypto/database/backup | Emails, status, ciphertext; transient SIN in crypto worker memory | Regional deployment is necessary but not a complete guarantee for support, diagnostics and subprocessors |
| Azure Key Vault | Private key operations, wrapped data keys and operational metadata | Region, replication, soft-delete, purge protection and support terms |
| Microsoft Entra | Staff identities, authentication events, device/MFA claims | Tenant geography and identity service processing terms |
| ACS and recipient email providers | Approved email address, invitation and OTP messages | At-rest geography differs from global transit/processing; mailbox retention is outside portal control |
| Azure monitoring / audit storage | Allowlisted actor/reference/status events | Explicit workspace/storage region, retention and operator access |
| Approved official accounting system | Transferred SIN and legally required records | Separate privacy/security assessment and retention owner |

Do not assume Canadian residency is universally legally required or automatically satisfied by selecting a Canada Azure region. Determine MI's actual contractual, legal and client requirements; document accepted cross-border processing. No external analytics, session recording, chat widgets or third-party font requests.

## Proposed administrator operations

1. Finance verifies collection eligibility and contractor email through an existing trusted business process; avoid accepting an unverified email-change request.
2. InvitationAdmin selects an approved purpose, sends an individual invitation and checks neutral status. Reissue revokes all old credentials; do not reissue a submitted record.
3. SINRetriever uses a trusted managed workstation, completes fresh step-up and prepares the approved destination before revealing. No screen sharing or ordinary email/phone transfer.
4. Reveal once and enter the value into the official system during the short visibility period. If it fails or is missed, open the approved recovery case using the record reference only; do not ask support to reset the reveal flag.
5. DisposalOfficer confirms the exact record and destination, attests transfer and initiates disposal. Track active deletion and key retirement separately; investigate overdue or failed tasks.
6. On ambiguous/failed retrieval, authorized staff revoke access, arrange a new contractor submission if still necessary and dispose of the old payload according to policy. Avoid free-text notes containing SINs.
7. On suspected exposure, suspend collection/reveal, preserve non-sensitive evidence, notify MI's designated incident owner and privacy adviser, and follow the approved breach process. Never paste a SIN into a ticket.

Sources: [OPC SIN guidance](https://www.priv.gc.ca/en/privacy-topics/sins-and-drivers-licences/social-insurance-numbers/02_05_d_21/), [CRA recipient information](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/calculating-deductions/determining-tax-treatment/set-up-and-manage-recipient-information.html), [CRA RC4157](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4157/deducting-income-tax-on-pension-other-income-filing-t4a-slip-summary.html), [ACS data residency](https://learn.microsoft.com/en-us/azure/communication-services/concepts/privacy). Reviewed November 5, 2026.
