"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/ds/Alert";
import { Button } from "@/ds/Button";
import { TextField } from "@/ds/TextField";
import { type BankState, requestBankChange } from "./actions";

type Text = { title: string; prefix: string; holder: string; holderHint: string; iban: string; ibanHint: string; submit: string };

const initial: BankState = { values: { holder: "", iban: "" }, errors: {} };

// 21-accessibility's pattern with 35-design-tokens' components: an error summary at the top that takes focus and links
// to each field, the error next to its field, aria-invalid, and "Error: " in the page title.
export function BankForm({ text }: { text: Text }) {
  const [state, action, pending] = useActionState(requestBankChange, initial);
  const summary = useRef<HTMLDivElement>(null);
  const fields = (["holder", "iban"] as const).filter((f) => state.errors[f]);
  const failed = fields.length > 0 || !!state.errors.form;

  useEffect(() => {
    const base = document.title.replace(new RegExp(`^${text.prefix}`), "");
    document.title = failed ? `${text.prefix}${base}` : base;
    if (failed) summary.current?.focus();
  }, [state.at, failed, text.prefix]);

  return (
    <form action={action} noValidate className="form">
      {failed && (
        <div ref={summary} tabIndex={-1} className="error-summary">
          <Alert tone="danger" title={state.errors.form ?? text.title}>
            {fields.length > 0 && (
              <ul>
                {fields.map((f) => (
                  <li key={f}>
                    <a href={`#${f}`}>{state.errors[f]}</a>
                  </li>
                ))}
              </ul>
            )}
          </Alert>
        </div>
      )}
      <TextField
        id="holder"
        name="holder"
        label={text.holder}
        hint={text.holderHint}
        error={state.errors.holder}
        errorPrefix={text.prefix}
        defaultValue={state.values.holder}
        autoComplete="name"
        key={`holder-${state.at}`}
      />
      <TextField
        id="iban"
        name="iban"
        label={text.iban}
        hint={text.ibanHint}
        error={state.errors.iban}
        errorPrefix={text.prefix}
        defaultValue={state.values.iban}
        autoComplete="off"
        spellCheck={false}
        translate="no"
        key={`iban-${state.at}`}
      />
      <div>
        <Button type="submit" disabled={pending}>
          {text.submit}
        </Button>
      </div>
    </form>
  );
}
