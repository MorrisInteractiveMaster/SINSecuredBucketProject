# Privacy, custody, retention and approval register — named Blaze database

November 5, 2026. Proposal for `gen-lang-client-0948635471` / new `mi-sin-portal`. No real collection, cloud activation or claim of legal compliance. Existing Blaze is owner-confirmed; no plan/billing changes. The CAD $0 additional-spend target is not a guarantee for billable named-DB usage.

## Decisions requiring MI evidence

| Decision | Proposed position | Evidence / owner |
| --- | --- | --- |
| Collection need | Finance determines actual tax/reporting need and SIN-versus-BN eligibility before invitation | Finance/legal: recipient/slip decision tree and nonresident cases |
| Authority/purpose | Specific lawful reporting purpose, not general identity verification | Privacy/legal: necessity, consent/notice and approved copy |
| Jurisdictions | Review PIPEDA applicability, Saskatchewan circumstances and applicable provincial/sectoral/interprovincial duties | Legal: actual business relationships; no blanket compliance conclusion |
| Existing app protection | Dedicated DB/rules/indexes/site/app; shared Auth and IAM remain | IT + existing app owner: read-only live inventory/rules/config/IAM and regression baseline |
| Location | Montréal proposed; Toronto alternative; Standard/Native | Privacy + IT: Canadian availability/residency requirements and immutable-location approval before creation |
| External processing | Firestore region is only one part of processing | Privacy/procurement: US Firebase Auth, global Hosting, Google subprocessors/support terms and accepted cross-border handling |
| Roles | Portal-specific UID roles, separate invitation/ciphertext/disposal duties | Sponsor/security: names, independent assignment/bootstrap and access review; no elevation of existing users |
| MFA | Verified signed recent second-factor evidence for retrieval | Security: actual provider/Identity Platform/TOTP config; password reauth/token iat alone insufficient |
| Encryption | Browser RSA-OAEP/SHA-256 with offline private keys | Independent reviewer: parameters, public-key authenticity, content assurance, trusted local tool/handoff/custody |
| Official destination | Approved payroll/accounting/tax record | Finance/security: actual system controls and transfer procedure; no ordinary mail/phone transfer |
| Retention | Immediate active deletion after transfer; proposed maximum seven days | Privacy/finance/security: manual purge not guaranteed; billed TTL/backend option needs review; no exact-time erasure promise |
| Copies/key retirement | Active deletion is not global destruction | IT/privacy: provider residual-copy terms, offline recovery copies, scoped key-retirement limitations and consumption tombstones |
| Audit | Proposed 365-day minimal metadata retention | Privacy/security: justified duration, access, read/offline-decryption blind spots and optional broker evidence |
| Cost | No new fixed subscription; named DB can produce usage charges | Finance: real account rates/usage and explicit nonzero-exposure decision before activation |
| Optional Functions | Evaluate benefits, no activation now | Sponsor/security/finance: exact limits, IAM scope, charge exposure and validation/retrieval guarantees |
| Brand | Genuine logo/Visby only with approved assets/license | Design: originals and rights; current prototype uses labelled text/system-font fallback |
| Launch | Original security properties demonstrated plus independent review | Sponsor/privacy/independent assessor: current gaps mean no production collection |

## Preserved legal-purpose analysis

CRA recipient guidance permits a business number in certain recipient/slip cases, including eligible individuals with a BN for T4A box 048. Finance must decide before requesting a SIN; do not funnel every contractor into SIN collection. CRA RC4157 generally describes at least six years for relevant tax records, distinct from temporary collection duplicates. Official records can have additional retention/holds requiring advice.

The OPC recommends limiting SIN collection to legislated purposes and identifies SIN as personal information subject to relevant PIPEDA obligations. Confirm purpose, necessity, notices/consent, safeguards, access/correction, accountability and breach response. A checkbox, encryption or a vendor certification does not independently establish MI compliance or cure missing safeguards.

## Processing inventory

| Party/resource | Potential data | Review required |
| --- | --- | --- |
| Portal Hosting | Public assets/public key; request/network information | Dedicated site, global delivery; no record data in HTML/artifacts, analytics or session recording |
| Shared Firebase Auth | Email/identity/credential and verification activity | US processing; new portal users can affect existing app access if its Rules are broad; no provider/user/template change now |
| New `mi-sin-portal` | Approved emails, UID roles, encrypted records, status/audit metadata | Canadian location to approve; separate DB Rules/indexes, shared IAM/operator privileges remain |
| Existing DB(s) | Existing application's records | IDs/Rules unknown; no portal operations/configuration target them; inspect authorization before new Auth users |
| Corporate/recipient mail | Manual invitation instructions and Firebase action mail | Existing services only, never passwords/SIN/private keys; mailbox retention separate |
| Optional Functions/dependencies | Tokens/metadata/ciphertext; plaintext only under separately reviewed alternative | Region, logging, IAM, compute/build/artifact/trigger costs and data handling; none activated |
| Local key custodian | Private-key import and transient SIN in offline utility | Managed trusted endpoint, approved encrypted offline storage/recovery copies, no cloud sync/dumps/extensions |
| GitHub/CI | Public code/design, synthetic fixtures | No real contractor records, credentials, private keys, private IAM/config/rules evidence or sensitive findings |
| Official secure business record | Transferred SIN and legally required records | Separate system purpose, controls/retention; portal disposal never deletes official records |

