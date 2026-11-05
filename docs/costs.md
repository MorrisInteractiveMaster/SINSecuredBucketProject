# Phase 1 — Operating cost envelope

Planning date: November 5, 2026. CAD/month, before tax. These are engineering budget allowances, **not retrieved SKU quotes**. Azure pricing pages require region/currency/offer selection and did not expose a usable Canada Central total in this session. Confirm with the Azure calculator before any purchase or provisioning.

Assumptions: fewer than 200 invitations/month, fewer than 100 active encrypted records, under 5 GB database storage use (billed storage minima may be higher), modest log volume, three isolated apps on a shared supported Linux plan, private network access and managed keys. Public web and workers have independent identities even if compute is shared; separate plans are preferable if the reviewer requires stronger isolation.

| Item | Monthly CAD allowance | Cost driver |
| --- | ---: | --- |
| Linux App Service compute for three apps | $150–$350 | Supported VNet/private access tier, instance size/count; sharing a plan does not eliminate its fixed cost |
| PostgreSQL Flexible Server and storage/backup | $100–$300 | Minimum provisioned storage, compute tier, backup use; HA increases this |
| Key Vault Premium / active per-record HSM keys | $30–$300 | Number of active/recoverable keys, key type and current per-key billing; validate quotas and deletion-window charging |
| Private endpoints, DNS and network traffic | $40–$120 | Endpoint hours, data processing and outbound traffic |
| Regional logs, audit storage and low-volume mail | $10–$50 | Ingestion/retention caps, recipient volume, mail service terms |
| **Base production planning envelope** | **$330–$1,120** | No WAF, HA expansion, separate worker plans or additional license costs |
| Optional regional WAF gateway | $200–$600 additional | Gateway capacity and processed traffic; quote before choosing |
| Isolated synthetic staging | $100–$350 additional | Reduced compute but separate identities/data/keys; never share production secrets |

Budget approximately **$450–$1,500/month for base production plus staging**, then separately quote WAF, high availability, additional isolation, Entra licenses, domain, support and security review. Existing Microsoft 365 licensing must be checked; do not assume it includes the needed Conditional Access/PIM capabilities. Development, independent penetration/privacy reviews and ongoing administration are excluded. At this volume fixed managed infrastructure and HSM-key lifecycle dominate; invitation counts alone cannot predict the bill.

Before approval: export a calculator estimate for Canada Central in CAD, include all private endpoints, exact HSM key count including recoverable keys, database backup/HA configuration, staging hours, service availability and applicable MI discounts. Set budget alerts and log/mail/key quotas. Record selected SKUs and final quote in a private operational record; do not publish tenant/billing details in this public repository.

Official pricing references: [Linux App Service](https://azure.microsoft.com/en-ca/pricing/details/app-service/linux/), [PostgreSQL Flexible Server](https://azure.microsoft.com/en-ca/pricing/details/postgresql/flexible-server/), [Key Vault](https://azure.microsoft.com/en-ca/pricing/details/key-vault/). Prices vary by region, currency and agreement; these links do not substantiate the numerical allowances above.
