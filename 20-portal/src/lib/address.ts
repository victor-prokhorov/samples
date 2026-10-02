import { z } from "zod";

export type Fields = { line1: string; city: string; postcode: string; effectiveFrom: string };
export type FormState = { values: Fields; errors: Partial<Record<keyof Fields | "form", string[]>> };

const today = () => new Date().toISOString().slice(0, 10);

export const AddressChange = z.object({
  line1: z.string().trim().min(1, "Enter the first line of the address").max(100, "Use 100 characters or fewer"),
  city: z.string().trim().min(1, "Enter the town or city"),
  postcode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/, "Enter a real postcode, like AB1 2CD"),
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date the new address applies from")
    .refine((d) => d >= today(), "The date cannot be in the past"),
});
