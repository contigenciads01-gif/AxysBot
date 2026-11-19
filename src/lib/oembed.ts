import "server-only";

/**
 * Embed oficial do X (oEmbed). Gratuito, sem chave e sem login:
 * https://docs.x.com/x-for-websites/oembed-api
 * So aceita o HTML que o X devolve no formato esperado (blockquote), sem <script>.
 */
export interface Embed { html: string; author_name: string; author_url: string; url: string }

const ENDPOINT = process.env.X_OEMBED_BASE ?? "https://publish.twitter.com/oembed";

export class EmbedError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function sanitizeEmbedHtml(html: string): string | null {
  const clean = html.replace(/<script[\s\S]*?<\/script>/gi, "").trim();
  if (!/^<blockquote class="twitter-(tweet|timeline)"/i.test(clean)) return null;
  if (/\son\w+\s*=|javascript:/i.test(clean)) return null;
  return clean;
}

export async function fetchEmbed(url: string, opts: { theme?: "light" | "dark"; fetchImpl?: typeof fetch } = {}): Promise<Embed> {
  const u = new URL(ENDPOINT);
  u.searchParams.set("url", url);
  u.searchParams.set("omit_script", "true");
  u.searchParams.set("dnt", "true");
  u.searchParams.set("lang", "pt");
  if (opts.theme === "dark") u.searchParams.set("theme", "dark");
  let r: Response;
  try {
    r = await (opts.fetchImpl ?? fetch)(u, { headers: { accept: "application/json" }, next: { revalidate: 300 } } as RequestInit);
  } catch {
    throw new EmbedError("Não consegui falar com o X agora. Tente de novo em instantes.", 502);
  }
  if (r.status === 404) throw new EmbedError("Esse post não existe, foi apagado ou é de uma conta protegida.", 404);
  if (r.status === 403) throw new EmbedError("O autor não permite que esse post seja incorporado.", 403);
  if (!r.ok) throw new EmbedError(`O X recusou o embed (HTTP ${r.status}).`, 502);
  const j = (await r.json()) as { html?: string; author_name?: string; author_url?: string; url?: string };
  const html = j.html ? sanitizeEmbedHtml(j.html) : null;
  if (!html) throw new EmbedError("O X devolveu um embed em formato inesperado.", 502);
  return { html, author_name: j.author_name ?? "", author_url: j.author_url ?? "", url: j.url ?? url };
}
