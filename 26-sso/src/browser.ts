// A browser reduced to what the redirect dance needs: a cookie jar per host and redirects followed one hop at a time, each hop logged.
type Cookie = { name: string; value: string; host: string; path: string };

export type Page = { status: number; url: URL; text: string; json?: any };

const short = (v: string) => (v.length > 14 ? `${v.slice(0, 10)}...` : v);

export function fmt(u: URL) {
  const q = [...u.searchParams].map(([k, v]) => `${k}=${k === "redirect_uri" || k === "post_logout_redirect_uri" ? v : short(v)}`).join("&");
  return `${u.host}${u.pathname.replace(/\/(interaction|auth)\/[\w-]{10,}/, (_m, p) => `/${p}/<uid>`)}${q ? `?${q}` : ""}`;
}

export class Browser {
  cookies: Cookie[] = [];

  constructor(
    public label: string,
    public log = true,
  ) {}

  private store(url: URL, res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(/;\s*/);
      const name = pair.slice(0, pair.indexOf("="));
      const value = pair.slice(pair.indexOf("=") + 1);
      const attr = Object.fromEntries(attrs.map((a) => [a.split("=")[0].toLowerCase(), a.split("=")[1] ?? ""]));
      const path = attr.path || "/";
      this.cookies = this.cookies.filter((c) => !(c.name === name && c.host === url.host && c.path === path));
      const expired = attr["max-age"] !== undefined ? Number(attr["max-age"]) <= 0 : attr.expires ? Date.parse(attr.expires) <= Date.now() : false;
      if (!expired) this.cookies.push({ name, value, host: url.host, path });
    }
  }

  cookieHeader(url: URL) {
    return this.cookies
      .filter((c) => c.host === url.host && url.pathname.startsWith(c.path))
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
  }

  forget(host: string) {
    this.cookies = this.cookies.filter((c) => c.host !== host);
  }

  async request(method: string, url: URL, form?: Record<string, string>) {
    const headers: Record<string, string> = {};
    const cookie = this.cookieHeader(url);
    if (cookie) headers.cookie = cookie;
    let body: string | undefined;
    if (form) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(form).toString();
    }
    const res = await fetch(url, { method, headers, body, redirect: "manual" });
    this.store(url, res);
    const text = await res.text();
    const location = res.headers.get("location");
    const setCookies = res.headers.getSetCookie().map((c) => c.split(";")[0].split("=")[0] + (/httponly/i.test(c) ? " (HttpOnly)" : ""));
    if (this.log) {
      const extra = location ? ` -> ${fmt(new URL(location, url))}` : "";
      const sc = setCookies.length ? ` [set-cookie: ${setCookies.join(", ")}]` : "";
      console.log(`   ${this.label}: ${method} ${fmt(url)} -> ${res.status}${extra}${sc}`);
    }
    return { res, text, location: location ? new URL(location, url) : undefined };
  }

  // Follows redirects (as GET) until a non-redirect, or until `stop` says the next URL should be handed back unvisited.
  async go(method: string, start: string | URL, opts: { form?: Record<string, string>; stop?: (u: URL) => boolean; rewrite?: (u: URL) => URL } = {}): Promise<{ page?: Page; stoppedAt?: URL }> {
    let url = new URL(start);
    let r = await this.request(method, url, opts.form);
    while (r.location && r.res.status >= 300 && r.res.status < 400) {
      let next = r.location;
      if (opts.rewrite) next = opts.rewrite(next);
      if (opts.stop?.(next)) return { stoppedAt: next };
      url = next;
      r = await this.request("GET", url);
    }
    const page: Page = { status: r.res.status, url, text: r.text };
    if (r.res.headers.get("content-type")?.includes("json")) page.json = JSON.parse(r.text);
    return { page };
  }
}