Firebase states Authentication operates in US data centers; Hosting uses global infrastructure. Canadian Firestore location does not imply Canadian-only identity/processing. Verify actual terms, support/subprocessors and MI's requirements; if all processing must remain in Canada, this shared Auth architecture is incompatible. Location cannot be changed in place; no moving/destroying the existing database to satisfy portal needs.

## Offline key custody and handling — proposed, not implemented

Use reviewed standard Web Crypto/OS cryptography to generate key material on an approved offline workstation. Only public JWK/SPKI + independent verified fingerprint is distributed to the app. Private key stored offline with established organizational encryption/passphrase policy and an encrypted recovery copy under a separate named custodian. Use existing approved resources; no new paid key subscription is assumed. Never derive key/passphrase from SIN/email/username or store private material in Firebase/GitHub/VITE variables.

If using encrypted PKCS#8, specify a vetted tool/format to unlock it; Web Crypto importKey does not unlock encrypted PKCS#8 directly. Avoid unencrypted temporary files and browser persistent key storage. A separate verified local artifact runs without Firebase SDK/network while keys are imported; hosted portal never imports them. Non-extractable CryptoKey use does not protect original import bytes/process memory or guarantee zeroization. Source artifact provenance, device/extensions and safe single-record ciphertext handoff still need independent review; no new CSV/download/clipboard export feature is silently introduced.

Track key IDs/fingerprints/custodians/rotation and affected references without SINs. New invitations bind active key version; do not relabel old ciphertext. Lost key means data is unrecoverable and may require a fresh approved contractor submission. Stolen key plus retained ciphertext remains decryptable after server revocation/deletion. Shared/epoch keys cannot cryptographically erase a single record; per-record keys add custody complexity and cannot revoke already copied keys.

## Retention and disposal

Propose immediate active encrypted-record deletion after an authorized attestation of transfer, plus permanent slot/status/audit to prevent submission/retrieval replay. Seven days untransferred maximum remains a proposed requirement, not an implemented guarantee. Manual staff checks do not guarantee deletion during absence/outage. Optional TTL is now technically eligible under Blaze but billed/asynchronous (often within about 24 hours after expiry); no policy is enabled and it cannot promise exact-time deletion or atomic status reconciliation. Optional broker/sweepers add costs/failure modes. Access denial at expiry is distinct from deletion.

Do not enable PITR/backups/export/scheduler to “solve” retention without review. Provider residual-copy terms, browser/operator copies and offline key backups must be acknowledged. Active DB deletion never implies immediate backup destruction or deletion of the official accounting record. Consumption/disposal tombstones must outlast any approved recovery window; any restore must be quarantined and reconcile them before access, otherwise previous one-use operations could reopen. No existing app backup/retention policy is changed.

## Notice and operations

Approved notice must state specific lawful purpose; whether SIN or BN is needed; who can access ciphertext/decrypt; browser encryption and endpoint risks; actual Canadian DB/US Auth/global processing; achievable active-retention/removal and residual-copy limits; official record destination; verified privacy contact; and how to ask about applicability/corrections without emailing a SIN. No placeholder purpose/contact, guaranteed one-time viewing or automatic purge promises. Record approved purpose/notice version without copying the SIN into consent evidence.

Staff verify business eligibility/email, manage portal-specific roles, send instructions manually and track status. Sensitive handling requires separate record assignment, real fresh MFA evidence, reviewed offline procedure and prepared official destination. If failure occurs after a broker claim (if later approved), do not reset/replay it silently; use approved recovery/fresh collection. Officer attests transfer, removes active copy and monitors cleanup exceptions without sensitive notes. Suspected exposure suspends only portal controls through reviewed procedures and invokes MI incident/privacy owners; never paste SIN/key material into tickets or disable shared project billing.

Sources reviewed: [OPC SIN guidance](https://www.priv.gc.ca/en/privacy-topics/sins-and-drivers-licences/social-insurance-numbers/02_05_d_21/), [CRA recipient information](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/calculating-deductions/determining-tax-treatment/set-up-and-manage-recipient-information.html), [CRA RC4157](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4157/deducting-income-tax-on-pension-other-income-filing-t4a-slip-summary.html), [Firebase privacy](https://firebase.google.com/support/privacy), [TTL](https://firebase.google.com/docs/firestore/ttl), [locations](https://docs.cloud.google.com/firestore/native/docs/locations). Actual project settings remain unread.
