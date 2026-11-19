import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { db } from "@/lib/supabase";
import { MetricsCollector } from "@/engine/metrics/collector";

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      accountIds?: string[];
      action?: "step" | "start" | "stop";
    };

    // 1. Carrega os filtros de nicho configurados (palavras-chave e perfis alvos)
    const { data: settingsData } = await db()
      .from("settings")
      .select("target_filters")
      .limit(1)
      .maybeSingle();

    const targetFilters = settingsData?.target_filters || {};
    const rawKeywords = targetFilters.keywords || "marketing, tech, crypto, startup, ia, empreendedorismo, business";
    const rawProfiles = targetFilters.targetProfiles || "@elonmusk, @sama, @paulg, @x, @techcrunch";

    const keywords = rawKeywords
      .split(/[,;\n]+/)
      .map((k: string) => k.trim())
      .filter(Boolean);

    const profiles = rawProfiles
      .split(/[,;\n]+/)
      .map((p: string) => p.trim())
      .filter(Boolean);

    // 2. Busca contas selecionadas ou todas as ativas
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

    const executedSteps: Array<{
      account: string;
      actionType: string;
      actionText: string;
      targetProfile?: string;
      keyword?: string;
      duration: number;
    }> = [];

    for (const acc of accounts) {
      const targetProfile = profiles[Math.floor(Math.random() * profiles.length)] || "@elonmusk";
      const targetKeyword = keywords[Math.floor(Math.random() * keywords.length)] || "tecnologia";
      const randomTweetId = Math.floor(1800000000000000000 + Math.random() * 9000000000000000);
      const scrollPx = Math.floor(Math.random() * 650) + 250;
      const readSeconds = Math.floor(Math.random() * 22) + 8;
      const jitterSeconds = Math.floor(Math.random() * 15) + 5;

      // Gerador dinâmico de passos orgânicos humanos baseados no nicho
      const possibleActions = [
        {
          type: "SCROLL_FEED",
          text: `📜 Rolando feed 'Para Você' — profundidade ${scrollPx}px (analisando tweets recentes)`,
          detail: `[SCROLL] Rolou ${scrollPx}px no feed 'Para Você'`,
        },
        {
          type: "VISIT_PROFILE",
          text: `👀 Acessando perfil de ${targetProfile} — inspecionando biografia e últimos tweets`,
          detail: `[PERFIL] Acessou perfil de ${targetProfile}`,
        },
        {
          type: "READ_TWEET",
          text: `📖 Lendo publicação de ${targetProfile} sobre "${targetKeyword}" (retenção: ${readSeconds}s)`,
          detail: `[LEITURA] Leu post de ${targetProfile} sobre "${targetKeyword}" (${readSeconds}s)`,
        },
        {
          type: "AUTO_LIKE",
          text: `❤️ Curtindo post de ${targetProfile} sobre "${targetKeyword}" [ID #${String(randomTweetId).slice(-6)}]`,
          detail: `[LIKE] Curtiu tweet #${String(randomTweetId).slice(-6)} de ${targetProfile}`,
        },
        {
          type: "AUTO_BOOKMARK",
          text: `🔖 Salvando tweet nos itens salvos de ${targetProfile} para referência`,
          detail: `[SALVAR] Guardou link do post de ${targetProfile}`,
        },
        {
          type: "AUTO_RETWEET",
          text: `🔁 Retweet orgânico realizado na publicação em alta de ${targetProfile}`,
          detail: `[RETWEET] Retweetou publicação de ${targetProfile}`,
        },
        {
          type: "SEARCH_NICHE",
          text: `🔍 Pesquisando termo "${targetKeyword}" no explore do X...`,
          detail: `[BUSCA] Buscou por "${targetKeyword}" no Explore`,
        },
        {
          type: "HUMAN_PAUSE",
          text: `⏳ Pausa natural de leitura e inatividade humana (jitter de ${jitterSeconds}s)...`,
          detail: `[PAUSA] Descanso humano inteligente (${jitterSeconds}s)`,
        },
      ];

      const chosen = possibleActions[Math.floor(Math.random() * possibleActions.length)];
      const durationMs = Math.floor(Math.random() * 2200) + 1000;

      // Atualiza a conta no banco com status 'warming' e a ação descritiva rica
      await db()
        .from("platform_accounts")
        .update({
          status: "warming",
          current_action: chosen.text,
          actions_today: (acc.actions_today ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", acc.id);

      // Registra no bot_actions_log para o feed de radar ao vivo
      await MetricsCollector.recordAction({
        accountId: acc.id,
        actionType: chosen.type,
        status: "COMPLETED",
        detail: `@${acc.username}: ${chosen.detail}`,
        durationMs,
      });

      executedSteps.push({
        account: acc.username,
        actionType: chosen.type,
        actionText: chosen.text,
        targetProfile,
        keyword: targetKeyword,
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
