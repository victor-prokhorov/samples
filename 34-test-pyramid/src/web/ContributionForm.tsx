// The contribution change form: live monthly preview, validation before sending (the same rules as the API),
// errors tied to their field, and the server's answer announced in a status or alert region.
import { type FormEvent, useEffect, useId, useState } from "react";
import { type Field, monthlyPreview, parseRate, rateError, startOptions, validateChange } from "../domain/contribution.js";
import { type Member, getMember, submitChange } from "./api.js";

const euro = new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" });
const month = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function ContributionForm({ memberId }: { memberId: string }) {
  const id = useId();
  const [member, setMember] = useState<Member | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rate, setRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    getMember(memberId).then(setMember, (e: Error) => setLoadError(e.message));
  }, [memberId]);

  if (loadError) return <p role="alert">{loadError}</p>;
  if (!member) return <p>Loading your details…</p>;

  const parsed = rateError(rate) ? null : parseRate(rate);
  const preview = parsed === null ? null : monthlyPreview(member.salary, parsed);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setDone(null);
    setRefused(null);
    const checked = validateChange({ rate, effectiveFrom }, member!.today);
    if (!checked.ok) return setErrors(checked.errors);
    setErrors({});
    setSending(true);
    const result = await submitChange(member!.id, rate, effectiveFrom);
    setSending(false);
    if (result.kind === "created") setDone(`Your change to ${result.rate}% from ${month(result.effectiveFrom)} is pending. You will pay ${euro.format(result.monthly.member)} a month.`);
    else if (result.kind === "invalid") setErrors(result.errors);
    else setRefused(result.message);
  }

  const field = (name: Field, hint?: string) => ({
    id: `${id}-${name}`,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": [hint && `${id}-${name}-hint`, errors[name] && `${id}-${name}-error`].filter(Boolean).join(" ") || undefined,
  });

  return (
    <main>
      <h1>Change my contribution</h1>
      <p>
        {member.name}, {member.employer}. You pay {member.rate}% of your salary today.
      </p>
      {member.pending && (
        <p>
          A change to {member.pending.rate}% from {month(member.pending.effectiveFrom)} is pending.
        </p>
      )}
      <form noValidate onSubmit={onSubmit}>
        <div>
          <label htmlFor={`${id}-rate`}>New rate (% of salary)</label>
          <p id={`${id}-rate-hint`}>Between 2 and 15, in steps of 0.5.</p>
          <input {...field("rate", "hint")} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          {errors.rate && <p id={`${id}-rate-error`}>Error: {errors.rate}</p>}
        </div>
        <div>
          <label htmlFor={`${id}-effectiveFrom`}>Starts on</label>
          <select {...field("effectiveFrom")} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)}>
            <option value="">Choose a month</option>
            {startOptions(member.today).map((d) => (
              <option key={d} value={d}>
                {month(d)}
              </option>
            ))}
          </select>
          {errors.effectiveFrom && <p id={`${id}-effectiveFrom-error`}>Error: {errors.effectiveFrom}</p>}
        </div>
        <section aria-labelledby={`${id}-preview`}>
          <h2 id={`${id}-preview`}>Each month</h2>
          {preview ? (
            <dl>
              <dt>You pay</dt>
              <dd>{euro.format(preview.member)}</dd>
              <dt>Your employer adds</dt>
              <dd>{euro.format(preview.employer)}</dd>
              <dt>Total</dt>
              <dd>{euro.format(preview.total)}</dd>
            </dl>
          ) : (
            <p>Enter a rate to see the amounts.</p>
          )}
        </section>
        <button type="submit" disabled={sending}>
          {sending ? "Sending…" : "Request the change"}
        </button>
      </form>
      <div role="status">{done}</div>
      <div role="alert">{refused}</div>
    </main>
  );
}
