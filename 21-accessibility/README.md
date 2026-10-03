# 21. Accessible forms, WCAG 2.2 AA and RGAA

**Pain: a form that some members cannot use at all.** A placeholder that disappears once you type, a "button" the keyboard never reaches, an error shown only as a red border, focus left at the top of the page after a failed submit. Nobody on the team notices, because they all use a mouse and see colour, and the members who cannot complete the form call the help desk or give up.

**Reach for it when** you build forms for the public or for members, which in many countries must meet WCAG 2.1 or 2.2 level AA by law (RGAA in France, EN 301 549 in the EU, Section 508 in the US, which references WCAG 2.0 AA). Put an automated scan and a keyboard journey in the test suite so regressions fail the build.

**Do not reach for it when** you expect it to replace an audit. Automated rules find a minority of failures; testing with screen readers and real users, and a conformance audit against WCAG-EM or the RGAA checklist, are still needed before you claim conformance.

The same "change of address" form in two versions, rendered with `react-dom/server` on a tiny `node:http` server. The demo drives both in Chromium through Playwright: an axe-core scan of each page state, a keyboard-only journey, and what Chromium's accessibility tree hands a screen reader for each field, read through the Chrome DevTools Protocol.

## Run

One shot with proof: `./run-21-accessibility.sh` from the repo root (log in [`../logs/21-accessibility.log`](../logs/21-accessibility.log)).

By hand, from this folder (ports: HTTP 53031 forms):

```sh
npm i
npm run server   # http://localhost:53031/bad and http://localhost:53031/good
npm run demo     # starts the server itself (stop the one above first), runs the checks, writes out/
```

## Files

- `src/bad.tsx` the inaccessible form: no `lang`, placeholders as labels, unlabelled radios, low contrast, a `div` as the button, errors as a red border only.
- `src/good.tsx` the accessible form: `lang`, labels, fieldset and legend, `autocomplete` tokens, errors in text tied to fields with `aria-describedby` and `aria-invalid`, an error summary that takes focus, an `Error:` page title.
- `src/address.ts` the fields and the validation both versions share.
- `src/server.tsx` GET and POST for `/bad` and `/good`; 422 with the errors, 303 on success.
- `src/demo.ts` the axe scans (WCAG 2.0, 2.1 and 2.2 A and AA rules), the keyboard journeys, the accessibility tree reads through the Chrome DevTools Protocol, and the findings table with the closest RGAA criterion.

## Concepts

