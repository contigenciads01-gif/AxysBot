import "server-only";
import { db, logRun } from "./supabase";
import { decrypt, encrypt } from "./crypto";
import { refreshTokens, XAuthError } from "./x-oauth";
import { X_PRICES_USD, opForPost, type BillableOp } from "./cost";

export const X_API = `${process.env.X_API_BASE || "https://api.x.com"}/2`;

export class XApiError extends Error {
  constructor(message: string, readonly status: number, readonly resetAt?: Date) { super(message); }
  get isRateLimited() { return this.status === 429; }
  /** 4xx (exceto 429) nao adianta repetir */
  get isPermanent() { return this.status >= 400 && this.status < 500 && this.status !== 429; }
}

interface AccountRow {
  id: string;
  x_user_id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
}

/** Registra uma operacao cobravel. Nunca derruba a operacao principal. */
export async function recordUsage(accountId: string, op: BillableOp, units = 1) {
  if (units <= 0) return;
  try {
    await db().from("api_usage").insert({
      account_id: accountId, operation: op, units, cost_usd: X_PRICES_USD[op] * units,
    });
  } catch { /* ignorado */ }
}

// Evita dois refresh simultaneos na mesma instancia: o X rotaciona o refresh
// token, entao o segundo refresh com o token antigo receberia invalid_grant.
const inflight = new Map<string, Promise<string>>();

export async function getAccessToken(accountId: string): Promise<string> {
  const pending = inflight.get(accountId);
  if (pending) return pending;
  const p = loadOrRefresh(accountId).finally(() => inflight.delete(accountId));
  inflight.set(accountId, p);
  return p;
}

async function loadOrRefresh(accountId: string, retried = false): Promise<string> {
  const { data, error } = await db()
    .from("x_accounts")
    .select("id,x_user_id,access_token,refresh_token,token_expires_at")
    .eq("id", accountId)
    .single<AccountRow>();
  if (error || !data) throw new Error("Conta do X nao encontrada — conecte em Ajustes");
  if (data.access_token === "revogado") throw new XAuthError("Conta do X desconectada — conecte em Ajustes");

  const expiresAt = data.token_expires_at ? Date.parse(data.token_expires_at) : 0;
  if (expiresAt - Date.now() > 120_000) return decrypt(data.access_token);
  if (!data.refresh_token) throw new XAuthError("Sessao do X expirou — reconecte em Ajustes");

  try {
    const t = await refreshTokens(decrypt(data.refresh_token));
    await db().from("x_accounts").update({
      access_token: encrypt(t.access_token),
      refresh_token: t.refresh_token ? encrypt(t.refresh_token) : data.refresh_token,
      token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    }).eq("id", accountId);
    return t.access_token;
  } catch (e) {
    // Outra instancia (outro cron) pode ter feito refresh antes e gravado um
    // token novo. Relemos uma vez antes de desistir.
    if (e instanceof XAuthError && e.needsReconnect && !retried) {
      await new Promise((r) => setTimeout(r, 400));
      return loadOrRefresh(accountId, true);
    }
    throw e;
  }
}

async function call<T>(accountId: string, path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken(accountId);
  const res = await fetch(X_API + path, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reset = res.headers.get("x-rate-limit-reset");
    const msg =
      body?.detail || body?.title || body?.errors?.[0]?.message ||
      (res.status === 429 ? "Limite de requisicoes do X atingido" : `Erro ${res.status} na API do X`);
    throw new XApiError(traduzErro(msg, res.status), res.status, reset ? new Date(Number(reset) * 1000) : undefined);
  }
  return body as T;
}

/** Mensagens frequentes do X em portugues; o resto passa como veio. */
export function traduzErro(msg: string, status: number): string {
  const m = msg.toLowerCase();
  if (m.includes("duplicate content")) return "O X recusou: texto igual a um post recente seu.";
  if (status === 429) return "Limite de requisições do X atingido. O agendador tenta de novo depois.";
  if (status === 401) return "O X não aceitou o acesso. Reconecte a conta em Ajustes.";
  if (m.includes("not permitted") || m.includes("forbidden")) return `O X recusou a publicação: ${msg}`;
  if (status === 402 || m.includes("credits") || m.includes("payment")) return "Sem créditos na API do X. Recarregue no Developer Console.";
  return msg;
}

