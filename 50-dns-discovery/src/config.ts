// Shared by the probe (in the network) and the demo (on the host).
export const PROBE_PORT = 53060;
// How long the cached and resilient clients keep a DNS answer. Short so the demo can wait it out;
// Docker's DNS itself says 600 s, and a client honouring that would be blind for ten minutes.
export const CACHE_MS = 12000;

export type RunResult = {
  client: string;
  how: string;
  sent: number;
  byIp: Record<string, number>;
  errors: Record<string, number>;
  retried: number;
  p50: number;
  max: number;
  ms: number;
};
