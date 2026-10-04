import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
}

// A native <button>: keyboard, focus and the accessible name come for free. type defaults to "button" so a button in a
// form does not submit it by accident.
export function Button({ variant = "primary", type = "button", className, ...rest }: ButtonProps) {
  return <button type={type} className={["ds-button", `ds-button--${variant}`, className].filter(Boolean).join(" ")} {...rest} />;
}
