import { type InputHTMLAttributes, useId } from "react";
import { Icon } from "./icons.js";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
}

// A visible <label> tied to the input, the hint and the error tied with aria-describedby, aria-invalid when in error.
// The error is text with an icon, not a red border alone (WCAG 1.4.1 Use of colour, 3.3.1 Error identification).
export function TextField({ label, hint, error, optional, ...input }: TextFieldProps) {
  const id = useId();
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
          <span className="ds-visually-hidden">Error: </span>
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
