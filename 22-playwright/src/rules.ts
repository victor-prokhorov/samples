export const KINDS = ["address", "email"] as const;
export type Kind = (typeof KINDS)[number];
export type ChangeRequest = { kind: string; value: string; effectiveFrom: string };

const DAY = 86_400_000;

// Returns the reasons a member's change request is refused; empty means it can be recorded as pending.
export function checkRequest(req: ChangeRequest, ctx: { today: string; pending: string[] }): string[] {
  const errors: string[] = [];
  if (!(KINDS as readonly string[]).includes(req.kind)) errors.push("Choose what you want to change");
  const value = req.value.trim();
  if (!value) errors.push("Enter the new value");
  else if (req.kind === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) errors.push("Enter an email address like name@example.com");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.effectiveFrom)) errors.push("Enter the date the change applies from");
  else {
    const days = (Date.parse(req.effectiveFrom) - Date.parse(ctx.today)) / DAY;
    if (days < 0) errors.push("The date cannot be in the past");
    else if (days > 90) errors.push("The date must be within 90 days");
  }
  if (ctx.pending.includes(req.kind)) errors.push(`You already have a pending ${req.kind} change`);
  return errors;
}
