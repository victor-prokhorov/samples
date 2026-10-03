// Ports (port rule: HTTP 53010+42, a second process 53110+42, and the attacker on 53252).
export const INSECURE_PORT = 53052;
export const HARDENED_PORT = 53152;
export const INSECURE = `http://localhost:${INSECURE_PORT}`;
export const HARDENED = `http://localhost:${HARDENED_PORT}`;
export const ATTACKER = "http://localhost:53252";
// The same attacker server reached under another host name: a different *site*, not just a different origin.
export const ATTACKER_CROSS_SITE = "http://127.0.0.1:53252";
