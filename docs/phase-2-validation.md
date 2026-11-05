# Phase 2 validation record — November 5, 2026

Local build and tests only; no cloud deploy/merge/provider change. Test addresses use reserved example domains. SIN fixtures are deliberately unissued synthetic values beginning with zero.

| Check | Result | Practical limit |
| --- | --- | --- |
| TypeScript and Vite production build | Passed | Builds a cloud-disabled MVP; not production approval |
| Named database/configuration unit checks | 3 passed | Existing live app databases were not inspected |
| Phase 1 structural/design gate | Passed | All 14 original screen concepts remain; not full accessibility certification |
| MVP Auth/Firestore/official callable HTTP tests | 14 passed, zero skipped | Local emulators + Functions Framework; real identity providers and deployed runtime not tested |
| Concurrent writes | Exactly one of 20 succeeded | Actual local Firestore transaction logic, not a live deployment load test |
| Encryption | Randomized RSA-4096 OAEP/SHA-256 round trip, context and wrong-label checks passed | Ephemeral test keys only; cannot validate arbitrary ciphertext contents server-side |
| Browser smoke check | Contractor and staff sign-in screens rendered with MI colours | Live OAuth, end-to-end browser sign-in, mobile and assistive-technology review still pending |
| Dependency audit | Nine moderate findings; zero high/critical | Findings remain in transitive Functions Framework/Google Cloud dependencies; audit fix did not resolve them safely. No forced breaking downgrade/override was applied |
| Firebase read-only inventory | Blocked by CLI authentication | No provider, IAM, database, location or billing assumptions were converted into changes |

Negative cases cover anonymous/unapproved accounts, unsupported providers, stale authentication, wrong-tenant privilege claims, role separation, expired invites, missing/wrong/expired/replayed/exhausted ownership codes, code resend limits, different-provider proof, revocation, forbidden direct writes/ciphertext reads, wrong-database writes, removal/reimport, and disabled sensitive reveal. HTTP tests use signed Auth-emulator sessions through the real callable middleware. Service transaction tests inject trusted identity fixtures separately; they are not proof of real Microsoft signatures/MFA.

Run instructions and limitations: [Phase 2 MVP](phase-2-mvp.md). The full Firebase Functions emulator could not start workers in this sandbox because its Unix socket creation was denied. The supported local HTTP framework serves the same exported callable handlers; the restriction was not bypassed or represented as a managed Functions emulator pass.

The production deny-all Rules candidate is unchanged. Hosted private-key import/reveal/disposal, verified step-up, production SMTP secret bindings, abuse/load limits, complete safe logging/monitoring, existing-app regression and independent security/privacy review remain release blockers. No security certification or guaranteed one-time offline decryption is claimed.
