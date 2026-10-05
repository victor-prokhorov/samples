// payments in the mesh: plaintext gRPC, bound to 127.0.0.1 so that only its sidecar (same network namespace) can reach it.
// No certificate, no TLS code: the sidecar terminates mTLS, checks who is calling and passes the identity in a header.
import * as grpc from "@grpc/grpc-js";
import { startPayments } from "./payments.js";

const { port } = await startPayments({ host: "127.0.0.1", port: 50051, credentials: grpc.ServerCredentials.createInsecure() });
console.log(`[payments] plaintext gRPC on 127.0.0.1:${port}, behind its sidecar on :15443`);
