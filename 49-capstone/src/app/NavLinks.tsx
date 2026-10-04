"use client";

import { usePathname } from "next/navigation";

// The only client code in the header: it marks the current page with aria-current, which a screen reader announces.
export function NavLinks({ label, links }: { label: string; links: { href: string; text: string }[] }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="portal-nav">
      <ul>
        {links.map((l) => (
          <li key={l.href}>
            <a href={l.href} aria-current={path === l.href ? "page" : undefined}>
              {l.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
