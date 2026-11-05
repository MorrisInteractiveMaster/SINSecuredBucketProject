# Minimal backend reassessment — optional, not selected/deployed

Existing Blaze permits evaluation, not automatic activation. CAD $0 additional actual spending remains the target. A backend cannot eliminate named-database usage charges or private-key/offline-copy limitations. See costs.md for allowances, charge formula and risk; no Function, service account, scheduler, IAM grant or backend secret was created.

| Security/control | Static client + Rules | Optional minimal broker backend |
| --- | --- | --- |
| Invitation/role authorization | Signed verified identity and DB-scoped role checks | Verify ID token/revocation, provider, portal role and invitation; no reliance on UI claims |
| Atomic create-once submission | Deterministic slot + getAfter batch, testable | Server transaction avoids trusting client state but still must pin named DB/IAM |
| Hidden SIN format/encryption validation | Cannot inspect encrypted contents | Still cannot decrypt with only public key. True plaintext validation needs a different explicitly reviewed trust boundary |
| Fresh MFA | Actual supported provider/claim/freshness must be proven | Backend can verify signed recent auth_time and actual second-factor claims; cannot manufacture missing MFA |
| One-time delivery operation | Direct permitted get is repeatable | Deny all direct ciphertext reads; broker commits irreversible release claim before returning ciphertext, at most one delivery attempt |
| Repeated offline decryption | Cannot prevent after ciphertext/key retained | Still cannot prevent; no private key on backend under this proposal |
| Audit of reads | Rules cannot write an audit event on get | Broker logs the claim/release attempt atomically before response; no proof of human view/decryption/transfer |
| Expiry/cleanup | Rule denies new reads; manual purge not guaranteed | Backend/TTL can automate eventual cleanup; job outages/TTL delay preclude instantaneous exact-time erasure |
| Cost/exposure | Named DB billed; client abuse exhausts shared quotas/costs | Adds compute/build/artifact/log/trigger/cleanup costs and broader service attack surface/IAM |
| Existing app | No new privileged server principal | Dedicated codebase/principal with database-specific access must be demonstrated; no project Editor grant |

## Narrow broker design to evaluate

A separate codebase would expose small authenticated operations such as createInvitation, acceptEncryptedSubmission, claimCiphertextDelivery and attestTransferAndDelete, with no unrestricted data query/list endpoint. Contractor identity still requires verified matching email/active invitation. A record claim requires assigned portal custodian + recent independently proven MFA + explicit confirmation; ID-token iat alone is insufficient. Enforce App Check where suitable, rate/body limits and all authorization server-side. Admin SDK bypasses Rules, so a testable least-privilege identity, explicit DB ID and ownership checks are mandatory.

For ciphertext delivery, transactionally verify the grant/actor/record/time and unused slot; persist a permanent release claim+audit, then **commit before returning any ciphertext**. Decryption stays in the separate offline local utility. Crash/unknown commit outcome/response loss consumes the attempt; no automatic resume or flag reset. A fresh contractor submission is the safer recovery. This can strengthen the original server-enforced single-use operation, but does not guarantee single decryption, human observation or transfer. A response already copied cannot be revoked.

## Validation/key boundary decision

With the private key strictly offline, neither Firestore Rules nor a broker holding only the public key can validate the SIN inside client ciphertext. A malicious client can submit valid-length arbitrary bytes. A new broker can validate envelope schema/length/allowed key/context declarations, not the hidden content.

Two alternatives require a separate security/privacy decision, neither selected: (a) accept client-content assurance as a documented change to the original requirement (not currently authorized), or (b) send plaintext through TLS to a hardened validator which transiently validates and encrypts with the public key before persistence. The latter exposes SIN to backend/ingress memory and must disable body/error/trace dumps at every hop; it changes the preferred pre-backend encryption guarantee and requires independent cryptographic/data-handling review. It does not authorize placing the offline private key in Firebase. If professionally reviewed server-side AES-GCM/envelope key management is required instead, its custody/key-service/cost design must be separately approved; no homemade cryptography.

## Cleanup and resource controls

A named-DB TTL policy can remove active payloads eventually without a custom scheduler, at billed delete rates; it must not delete permanent slots or audit evidence and generally is not an exact-time deadline. A Function triggered on deletion may reconcile status but adds event/compute costs and retries; design idempotently and do not claim audit atomically preceded a TTL delete. A scheduled sweeper requires separate schedule/compute approval and bounded batch/retry behavior. No new fixed-cost scheduler or existing scheduled task reuse is assumed.

Proposed backend region Montréal if supported, matched to DB; minInstances=0/maxInstances=1/concurrency=1/256 MiB/15 s are starting review values, not a spend cap. Avoid warm instances, broad IAM, unbounded retries and input logs. All secrets/key requirements would be reviewed separately. 2nd-gen Functions use managed Cloud Run infrastructure internally; this is not a proposal to deploy an unrelated standalone Run application.

## Selection recommendation

Keep the review and local synthetic proof static/emulated now. For any real collection, compare the broker's stronger operation-level control/audit against actual costs, fresh MFA proof, existing-app IAM impact and still-unresolved encrypted-content validation, local custody/handoff and disposal. Approve a backend only if its specific benefits justify nonzero billing exposure. If CAD $0 is an absolute guarantee or original security requirements remain unmet, do not activate either live architecture.

Primary sources: [Functions pricing dependencies](https://firebase.google.com/docs/functions/faq-and-troubleshooting), [2nd-gen options](https://firebase.google.com/docs/reference/functions/2nd-gen/node/firebase-functions.globaloptions), [Run request-based billing](https://cloud.google.com/run/pricing), [Firestore TTL behavior](https://firebase.google.com/docs/firestore/ttl), [Rules/server bypass](https://firebase.google.com/docs/firestore/security/rules-conditions). All account-specific estimates/settings remain unverified.
