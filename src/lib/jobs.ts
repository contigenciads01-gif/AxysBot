import "server-only";
import { db, logRun } from "./supabase";

/**
 * Agendador SEM API paga do X.
 *
 * Nada e publicado sozinho: sem a API, publicar exige um clique seu na tela
 * do proprio X (Web Intent). O agendador so marca quando cada post chega na
 * hora, para o painel destacar "Pronto para publicar" e registrar o aviso.
 * claimed_at guarda quando o aviso foi dado: cada post avisa uma vez so.
 */
export async function runPublisher(max = 50) {
  const started = Date.now();
  const nowIso = new Date().toISOString();
  const { data: paused } = await db().from("settings").select("account_id").eq("paused", true);
  const pausedIds = new Set((paused ?? []).map((r) => r.account_id as string));

  const { data: due, error } = await db()
    .from("posts")
    .select("id,account_id")
    .eq("status", "agendado")
    .lte("scheduled_for", nowIso)
    .is("claimed_at", null)
    .order("scheduled_for")
    .limit(max);
  if (error) throw error;

  const fresh = (due ?? []).filter((p) => !pausedIds.has(p.account_id));
  const byAccount = new Map<string, string[]>();
  for (const p of fresh) byAccount.set(p.account_id, [...(byAccount.get(p.account_id) ?? []), p.id]);

  for (const [accountId, ids] of byAccount) {
    // o filtro "claimed_at is null" no update evita aviso duplicado se dois crons rodarem juntos
    const { data: marked } = await db().from("posts").update({ claimed_at: nowIso })
      .in("id", ids).is("claimed_at", null).select("id");
    const n = marked?.length ?? 0;
    if (n) {
      await logRun({
        account_id: accountId, kind: "lembrete", ok: true,
        detail: `${n} post${n > 1 ? "s chegaram" : " chegou"} na hora. Confirme no painel para publicar no X.`,
        duration_ms: Date.now() - started,
      });
    }
  }

  const { count } = await db().from("posts").select("id", { count: "exact", head: true })
    .eq("status", "agendado").lte("scheduled_for", nowIso);
  return { due: count ?? 0, notified: fresh.length, ms: Date.now() - started };
}
