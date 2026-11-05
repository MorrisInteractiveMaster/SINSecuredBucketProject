# Phase 2.5 validation — November 5, 2026

Prepared on the existing draft PR branch. No cloud deploy, IAM/billing/provider change or merge was executed.

| Check | Result | Limits |
| --- | --- | --- |
| Existing routing tests | 3 passed | Local named-target/config proof |
| New cloud release/scope/staging tests | 11 passed | Envelope/log redaction and Firebase client protocol interop with mocked attestation, missing/wrong config, real-data flags, arbitrary ciphertext/input, wrong DB/site, missing approval/expiry, test identity and Node 22 package selection fail closed |
| Existing Phase 1 functional Rules model | 6 passed | Local model, never deployed |
| Existing actual deny-all Rules candidate | 2 passed | Client closure, no privileged cloud IAM claim |
| Existing OAuth/allowlist/HTTP MVP suite | 14 passed | Auth/Firestore emulators plus same local callable HTTP handlers; not live Microsoft/Google credentials |
| New cloud runtime/Rules suite | 5 passed | Signed Auth-emulator identities, operator-attested bindings, injected Microsoft verifier, concurrent trusted fixture-only writes, unauthorized/disabled access, quotas, direct read/query/write/ownership/schema/delete/subcollection denial |
| Total | **41 passed, zero skipped** | Suites run under Node 22.23.4; managed cloud invocation and real provider/App Check are still owner smoke tests |
| TypeScript/Vite local and cloud-test builds | Passed | Cloud build checked with deliberately fake public test configuration, never deployed; owner must build with actual public configuration |
| Standalone cloud package | Locked npm install and Node 22 module load passed | Exactly one Gen 2 export, dedicated SA, 256 MiB, max 1, concurrency 1; no deployment or actual runtime IAM exercise |
| Structural/design check | Passed | Original 14 screen concepts preserved; not mobile/assistive-technology certification |
| Dependency audits | Root 9 moderate; cloud package 6 moderate; no high/critical | Remaining chains documented in cloud-test-review.md; not zero vulnerabilities |
| Read-only live database lookup | CLI authentication failed | Owner resource confirmation accepted; actual region, IAM/billing and existing app regression still require checks |

`npm run test:all` runs all six suites; development Functions workers still use the supported local HTTP harness where this sandbox disallows emulator worker sockets. New cloud dispatch integration exercises actual Firebase Admin Auth token verification/Firestore transactions on loopback and the deployed deny-all Rules file, while Microsoft verification is deliberately injected for fixtures. No test falsely asserts real tenant membership, MFA, live App Check or existing-app cloud isolation.

Cloud synthetic mode does not accept browser ciphertext. It accepts only two fixture IDs and encrypts the corresponding hardcoded unissued value server-side; tests reject arbitrary ciphertext or extra SIN fields even beside a valid fixture. This closes the prior hidden-content acceptance gap for synthetic cloud storage, **not** the cryptographic design of a future real-data collector.

All release artifacts, public local environment inputs and staging/node_modules stay untracked. No contractor list, real SINs, OAuth secrets, private keys or production credentials were used. Review [launch/rollback commands](cloud-test-launch.md) and [cost/security findings](cloud-test-review.md) before any owner-run deployment.
