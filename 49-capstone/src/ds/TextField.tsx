import { type InputHTMLAttributes, useId } from "react";
import { Icon } from "./icons";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id?: string;
  errorPrefix?: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
}

// A visible <label> tied to the input, the hint and the error tied with aria-describedby, aria-invalid when in error.
// The error is text with an icon, not a red border alone (WCAG 1.4.1 Use of colour, 3.3.1 Error identification).
// 49-capstone: two changes from 35-design-tokens: an optional id, so an error summary can link to the input, and
// errorPrefix, so the hidden "Error: " is read in the page's language.
export function TextField({ id: given, errorPrefix = "Error: ", label, hint, error, optional, ...input }: TextFieldProps) {
  const generated = useId();
  const id = given ?? generated;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="ds-field">
      <label className="ds-field__label" htmlFor={id}>
        {label}
        {optional && <span className="ds-field__optional"> (optional)</span>}
      </label>
      {hint && (
        <span className="ds-field__hint" id={hintId}>
          {hint}
        </span>
      )}
      {error && (
        <span className="ds-field__error" id={errorId}>
          <Icon name="danger" />
          <span className="ds-visually-hidden">{errorPrefix}</span>
          {error}
        </span>
      )}
      <input
        className="ds-field__input"
        id={id}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        aria-invalid={error ? true : undefined}
        required={!optional}
        {...input}
      />
    </div>
  );
}
