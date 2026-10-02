const VOID = new Set(["meta", "link", "br", "input", "img", "hr"]);

export type TextNode = { text: string; path: string[]; attrs: Record<string, string>[] };

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&amp;/g, "&");

// Just enough HTML parsing for server-rendered pages we wrote: text nodes with their ancestors' tags and attributes.
export function textNodes(html: string): { lang: string | null; nodes: TextNode[] } {
  const stack: { tag: string; attrs: Record<string, string> }[] = [];
  const nodes: TextNode[] = [];
  let lang: string | null = null;
  for (const m of html.matchAll(/<!.*?>|<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)/g)) {
    if (m[0].startsWith("<!")) continue;
    if (m[4] !== undefined) {
      const text = decode(m[4]).replace(/\s+/g, " ").trim();
      if (text) nodes.push({ text, path: stack.map((s) => s.tag), attrs: stack.map((s) => s.attrs) });
      continue;
    }
    const tag = m[2].toLowerCase();
    if (m[1]) {
      const i = stack.map((s) => s.tag).lastIndexOf(tag);
      if (i >= 0) stack.length = i;
      continue;
    }
    const attrs = Object.fromEntries([...m[3].matchAll(/([a-zA-Z-]+)="([^"]*)"/g)].map((a) => [a[1], decode(a[2])]));
    if (tag === "html") lang = attrs.lang ?? null;
    if (!VOID.has(tag)) stack.push({ tag, attrs });
  }
  return { lang, nodes };
}
