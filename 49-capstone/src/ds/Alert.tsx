import type { ReactNode } from "react";
import { Icon } from "./icons";

export interface AlertProps {
  tone: "info" | "success" | "warning" | "danger";
  title: string;
  children?: ReactNode;
}

// Tone is carried by the title text and the icon as well as the colour. Warnings and errors use role="alert" so a
// screen reader announces them when they appear; information and success use role="status", which waits its turn.
export function Alert({ tone, title, children }: AlertProps) {
  const urgent = tone === "warning" || tone === "danger";
  return (
    <div className={`ds-alert ds-alert--${tone}`} role={urgent ? "alert" : "status"}>
      <Icon name={tone} className="ds-alert__icon" />
      <div>
        <p className="ds-alert__title">{title}</p>
        {children && <div className="ds-alert__body">{children}</div>}
      </div>
    </div>
  );
}
