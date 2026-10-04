import type { ReactNode } from "react";

// A table that may scroll sideways on a phone. A keyboard user can only scroll what can take focus, so the wrapper is a
// named, focusable region (WCAG 2.1.1; axe rule scrollable-region-focusable).
export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
