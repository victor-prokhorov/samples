# 25-bilingual

**Pain: a "translated" page that is still English underneath.** The strings were translated, but the code concatenates `"€" + amount.toFixed(2)`, prints `date.toDateString()`, builds plurals with `"request(s)"`, hard-codes a few labels, and sets no `lang`. French members see `€4111.06`, `Sat Jan 31 2026` and `You have 0 pending request(s)` on a French page that a screen reader reads with the wrong voice. A translator renames `{count}` to `{nombre}` and the page breaks at runtime. The French button label does not fit the fixed-width button.

**Reach for it when** a product serves more than one language (a legal requirement in bilingual regions, or members in several countries), or will: retrofitting message catalogues, Intl formatting and `lang` later means touching every view.

**Do not reach for it when** the product has one language and no plan for another: format numbers and dates with `Intl` anyway (it costs nothing), but a catalogue and a negotiation layer are overhead. You need right-to-left scripts, translation memory or a translation management system: this sample covers the code side only.

A `node:http` server (`src/server.ts`) renders the same member page in English and French: messages in ICU MessageFormat (`messages/en.json`, `messages/fr.json`) formatted with `intl-messageformat`, numbers, money and dates with `Intl`, the locale chosen from `Accept-Language` or `?lang=`. `/naive` is the page as first written. A client (`src/demo.ts`) fetches both with different headers and checks what comes back.

```sh
npm i
npm run server   # :53035, / and /naive, ?lang=en|fr|en-XA, ?member=alice|bob|carol
npm run demo     # in another terminal: negotiation, formats, plurals, catalogue check, pseudo-localisation, lang
npm run check    # the catalogue check alone, exits 1 on any problem (for CI)
```

- `messages/en.json`, `messages/fr.json` the catalogues: plural, select, number and date arguments, gender-free French wording (`Membre`, `Administration employeur`, `Dernière connexion le ...`), no-break spaces before `:` and `%`.
- `src/negotiate.ts` `Accept-Language` parsing: q-values, `q=0` (never chosen, also not through `*`), exact match then primary language, fallback.
- `src/i18n.ts` the translator for a locale: messages through `IntlMessageFormat`, money and dates through `Intl`, the formatting locale per language (`en` formats as `en-GB`, `fr` as `fr-FR`).
- `src/catalogues.ts` loads catalogues and compares them: same keys, every message parses, same ICU arguments with the same types, same select cases.
- `src/check-catalogues.ts` the CI gate (`npm run check`).
- `src/pseudo.ts` the `en-XA` pseudo-locale generated from English: literal text accented and padded by 40% inside `⟦ ⟧`, ICU arguments, plurals and `#` left intact (parse, transform the AST, print it back).
- `src/pages.ts` the page (`lang`, a language switcher marked with its own `lang`, `translate="no"` on data) and the naive page.
- `src/scan.ts` a minimal HTML text-node scanner for the checks.
- `fixtures/fr.broken.json` a French catalogue with seven typical translation mistakes.

One-shot run with proof: `../run-25-bilingual.sh` (log in `../logs/25-bilingual.log`). Concepts explained in `../README.md`.
