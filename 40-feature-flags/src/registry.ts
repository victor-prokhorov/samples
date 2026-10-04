// Every flag the code may ask for, declared once: kind, owner, why it exists and the date it must be gone by.
// setup.ts seeds the flags table from this list; lint-flags.ts reads it to fail CI on a flag past its expiry.
export type Kind = "release" | "percentage" | "tenant" | "kill";

export type FlagDef = {
  key: string;
  kind: Kind;
  owner: string;
  description: string;
  expires: string; // YYYY-MM-DD; a kill switch is long-lived but still reviewed
  enabled: boolean; // the value seeded into Postgres
  percentage?: number;
  tenants?: string[];
};

export const registry: FlagDef[] = [
  {
    key: "new-statement-page",
    kind: "release",
    owner: "statements team",
    description: "release toggle: the rewritten annual statement page, merged dark and switched on when ready",
    expires: "2027-03-31",
    enabled: false,
  },
  {
    key: "projection-v2",
    kind: "percentage",
    owner: "statements team",
    description: "percentage rollout: the new retirement projection on the statement, 1% -> 10% -> 50% -> 100% of members",
    expires: "2027-03-31",
    enabled: true,
    percentage: 0,
  },
  {
    key: "employer-bulk-upload",
    kind: "tenant",
    owner: "employer team",
    description: "per-tenant targeting: bulk contribution upload, Acme first, then the other employers",
    expires: "2027-06-30",
    enabled: true,
    tenants: [],
  },
  {
    key: "ops-live-valuation",
    kind: "kill",
    owner: "operations",
    description: "kill switch: the live fund valuation on the statement (an expensive call); ops turn it off during an incident",
    expires: "2027-12-31",
    enabled: true,
  },
  {
    key: "legacy-pdf-renderer",
    kind: "release",
    owner: "statements team",
    description: "the old PDF renderer kept behind a flag during the switch; the switch finished in August",
    expires: "2026-08-31",
    enabled: false,
  },
];
