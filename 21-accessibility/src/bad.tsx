import { Errors, Values } from "./address.js";

const css = `
  body { font-family: sans-serif; margin: 2rem; color: #333; }
  .title { font-size: 1.6rem; font-weight: bold; margin-bottom: 1rem; }
  .hint { color: #b8b8b8; font-size: .85rem; }
  input[type=text] { display: block; margin: .5rem 0; padding: .4rem; border: 1px solid #ccc; }
  .err { border: 2px solid #e00 !important; }
  .btn { display: inline-block; background: #7fb2e5; color: #fff; padding: .5rem 1rem; cursor: pointer; margin-top: 1rem; }
  input:focus { outline: none; }
`;

export function BadForm({ values, errors }: { values: Values; errors: Errors }) {
  const cls = (f: keyof Values) => (errors[f] ? "err" : "");
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>Form</title>
        <style>{css}</style>
      </head>
      <body>
        <div className="title">Change your address</div>
        <div className="hint">We will send a confirmation letter to the new address.</div>
        <form method="post" action="/bad">
          <input type="text" name="line1" placeholder="Address line 1" defaultValue={values.line1} className={cls("line1")} />
          <input type="text" name="city" placeholder="Town or city" defaultValue={values.city} className={cls("city")} />
          <input type="text" name="postcode" placeholder="Postcode" defaultValue={values.postcode} className={cls("postcode")} />
          <input type="text" name="country" placeholder="Country" defaultValue={values.country} className={cls("country")} />
          <div className={`hint ${cls("when")}`}>Apply from</div>
          <input type="radio" name="when" value="today" defaultChecked={values.when === "today"} /> Today
          <input type="radio" name="when" value="next-statement" defaultChecked={values.when === "next-statement"} /> Next statement
          <div>
            <div className="btn" id="save">Save</div>
          </div>
        </form>
        <script dangerouslySetInnerHTML={{ __html: "document.getElementById('save').addEventListener('click', () => document.forms[0].submit())" }} />
      </body>
    </html>
  );
}
