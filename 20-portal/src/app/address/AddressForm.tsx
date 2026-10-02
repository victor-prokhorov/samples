"use client";

import { useActionState } from "react";
import type { Fields, FormState } from "@/lib/address";
import { requestAddressChange } from "./actions";

const initial: FormState = { values: { line1: "", city: "", postcode: "", effectiveFrom: "" }, errors: {} };

const FIELDS: { name: keyof Fields; label: string; autoComplete?: string; type?: string }[] = [
  { name: "line1", label: "Address line 1", autoComplete: "address-line1" },
  { name: "city", label: "Town or city", autoComplete: "address-level2" },
  { name: "postcode", label: "Postcode", autoComplete: "postal-code" },
  { name: "effectiveFrom", label: "Applies from", type: "date" },
];

export function AddressForm() {
  const [state, action, pending] = useActionState(requestAddressChange, initial);
  return (
    <form action={action} noValidate>
      {state.errors.form && <p role="alert">{state.errors.form[0]}</p>}
      {FIELDS.map(({ name, label, autoComplete, type }) => {
        const error = state.errors[name]?.[0];
        return (
          <div key={name}>
            <label htmlFor={name}>{label}</label>
            {error && (
              <p id={`${name}-error`} className="error">
                Error: {error}
              </p>
            )}
            <input
              id={name}
              name={name}
              type={type ?? "text"}
              autoComplete={autoComplete}
              defaultValue={state.values[name]}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${name}-error` : undefined}
            />
          </div>
        );
      })}
      <button disabled={pending}>Request the change</button>
    </form>
  );
}
