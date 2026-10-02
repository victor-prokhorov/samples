// Accept-Language (RFC 9110): ranges with q-values, highest first; each matched exactly, then by its primary language (RFC 4647 lookup).
export function negotiate(header: string | undefined, supported: string[], fallback: string): string {
  const ranges = (header ?? "")
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.slice(2)) : 1, i };
    })
    .filter((r) => r.tag && r.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const r of ranges) {
    if (r.tag === "*") return fallback;
    const exact = supported.find((s) => s.toLowerCase() === r.tag);
    if (exact) return exact;
    const primary = supported.find((s) => s.toLowerCase() === r.tag.split("-")[0]);
    if (primary) return primary;
  }
  return fallback;
}
