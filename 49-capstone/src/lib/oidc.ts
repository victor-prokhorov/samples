// The relying party of 26-sso (openid-client), shared by the /login and /callback route handlers.
import * as oidc from "openid-client";
import { APP, CLIENT_ID, CLIENT_SECRET, IDP } from "../config";

export const REDIRECT_URI = `${APP}/callback`;
export const SCOPE = "openid email profile portal";

// Discovery once per process; forgotten on failure, so a portal started before its IdP recovers.
const g = globalThis as unknown as { oidcConfig?: Promise<oidc.Configuration> };
export function config(): Promise<oidc.Configuration> {
  g.oidcConfig ??= oidc
    .discovery(new URL(IDP), CLIENT_ID, CLIENT_SECRET, undefined, {
      // Plain HTTP for the sample, so the ID token signature is checked too (over TLS it is optional).
      execute: [oidc.allowInsecureRequests, oidc.enableNonRepudiationChecks],
    })
    .catch((e) => {
      g.oidcConfig = undefined;
      throw e;
    });
  return g.oidcConfig;
}

export { oidc };

// Only a path on this site: "//evil.example" or "/\evil.example" would leave it (26-sso's localPath).
export function localPath(want: string | null | undefined, fallback = "/") {
  try {
    const u = new URL(want ?? fallback, APP);
    return u.origin === new URL(APP).origin && !u.pathname.startsWith("//") ? u.pathname + u.search : fallback;
  } catch {
    return fallback;
  }
}
