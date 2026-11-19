import "server-only";
import { cache } from "react";
import { db } from "./supabase";
import type { Post, PostStatus, XAccount } from "./types";
import { parsePostRef } from "./intents";

/** Conta conectada (o painel opera uma conta). React.cache deduplica por request. */
export const getAccount = cache(async (): Promise<XAccount | null> => {
  const { data } = await db()
    .from("x_accounts")
    .select("id,x_user_id,username,display_name,avatar_url,token_expires_at,scopes,connected_at")
    .neq("access_token", "revogado")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle<XAccount>();

  if (data) return data;

  // Fallback para platform_accounts (farm / modelo conectada)
  const { data: pData } = await db()
    .from("platform_accounts")
    .select("id,x_user_id,username,display_name,avatar_url,token_expires_at,scopes,connected_at")
    .eq("is_active", true)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle<XAccount>();

  return pData ?? null;
});

export async function listPosts(accountId: string, opts: { status?: PostStatus[]; from?: string; to?: string; limit?: number } = {}): Promise<Post[]> {
  let q = db()
    .from("posts")
    .select("*, items:post_items(*)")
    .eq("account_id", accountId)
    .order("scheduled_for", { ascending: true, nullsFirst: false })
    .limit(opts.limit ?? 200);
  if (opts.status?.length) q = q.in("status", opts.status);
  if (opts.from) q = q.gte("scheduled_for", opts.from);
  if (opts.to) q = q.lt("scheduled_for", opts.to);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((p) => ({ ...p, items: [...(p.items ?? [])].sort((a, b) => a.position - b.position) })) as Post[];
}

export async function createPost(accountId: string, input: { items: string[]; scheduledFor: string | null }) {
  const items = input.items.map((s) => s.trim()).filter(Boolean);
  if (!items.length) throw new Error("O post precisa de texto");
  const status: PostStatus = input.scheduledFor ? "agendado" : "rascunho";
  const { data: post, error } = await db()
    .from("posts")
    .insert({ account_id: accountId, status, scheduled_for: input.scheduledFor })
    .select("id")
    .single<{ id: string }>();
  if (error || !post) throw error ?? new Error("Falha ao criar post");
  const { error: e2 } = await db()
    .from("post_items")
    .insert(items.map((body, position) => ({ post_id: post.id, position, body })));
  if (e2) {
    await db().from("posts").delete().eq("id", post.id); // nao deixa post orfao
    throw e2;
  }
  return post.id;
}

export async function setPostStatus(accountId: string, id: string, status: PostStatus, scheduledFor?: string | null) {
  const patch: Record<string, unknown> = { status, error: null };
  if (scheduledFor !== undefined) patch.scheduled_for = scheduledFor;
  if (status === "agendado") { patch.attempts = 0; patch.claimed_at = null; }
  const { error } = await db().from("posts").update(patch).eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}

/**
 * Voce publicou no X (pela tela do proprio X). Grava os links que colou:
 * o ID de cada post e o que permite encadear a thread e medir depois.
 */
export async function confirmPublished(accountId: string, id: string, links: (string | null | undefined)[]) {
  const { data: post, error } = await db().from("posts").select("id,status, items:post_items(position)")
    .eq("id", id).eq("account_id", accountId).maybeSingle<{ id: string; status: PostStatus; items: { position: number }[] }>();
  if (error) throw error;
  if (!post) throw Object.assign(new Error("Post não encontrado."), { status: 404 });
  const ids = links.map((l) => (l ? parsePostRef(l)?.id ?? null : null));
  for (const [position, xId] of ids.entries()) {
    if (!xId) continue;
    const { error: e } = await db().from("post_items").update({ x_post_id: xId }).eq("post_id", id).eq("position", position);
    if (e) throw e;
  }
  const { error: e2 } = await db().from("posts").update({
    status: "publicado", published_at: new Date().toISOString(), x_post_id: ids[0] ?? null, error: null,
  }).eq("id", id).eq("account_id", accountId);
  if (e2) throw e2;
  return { items: post.items.length, linked: ids.filter(Boolean).length };
}

export async function deletePost(accountId: string, id: string) {
  const { error } = await db().from("posts").delete().eq("id", id).eq("account_id", accountId).neq("status", "publicado");
  if (error) throw error;
}

// ------------------------------------------------------------------ dashboard
export interface DashboardData {
  metrics: { day: string; followers: number | null; impressions: number | null; likes: number | null; replies: number | null; reposts: number | null }[];
  queue: { agendado: number; publicado7d: number; falhou: number; proximo: string | null };
  ready: number;
  perDay: { day: string; count: number }[];
  runs: { kind: string; ok: boolean; detail: string | null; at: string; duration_ms: number | null }[];
}

export async function getDashboard(accountId: string): Promise<DashboardData> {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 864e5).toISOString().slice(0, 10);
  const d14 = new Date(now.getTime() - 14 * 864e5).toISOString();
  const d7 = new Date(now.getTime() - 7 * 864e5).toISOString();
  const c = db();

  // Tudo em paralelo (vercel-react-best-practices: async-parallel)
  const [metrics, agendados, proximo, publicados, falhos, prontos, runs, perDayRows] = await Promise.all([
    c.from("metrics_daily").select("day,followers,impressions,likes,replies,reposts").eq("account_id", accountId).gte("day", d30).order("day"),
    c.from("posts").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "agendado"),
    c.from("posts").select("scheduled_for").eq("account_id", accountId).eq("status", "agendado").order("scheduled_for").limit(1).maybeSingle(),
    c.from("posts").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "publicado").gte("published_at", d7),
    c.from("posts").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "falhou"),
    c.from("posts").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "agendado").lte("scheduled_for", now.toISOString()),
    c.from("run_log").select("kind,ok,detail,at,duration_ms").eq("account_id", accountId).order("at", { ascending: false }).limit(12),
    c.from("posts").select("published_at").eq("account_id", accountId).eq("status", "publicado").gte("published_at", d14),
  ]);

  // publicacoes por dia, 14 dias, preenchendo dias vazios com zero
  const counts = new Map<string, number>();
  for (const r of perDayRows.data ?? []) {
    const k = String(r.published_at).slice(0, 10);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const perDay = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(now.getTime() - (13 - i) * 864e5).toISOString().slice(0, 10);
    return { day, count: counts.get(day) ?? 0 };
  });

  return {
    metrics: metrics.data ?? [],
    queue: {
      agendado: agendados.count ?? 0,
      publicado7d: publicados.count ?? 0,
      falhou: falhos.count ?? 0,
      proximo: (proximo.data as { scheduled_for: string } | null)?.scheduled_for ?? null,
    },
    ready: prontos.count ?? 0,
    perDay,
    runs: runs.data ?? [],
  };
}
