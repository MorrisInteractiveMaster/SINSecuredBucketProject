# Initial screen layouts

Open `design/index.html` locally. This is a non-collecting, responsive design review, with a screen selector to inspect each state. All email addresses use reserved example domains, SIN entry is disabled, and reveal contains a text placeholder only. No mail, storage, API, analytics or external asset calls. It is not an operational portal.

## Visual system

Charcoal outer shell; white main cards; thin neutral borders; 20px cards and 8px controls; Murrey primary actions; dark teal helper text on light teal; no decorative imagery or animation. Plain text organization identification is explicitly not a substitute logo. Replace its slot with the approved original asset, preserve proportions/clear space, and load Visby CF only with valid web license. Use system-ui fallback now. Body text 16px, headings 1.2 line height, sentence case, visible blue focus outline, 44px minimum controls. Do not use Robin Egg Blue as small white-button text without contrast verification.

Contractor screens use one 560px main card, responsive padding and a three-step text indicator. Administrator views use a wider desktop content area; on mobile status metrics stack and the invitation table scrolls inside its own labelled region. Prototype navigation is review-only and must never be present in the actual contractor flow.

| View | Layout and intended production action |
| --- | --- |
| Secure invitation | Welcome, explanation, approved-email label, send-code action; link possession alone grants no form access |
| Email verification | Single labelled OTP field (paste supported), expiry/cooldown hints, verify/resend; server errors announced without leaking other recipients |
| SIN submission | Read-only verified email, password-style numeric input, accessible show/hide button, purpose/retention/contact notice; entry disabled in prototype |
| Review before submission | In-session editable review, explicit final confirmation; actual number never appears in URL or saved page; prototype contains no digits |
| Submission confirmation | Exact “Your information has been submitted securely.” plus no further action message; no number or last four |
| Expired/invalid invitation | Neutral unavailable message, contact MI through approved channel; no email enumeration, no insecure reactivation |
| Already completed | A completed message, no redisplay/change; instructions to contact MI if correction needed |
| Administrator login | Entra sign-in only; no password fields; explains assigned access and additional reveal verification |
| Dashboard | Six metrics, recent metadata statuses and simple navigation; no SIN fragments |
| Invitation management | Bounded email input and explicit send/revoke/reissue in production; table with created/expiry/status; no real sending in design prototype |
| Submission status | Random reference, status, retention deadline and role-dependent actions; no automatic decryption |
| Authorized retrieval | Recent step-up state, record-specific deliberate confirmation, warning about one delivery attempt; placeholder for brief reveal |
| Disposal confirmation | Approved destination and transfer attestation; separate active deletion and key-retirement statuses; no promise of immediate backup erasure |
| Audit activity | Timestamp, actor role/ID, event, random reference and outcome only; no raw request details |

## Interaction and accessibility requirements for Phase 2

Use semantic labels, described-by error hints, focus summary after failed validation, aria-live for send/expiry/success and aria-pressed on visibility control. Do not announce a revealed SIN automatically to the entire screen-reader live region. OTP paste and password-manager interaction require real device tests. Support 200% zoom, keyboard-only navigation, reduced motion and session-expiry messages. Re-auth redirects must not preserve SIN form values. Do not persist drafts, use service workers, prefetch reveal routes, or SSR plaintext.

The current layouts intentionally demonstrate visual arrangement only. They do not simulate successful authentication, an actual reveal, or final deletion.
