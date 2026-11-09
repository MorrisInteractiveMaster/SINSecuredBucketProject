# Phase 3 validation and review instructions

Review-only synthetic implementation, 5 November 2026. No Firebase deployment or shared project configuration changes. Test identities use reserved example domains and local emulator data; no real contractor list was imported.

## Automated validation

The release command is `npm run test:all` under Node 22 with Java 21 for the Firebase emulators. It includes routing (3), release/security gates (14), the existing Rules model (6), actual deny-all Rules checks (2), local OAuth/allowlist/concurrency plus new administrator operations (23), cloud runtime/Rules with independent administrator bindings (6), and UI interactions/accessibility (15): **69 passed, zero skipped** in the completed Node 22 suite. No test uses live provider credentials.

The new tests cover backend metadata permissions, forbidden fields/unknown IDs, exact export/copy scopes, formula-safe real XLSX parsing, actor-bound one-use output acknowledgments, role revocation, atomic/bounded bulk actions, permanent-slot/payload preservation and blocked retrieval/transfer/Burn. Existing acceptance coverage for unauthorized and unverified identities, provider switching, signed identity checks, expired/replayed email proofs and concurrent submissions is retained.

UI tests cover search/reset/selection, clipboard success and failure, unavailable permissions, server-first export, CSV preview before import, revoke confirmation and failure, drawer focus restoration/Escape, touch/keyboard help, synthetic review before submission, no success before server acknowledgment, failed submission recovery, welcome/provider choice and Microsoft-only staff entry. Axe checks welcome, dashboard and contractor semantics. Automated contrast checking is disabled in jsdom because it has no rendered layout; these are not full WCAG conformance claims.

Local and synthetic-cloud production builds, isolated Node 22 deploy-package discovery, original 14-state structural checks and release-target gates are required. Cloud builds use deliberately fake **public** configuration for build verification, never real secrets. Artifact scans confirm that the emulator-only sign-in controls, unsigned fixture assertion and responsive QA harness are absent from `dist-cloud-test`.

## Dependencies and bundle size

`exceljs-community` 5.2.1 is pinned and used only by the backend. Its MIT license and upstream-change record are in the installed package. A scoped override pins `readdir-glob`’s `minimatch` to 11.0.1, eliminating the three additional moderate findings introduced by the workbook dependency. Root and standalone cloud package lockfiles include the override. The existing findings remain: root **9 moderate**, standalone cloud **6 moderate**, no high/critical at this scan. The older Google client/functions-framework dependency chains remain documented in [the earlier review](cloud-test-review.md). Neither downgrading the spreadsheet implementation nor suppressing audits is used as a fix.

The first JavaScript entry is approximately **238.6 kB (75.1 kB gzip)**, compared with the previous approximately 799 kB (245 kB gzip) single entry. Authentication/Firebase and role-specific workspaces are lazy-loaded; the largest remaining separate SDK chunk is approximately 396 kB. This improves the initial load, not the total bytes eventually used by an authenticated session. CSS is approximately 42 kB (10.2 kB gzip). No animation library, third-party analytics or session recording was added.

## Browser and responsive checks

Actual local browser testing exercised the seeded Auth/Firestore backend, rather than a mock dashboard: authenticated administrator overview, search, selected metadata copy (clipboard content verified), generated Excel download, record details and an audited **blocked** Burn request. The local contractor journey exercised supplementary email proof, fixture selection, review, explicit confirmation and a backend-acknowledged submission. The completion screen contains no submitted digits.

A local-only `qa/responsive.html` iframe harness gives the actual app a 390- or 768-pixel viewport. It is not a production build entry/public asset and does not weaken the cloud `frame-ancestors 'none'` policy. Narrow welcome/contractor heading overflow and a hidden header action were corrected during inspection. Help popovers are positioned within the viewport and remain dismissible; an essential instruction never depends on hovering. Keyboard focus and mobile sign-out remain available. The table deliberately scrolls within its own labeled region for the many requested metadata columns.

Browser layout checks at 390 and 768 pixels show no horizontal document overflow in the reviewed welcome and contractor states. These are browser viewport tests, **not physical-device or screen-reader certification**. Real Microsoft/Google credentials, live App Check, cloud IAM and existing-app regressions were not tested. Touch is represented by disclosure-button interaction, not a physical touch-device test. A keyboard/screen-reader and real-device review is still required before production approval.

Static contrast spot checks for the main palette: primary text `#F4F3F1` on `#181818`, muted text `#B5B4B0` on `#262626`, white on Murrey `#931B50`, teal heading `#69B8B4` on `#181818`, and focus ring `#6EC6DD` against dark controls: respectively **16.01:1, 7.29:1, 8.36:1, 7.71:1 and 7.77:1**. Disabled controls are explicitly identified and explanatory help remains focusable. These spot checks do not replace testing all component states.

## Screenshots

All displayed people and records are synthetic local fixtures. The baseline is the original application screen, not a claim that the deployed site was changed.

| View | Evidence |
| --- | --- |
| Original baseline | [Phase 2 screen](screenshots/phase-2-before.jpg) |
| Redesigned administrator overview | [Phase 3 dashboard](screenshots/phase-3-dashboard.jpg) |
| Restricted Burn review | [Burn remains blocked](screenshots/phase-3-burn.jpg) |
| Mobile welcome | [390-pixel welcome](screenshots/phase-3-mobile-welcome.jpg) |
| Mobile contractor completion | [Acknowledged completion without digits](screenshots/phase-3-mobile-complete.jpg) |

## Reproduce locally without cloud writes

1. Use Node 22.23 or a supported later Node 22 release, Java 21 and `npm ci --ignore-scripts`.
2. Run `npm run test:all`, then `npm run build`.
3. For normal local development, run `npm run dev:emulators` in one terminal, wait for “Synthetic MVP ready,” and run `npm run dev` in another. Open the Vite URL. Only the local development build exposes the expandable “Local synthetic review” fixture buttons.
4. Where the browser can reach only the Vite port, run the Auth/Firestore emulators and Vite in the same network environment with `VITE_LOCAL_PROXY=1`. The development-only Vite proxy forwards exact demo Auth and portal Function paths to loopback. It is not part of the static Hosting build or a deployed proxy. The application still uses actual emulator credentials/role checks; there is no UI-only authorization shortcut.
5. Use the seeded synthetic administrator/contractor entry controls to test the interface; the approved private contractor CSV is not needed. The synthetic mailbox is emulator-only. For 390/768-pixel inspection, open `/qa/responsive.html` on the local Vite server.
6. Cloud testing is a separate owner-approved action. Follow [Phase 3 migration/permissions](phase-3-review.md) and [scoped launch/rollback](cloud-test-launch.md). Nothing in these local instructions enables collection or deploys resources.

## Review still required

Production remains blocked for the cryptographic design/key custody, verified fresh MFA and retrieval authorization, one-time reveal/recovery semantics, official transfer, disposal/backup limitations, retention/legal purpose/privacy contact and independent security/privacy review. The four real administrator UID/tenant/object bindings have not been provisioned. The real contractor list remains outside source control and cloud testing. See [the working/gated feature matrix](phase-3-review.md).