- **WCAG 2.2 and RGAA**: WCAG (W3C) states testable success criteria grouped under four principles (perceivable, operable, understandable, robust), at levels A, AA and AAA; AA is what laws and contracts ask for. RGAA 4.1, the French public-sector standard, turns WCAG 2.1 AA into 106 criteria with test procedures; the demo prints the closest RGAA criterion next to each finding. WCAG 2.2 adds criteria RGAA 4.1 does not have yet, such as 2.5.8 target size.
- **Automated scan (axe-core)**: axe runs inside the real page and reports each failed rule with its WCAG tags (`wcag143` is success criterion 1.4.3). It found the missing `lang` (3.1.1), the low-contrast grey text (1.4.3) and the unlabelled radios (4.1.2). Scan every state a user can reach: the form after a failed submit is a different page. While this sample was being written, the scan of the accessible form's error state failed 2.5.8 (the error summary links were 17 px tall); padding fixed it.
- **What axe cannot see**: axe's `label` rule accepts a non-empty `placeholder` as a label (its `non-empty-placeholder` check; Chromium also uses the placeholder as the accessible name), so the placeholder-only inputs pass, although the placeholder disappears as soon as you type. An error shown only as a red border is invisible to axe and to a screen reader: the accessibility tree shows no description and `invalid=false` (1.4.1 use of colour, 3.3.1 error identification). A `div` with a click handler is no failure to axe here; the keyboard journey shows it can never be reached.
- **Accessible name and description**: what a screen reader announces for a field. The name comes from the `<label for>`; the description joins, in order, the elements listed in `aria-describedby` (the hint "For example, AB1 2CD", then the error); `aria-invalid="true"` adds "invalid entry". The visually hidden `Error:` prefix makes the message an error for listeners too, not just red text.
- **Keyboard operability**: Tab must reach every control in reading order (2.1.1, 2.4.3). A radio group is one tab stop; arrows move inside it, Space selects. A real `<button>` is focusable and submits on Enter; a form with several text inputs and no submit button cannot be submitted by Enter at all (HTML implicit submission).
- **Error summary with focus**: after a failed submit the page starts with a box titled "There is a problem", listing each error as a link to its field, and the page moves focus to it (`tabindex="-1"` plus one line of script; `role="alert"` also announces it). Following a link focuses the field. The page `<title>` starts with `Error:` so the first thing announced on reload says what happened. This is the GOV.UK Design System pattern.
- **Grouping and autocomplete**: `fieldset` and `legend` name a group of fields (the address, the radios' question) so each radio is announced with its question (1.3.1). `autocomplete="address-line1"`, `postal-code`, ... let browsers and assistive tools fill and identify fields (1.3.5).
- **Trade-offs**: the scripted checks prove only what they assert: no tool judges whether an error message is helpful, whether reading order makes sense, or how the form behaves at 400% zoom or with a screen reader's virtual cursor. The accessibility tree read here is Chromium's; other browsers and screen readers differ. Keep the scan in CI (30 runs axe as a pipeline gate; this sample's demo shows the in-browser scan, which also covers contrast and focus) and schedule manual audits.

## Proof (`logs/21-accessibility.log`)

axe finds three rule failures on the inaccessible form, and none on the accessible one, in either state:

```
   axe /bad -> 3 violations, 7 rules passed, 0 need review (out/axe-bad-errors.json)
     color-contrast   serious   WCAG 1.4.3        RGAA 3.2    3 nodes  Elements must meet minimum color contrast ratio thresholds
     html-has-lang    serious   WCAG 3.1.1        RGAA 8.3    1 nodes  <html> element must have a lang attribute
     label            critical  WCAG 4.1.2        RGAA 11.1   2 nodes  Form elements must have labels
...
   axe /good -> 0 violations, 17 rules passed, 0 need review (out/axe-good-empty.json)
   axe /good -> 0 violations, 24 rules passed, 0 need review (out/axe-good-errors.json)
```

What a screen reader gets after the failed submit of each form. The inaccessible one has names (from the placeholders) but nothing says there is an error; the accessible one ties hint and error to the field:

```
   input[name=postcode] role=textbox    name="Postcode"                 description=""                                                         invalid=false
   4 inputs have the red .err border; focus after the reload is on: body
...
   #error-summary       role=alert      name="There is a problem"       description=""                                                         invalid=false
   #postcode            role=textbox    name="Postcode"                 description="For example, AB1 2CD Error: Enter a real postcode, like AB1 2CD" invalid=true
```

Keyboard only: Tab never reaches the inaccessible form's Save, and Enter does nothing. On the accessible form, focus goes to the error summary, its link to the field, and the form completes:

```
   Tab  5 -> radio
   Enter in the postcode field: 0 POST requests, still on /bad
...
   Tab  6 -> button "Save new address"
   focus on button "Save new address", press Enter
   -> 422, focus is now on #error-summary: alert "There is a problem"
   Tab -> link "Enter the first line of your address"
   Enter -> focus on #line1: textbox "Address line 1"
...
   typed the address, Space on "From today", Tab -> button "Save new address", Enter
   -> /good/done: "Address saved"
```

The findings, and how each was found:

```
   html-has-lang              WCAG 3.1.1         RGAA 8.3        found by axe
   color-contrast             WCAG 1.4.3         RGAA 3.2        found by axe
   label                      WCAG 4.1.2         RGAA 11.1       found by axe (radios only; placeholders pass)
   colour-only error          WCAG 1.4.1         RGAA 3.1        found by accessibility tree
   error not announced        WCAG 3.3.1, 4.1.2  RGAA 11.10      found by accessibility tree
   no error summary or focus  WCAG 3.3.1, 2.4.3  RGAA 11.10      found by keyboard journey
   div as button              WCAG 2.1.1, 4.1.2  RGAA 7.3        found by keyboard journey
   radios not grouped         WCAG 1.3.1         RGAA 11.5, 11.6 found by markup query
   no autocomplete tokens     WCAG 1.3.5         RGAA 11.13      found by markup query
```

## Origins and further reading

- Standard: "Web Content Accessibility Guidelines (WCAG) 2.2", W3C Recommendation, 2023. https://www.w3.org/TR/WCAG22/
- Docs: "Understanding WCAG 2.2" (the intent and techniques behind each criterion), W3C WAI. https://www.w3.org/WAI/WCAG22/Understanding/
- Standard: RGAA 4.1, "Critères et tests", DINUM. https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/
- Standard: "Website Accessibility Conformance Evaluation Methodology (WCAG-EM) 1.0", W3C, 2014. https://www.w3.org/TR/WCAG-EM/
- Standard: "Accessible Name and Description Computation 1.2", W3C. https://www.w3.org/TR/accname-1.2/
- Docs: axe-core rule descriptions, Deque. https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md
- Docs: "Accessibility testing", Playwright. https://playwright.dev/docs/accessibility-testing
- Docs: "Error summary" and "Error message" components, GOV.UK Design System. https://design-system.service.gov.uk/components/error-summary/
- Article: "Placeholders in Form Fields Are Harmful", Katie Sherwin, Nielsen Norman Group, 2014. https://www.nngroup.com/articles/form-design-placeholders/
- Article: "What we found when we tested tools on the world's least-accessible webpage", Mehmet Duran, GOV.UK accessibility blog, 2017. https://accessibility.blog.gov.uk/2017/02/24/what-we-found-when-we-tested-tools-on-the-worlds-least-accessible-webpage/