// ------------------------------------------------------------------ usuario
export interface XUser {
  id: string; username: string; name: string; profile_image_url?: string;
  public_metrics?: { followers_count: number; following_count: number; tweet_count: number };
}

export async function getMe(accountId: string): Promise<XUser> {
  const r = await call<{ data: XUser }>(accountId,
    "/users/me?user.fields=profile_image_url,public_metrics");
  await recordUsage(accountId, "user_read");
  return r.data;
}

/** Variante usada no callback do OAuth, antes de a conta existir no banco. */
export async function getMeWithToken(accessToken: string): Promise<XUser> {
  const res = await fetch(`${X_API}/users/me?user.fields=profile_image_url,public_metrics`, {
    headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new XApiError(body?.detail || `Erro ${res.status} ao ler perfil`, res.status);
  return body.data as XUser;
}

// ------------------------------------------------------------------ publicar
export async function createPost(accountId: string, text: string, replyTo?: string): Promise<string> {
  const payload: Record<string, unknown> = { text };
  if (replyTo) payload.reply = { in_reply_to_tweet_id: replyTo };
  const r = await call<{ data: { id: string } }>(accountId, "/tweets", {
    method: "POST", body: JSON.stringify(payload),
  });
  await recordUsage(accountId, opForPost(text));
  return r.data.id;
}

/**
 * Publica uma thread como cadeia de respostas. Se parar no meio, devolve o
 * que ja saiu — quem chama grava os ids para retomar sem duplicar.
 */
export async function publishThread(
  accountId: string,
  items: { position: number; body: string; x_post_id: string | null }[],
  onItem: (position: number, xPostId: string) => Promise<void>,
): Promise<string> {
  const ordered = [...items].sort((a, b) => a.position - b.position);
  let previous: string | undefined;
  let first: string | undefined;
  for (const it of ordered) {
    // retomada: item ja publicado numa tentativa anterior
    if (it.x_post_id) { previous = it.x_post_id; first ??= it.x_post_id; continue; }
    const id = await createPost(accountId, it.body, previous);
    await onItem(it.position, id);
    previous = id;
    first ??= id;
  }
  if (!first) throw new Error("Thread sem itens");
  return first;
}

// ------------------------------------------------------------------ leitura
export interface XTweet {
  id: string; text: string; created_at?: string; author_id?: string;
  public_metrics?: { impression_count?: number; like_count: number; reply_count: number; retweet_count: number; quote_count: number; bookmark_count?: number };
}

export async function getTweetsMetrics(accountId: string, ids: string[]): Promise<XTweet[]> {
  const out: XTweet[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const r = await call<{ data?: XTweet[] }>(accountId,
      `/tweets?ids=${batch.join(",")}&tweet.fields=public_metrics,created_at`);
    out.push(...(r.data ?? []));
    await recordUsage(accountId, "post_read", r.data?.length ?? 0);
  }
  return out;
}

export async function getMentions(accountId: string, xUserId: string, sinceId?: string) {
  const q = new URLSearchParams({
    max_results: "50",
    "tweet.fields": "created_at,author_id",
    expansions: "author_id",
    "user.fields": "username,name",
  });
  if (sinceId) q.set("since_id", sinceId); // so o que e novo: nao paga leitura repetida
  const r = await call<{
    data?: XTweet[]; includes?: { users?: { id: string; username: string; name: string }[] };
  }>(accountId, `/users/${xUserId}/mentions?${q}`);
  await recordUsage(accountId, "post_read", r.data?.length ?? 0);
  const users = new Map((r.includes?.users ?? []).map((u) => [u.id, u]));
  return (r.data ?? []).map((t) => ({ ...t, author: t.author_id ? users.get(t.author_id) : undefined }));
}

export { logRun };
