# 21-accessibility

**Pain: a form that some members cannot use at all.** A placeholder that disappears once you type, a "button" that the keyboard never reaches, an error shown only as a red border, focus left at the top of the page after a failed submit. Nobody on the team notices, because they all use a mouse and see colour, and the members who cannot complete the form simply call or stop trying.

**Reach for it when** you build forms for the public or for members, which in many countries must meet WCAG 2.1 or 2.2 level AA by law (RGAA in France, EN 301 549 in the EU, Section 508 in the US): put an automated scan and a keyboard journey in the test suite so regressions fail the build.

**Do not reach for it when** you expect it to replace an audit. Automated rules find a minority of failures; screen reader testing with real users, and a conformance audit against WCAG-EM or the RGAA checklist, are still needed before you claim conformance.

The same "change of address" form in two versions, rendered with `react-dom/server` on a tiny `node:http` server, and a demo that drives them in Chromium through Playwright: an axe-core scan of each page state, a keyboard-only journey, and what Chromium's accessibility tree hands to a screen reader for each field.

```sh
npm i
npm run server   # http://localhost:53031/bad and http://localhost:53031/good
npm run demo     # starts the server itself (stop the one above first), runs the checks, writes out/
```

- `src/bad.tsx` the inaccessible form: no `lang`, placeholders as labels, unlabelled radios, low contrast, a `div` as the button, errors as a red border only.
- `src/good.tsx` the accessible form: `lang`, labels, fieldset and legend, `autocomplete` tokens, errors in text tied to fields with `aria-describedby` and `aria-invalid`, an error summary that takes focus, an `Error:` page title.
- `src/address.ts` the fields and the validation both versions share.
- `src/server.tsx` GET and POST for `/bad` and `/good`; 422 with the errors, 303 on success.
- `src/demo.ts` the axe scans (WCAG 2.0, 2.1 and 2.2 A and AA rules), the keyboard journeys, the accessibility tree reads through the Chrome DevTools Protocol, and the findings table with the closest RGAA criterion.

One-shot run with proof: `../run-21-accessibility.sh` (log in `../logs/21-accessibility.log`). Concepts explained in `../README.md`.
