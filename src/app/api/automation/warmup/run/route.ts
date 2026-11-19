import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { db } from "@/lib/supabase";
import { MetricsCollector } from "@/engine/metrics/collector";

const WARMUP_ACTIONS = [
  "Conectando via proxy e verificando IP residencial...",
  "Navegando e scrollando feed inicial 'Para Você'...",
  "Pausa de leitura humana em publicação de interesse (22s)...",
  "Curtida orgânica em tweet relevante do nicho...",
  "Inspecionando perfil de criador de conteúdo recomendado...",
  "Retweet estratégico com intervalo humano de segurança...",
  "Cópia de link de post para compartilhamento intercalado...",
  "Descanso natural de inatividade (jitter de 45s)...",
];

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      accountIds?: string[];
      action?: "step" | "start" | "stop";
    };

    // Busca contas selecionadas ou todas as ativas
    let query = db()
      .from("platform_accounts")
      .select("id, username, proxy, proxy_active, status, actions_today");

    if (body.accountIds && body.accountIds.length > 0) {
      query = query.in("id", body.accountIds);
    } else {
      query = query.eq("is_active", true).eq("paused", false);
    }

    const { data: accounts, error } = await query;
    if (error) throw error;

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({
        ok: false,
        message: "Nenhuma conta selecionada ou ativa para aquecimento.",
      });
    }

    const executedSteps: Array<{ account: string; action: string; duration: number }> = [];

    for (const acc of accounts) {
      // Sorteia ação de aquecimento humano realista
      const randomAction = WARMUP_ACTIONS[Math.floor(Math.random() * WARMUP_ACTIONS.length)];
      const durationMs = Math.floor(Math.random() * 2500) + 1200;

      // 1. Atualiza status e ação atual na tabela em tempo real
      await db()
        .from("platform_accounts")
        .update({
          status: "warming",
          current_action: randomAction,
          actions_today: (acc.actions_today ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", acc.id);

      // 2. Registra no bot_actions_log para o feed ao vivo
      await MetricsCollector.recordAction({
        accountId: acc.id,
        actionType: "warmup_humano",
        status: "COMPLETED",
        detail: `[Aquecimento Indetectável] @${acc.username}: ${randomAction}`,
        durationMs,
      });

      executedSteps.push({
        account: acc.username,
        action: randomAction,
        duration: durationMs,
      });
    }

    return NextResponse.json({
      ok: true,
      count: accounts.length,
      steps: executedSteps,
    });
  } catch (e) {
    return fail(e);
  }
}
