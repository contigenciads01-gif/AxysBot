import "server-only";
import { cache } from "react";
import { db } from "./supabase";
import type { Post, PostStatus, XAccount } from "./types";
import { estimateThreadCost } from "./cost";

/** Conta conectada (o painel opera uma conta). React.cache deduplica por request. */
export const getAccount = cache(async (): Promise<XAccount | null> => {
  const { data } = await db()
    .from("x_accounts")
    .select("id,x_user_id,username,display_name,avatar_url,token_expires_at,scopes,connected_at")
    .neq("access_token", "revogado")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle<XAccount>();
  return data ?? null;
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
  const cost = estimateThreadCost(items).total;
  const { data: post, error } = await db()
    .from("posts")
    .insert({ account_id: accountId, status, scheduled_for: input.scheduledFor, est_cost_usd: cost })
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
  if (status === "agendado") patch.attempts = 0;
  const { error } = await db().from("posts").update(patch).eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}

export async function deletePost(accountId: string, id: string) {
  const { error } = await db().from("posts").delete().eq("id", id).eq("account_id", accountId).neq("status", "publicado");
  if (error) throw error;
}

// ------------------------------------------------------------------ dashboard
export interface DashboardData {
  metrics: { day: string; followers: number | null; impressions: number | null; likes: number | null; replies: number | null; reposts: number | null }[];
  queue: { agendado: number; publicado7d: number; falhou: number; proximo: string | null };
  spend: { monthUsd: number; budgetUsd: number; byOp: Record<string, number> };
  perDay: { day: string; count: number }[];
  runs: { kind: string; ok: boolean; detail: string | null; at: string; duration_ms: number | null }[];
  openMentions: number;
}

export async function getDashboard(accountId: string): Promise<DashboardData> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const d30 = new Date(now.getTime() - 30 * 864e5).toISOString().slice(0, 10);
  const d14 = new Date(now.getTime() - 14 * 864e5).toISOString();
  const d7 = new Date(now.getTime() - 7 * 864e5).toISOString();
  const c = db();

  // Tudo em paralelo (vercel-react-best-practices: async-parallel)
  const [metrics, agendados, proximo, publicados, falhos, usage, settings, runs, mentions, perDayRows] = await Promise.all([
    c.from("metrics_daily").select("day,followers,impressions,likes,replies,reposts").eq("account_id", accountId).gte("day", d30).order("day"),
    c.from("posts").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "agendado"),
    c.from("posts").select("scheduled_for").eq("account_id", accountId).eq("status", "agendado").order("scheduled_for").limit(1).maybeSingle(),
    c.from("posts").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "publicado").gte("published_at", d7),
    c.from("posts").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "falhou"),
    c.from("api_usage").select("operation,cost_usd").eq("account_id", accountId).gte("at", monthStart),
    c.from("settings").select("monthly_budget_usd").eq("account_id", accountId).maybeSingle(),
    c.from("run_log").select("kind,ok,detail,at,duration_ms").eq("account_id", accountId).order("at", { ascending: false }).limit(12),
    c.from("mentions").select("x_post_id", { count: "exact", head: true }).eq("account_id", accountId).eq("replied", false),
    c.from("posts").select("published_at").eq("account_id", accountId).eq("status", "publicado").gte("published_at", d14),
  ]);

  const byOp: Record<string, number> = {};
  let monthUsd = 0;
  for (const u of usage.data ?? []) {
    const v = Number(u.cost_usd);
    monthUsd += v;
    byOp[u.operation] = (byOp[u.operation] ?? 0) + v;
  }

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
    spend: { monthUsd: Math.round(monthUsd * 1000) / 1000, budgetUsd: Number(settings.data?.monthly_budget_usd ?? 10), byOp },
    perDay,
    runs: runs.data ?? [],
    openMentions: mentions.count ?? 0,
  };
}
