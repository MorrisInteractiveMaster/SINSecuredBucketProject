# Phase 2 authentication and allowlist MVP

**Historical local MVP record.** Phase 2.5 adds a separate synthetic cloud package without opening the old local runtime: see [cloud launch](cloud-test-launch.md).

Implemented on the existing draft PR branch. This is a **local, synthetic-only functional MVP**, not a production collector. The 14 original concepts and design assets remain in `design/index.html`; the new React interface reuses their Morris Interactive palette, spacing and charcoal shell. No licensed logo or Visby asset was supplied in this checkout; the existing organization label and sans-serif fallback remain rather than an invented logo.

## Run locally

Use Node 22.18+ (tested here with Node 24), Java 21, and locked dependencies:

```sh
npm ci --ignore-scripts
npm run dev:emulators
```

In another terminal run `npm run dev` and open its local URL. Only the demo project `demo-mi-sin-portal` and named database `mi-sin-portal` are used. The Auth emulator offers fake provider accounts; do not enter real Microsoft/Google credentials. Seeded identities are `contractor@example.com` (Microsoft), `google@example.net` (Google), `admin@example.com` (Microsoft MI staff fixture), and `outsider@example.org` (unapproved). Use the local synthetic test mailbox for supplementary email proof. Only the two documented test fixtures shown in the form are accepted; they are not issued SINs. Every seed public key is generated afresh; its private key is discarded. Local stored ciphertext is intentionally unrecoverable after seeding.

The local Auth and Firestore emulators run alongside Google's official Functions Framework, which serves the **same exported callable handlers** on loopback port 5001. This avoids this workspace's Functions emulator Unix-socket restriction without replacing callable authentication or transaction logic. It is a development harness, not a hosting recommendation. `npm run test:mvp:emulators` is also provided for environments able to run the Functions emulator; that managed emulator path was not validated here. Live OAuth popups and real Microsoft claims cannot be validated without the owner's provider setup.

## Implemented behavior

- Two Firebase-supported popup buttons: Microsoft and Google. Staff mode offers Microsoft only. No password registration, automatic account linking or additional Graph mail/calendar permissions. Authentication and Firestore caches remain memory-only.
- Callable middleware verifies signed Firebase identity, revocation/disabled status, provider, current Auth record, matching canonical email and recent authentication. An active exact-email allowlist entry is required on every contractor operation. No domain grants access.
- Conservative ownership policy: signed verified Gmail/Google and Outlook/Hotmail/Microsoft assertions may establish ownership; other accounts require a separate eight-digit portal code to the approved address. This includes organization domains until independently verified. Code digests are HMAC-bound to UID/provider/nonce, expire in ten minutes, allow five attempts, and are consumed atomically. Resends replace the challenge; per-email sends have a 60-second cooldown, three/hour and ten/day limits. Proof expires after fifteen minutes; refresh does not prolong a supplementary proof.
- Admin role requires an approved Firebase UID **and** verified Microsoft tenant/object/member assertion, not company email. Invitation management, status viewing, correction management and sensitive retrieval flags are separate. An emulator fixture stands in for the signed tenant assertion locally; it cannot authorize cloud requests.
- CSV preview/import (`name,email,status`, 100 rows, 64 KiB), add, soft remove and revoke. Parsing repeats in the backend. Reimport retains the same invitation ID and permanent submission slot. Email normalization trims/lowercases only, without collapsing provider aliases.
- Masked synthetic SIN form, numeric keyboard, formatting/checksum validation, review/correction, final confirmation, RSA-OAEP SHA-256 browser encryption, and confirmation without the number. Value clears on tab hiding, sign-out and inactivity. Local-only requests include a synthetic fixture field for server validation; this field is never stored or logged. **Remove and redesign this test-only transport before any production collection.**
- Firestore transactions create permanent slot, encrypted payload, status and enum-only audit event together. Retries/concurrent requests/provider changes do not create another submission. Contractors cannot read ciphertext or modify records. Correction requests revoke access and mark the status for review; they never silently reopen a slot or certify disposal.
- The dashboard shows approved emails and metadata, never numbers or last-four digits. State-change audit events are backend-only. A full audit viewer and completed-transfer/disposal workflow remain pending.

## Rules and cloud safeguards

`firestore.mi-sin-portal.mvp.rules` is **emulator-only**: direct writes, queries and all encrypted-record reads are denied. Only tightly bounded own session/status and own-role observations are allowed; server-owned roles/sessions and active invite revisions control them. Backend transactions use Admin SDK and must independently enforce every check because Admin SDK bypasses Rules. Emulator tests exercise both boundaries.

The cloud candidate `firestore.mi-sin-portal.rules` stays deny-all. No cloud Functions deployment workflow or configuration was added. Client cloud mode throws before SDK initialization; callable code also refuses every non-emulator request. No environment variable can open this release gate. The separate Hosting/database/app remain proposals, not evidence of live provisioning. Shared Auth, IAM, provider changes and existing-app regressions still require read-only inventory and owner approval.

## Validation and limits

See the [validation record](phase-2-validation.md) for exact results and dependency findings.

Run `npm run build`, `npm test`, `python3 scripts/check_phase1.py`, and `npm run test:mvp:local-http` (stop development emulators first). The latter launches real local Auth/Firestore services and official callable HTTP handlers; tests cover unauthorized access, ownership/expiration/replay, roles, revocation, named-DB Rules, concurrent submission, provider switching, removal/reimport and encryption round trips. The earlier Phase 1 model and closed-candidate suites remain available separately. The local HTTP test provides no evidence of Entra tenant configuration, production MFA, actual provider linking behavior, live existing-app isolation or Canadian residency.

Sensitive reveal, local private-key import, decryption, completed-transfer marking and automatic disposal are intentionally disabled. Ciphertext-content validation cannot be inferred from its size: the server cannot prove it encrypts the claimed fixture or invitation without a reviewed trust-boundary change. Browser code or extensions can steal plaintext before encryption. Retained ciphertext plus a stolen offline private key permits repeated decryption. Project IAM administrators can bypass Rules and alter code. A seven-day retention timestamp is only a proposed deadline, not an implemented deletion scheduler. Original one-time retrieval and disposal guarantees remain unresolved; see [requirements gaps](requirements-gap.md).

No real SINs, real contractor list, production credentials, personal test identities or private keys were used. Real collection requires independent security/privacy review, legitimate business-purpose approval, operational retention/recovery procedures, scoped IAM/deployment review, actual billing approval and demonstrated fresh MFA/retrieval controls. Blaze usage is billable; this local work does not establish guaranteed CAD $0 cloud operation.
