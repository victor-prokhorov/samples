import { type ReactNode, useId } from "react";

export interface CardProps {
  title: string;
  meta?: string;
  children?: ReactNode;
  footer?: ReactNode;
  headingLevel?: 2 | 3 | 4;
}

// A <section> named by its heading, so it shows up as a region in a screen reader's landmarks list.
export function Card({ title, meta, children, footer, headingLevel = 2 }: CardProps) {
  const id = useId();
  const Heading = `h${headingLevel}` as const;
  return (
    <section className="ds-card" aria-labelledby={id}>
      <div className="ds-card__header">
        <Heading className="ds-card__title" id={id}>
          {title}
        </Heading>
        {meta && <p className="ds-card__meta">{meta}</p>}
      </div>
      {children && <div className="ds-card__body">{children}</div>}
      {footer && <div className="ds-card__footer">{footer}</div>}
    </section>
  );
}
