import { Icon } from "@/ds/icons";
import { computeKpis } from "@/lib/kpis";
import { getT, requireUser, track } from "@/lib/request";

export async function generateMetadata() {
  return { title: (await getT()).t("kpis.title") };
}

export default async function KpiPage() {
  const user = await requireUser("staff");
  const tr = await getT();
  const { t } = tr;
  await track(user, "kpis_viewed");
  const { results, events } = await computeKpis(user);
  return (
    <>
      <div className="page-head">
        <h1 className="ds-heading">{t("kpis.title")}</h1>
        <p className="ds-muted">{t("kpis.meta", { count: events })}</p>
      </div>
      <div className="tiles">
        {results.map(({ kpi, value, n, d, met }) => (
          // Status is text and an icon as well as colour (WCAG 1.4.1), as on 29-kpis' dashboard.
          <section key={kpi.id} className="ds-card tile" aria-labelledby={`kpi-${kpi.id}`} data-kpi={kpi.id}>
            <div className="ds-card__header">
              <h2 className="ds-card__title" id={`kpi-${kpi.id}`}>
                {t(`kpi.${kpi.id}.name`)}
              </h2>
              <p className="ds-card__meta">{t(`kpi.${kpi.id}.question`)}</p>
            </div>
            <div className="ds-card__body ds-stack">
              <p className="tile__value">{tr.percent(value)}</p>
              <p className={`tile__status tile__status--${met ? "met" : "missed"}`}>
                <Icon name={met ? "success" : "warning"} />
                {t(met ? "kpis.met" : "kpis.missed")}
              </p>
              <p className="ds-muted">{t(`kpi.${kpi.id}.detail`, { n, d })}</p>
            </div>
            <div className="ds-card__footer">
              <span>{t("kpis.target", { op: kpi.target.op === ">=" ? "≥" : "≤", target: tr.percent(kpi.target.value) })}</span>
              <span>{t("kpis.owner", { owner: t(kpi.owner) })}</span>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
