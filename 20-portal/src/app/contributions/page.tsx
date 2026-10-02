import { getContributions } from "@/lib/members";
import { requireMember } from "@/lib/session";

export default async function ContributionsPage() {
  const rows = await getContributions(await requireMember());
  const total = rows.reduce((sum, r) => sum + Number(r.employee) + Number(r.employer), 0);
  return (
    <>
      <h1>Your contributions</h1>
      <table>
        <caption>Monthly contributions</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">You</th>
            <th scope="col">Employer</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month}>
              <td>{r.month}</td>
              <td>{r.employee}</td>
              <td>{r.employer}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Total paid in: {total.toFixed(2)}</p>
    </>
  );
}
