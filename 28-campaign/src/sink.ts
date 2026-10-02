import { pathToFileURL } from "node:url";
import { SMTPServer } from "smtp-server";
import { SMTP_PORT } from "./db.js";

export type Delivery = { to: string; messageId: string; subject: string; bytes: number; at: number };

// Scripted failures, standing in for a real MTA: a greylisted mailbox, an unknown one, and one whose server is down all week.
const FAULTS: Record<string, { code: number; text: string; times: number }> = {
  "bob@acme.example": { code: 451, text: "4.7.1 greylisted, try again later", times: 2 },
  "carol@acme.example": { code: 550, text: "5.1.1 mailbox unknown", times: Infinity },
  "dan@acme.example": { code: 451, text: "4.3.0 mailbox temporarily unavailable", times: Infinity },
};

export class Sink {
  deliveries: Delivery[] = [];
  private seen = new Map<string, number>();
  private server: SMTPServer;

  constructor(faults = true, onDelivery?: (d: Delivery) => void) {
    this.server = new SMTPServer({
      authOptional: true,
      disabledCommands: ["STARTTLS", "AUTH"],
      logger: false,
      onRcptTo: (address, _session, callback) => {
        const f = faults ? FAULTS[address.address] : undefined;
        const n = (this.seen.get(address.address) ?? 0) + 1;
        this.seen.set(address.address, n);
        if (f && n <= f.times) return callback(Object.assign(new Error(f.text), { responseCode: f.code }));
        callback();
      },
      onData: (stream, session, callback) => {
        const chunks: Buffer[] = [];
        stream.on("data", (c: Buffer) => chunks.push(c));
        stream.on("end", () => {
          const raw = Buffer.concat(chunks).toString("latin1");
          const header = (name: string) => new RegExp(`^${name}: (.*)$`, "mi").exec(raw.split("\r\n\r\n")[0])?.[1] ?? "";
          for (const r of session.envelope.rcptTo) {
            const d = { to: r.address, messageId: header("Message-ID"), subject: header("Subject"), bytes: raw.length, at: Date.now() };
            this.deliveries.push(d);
            onDelivery?.(d);
          }
          callback();
        });
      },
    });
  }

  listen() {
    return new Promise<void>((resolve) => this.server.listen(SMTP_PORT, "127.0.0.1", resolve));
  }

  reset() {
    this.deliveries = [];
    this.seen.clear();
  }

  copies() {
    const by = new Map<string, Delivery[]>();
    for (const d of this.deliveries) by.set(d.to, [...(by.get(d.to) ?? []), d]);
    return by;
  }

  close() {
    return new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sink = new Sink(true, (d) => console.log(`received ${d.messageId} for ${d.to} (${d.bytes} bytes)`));
  await sink.listen();
  console.log(`SMTP sink on :${SMTP_PORT} (scripted faults for bob, carol, dan); Ctrl-C to stop`);
}
