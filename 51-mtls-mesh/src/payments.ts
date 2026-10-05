// The payments service. The same handler runs in every mode; only the credentials it is started with change.
// Who called comes from the TLS peer certificate (in-app mTLS) or from the header the sidecar adds (mesh).
import { randomUUID } from "node:crypto";
import * as grpc from "@grpc/grpc-js";
import { type ChargeReply, type ChargeRequest, Payments } from "./grpc.js";

export type PaymentsOptions = {
  host: string;
  port: number;
  credentials: grpc.ServerCredentials;
  // In-app authorization: which SPIFFE ids may call Charge. Empty: anyone who got through the transport.
  allow?: string[];
};

const uriSan = (san: string | undefined) => san?.split(", ").find((s) => s.startsWith("URI:"))?.slice(4);

// x-forwarded-client-cert: By=spiffe://.../payments;Hash=...;URI=spiffe://.../orders (set by the payments sidecar)
const xfccUri = (h: string | undefined) => h?.split(";").find((p) => p.startsWith("URI="))?.slice(4);

export function callerOf(call: grpc.ServerUnaryCall<ChargeRequest, ChargeReply>) {
  const fromCert = uriSan(call.getAuthContext()?.sslPeerCertificate?.subjectaltname);
  if (fromCert) return { caller: fromCert, via: "peer certificate" };
  const fromSidecar = xfccUri(call.metadata.get("x-forwarded-client-cert")[0]?.toString());
  if (fromSidecar) return { caller: fromSidecar, via: "x-forwarded-client-cert" };
  return { caller: "unknown", via: "none" };
}

export async function startPayments(opts: PaymentsOptions) {
  const server = new grpc.Server();
  const seen: { caller: string; via: string; orderId: string }[] = [];
  server.addService(Payments.service, {
    charge(call: grpc.ServerUnaryCall<ChargeRequest, ChargeReply>, cb: grpc.sendUnaryData<ChargeReply>) {
      const { caller, via } = callerOf(call);
      if (opts.allow?.length && !opts.allow.includes(caller)) {
        return cb({ code: grpc.status.PERMISSION_DENIED, details: `${caller} may not call Charge` });
      }
      seen.push({ caller, via, orderId: call.request.orderId });
      cb(null, { paymentId: `pay_${randomUUID().slice(0, 8)}`, caller });
    },
  });
  const port = await new Promise<number>((resolve, reject) =>
    server.bindAsync(`${opts.host}:${opts.port}`, opts.credentials, (err, p) => (err ? reject(err) : resolve(p))),
  );
  return { port, seen, stop: () => new Promise<void>((r) => server.tryShutdown(() => r())) };
}
