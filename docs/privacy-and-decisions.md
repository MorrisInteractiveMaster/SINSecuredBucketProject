# Firebase revision — Privacy decisions and operating policy

November 5, 2026. This is an approval register for MI's privacy/legal/security advisers, not a legal opinion or approved notice. The incremental infrastructure ceiling is **CAD $0**. All real collection/retrieval is disabled; independent review and demonstrated technical properties remain mandatory. No new paid review or service is authorized automatically.

## Decisions requiring evidence

| Decision | Proposed position | MI owner / evidence needed |
| --- | --- | --- |
| Collection eligibility | Accounting confirms recipient/slip/purpose before invitation; do not collect from every contractor | Finance/legal: SIN-versus-BN decision tree including nonresident cases |
| Purpose and authority | Specific approved tax-reporting purpose, not generic identity verification | Privacy/legal: applicable authority, necessity and notice wording |
| Applicable laws | Review PIPEDA applicability, Saskatchewan circumstances, interprovincial transactions and relevant provincial/sectoral requirements | Legal: actual operations and jurisdictions; no assumption one statute covers all relationships |
| Official record | Transfer only to a named approved payroll/accounting/tax system | Finance/security: system owner, access/retention and approved transfer procedure |
| Project choice | Inspect Default Gemini first; only Spark/no billing, no disruptive reuse | IT + existing app owners: current plan, configuration, Rules, IAM, usage and dependency evidence; no selection yet |
| Regional processing | Inspect actual existing Firestore location; cannot relocate an existing database in place | Privacy/IT: accepted database location; whether Canadian storage is mandatory; no assumption “default” means Canada |
| Auth/global services | Firebase Auth processes in US; Hosting uses global infrastructure | Privacy/legal/procurement: accepted cross-border processing, terms and subprocessors; reject design if all processing must stay in Canada |
| Shared project access | Separate portal UID roles and record assignments, not generic existing app admin status | Sponsor/IT: current IAM/server clients/rules and named portal role ownership; project admins can bypass Rules |
| MFA | Investigate existing no-billing Identity Platform/TOTP, verify freshness/claims | Security: real evidence; password reauthentication is not MFA; no upgrade or provider change this phase |
| Encryption/custody | Public-key browser encryption, private key offline, hosted portal never imports it | Independent assessor + IT: crypto/context design, approved existing encrypted storage, local utility/handoff/recovery |
| Portal payload retention | Immediate active deletion after attested transfer; proposed seven-day maximum | Privacy/finance: manual process cannot guarantee deadline deletion; this remains a production blocker |
| Residual copies/keys | No immediate backup-erasure claim; offline key and ciphertext copies cannot be revoked | Privacy/security: provider retention terms, all custody copies and key retirement limits; shared keys lack per-record erasure |
| Audit | Proposed 365-day metadata retention, reference/actor/event only | Privacy/security: justified period and limitations; no automatic read/decryption audit with Rules |
| Manual mail | Existing corporate service sends instructions only; Firebase verifies email | IT/privacy: providers, action URLs, message templates and quota ownership; no SIN/password/private key in messages |
| Brand assets | Approved genuine logo + licensed Visby web fonts only | Design: original assets/rights; preserve current labelled text/system-font fallback |
| Production | Must demonstrate original privacy/authorization/encryption/retrieval/disposal requirements | Sponsor/privacy/independent security: current design cannot guarantee all requirements; remain synthetic-only |

## Preserved legal-purpose analysis

CRA recipient guidance allows a business number for certain recipient/slip cases, including eligible individuals with a BN for T4A box 048. Accounting must decide before invitation, rather than forcing every contractor into a SIN form. CRA RC4157 generally describes at least six years for relevant tax records; this does not require keeping a temporary collection duplicate for six years. Official records may be subject to longer obligations/holds requiring advice.

The OPC recommends restricting SIN collection to legislated purposes and treats SIN as personal information subject to relevant PIPEDA provisions. MI must confirm purpose, necessity, notices/consent, safeguards, access/correction processes, accountability and breach response. A checkbox does not create legal authority or compensate for missing technical safeguards.

## Draft notice structure — must be rewritten/approved before use

“Morris Interactive is requesting your SIN for [specific approved tax-reporting purpose]. [Named authorized finance role] may access encrypted submissions through [approved access and local decryption process]. Your number is encrypted in your browser before the normal application sends it to Firestore. Google also processes your email and authentication information; Firebase Authentication operates in the United States and Hosting is globally delivered. We remove the active portal payload after confirmed transfer to [official system], subject to [approved deadline/process]. This does not remove copies already obtained by an authorized device or guarantee immediate removal of provider residual copies. Official business records follow a separate retention policy. Privacy questions: [verified privacy contact]. If you have a business number or believe this request does not apply, contact [approved finance contact] before submitting.”

Do not promise one-time viewing, automatic seven-day purge, Canadian-only processing or irreversible deletion. This draft is informational structure only; it is not suitable for publication because collection is blocked and the handling/retention guarantees are not met. No placeholder contacts/purposes may be deployed in a real collector. Store approved notice version/purpose with metadata, never copy a SIN into consent evidence.

