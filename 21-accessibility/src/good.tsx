import { Errors, FIELDS, Field, LABELS, Values } from "./address.js";

const css = `
  body { font-family: sans-serif; margin: 2rem; color: #0b0c0c; max-width: 40rem; }
  label, legend { display: block; font-weight: bold; margin-top: 1rem; }
  .hint { color: #505a5f; margin: .25rem 0; }
  .error { color: #b10e1e; font-weight: bold; margin: .25rem 0; }
  input[type=text] { display: block; padding: .4rem; border: 2px solid #0b0c0c; }
  input[aria-invalid=true] { border: 4px solid #b10e1e; }
  .field-error { border-left: 5px solid #b10e1e; padding-left: 1rem; }
  #error-summary { border: 5px solid #b10e1e; padding: 1rem; margin-bottom: 1rem; }
  #error-summary a { color: #b10e1e; font-weight: bold; display: inline-block; padding: .3rem 0; }
  button { background: #00703c; color: #fff; border: 0; padding: .6rem 1rem; font-size: 1rem; margin-top: 1.5rem; }
  :focus { outline: 3px solid #fd0; outline-offset: 0; box-shadow: 0 0 0 6px #0b0c0c; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .radio { display: flex; gap: .5rem; align-items: center; margin-top: .5rem; }
  .radio label { font-weight: normal; margin: 0; }
`;

const AUTOCOMPLETE: Partial<Record<Field, string>> = {
  line1: "address-line1",
  city: "address-level2",
  postcode: "postal-code",
  country: "country-name",
};

const HINTS: Partial<Record<Field, string>> = { postcode: "For example, AB1 2CD" };

function ErrorMessage({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return (
    <p id={id} className="error">
      <span className="visually-hidden">Error: </span>
      {text}
    </p>
  );
}

function TextField({ name, values, errors }: { name: Field; values: Values; errors: Errors }) {
  const hint = HINTS[name];
  const describedBy = [hint && `${name}-hint`, errors[name] && `${name}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={errors[name] ? "field-error" : undefined}>
      <label htmlFor={name}>{LABELS[name]}</label>
      {hint && (
        <p id={`${name}-hint`} className="hint">
          {hint}
        </p>
      )}
      <ErrorMessage id={`${name}-error`} text={errors[name]} />
      <input
        type="text"
        id={name}
        name={name}
        defaultValue={values[name]}
        autoComplete={AUTOCOMPLETE[name]}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={describedBy}
      />
    </div>
  );
}

export function GoodForm({ values, errors }: { values: Values; errors: Errors }) {
  const failed = FIELDS.filter((f) => errors[f]);
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{`${failed.length ? "Error: " : ""}Change your address - Member portal`}</title>
        <style>{css}</style>
      </head>
      <body>
        <main>
          {failed.length > 0 && (
            <div id="error-summary" tabIndex={-1} aria-labelledby="error-summary-title" role="alert">
              <h2 id="error-summary-title">There is a problem</h2>
              <ul>
                {failed.map((f) => (
                  <li key={f}>
                    <a href={`#${f === "when" ? "when-today" : f}`}>{errors[f]}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <h1>Change your address</h1>
          <p className="hint">We will send a confirmation letter to the new address.</p>
          <form method="post" action="/good" noValidate>
            <fieldset>
              <legend>New address</legend>
              {(["line1", "city", "postcode", "country"] as const).map((f) => (
                <TextField key={f} name={f} values={values} errors={errors} />
              ))}
            </fieldset>
            <fieldset className={errors.when ? "field-error" : undefined} aria-describedby={errors.when ? "when-error" : undefined}>
              <legend>{LABELS.when}</legend>
              <ErrorMessage id="when-error" text={errors.when} />
              {[
                ["today", "From today"],
                ["next-statement", "From the next annual statement"],
              ].map(([value, label]) => (
                <div className="radio" key={value}>
                  <input type="radio" id={`when-${value}`} name="when" value={value} defaultChecked={values.when === value} />
                  <label htmlFor={`when-${value}`}>{label}</label>
                </div>
              ))}
            </fieldset>
            <button type="submit">Save new address</button>
          </form>
        </main>
        <script dangerouslySetInnerHTML={{ __html: "document.getElementById('error-summary')?.focus()" }} />
      </body>
    </html>
  );
}

export function Done({ lang }: { lang: boolean }) {
  return (
    <html lang={lang ? "en" : undefined}>
      <head>
        <meta charSet="utf-8" />
        <title>Address saved - Member portal</title>
      </head>
      <body>
        <main>
          <h1>Address saved</h1>
        </main>
      </body>
    </html>
  );
}
