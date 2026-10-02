"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { AddressChange, Fields, FormState } from "@/lib/address";
import { createAddressRequest } from "@/lib/members";
import { requireMember } from "@/lib/session";

export async function requestAddressChange(_prev: FormState, formData: FormData): Promise<FormState> {
  const memberId = await requireMember();
  const values: Fields = {
    line1: String(formData.get("line1") ?? ""),
    city: String(formData.get("city") ?? ""),
    postcode: String(formData.get("postcode") ?? ""),
    effectiveFrom: String(formData.get("effectiveFrom") ?? ""),
  };
  const parsed = AddressChange.safeParse(values);
  if (!parsed.success) return { values, errors: z.flattenError(parsed.error).fieldErrors };
  let id: number;
  try {
    id = await createAddressRequest(memberId, parsed.data);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return { values, errors: { form: ["You already have a pending address change"] } };
    throw err;
  }
  redirect(`/requests/${id}`);
}
