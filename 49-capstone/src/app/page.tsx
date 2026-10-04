import { redirect } from "next/navigation";
import { Alert } from "@/ds/Alert";
import { home } from "@/lib/policy";
import { currentUser, getT } from "@/lib/request";

export default async function Landing() {
  const user = await currentUser();
  if (user) redirect(home(user));
  const { t } = await getT();
  return (
    <div className="hero ds-stack">
      <h1 className="ds-heading">{t("landing.title")}</h1>
      <p className="ds-muted">{t("landing.body")}</p>
      <div className="ds-row">
        <a className="ds-button ds-button--primary button-link" href="/login">
          {t("landing.signin")}
        </a>
      </div>
      <Alert tone="info" title={t("app.name")}>
        {t("landing.note")}
      </Alert>
    </div>
  );
}
