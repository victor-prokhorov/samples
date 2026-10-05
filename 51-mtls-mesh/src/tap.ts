// A TCP relay that keeps a copy of every byte it forwards: what anyone on the path between two services could read
// (a compromised host, a misconfigured network tap, a packet capture). It does not decrypt anything.
import { type Server, createServer, connect } from "node:net";

export type TapStats = { connections: number; bytes: number; sawCard: boolean; strings: string[] };

export class Tap {
  private server?: Server;
  private chunks: Buffer[] = [];
  private connections = 0;
  constructor(private target: { host: string; port: number }, private needle: string) {}

  async listen(port = 0, host = "127.0.0.1") {
    this.server = createServer((client) => {
      this.connections++;
      const upstream = connect(this.target.port, this.target.host);
      const keep = (b: Buffer) => this.chunks.push(Buffer.from(b));
      client.on("data", keep);
      upstream.on("data", keep);
      client.pipe(upstream).pipe(client);
      const end = () => { client.destroy(); upstream.destroy(); };
      client.on("error", end);
      upstream.on("error", end);
      client.on("close", end);
      upstream.on("close", end);
    });
    await new Promise<void>((r) => this.server!.listen(port, host, r));
    return (this.server.address() as { port: number }).port;
  }

  reset() {
    this.chunks = [];
    this.connections = 0;
  }

  // Like strings(1): runs of 6 or more word-like characters, which is what a reader of the capture would see.
  stats(): TapStats {
    const all = Buffer.concat(this.chunks);
    const strings = [...new Set(all.toString("latin1").match(/[A-Za-z0-9._\/:=-]{6,}/g) ?? [])];
    return { connections: this.connections, bytes: all.length, sawCard: all.includes(this.needle), strings };
  }

  close() {
    return new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r()));
  }
}
