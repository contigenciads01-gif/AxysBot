import "server-only";
import { db, logRun } from "./supabase";
import { publishThread, getMe, getMentions, getTweetsMetrics, XApiError } from "./x-api";
import { XAuthError } from "./x-oauth";

/**
 * Publica os posts vencidos. Seguro para rodar em paralelo: a reserva e
 * atomica no banco (claim_due_posts com FOR UPDATE SKIP LOCKED).
 */
export async function runPublisher(maxPosts = 5) {
  const started = Date.now();
  const { data: claimed, error } = await db().rpc("claim_due_posts", { max_posts: maxPosts });
  if (error) throw error;
  const results: { id: string; ok: boolean; detail: string }[] = [];

  for (const post of claimed ?? []) {
    const t0 = Date.now();
    try {
      const { data: items, error: e1 } = await db()
        .from("post_items").select("position,body,x_post_id").eq("post_id", post.id).order("position");
      if (e1) throw e1;

      const first = await publishThread(post.account_id, items ?? [], async (position, xId) => {
        // grava cada item assim que sai: se cair no meio, a retomada nao duplica
        await db().from("post_items").update({ x_post_id: xId }).eq("post_id", post.id).eq("position", position);
      });

      await db().from("posts").update({
        status: "publicado", x_post_id: first, published_at: new Date().toISOString(), error: null,
      }).eq("id", post.id);
      results.push({ id: post.id, ok: true, detail: `publicado ${first}` });
      await logRun({ account_id: post.account_id, kind: "publicar", ok: true, detail: (items?.length ?? 1) > 1 ? `Thread de ${items!.length} posts publicada` : "Post publicado", duration_ms: Date.now() - t0 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const permanent = (e instanceof XApiError && e.isPermanent) || e instanceof XAuthError || post.attempts >= 3;
      // erro transitorio (rede, 5xx, 429): volta pra fila; o claim tenta de novo
      await db().from("posts").update({
        status: permanent ? "falhou" : "agendado",
        error: msg,
        ...(e instanceof XApiError && e.resetAt ? { scheduled_for: e.resetAt.toISOString() } : {}),
      }).eq("id", post.id);
      results.push({ id: post.id, ok: false, detail: msg });
      await logRun({ account_id: post.account_id, kind: "publicar", ok: false, detail: msg, duration_ms: Date.now() - t0 });
    }
  }
  return { claimed: claimed?.length ?? 0, results, ms: Date.now() - started };
}

/**
 * Sincroniza metricas do perfil + dos posts dos ultimos 7 dias, e mencoes
 * novas. Custo controlado: metricas so dos posts recentes (o X deduplica
 * leituras na mesma janela de 24 h UTC) e mencoes com since_id.
 */
export async function runSync() {
  const { data: accounts } = await db().from("x_accounts").select("id,x_user_id");
  const out: Record<string, unknown>[] = [];

  for (const acc of accounts ?? []) {
    // --- perfil
    let t0 = Date.now();
    try {
      const me = await getMe(acc.id);
      const today = new Date().toISOString().slice(0, 10);
      await db().from("x_accounts").update({
        username: me.username, display_name: me.name, avatar_url: me.profile_image_url ?? null,
      }).eq("id", acc.id);

      // metricas dos posts publicados nos ultimos 7 dias
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const { data: recent } = await db().from("post_items")
        .select("x_post_id, posts!inner(account_id,published_at)")
        .eq("posts.account_id", acc.id).gte("posts.published_at", since).not("x_post_id", "is", null);
      const ids = [...new Set((recent ?? []).map((r) => r.x_post_id as string))];
      const tweets = ids.length ? await getTweetsMetrics(acc.id, ids) : [];

      let impressions = 0, likes = 0, replies = 0, reposts = 0;
      if (tweets.length) {
        await db().from("post_metrics").upsert(tweets.map((t) => {
          const m = t.public_metrics;
          impressions += m?.impression_count ?? 0; likes += m?.like_count ?? 0;
          replies += m?.reply_count ?? 0; reposts += m?.retweet_count ?? 0;
          return {
            x_post_id: t.id, account_id: acc.id,
            impressions: m?.impression_count ?? 0, likes: m?.like_count ?? 0, replies: m?.reply_count ?? 0,
            reposts: m?.retweet_count ?? 0, quotes: m?.quote_count ?? 0, bookmarks: m?.bookmark_count ?? 0,
            collected_at: new Date().toISOString(),
          };
        }));
      }

      await db().from("metrics_daily").upsert({
        account_id: acc.id, day: today,
        followers: me.public_metrics?.followers_count ?? null,
        following: me.public_metrics?.following_count ?? null,
        posts_count: me.public_metrics?.tweet_count ?? null,
        impressions, likes, replies, reposts,
        collected_at: new Date().toISOString(),
      });
      await logRun({ account_id: acc.id, kind: "sync_metricas", ok: true, detail: `Perfil e ${tweets.length} post${tweets.length === 1 ? "" : "s"} atualizados`, duration_ms: Date.now() - t0 });
      out.push({ account: acc.id, metrics: tweets.length });
    } catch (e) {
      await logRun({ account_id: acc.id, kind: "sync_metricas", ok: false, detail: e instanceof Error ? e.message : String(e), duration_ms: Date.now() - t0 });
    }

    // --- mencoes
    t0 = Date.now();
    try {
      const { data: last } = await db().from("mentions").select("x_post_id")
        .eq("account_id", acc.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const items = await getMentions(acc.id, acc.x_user_id, last?.x_post_id);
      if (items.length) {
        await db().from("mentions").upsert(items.map((m) => ({
          x_post_id: m.id, account_id: acc.id, author_id: m.author_id ?? null,
          author_handle: m.author?.username ?? null, author_name: m.author?.name ?? null,
          body: m.text, created_at: m.created_at ?? new Date().toISOString(),
        })), { onConflict: "x_post_id", ignoreDuplicates: true });
      }
      await logRun({ account_id: acc.id, kind: "sync_mencoes", ok: true, detail: items.length ? `${items.length} menç${items.length === 1 ? "ão nova" : "ões novas"}` : "Nenhuma menção nova", duration_ms: Date.now() - t0 });
    } catch (e) {
      await logRun({ account_id: acc.id, kind: "sync_mencoes", ok: false, detail: e instanceof Error ? e.message : String(e), duration_ms: Date.now() - t0 });
    }
  }
  return out;
}
