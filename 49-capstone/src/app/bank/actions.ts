"use server";

import { redirect } from "next/navigation";
import { type BankErrors, type BankFields, normaliseIban, validateBank } from "@/lib/bank";
import { createBankChange } from "@/lib/data";
import { getT, requireUser, track } from "@/lib/request";

export type BankState = { values: BankFields; errors: Partial<Record<keyof BankFields | "form", string>>; at?: number };

// Validates on the server (the only place that counts), records the outcome as a usage event, and either returns the
// translated errors with the typed values kept, or writes the request and redirects (Post/Redirect/Get, 20-portal).
export async function requestBankChange(_prev: BankState, form: FormData): Promise<BankState> {
  const user = await requireUser("member");
  const { t } = await getT();
  const values: BankFields = { holder: String(form.get("holder") ?? ""), iban: String(form.get("iban") ?? "") };
  const problems: BankErrors = validateBank(values);
  const keys = Object.keys(problems) as (keyof BankFields)[];
  if (keys.length) {
    await track(user, "bank_change_rejected", { fields: keys, reasons: keys.map((k) => problems[k]) });
    return { values, errors: Object.fromEntries(keys.map((k) => [k, t(problems[k]!)])), at: Date.now() };
  }
  try {
    await createBankChange(user, { holder: values.holder.trim(), iban: normaliseIban(values.iban) });
  } catch (e) {
    // The partial unique index allows one pending change per member: the database is the rule, the form explains it.
    if ((e as { code?: string }).code === "23505") return { values, errors: { form: t("bank.pendingExists") }, at: Date.now() };
    throw e;
  }
  await track(user, "bank_change_submitted");
  redirect("/dashboard?sent=1");
}
