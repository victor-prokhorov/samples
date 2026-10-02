import { getPendingRequest, getProfile } from "@/lib/members";
import { requireMember } from "@/lib/session";

export default async function ProfilePage() {
  const memberId = await requireMember();
  const [p, pending] = await Promise.all([getProfile(memberId), getPendingRequest(memberId)]);
  return (
    <>
      <h1>Your profile</h1>
      <dl>
        <dt>Name</dt>
        <dd>{p.full_name}</dd>
        <dt>Email</dt>
        <dd>{p.email}</dd>
        <dt>Employer</dt>
        <dd>{p.employer}</dd>
        <dt>Address</dt>
        <dd>
          {p.line1}, {p.city}, {p.postcode}
        </dd>
      </dl>
      {pending ? (
        <p>
          Address change to {pending.line1}, {pending.city}, {pending.postcode}: <a href={`/requests/${pending.id}`}>pending since {pending.created_at}</a>
        </p>
      ) : (
        <p>
          <a href="/address">Request a change of address</a>
        </p>
      )}
    </>
  );
}
