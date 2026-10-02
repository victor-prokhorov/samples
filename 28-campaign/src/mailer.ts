import nodemailer from "nodemailer";
import { SMTP_PORT } from "./db.js";

export const transport = nodemailer.createTransport({ host: "localhost", port: SMTP_PORT, secure: false, ignoreTLS: true, connectionTimeout: 2000 });

export const messageId = (year: number, memberNo: string) => `<statement-${year}-${memberNo}@portal.example>`;

export async function sendStatement(to: string, name: string, year: number, memberNo: string, pdf: Buffer) {
  return transport.sendMail({
    from: "statements@portal.example",
    to,
    subject: `Your ${year} annual statement`,
    messageId: messageId(year, memberNo),
    text: `Hello ${name},\n\nYour ${year} annual statement is attached.\n`,
    attachments: [{ filename: `statement-${year}-${memberNo}.pdf`, content: pdf, contentType: "application/pdf" }],
  });
}

// 4xx and network errors are worth retrying; a 5xx reply is a final answer.
export function classify(err: unknown): { transient: boolean; detail: string } {
  const e = err as { responseCode?: number; response?: string; code?: string; message: string };
  if (e.responseCode) return { transient: e.responseCode < 500, detail: (e.response ?? e.message).trim() };
  return { transient: true, detail: `${e.code ?? "error"}: ${e.message}` };
}
