"use server";

import { redirect } from "next/navigation";
import { findMemberByUsername } from "@/lib/members";
import { startSession } from "@/lib/session";

export async function login(formData: FormData) {
  const id = await findMemberByUsername(String(formData.get("username") ?? "").trim());
  if (id === null) redirect("/login?error=unknown");
  await startSession(id);
  redirect("/profile");
}
