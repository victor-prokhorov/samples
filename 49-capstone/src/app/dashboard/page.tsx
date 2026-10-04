import { TableScroll } from "@/app/TableScroll";
import { Alert } from "@/ds/Alert";
import { Card } from "@/ds/Card";
import { formatIban } from "@/lib/bank";
import { contributions, memberRecord, pendingChange } from "@/lib/data";
import { getT, requireUser, track } from "@/lib/request";

export async function generateMetadata() {
  return { title: (await getT()).t("nav.dashboard") };
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const user = await requireUser("member");
  const tr = await getT();
  const { t } = tr;
  const [member, rows, pending, { sent }] = await Promise.all([memberRecord(user), contributions(user), pendingChange(user), searchParams]);
  await track(user, "dashboard_viewed");
  const employee = rows.reduce((s, r) => s + r.employee, 0);
  const employer = rows.reduce((s, r) => s + r.employer, 0);
  return (
    <>
      <div className="page-head">
        <h1 className="ds-heading">{t("dashboard.title", { name: member.name.split(" ")[0] })}</h1>
        <p className="ds-muted">{t("dashboard.meta", { org: member.org, memberNo: member.id })}</p>
      </div>
      <div className="ds-stack">
        {sent && pending && (
          <Alert tone="success" title={t("dashboard.sent.title")}>
            {t("dashboard.sent.body")}
          </Alert>
        )}
        {!sent && pending && (
          <Alert tone="info" title={t("dashboard.pending.title")}>
            {t("dashboard.pending.body", { date: pending.created_at })}
          </Alert>
        )}
        <div className="grid">
          <Card title={t("contrib.title")} meta={t("contrib.meta", { count: rows.length })}>
            <div className="ds-stack">
              <dl className="ds-figures">
                <div>
                  <dt>{t("contrib.total")}</dt>
                  <dd>{tr.money(employee + employer)}</dd>
                </div>
                <div>
                  <dt>{t("contrib.employee")}</dt>
                  <dd>{tr.money(employee)}</dd>
                </div>
                <div>
                  <dt>{t("contrib.employer")}</dt>
                  <dd>{tr.money(employer)}</dd>
                </div>
              </dl>
              <TableScroll label={t("contrib.caption")}>
                <table className="data-table">
                  <caption>{t("contrib.caption")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("contrib.month")}</th>
                      <th scope="col" className="num">
                        {t("contrib.you")}
                      </th>
                      <th scope="col" className="num">
                        {t("contrib.yourEmployer")}
                      </th>
                      <th scope="col" className="num">
                        {t("contrib.total")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.month.toISOString()}>
                        <th scope="row">{tr.month(r.month)}</th>
                        <td className="num">{tr.money(r.employee)}</td>
                        <td className="num">{tr.money(r.employer)}</td>
                        <td className="num">{tr.money(r.employee + r.employer)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </div>
          </Card>
          <Card
            title={t("bank.title")}
            meta={t("bank.meta")}
            footer={
              <a className="ds-button ds-button--secondary button-link" href="/bank">
                {t("bank.change")}
              </a>
            }
          >
            <dl className="details">
              <dt>{t("bank.holder")}</dt>
              <dd>{member.holder}</dd>
              <dt>{t("bank.iban")}</dt>
              <dd className="mono" translate="no">
                {formatIban(member.iban)}
              </dd>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