## Processing inventory

| Service / party | Data it may receive | Privacy boundary / review |
| --- | --- | --- |
| GitHub / Actions | Public source/design, synthetic fixtures and build metadata | No contractor emails, SINs, private keys, role UID inventories, tokens, sensitive findings or service-account credentials in public issues/artifacts |
| Firebase Hosting | Public app/public key/assets, network request information | Global CDN; hosted pages must contain no personal record data; no private keys in bundles |
| Firebase Authentication | Email, credential/authentication data, verification/reset activity, network/device information | Firebase states US-only processing; review actual provider/settings and shared-app changes |
| Firestore | Approved emails, UID-role mappings, invitation/status/audit metadata and ciphertext | Actual immutable region unknown; namespacing is not IAM isolation; email/UID/ciphertext remain personal information |
| Corporate and recipient mail providers | Invitation instructions/link, recipient and Firebase action mail | Mailbox/processor retention outside portal control; no SIN/password/private key |
| Local key custodians / workstations | Offline encrypted private key; transient decrypted SIN and key memory | Existing approved secure endpoint/media required; no cloud-sync folders, browser persistent storage, screen sharing or support dumps |
| Approved official record system | Transferred SIN and legally required records | Separate assessment/retention; portal disposal does not delete official record |
| Google operations / subprocessors | Service-specific diagnostic and operational information | Review Firebase/Google terms, service data retention and access/support handling; public docs do not prove MI-specific compliance |

Firebase's published privacy page identifies Authentication as US-only; a Canadian Firestore region cannot change that. Actual Firestore region is uninspected and fixed after provisioning. If incompatible, evaluate the next project; do not destroy or move an existing application's database. No Analytics, Crashlytics, performance monitoring, input capture or third-party fonts/scripts in the portal. Do not assume project-level existing telemetry is harmless; inspect it.

## Retention/disposal realities

Rules can deny future reads on expiry, and a paired delete/status/event batch can remove the active ciphertext under approved officer authorization. That does not verify the official transfer, run a cleanup when no staff are online or erase prior copies. Firestore TTL/PITR/managed backups/restores require billing and are excluded. Provider internal retention is distinct from an MI-managed backup setting; obtain terms/evidence rather than invent a seven-day provider-erasure promise.

Proposed manual cleanup: named officer checks overdue metadata each business day, deletes exact eligible payloads with permanent tombstones/events and records failures without SINs. Existing corporate calendaring/process may support this at no new infrastructure cost; no reminder/automation was created by this revision. This process cannot guarantee a strict seven-day maximum, especially during outage/absence; the original automated deadline guarantee stays unmet.

Do not delete submission tombstones in a way that permits recreation; define their justified retention separately and retain them beyond any recoverable copy window. No new paid backup/export service and no bulk download of payloads. Offline keys retained for pending records and recovery copies need an approved custody/retirement log. A shared key remains usable for copied ciphertext after a Firestore delete. Physical/offline copies cannot be remotely revoked.

## Proposed staff operations — synthetic demonstrations only for now

1. Verify business need and approved email through an existing trusted process, then create a namespaced invitation and manually send instructions. Do not email passwords or submit SINs on somebody's behalf.
2. Assign portal roles by verified Auth UID through an owner-controlled trusted process. Do not let portal clients self-assign roles; do not promote all existing users or managers to custodians.
3. For synthetic custody demonstrations, use an approved managed workstation, exact record assignment, recent auth and separately controlled offline utility. Never treat a handling claim as proof of one-time decryption or MFA.
4. Follow a reviewed record-specific transfer/handoff procedure; currently unresolved, so real handling remains disabled. No CSV, general download/print workflow or SIN sent through email/phone/tickets.
5. Officer attests transfer and deletes active payload atomically with status/tombstone/event; monitor overdue data manually and document exceptions. Do not mark an expired record as transferred.
6. Lost/failed key or corrupt ciphertext: use record reference only in support, revoke affected invitation/assignment and arrange a new contractor submission if justified. Do not reset a consumed submission slot or put raw numbers in recovery notes.
7. Suspected exposure: suspend namespaced collection/access through reviewed controls, notify MI's designated incident/privacy owners and follow approved breach procedures. No alterations to unrelated app services or billing. Project IAM compromise needs owner-level incident response because client Rules cannot contain it.

Sources: [OPC SIN guidance](https://www.priv.gc.ca/en/privacy-topics/sins-and-drivers-licences/social-insurance-numbers/02_05_d_21/), [CRA recipient information](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/calculating-deductions/determining-tax-treatment/set-up-and-manage-recipient-information.html), [CRA RC4157](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4157/deducting-income-tax-on-pension-other-income-filing-t4a-slip-summary.html), [Firebase privacy](https://firebase.google.com/support/privacy), [Firestore locations](https://firebase.google.com/docs/firestore/locations), [Firestore pricing/retention features](https://firebase.google.com/docs/firestore/pricing). Reviewed November 5, 2026. No compliance certification is claimed.
