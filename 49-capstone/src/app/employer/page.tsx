import { TableScroll } from "@/app/TableScroll";
import { Card } from "@/ds/Card";
import { organisationMembers } from "@/lib/data";
import { getT, requireUser, track } from "@/lib/request";

export async function generateMetadata() {
  return { title: (await getT()).t("nav.members") };
}

export default async function EmployerPage() {
  const user = await requireUser("employer_admin");
  const tr = await getT();
  const { t } = tr;
  const { org, members } = await organisationMembers(user);
  await track(user, "employer_members_viewed", { count: members.length });
  return (
    <>
      <div className="page-head">
        <h1 className="ds-heading">{t("employer.title", { org })}</h1>
        <p className="ds-muted">{t("employer.meta", { count: members.length })}</p>
      </div>
      <Card title={t("employer.caption", { org })}>
        <TableScroll label={t("employer.caption", { org })}>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t("employer.memberNo")}</th>
                <th scope="col">{t("employer.name")}</th>
                <th scope="col">{t("employer.lastMonth")}</th>
                <th scope="col" className="num">
                  {t("employer.total")}
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="mono">{m.id}</td>
                  <th scope="row">{m.name}</th>
                  <td>{m.last ? tr.month(m.last) : "–"}</td>
                  <td className="num">{tr.money(m.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Card>
    </>
  );
}
