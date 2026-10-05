// The Payments service definition, loaded from proto/payments.proto at runtime (no generated code).
import * as grpc from "@grpc/grpc-js";
import * as loader from "@grpc/proto-loader";

const def = loader.loadSync(new URL("../proto/payments.proto", import.meta.url).pathname, { keepCase: false, longs: Number, defaults: true });
const pkg = grpc.loadPackageDefinition(def) as unknown as {
  payments: { Payments: grpc.ServiceClientConstructor };
};

export const Payments = pkg.payments.Payments;
export type ChargeRequest = { orderId: string; cardNumber: string; amountCents: number };
export type ChargeReply = { paymentId: string; caller: string };

export type Outcome = { ok: true; reply: ChargeReply } | { ok: false; code: string; details: string };

// One Charge call with a deadline; the outcome names the gRPC status rather than throwing.
export function charge(client: grpc.Client, req: ChargeRequest, timeoutMs = 3000): Promise<Outcome> {
  return new Promise((resolve) => {
    (client as unknown as { charge: Function }).charge(req, { deadline: Date.now() + timeoutMs }, (err: grpc.ServiceError | null, reply: ChargeReply) => {
      if (err) resolve({ ok: false, code: grpc.status[err.code] ?? String(err.code), details: err.details });
      else resolve({ ok: true, reply });
    });
  });
}

export const CARD = "4111111111111111";
