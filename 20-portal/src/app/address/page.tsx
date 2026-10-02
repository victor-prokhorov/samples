import { getPendingRequest } from "@/lib/members";
import { requireMember } from "@/lib/session";
import { AddressForm } from "./AddressForm";

export default async function AddressPage() {
  const pending = await getPendingRequest(await requireMember());
  return (
    <>
      <h1>Change your address</h1>
      {pending && (
        <p>
          You already have a <a href={`/requests/${pending.id}`}>pending address change</a>.
        </p>
      )}
      <AddressForm />
    </>
  );
}
