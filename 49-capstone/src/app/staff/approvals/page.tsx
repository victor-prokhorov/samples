import { TableScroll } from "@/app/TableScroll";
import { Alert } from "@/ds/Alert";
import { Button } from "@/ds/Button";
import { Card } from "@/ds/Card";
import { maskIban } from "@/lib/bank";
import { pendingApprovals } from "@/lib/data";
import { can } from "@/lib/policy";
import { getT, requireUser } from "@/lib/request";
import { approveChange } from "./actions";

export async function generateMetadata() {
  return { title: (await getT()).t("approvals.title") };
}

export default async function Approvals({ searchParams }: { searchParams: Promise<{ approved?: string; refused?: string }> }) {
  const user = await requireUser("staff");
  const tr = await getT();
  const { t } = tr;
  const [rows, { approved, refused }] = await Promise.all([pendingApprovals(user), searchParams]);
  return (
    <>
      <div className="page-head">
        <h1 className="ds-heading">{t("approvals.title")}</h1>
        <p className="ds-muted">{t("approvals.meta", { count: rows.length })}</p>
      </div>
      <div className="ds-stack">
        {approved && (
          <Alert tone="success" title={t("approvals.approved.title")}>
            {t("approvals.approved.body", { member: approved })}
          </Alert>
        )}
        {refused && (
          <Alert tone="danger" title={t("approvals.refused.title")}>
            {t("approvals.refused.body")}
          </Alert>
        )}
        <Card title={t("approvals.caption")}>
          <TableScroll label={t("approvals.caption")}>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t("approvals.member")}</th>
                  <th scope="col">{t("approvals.requestedBy")}</th>
                  <th scope="col">{t("approvals.newAccount")}</th>
                  <th scope="col">{t("approvals.requestedAt")}</th>
                  <th scope="col">{t("approvals.action")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  // The same policy as the database: pending, and not requested by the person approving.
                  const allowed = can(user, "change_request:approve", { type: "change_request", memberId: r.member_id, orgId: r.org_id, requestedBy: r.requested_by, status: r.status });
                  return (
                    <tr key={r.id}>
                      <th scope="row">
                        {r.member}
                        <br />
                        <span className="ds-muted">{r.org}</span>
                      </th>
                      <td>{r.requester}</td>
                      <td className="mono" translate="no">
                        {maskIban(r.iban)}
                      </td>
                      <td>{tr.dateTime(r.created_at)}</td>
                      <td>
                        {allowed ? (
                          <form action={approveChange}>
                            <input type="hidden" name="id" value={r.id} />
                            <Button type="submit">
                              {t("approvals.approve")}
                              <span className="ds-visually-hidden">{t("approvals.approveFor", { member: r.member })}</span>
                            </Button>
                          </form>
                        ) : (
                          <span className="ds-muted">{t("approvals.own")}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        </Card>
      </div>
    </>
  );
}
