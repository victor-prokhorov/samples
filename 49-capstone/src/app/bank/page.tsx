import { Alert } from "@/ds/Alert";
import { Card } from "@/ds/Card";
import { pendingChange } from "@/lib/data";
import { getT, requireUser, track } from "@/lib/request";
import { BankForm } from "./BankForm";

export async function generateMetadata() {
  return { title: (await getT()).t("bank.formTitle") };
}

export default async function BankPage() {
  const user = await requireUser("member");
  const { t } = await getT();
  const pending = await pendingChange(user);
  await track(user, "bank_change_started");
  return (
    <>
      <div className="page-head">
        <h1 className="ds-heading">{t("bank.formTitle")}</h1>
        <p className="ds-muted">{t("bank.intro")}</p>
      </div>
      <div className="ds-stack">
        {pending && (
          <Alert tone="warning" title={t("bank.pendingExists")}>
            {t("dashboard.pending.body", { date: pending.created_at })}
          </Alert>
        )}
        <Card title={t("bank.title")}>
          <BankForm
            text={{
              title: t("errors.title"),
              prefix: t("errors.prefix"),
              holder: t("bank.holder"),
              holderHint: t("bank.holderHint"),
              iban: t("bank.iban"),
              ibanHint: t("bank.ibanHint"),
              submit: t("bank.submit"),
            }}
          />
        </Card>
      </div>
    </>
  );
}
