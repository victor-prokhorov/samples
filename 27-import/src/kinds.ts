// Each rule is a SQL condition on a staged row `s` (all columns text) and the reason stored when it holds.
// :employer and :period are the sender and month taken from the file name.
export type Rule = { rule: string; when: string; detail: string };

export type Kind = {
  table: string;
  columns: string[];
  key: string[];
  values: string[];
  typed: Record<string, string>;
  scope: string[];
  amount?: string;
  rules: Rule[];
};

const employer: Rule = {
  rule: "employer",
  when: "s.employer IS DISTINCT FROM :employer",
  detail: "format('employer %L is not the sender %s', s.employer, :employer)",
};

const duplicate = (key: string[]): Rule => {
  const same = key.map((k) => `d.${k} = s.${k}`).join(" AND ");
  return {
    rule: "duplicate",
    when: `EXISTS (SELECT 1 FROM stage d WHERE ${same} AND d.line_no < s.line_no)`,
    detail: `format('duplicate key, first seen on line %s', (SELECT min(d.line_no) FROM stage d WHERE ${same}))`,
  };
};

const members: Kind = {
  table: "members",
  columns: ["employer", "member_no", "first_name", "last_name", "email", "birth_date"],
  key: ["employer", "member_no"],
  values: ["first_name", "last_name", "email", "birth_date"],
  typed: { birth_date: "s.birth_date::date" },
  scope: ["employer"],
  rules: [
    employer,
    { rule: "member_no", when: "coalesce(s.member_no, '') !~ '^M[0-9]{4}$'", detail: "format('member_no %L is not M and 4 digits', s.member_no)" },
    { rule: "name", when: "coalesce(s.first_name, '') = '' OR coalesce(s.last_name, '') = ''", detail: "'first_name and last_name are required'" },
    { rule: "email", when: "coalesce(s.email, '') !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'", detail: "format('email %L is not an address', s.email)" },
    {
      rule: "birth_date",
      when: "coalesce(s.birth_date, '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR NOT pg_input_is_valid(s.birth_date, 'date')",
      detail: "format('birth_date %L is not a YYYY-MM-DD date', s.birth_date)",
    },
    duplicate(["employer", "member_no"]),
  ],
};

const contributions: Kind = {
  table: "contributions",
  columns: ["employer", "member_no", "period", "amount"],
  key: ["employer", "member_no", "period"],
  values: ["amount"],
  typed: { amount: "s.amount::numeric(12, 2)" },
  scope: ["employer", "period"],
  amount: "amount",
  rules: [
    employer,
    { rule: "period", when: "s.period IS DISTINCT FROM :period", detail: "format('period %L is not the file period %s', s.period, :period)" },
    { rule: "amount_type", when: "NOT pg_input_is_valid(coalesce(s.amount, ''), 'numeric(12, 2)')", detail: "format('amount %L is not a number', s.amount)" },
    {
      rule: "amount_sign",
      when: "CASE WHEN pg_input_is_valid(coalesce(s.amount, ''), 'numeric(12, 2)') THEN s.amount::numeric < 0 ELSE false END",
      detail: "format('amount %s is negative: corrections are sent as a corrected file, not a negative line', s.amount)",
    },
    {
      rule: "member",
      when: "NOT EXISTS (SELECT 1 FROM members m WHERE m.employer = s.employer AND m.member_no = s.member_no)",
      detail: "format('member %s is unknown for %s: send the members file first', s.member_no, s.employer)",
    },
    duplicate(["employer", "member_no", "period"]),
  ],
};

export const KINDS: Record<string, Kind> = { members, contributions };
