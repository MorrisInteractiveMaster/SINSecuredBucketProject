# Original guarantees — achieved model properties and unresolved gaps

Existing Blaze and a separate DB improve deployment/data scoping; they do not by themselves satisfy all original requirements. **Real SIN collection remains disabled.** No requirement is silently waived and no nonzero spend is approved.

| Original property | Current static/emulator evidence | Optional backend / remaining gap |
| --- | --- | --- |
| Dedicated database/rules/indexes | Proposed named DB, explicit SDK/config target unit tests | No DB created; actual independent cloud releases/indexes/location unverified |
| Existing app untouched | No cloud change; synthetic sentinel unchanged; SDK wrong/default IDs rejected | Actual DB Rules/Auth dependencies unread; new shared Auth users may access broad existing Rules |
| Approved verified contractor only | Limited emulator matching verified invite tests; unknown/unverified denied | Real Auth/provider refresh/deliverability/MFA configuration unverified |
| One submission/invitation including races | Model deterministic slot/paired batch; 20 attempts yield one successful submission | Full status/event/revoke/reissue lifecycle + live transaction limits need proof |
| No contractor retrieval/modification | Actual closed gate + model deny payload reads/updates and slot deletion | Future functional deployment needs entire permission matrix; project IAM bypass remains |
| Valid SIN/encryption enforced for every write | Normal-form design validates client-side; model type/size/schema restrictions | Rules/public-key-only backend cannot validate hidden SIN/encryption. Trusted validator needs a separately reviewed trust-boundary change |
| No plaintext at rest/logs | No real data accepted; design calls for browser encryption/memory only | Crypto/content handling/telemetry not implemented; malicious direct bytes cannot be certified ciphertext |
| Explicit permission and fresh MFA for retrieval | Current gate denies all; no production access | Actual signed second-factor/freshness evidence + assignments unresolved; password reauth is not MFA |
| Server-enforced one-time retrieval operation | Direct Rules get cannot consume a read | Optional broker can atomically consume one ciphertext-delivery attempt before response, with fail-closed recovery; not implemented |
| Single offline decryption/view | Not technically enforceable after ciphertext and key retained | Broker cannot revoke copies; no claim of screenshots/extensions/photograph prevention |
| Complete reveal/read audit | Rules can validate paired state-change events in future model | Backend can log claim/delivery attempt but cannot prove human observation, offline decrypt or external transfer |
| Automatic retention disposal | Future read expiry possible, no scheduled purge active | Blaze permits billed TTL/backend cleanup after approval; asynchronous/outage behavior precludes exact-time erasure |
| Per-record key retirement/total disposal | Offline custody/rotation proposed; active delete leaves permanent slot | Shared offline keys/copied payload/key remain; no immediate backup/provider-copy erasure |
| Server HttpOnly sessions/central idle expiry | Firebase SDK memory bearer tokens; auth_time checks proposed | Not equivalent to server cookie isolation; Function endpoints still need secure token checks |
| Strong abuse/cost controls | Gate closed; bounded model operations | Named DB is billable, alerts not caps; maxInstances/rate checks cannot guarantee CAD $0 |
| Production secure defaults | Emulator helper refuses live project, actual Rules deny all, no deploy workflow | Cloud creation/config/financial/privacy/security approvals and full tests still required |

Original 15 acceptance criteria remain mapped in implementation-plan.md. The deny-all candidate passes closure tests by blocking everyone; this is intentional and not a functioning production collector. The positive emulator model proves a subset and is never referenced by the proposed cloud deploy config.

If strict CAD $0 or mandatory privacy/retrieval/validation/disposal guarantees cannot be demonstrated/approved, keep the work local/synthetic. Do not downgrade the existing Blaze project, move the existing DB, change shared Auth/IAM or use paid infrastructure silently to close the gaps.
