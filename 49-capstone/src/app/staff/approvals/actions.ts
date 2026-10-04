"use server";

import { redirect } from "next/navigation";
import { approve } from "@/lib/data";
import { isRlsRefusal } from "@/lib/db";
import { requireUser, track } from "@/lib/request";

// The page only offers the button when can() allows it; the database decides again (four eyes in WITH CHECK).
export async function approveChange(form: FormData) {
  const user = await requireUser("staff");
  const id = Number(form.get("id"));
  let member: string | null;
  try {
    member = await approve(user, id);
  } catch (e) {
    if (!isRlsRefusal(e)) throw e;
    await track(user, "change_approval_refused", { id });
    redirect(`/staff/approvals?refused=${id}`);
  }
  if (!member) redirect("/staff/approvals");
  await track(user, "change_approved", { id });
  redirect(`/staff/approvals?approved=${encodeURIComponent(member)}`);
}
