/**
 * Links oficiais e gratuitos do X (Web Intents e paginas publicas).
 * Docs: https://docs.x.com/x-for-websites/web-intents/overview
 *
 * Nada aqui chama API: cada link abre a tela do proprio X, ja logada no
 * navegador do usuario, e a acao so acontece quando ELE confirma la.
 * Roda no navegador e no servidor (sem segredos).
 */

const X = "https://x.com";

/** Normaliza "@Fulano", "x.com/fulano", "https://twitter.com/fulano/" -> "fulano". */
export function normalizeHandle(input: string): string | null {
  let s = input.trim();
  const m = s.match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/([^/?#]+)/i);
  if (m) s = m[1];
  s = s.replace(/^@/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(s) ? s : null;
}

export interface PostRef { id: string; handle: string | null; url: string }

/** Aceita link de post (x.com, twitter.com, mobile) ou so o ID numerico. */
export function parsePostRef(input: string): PostRef | null {
  const s = input.trim();
  if (/^\d{1,25}$/.test(s)) return { id: s, handle: null, url: `${X}/i/status/${s}` };
  const m = s.match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/(?:([A-Za-z0-9_]{1,15})|i(?:\/web)?)\/status(?:es)?\/(\d{1,25})/i);
  if (!m) return null;
  const handle = m[1] ?? null;
  return { id: m[2], handle, url: `${X}/${handle ?? "i"}/status/${m[2]}` };
}

/** Tela de novo post do X ja preenchida. Com inReplyTo vira resposta. */
export function postIntent(text: string, inReplyTo?: string | null): string {
  const u = new URL(`${X}/intent/tweet`);
  u.searchParams.set("text", text);
  if (inReplyTo) u.searchParams.set("in_reply_to", inReplyTo);
  return u.toString();
}

/** Tela de repost do X. */
export function repostIntent(postId: string): string {
  return `${X}/intent/retweet?tweet_id=${encodeURIComponent(postId)}`;
}

export type SearchKind = "recentes" | "destaques" | "perfis" | "midia";
const SEARCH_F: Record<SearchKind, string | null> = { recentes: "live", destaques: null, perfis: "user", midia: "media" };

export function searchUrl(q: string, kind: SearchKind = "recentes"): string {
  const u = new URL(`${X}/search`);
  u.searchParams.set("q", q.trim());
  u.searchParams.set("src", "typed_query");
  const f = SEARCH_F[kind];
  if (f) u.searchParams.set("f", f);
  return u.toString();
}

export const X_PAGES = {
  feed: `${X}/home`,
  explorar: `${X}/explore`,
  notificacoes: `${X}/notifications`,
  mencoes: `${X}/notifications/mentions`,
} as const;

export function profileUrl(handle: string): string {
  return `${X}/${encodeURIComponent(handle)}`;
}

/** Busca "conversas com voce": mencoes recentes ao @handle. */
export function mentionsSearchUrl(handle: string): string {
  return searchUrl(`@${handle}`, "recentes");
}
