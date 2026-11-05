# Existing Blaze project — usage costs and CAD $0 target

November 5, 2026. Project owner confirms Blaze is active for `gen-lang-client-0948635471`. **No plan or billing change. No new subscription, purchased domain or fixed-cost infrastructure is proposed.** The target is CAD $0 additional actual spending, not a Spark-only constraint.

## Financial finding

A dedicated named database does not receive a second free allowance. Google's current Standard pricing page explicitly says named (non-default) databases are billed on usage; creation/deletion itself has no separate fee. Assume **all portal operations/storage are billable**. Tiny usage may produce tiny charges, but billing rounding/credits do not constitute a guaranteed-zero design. **An active named-database collector cannot realistically be guaranteed CAD $0.** Keep cloud collection and resource creation disabled until Finance reviews the actual account/rates/usage and approves the exposure. If literally zero incremental spend is non-negotiable, remain local-emulator-only.

Live billing/usage/free-quota inventory could not be read: the authorized read-only database inventory failed authentication. No existing invoice, rate contract, credit, currency, service usage or free-tier eligibility was inspected. Owner confirmation of Blaze is not proof of free remaining capacity.

## Charge model for Standard/Native

| Item | What may be billed | Control / unknown |
| --- | --- | --- |
| Document reads | SDK gets, metadata dashboard queries/listeners, transaction retries and rule-dependent document reads, even some denied requests | Bounded pagination, no continuous whole-collection listeners; count auth/role/rules lookups and minimum query charges |
| Writes | Every invitation/status/slot/payload/event create/update; retries that actually commit | Bounded batches, one deterministic submission, no unconditional loops |
| Deletes | Manual disposal, TTL if enabled and operator cleanup | No free TTL assumed; keep permanent anti-replay slot separate from payload |
| Index reads | Queries can bill index-entry reads depending on shape | Measure actual query patterns; no paid Query Explain run now |
| Storage | Data plus document metadata and indexes over time | Small ciphertext; short approved retention; disabled ciphertext indexing; growth includes audit/tombstones |
| Network | Response sizes, destination and region; cross-region/backend and browser egress can differ | Inbound/same-region rules differ from internet egress; do not allocate a new per-DB free transfer allowance without account/SKU evidence |
| TTL/PITR/backups/restores/clones | Extra billable features | None enabled/provisioned by this revision; no automatic provider-erasure claim |
| Hosting | Site storage/releases and transfer share project included allowance; Blaze excess is billed | Separate site adds no separate free capacity; existing usage unknown |
| Auth | Existing chosen providers/quotas, possible advanced features; SMS explicitly excluded | Email/password baseline; project settings/MFA/free capacity unverified; no new provider activation |
| Optional Functions | Invocation/compute/network plus build/artifact/log/trigger/scheduling dependencies | Separate comparison below; not selected/deployed |

## Illustrative workload and transparent estimate

Planning example, not measured usage: 100 invitations/month; 10,000 billed reads (including dashboard/rule overhead), 2,000 writes, 200 deletes, 0.01 GiB average stored including indexes/metadata, 0.01 GiB response egress. Actual counters may be higher under errors, retries, malicious traffic or unrelated applications.

Monthly formula: `(reads / 100000 × readRate) + (writes / 100000 × writeRate) + (deletes / 100000 × deleteRate) + (averageGiB × monthlyStorageRate) + (billableEgressGiB × destinationRate) + optional services`. Apply **no document/storage free quota subtraction** for the named DB. Use the actual Canadian-region and CAD account SKU rates before approval.

The retrieved public pricing table was set to **Iowa**, not Montréal/Toronto. Its reference rates were USD $0.03/100k reads, $0.09/100k writes, $0.01/100k deletes and $0.000205479/GiB-hour (approximately $0.15/GiB-month at 730 hours). They are **not a verified Canadian quote**. With those reference assumptions and a hypothetical billable $0.12/GiB egress rate, the example is about **USD $0.00752/month** before optional services, tax, currency, rounding, differing SKU rates and shared-account effects. This demonstrates small-but-nonzero exposure, not a promised invoice or an approved CAD budget. Exact Canadian prices remain unverified rather than guessed.

Do not interpret low average traffic as a cost cap. A single abuse burst, open rule, leaked token or excessive listener can dominate the bill. Review costs by database/service/SKU using an already authorized billing viewer, not a new paid export/report service.

## Optional backend allowances and risks

For **2nd-generation** request-based Functions, use underlying Cloud Run pricing, not the 1st-generation GB/GHz allowance as if it were interchangeable. The current request-based Run page describes a billing-account-aggregated free tier of 2 million requests, 180,000 vCPU-seconds and 360,000 GiB-seconds monthly, applied using Tier 1 pricing. Regional rates and other workloads affect the discount; remaining account capacity is unknown. This does **not** make named Firestore operations free.

Illustration only: 1,000 0.5-second invocations with one vCPU/256 MiB would use roughly 500 vCPU-seconds and 125 GiB-seconds, excluding cold-start/billed timing effects. Compute might fall within unused allowances, but no zero-charge guarantee follows. Cloud Build, Artifact Registry, logging, network, Eventarc/PubSub, Secret Manager/KMS and scheduled jobs can add costs. Firebase documentation notes a 500 MB Artifact Registry allowance; check remaining account/service allowance and actual region before any backend selection. No new KMS/secret service or scheduler is automatically approved.

Proposed safeguards if later approved: minInstances=0, maxInstances=1, bounded concurrency=1, memory=256 MiB, timeout=15 seconds, short bounded bodies, no warm instances, exact named-DB initialization, per-user/invitation quotas, verified Auth/App Check, bounded queries, safe errors and artifact retention scoped to the new codebase only. These reduce exposure; none is a hard monthly spending cap. Some controls add billed DB operations; auth rejection itself may consume backend resources. Do not alter existing artifact retention, functions or quotas to make room.

## Financial approval before activation

1. Read actual billing plan/linkage (without changes), last usage/invoices/currency, eligible DB and existing workloads' quota use. Verify actual Canadian-region SKU rates and feature availability.
2. Finance must explicitly accept possible nonzero usage charges or require continued emulator-only operation. “Blaze already active” is not authorization for new spend.
3. Recommend project/service/database-aware budgets/alerts and named monitoring ownership, but do not configure them now or describe them as hard caps. Existing application billing must never be disabled as portal containment.
4. Approve DB/site/app configuration and any optional backend/TTL/cleanup separately. Keep collection disabled until security/privacy and financial gates pass.

Sources reviewed: [Standard Firestore pricing](https://cloud.google.com/firestore/pricing), [Firestore free quota/features](https://firebase.google.com/docs/firestore/pricing), [Hosting quotas](https://firebase.google.com/docs/hosting/usage-quotas-pricing), [request-based Run pricing](https://cloud.google.com/run/pricing), [Functions billing dependencies](https://firebase.google.com/docs/functions/faq-and-troubleshooting), [Functions resource options](https://firebase.google.com/docs/reference/functions/2nd-gen/node/firebase-functions.globaloptions). No cloud data was read to derive the planning example.
