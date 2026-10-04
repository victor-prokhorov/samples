# An accessible bilingual member portal

## Problem

Members of Acme, Globex and Initech, their employers' HR staff and the portal team share one portal, in English and French. The first versions in the samples look finished and fail people in ways nobody on the team sees:

- The change-of-address form has placeholders as labels, errors shown only as a red border and a `div` as its button. axe finds 3 rule failures, but not the worst ones: Tab never reaches Save, and Enter in a field sends **0** requests ([21](../../21-accessibility/)).
- The "translated" page shows French members `€4111.06` and `Sat Jan 31 2026`; pseudo-localisation finds **9** hard-coded strings and a French button label of 25 characters in an 18-character box ([25](../../25-bilingual/)).
- On a phone on slow 4G the member page has a Lighthouse LCP of **30.8 s**; across visits the p75 LCP is 12,068 ms and the p75 INP 584 ms ([39](../../39-web-performance/)).
- Muted text that passes on white is 4.45:1 and 4.14:1 on the two other backgrounds it sits on, under WCAG's 4.5:1; the colour change after it slips past Playwright's default screenshot threshold, 0 of 28 failing ([35](../../35-design-tokens/)).
- Permission checks written in each handler answer **7 of 63** cells of the permission matrix wrongly: a member reads other members' contributions, staff approve their own request ([37](../../37-authorization/)).
- With no security headers, a script injected into an employer notice sends members' session cookies away, and a forged form changes a member's bank details to `XX00 ATTACKER 0000 0000`. The header scan scores 0/100 ([42](../../42-security-headers/)).

## Constraints

- WCAG 2.2 AA (RGAA in France) for public and member forms, checked in CI rather than once a year.
- English and French as equals, with gender-free French wording, since the portal does not know members' gender.
- It must work without JavaScript and on slow phones, not only on the team's laptops.
- Sign-in goes through the organisation's identity provider; roles come from its groups.
- Content written by employer admins is untrusted, and one organisation must never see another's data.

## Decisions

| Decision | Trade-off |
| --- | --- |
| **Render on the server, enhance in the browser.** Server components read Postgres; forms are server actions that work as plain POSTs; zod validates on the server; every query is filtered on the session's member ([20](../../20-portal/)). | Action ids change with each build, so a form rendered before a deploy can fail after it. |
| **Accessible markup, checked three ways.** Labels, fieldset and legend, `aria-describedby`, an error summary that takes focus; then axe, a keyboard journey and the accessibility tree ([21](../../21-accessibility/)). | The scripts prove only what they assert; a manual audit and screen reader testing are still needed. |
| **ICU catalogues and `Intl`, checked in CI.** One message per sentence, CLDR plurals, a catalogue check and an `en-XA` pseudo-locale ([25](../../25-bilingual/)). | ICU syntax is strict; translators need tooling that understands it. |
| **Delegate sign-in with OpenID Connect.** Authorization code with PKCE, state and nonce; roles mapped from the `groups` claim ([26](../../26-sso/)). | The portal depends on the identity provider, and a login is several redirects. |
| **One policy, a generated matrix, the same rules in RLS.** `can(user, action, resource)` decides every route; Postgres row-level security applies the rules again ([37](../../37-authorization/)). | Hand-written conditions; deep sharing graphs would need a relationship-based system. |
| **Design tokens with a contrast gate and pixel baselines.** Every declared colour pair checked in both themes; screenshots compared at threshold 0 ([35](../../35-design-tokens/)). | Baselines hold for one browser build and OS, so they run in one container image. |
| **Performance budgets in three scopes.** Bundle size at build, Lighthouse in the lab, p75 Core Web Vitals from real visits, one `budgets.json` ([39](../../39-web-performance/)). | Lab and field disagree on purpose; neither alone is the answer. |
| **A strict CSP, hardened cookies and CSRF tokens.** A nonce per response with `'strict-dynamic'`, `frame-ancestors 'none'`, a `__Host-` cookie, an Origin check and a session-bound token ([42](../../42-security-headers/)). | Headers make an injection inert; they do not remove it. Output must still be escaped. |

[`49-capstone/`](../../49-capstone/) brings these pieces together in one portal.

## What could go wrong, and how it was guarded

| Risk | Guard, as the logs show it |
| --- | --- |
| JavaScript fails to load | A client with no JS signs in, submits the form, gets the server's errors with typed values kept, then a 303 to the new request. |
| A member reads someone else's data | Bob gets 404 on Alice's request; a forged `member_id` is ignored. Policy app: 63 of 63 cells right. RLS refuses a self-approval the buggy loader allowed. |
| An error is invisible to a screen reader | The accessible form's field has the hint and the error as its description and `invalid=true`; focus moves to the error summary. axe: 0 violations in both states. |
| A translation breaks a message | The catalogue check names 7 typical mistakes in a broken French file (a renamed `{nombre}`, a lost `select` case); the real one has 0 problems. |
| A rebrand fails contrast or changes pixels | The gate exits 1 naming the two pairs; the second proposal is caught by 2 screenshots at threshold 0. |
| A token is altered, replayed or meant for another app | Changed groups break the signature; another audience and a token 10 minutes old are rejected; a replayed code gets `invalid_grant`; an open-redirect `returnTo` lands on `/`. |
| Script injection, forged posts, framing | Hardened build: the injected script does not run and is reported, the forged post gets 403, the iframe is blocked. 7 CSP reports; scan 100/100 A+. |
| A heavy dependency slips in | The bundle budget fails at build: 114.4 kB against 30.0 kB. The fast page: LCP 1295 ms in the lab, p75 INP 48 ms. |

## Proof

![Every performance budget, slow page against fast page](../../39-web-performance/screenshots/budgets.png)

![Security header scan: insecure build 0/100, hardened build 100/100](../../42-security-headers/screenshots/header-grades.png)

- [20 server-rendered portal](../../20-portal/), log [`20-portal.log`](../../logs/20-portal.log)
- [21 accessibility](../../21-accessibility/), log [`21-accessibility.log`](../../logs/21-accessibility.log), the form after a failed submit [`good-errors.html`](../../21-accessibility/out/good-errors.html)
- [25 bilingual](../../25-bilingual/), log [`25-bilingual.log`](../../logs/25-bilingual.log)
- [26 single sign-on](../../26-sso/), log [`26-sso.log`](../../logs/26-sso.log)
- [35 design tokens](../../35-design-tokens/), log [`35-design-tokens.log`](../../logs/35-design-tokens.log), screenshots [light](../../35-design-tokens/screenshots/gallery-light.png), [dark](../../35-design-tokens/screenshots/gallery-dark.png), [visual diff](../../35-design-tokens/screenshots/visual-diff.png)
- [39 web performance](../../39-web-performance/), log [`39-web-performance.log`](../../logs/39-web-performance.log), [Lighthouse slow](../../39-web-performance/screenshots/lighthouse-slow.png), [Lighthouse fast](../../39-web-performance/screenshots/lighthouse-fast.png)
- [42 security headers](../../42-security-headers/), log [`42-security-headers.log`](../../logs/42-security-headers.log), [CSP reports](../../42-security-headers/screenshots/csp-reports.png)
- [37 authorization](../../37-authorization/), log [`37-authorization.log`](../../logs/37-authorization.log), [permission matrix](../../37-authorization/screenshots/matrix.png)
- [49 capstone](../../49-capstone/)
