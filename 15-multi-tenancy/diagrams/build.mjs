// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

const cols = [
  [
    "pool",
    "Pool: shared tables",
    "tenant_id on every row + RLS\nset_config('app.tenant_id',\n$1, true) per transaction",
    "failed: a forgotten WHERE returned\nall 3 tenants; the owner bypasses\nRLS; a session SET leaked acme",
    "fixed: FORCE RLS, app role not\nowner, LOCAL setting, tenant_id\nleads indexes, UNIQUE and FKs",
  ],
  [
    "bridge",
    "Bridge: schema per tenant",
    "search_path + one role\nper tenant, both LOCAL",
    "failed: search_path is no boundary;\nmigration loop half done;\n1003 schemas: catalogs 7.6 -> 25 MB",
    "fixed: privileges per role,\nresumable migration loop\n(one tx per schema)",
  ],
  [
    "silo",
    "Silo: database per tenant",
    "router reads the tenants\ndirectory on every call",
    "costs: about 7.6 MB of catalogs\neach; connections per database,\n~20 busy silos fill 100",
    "wins: restore one tenant alone,\nDROP DATABASE to delete;\nbigco moved out of the pool",
  ],
];
const d = diagram("overview", "15. Multi-tenancy: pool, bridge, silo on one Postgres");
cols.forEach(([id, title, how, bad, good], i) => {
  const x = 40 + i * 400;
  d.frame(id, x, 90, 370, 380, title)
    .box(`${id}-how`, x + 20, 140, 330, 80, how, { bold: true })
    .box(`${id}-bad`, x + 20, 250, 330, 80, bad, { dashed: true })
    .box(`${id}-good`, x + 20, 360, 330, 80, good)
    .arrow(`${id}-how`, `${id}-bad`)
    .arrow(`${id}-bad`, `${id}-good`);
});
d.text(40, 490, "The app connects as a role that is not the owner, not superuser and has no BYPASSRLS: RLS filters nothing for those.\nIsolation and cost grow left to right: pool for many small tenants, silo for the few that need their own restore or region.")
  .write(dirname(fileURLToPath(import.meta.url)));
