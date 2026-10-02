# Accessibility and security approach

## Accessibility (REQ-13): WCAG 2.2 AA, RGAA 4.1

Two employers have already complained, and the old portal fails basic criteria (placeholder used as label, colour-only errors, PDFs without tags). Accessibility is built in from the first page, not audited at the end.

- **Design system first.** Form field, error summary, date input, table, button and navigation components are built once, accessible, and reused. Pages are composed from them, so a fix in a component fixes every page.
- **Semantics before ARIA.** Native elements (`<button>`, `<label>`, `<fieldset>`/`<legend>`, `<table>` with headers), one `<h1>` per page, landmarks, `lang` on every page and on any passage in the other language.
- **Forms.** Visible labels, `autocomplete` tokens for personal data (WCAG 1.3.5), errors in text next to the field and in a summary at the top that receives focus, values kept after an error, no time limits on the change form.
- **Mobile and zoom.** Works at 320 CSS pixels wide and 400% zoom without horizontal scrolling (1.4.10); targets at least 24 by 24 pixels (2.5.8).
- **Documents.** Statements are tagged PDF/UA with a title, language, reading order and real text; an HTML version of the same content is offered.
- **Checks in the pipeline.** axe-core on every page template in a real browser, plus a keyboard-only journey test for J2 (see samples 21 and 30). Automated checks find about a third of issues, so:
- **Manual checks each release.** Keyboard and screen reader (NVDA with Firefox, VoiceOver with Safari on iOS) on the four journeys; an external RGAA audit before launch and yearly; an accessibility statement published with the audit result and a contact for members who meet a barrier.
- **Research.** At least two participants using assistive technology in every round of usability testing.

## Security and data protection (REQ-01, REQ-05, REQ-10, REQ-12, REQ-16)

Target: OWASP ASVS level 2 for the portal. The asset that matters most is the bank details change: a successful fraud diverts a member's money.

- **Identity.** OpenID Connect authorization code flow with PKCE against the organisation's identity provider; the portal stores no passwords. State and nonce checked, ID token validated (signature, issuer, audience, expiry). MFA step-up before a bank details change (REQ-01 AC2).
- **Sessions.** Server-side sessions, cookie `HttpOnly; Secure; SameSite=Lax`, rotated at sign-in, 30 minutes idle and 8 hours absolute timeout, CSRF token on every form.
- **Authorisation.** Three roles from the identity provider's claims: member (own data only), employer administrator (own employer's members, enforced by row-level security in Postgres as well as in the app), staff. Deny by default; every route declares its role.
- **Fraud controls on bank details.** MFA step-up, four-eyes approval enforced by a database constraint, notification to the member's previous email address, a 48-hour delay before the change is applied, and a call-back for changes flagged by rules (new IBAN country, recent address change).
- **Audit.** Every change to member data is written with its actor, request and before/after values in the same transaction (REQ-12), kept apart from application logs, readable by staff, not editable.
- **Data protection.** Collect only what statements and payments need; retention per data category, erasure job with a log (REQ-16); personal data out of logs, analytics events and emails; encryption in transit (TLS 1.2+) and at rest; backups encrypted and restore-tested quarterly.
- **Supply chain and code.** Dependency audit and secret scanning in the pipeline; dependencies updated monthly; the change request and upload endpoints are covered by abuse tests (oversized files, CSV injection in exported files, rate limits).
- **Threat model.** A STRIDE session per new capability, starting with the bank details change and the employer upload, recorded next to the ADRs.
