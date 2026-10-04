// Accept-Language (RFC 9110): ranges with q-values, highest first; each matched exactly, then by its primary language (RFC 4647 lookup).
// q=0 means "not this one": a supported language named with q=0 is never chosen, also not through "*".
export function negotiate(header: string | undefined, supported: string[], fallback: string): string {
  const parsed = (header ?? "")
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.slice(2)) : 1, i };
    })
    .filter((r) => r.tag);
  const refused = new Set(parsed.filter((r) => r.q === 0).map((r) => r.tag));
  const allowed = supported.filter((s) => !refused.has(s.toLowerCase()));
  const ranges = parsed.filter((r) => r.q > 0).sort((a, b) => b.q - a.q || a.i - b.i);
  for (const r of ranges) {
    if (r.tag === "*") return allowed[0] ?? fallback;
    const exact = allowed.find((s) => s.toLowerCase() === r.tag);
    if (exact) return exact;
    const primary = allowed.find((s) => s.toLowerCase() === r.tag.split("-")[0]);
    if (primary) return primary;
  }
  return fallback;
}
