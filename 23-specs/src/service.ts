export class RuleViolation extends Error {}

export type Status = "pending" | "awaiting second approval" | "approved";

export type ChangeRequest = { memberId: string; requestedBy: string; iban: string; effectiveFrom: string };

export interface BankDetailsService {
  requestChange(req: ChangeRequest, now: Date): Promise<number>;
  approve(requestId: number, approver: string, now: Date): Promise<Status>;
  status(requestId: number): Promise<Status>;
  accountOn(memberId: string, day: string): Promise<string | null>;
}

export const SECOND_APPROVAL_ABOVE = 1000;
