import "@fontsource-variable/inter";
import "../styles/tokens.css";
import "../styles/components.css";
import "../styles/portal.css";
import type { ReactNode } from "react";
import { Button } from "@/ds/Button";
import { NAMES, SUPPORTED } from "@/lib/i18n";
import { type Role, home } from "@/lib/policy";
import { currentUser, getT } from "@/lib/request";
import { NavLinks } from "./NavLinks";

const NAV: Record<Role, [string, string][]> = {
  member: [
    ["/dashboard", "nav.dashboard"],
    ["/bank", "nav.bank"],
  ],
  employer_admin: [["/employer", "nav.members"]],
  staff: [
    ["/staff/approvals", "nav.approvals"],
    ["/staff/kpis", "nav.kpis"],
  ],
};

export async function generateMetadata() {
  const { t } = await getT();
  return { title: { template: `%s · ${t("app.name")}`, default: t("app.name") } };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { t, locale } = await getT();
  const user = await currentUser();
  const links = (user ? (NAV[user.role as Role] ?? []) : []).map(([href, key]) => ({ href, text: t(key) }));
  return (
    <html lang={locale}>
      <body>
        <a className="skip-link" href="#main">
          {t("app.skip")}
        </a>
        <header className="portal-header">
          <div className="portal-header__inner">
            <a className="portal-brand" href={user ? home(user) : "/"}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path fill="currentColor" d="M12 2 3 6.5v5C3 17 6.8 21.3 12 22.5c5.2-1.2 9-5.5 9-11v-5L12 2Zm-1 14.6-4-4 1.4-1.4 2.6 2.6 5.6-5.6L18 9.6l-7 7Z" />
              </svg>
              {t("app.name")}
            </a>
            {links.length > 0 && <NavLinks label={t("nav.main")} links={links} />}
            <div className="portal-tools">
              <nav aria-label={t("nav.language")} className="portal-lang">
                {SUPPORTED.map((l) =>
                  l === locale ? (
                    <span key={l} lang={l} aria-current="true">
                      {NAMES[l]}
                    </span>
                  ) : (
                    <a key={l} href={`/lang?to=${l}`} hrefLang={l} lang={l}>
                      {NAMES[l]}
                    </a>
                  ),
                )}
              </nav>
              {user && (
                <form action="/logout" method="post" className="portal-user">
                  <span>
                    {user.name} · {t("role", { role: user.role })}
                  </span>
                  <Button type="submit" variant="secondary">
                    {t("nav.signout")}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </header>
        <main id="main" className="portal-main">
          {children}
        </main>
      </body>
    </html>
  );
}
