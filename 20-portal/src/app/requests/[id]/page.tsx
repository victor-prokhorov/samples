import { notFound } from "next/navigation";
import { getRequest } from "@/lib/members";
import { requireMember } from "@/lib/session";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const memberId = await requireMember();
  const { id } = await params;
  // At most 9 digits: the id column is a 32-bit INT, so a longer number would be a Postgres error (500) instead of a 404.
  const r = /^\d{1,9}$/.test(id) ? await getRequest(memberId, Number(id)) : null;
  if (!r) notFound();
  return (
    <>
      <h1>Address change request {r.id}</h1>
      <p>
        Status: <strong>{r.status === "pending" ? "Pending" : r.status}</strong>
      </p>
      <p>
        New address: {r.line1}, {r.city}, {r.postcode}, from {r.effective_from}. Requested {r.created_at}.
      </p>
    </>
  );
}
