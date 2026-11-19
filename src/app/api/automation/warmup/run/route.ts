import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { db } from "@/lib/supabase";
import { MetricsCollector } from "@/engine/metrics/collector";
import { getActiveCadence, calculateBiologicalState } from "../../cadence/route";

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      accountIds?: string[];
      action?: "step" | "start" | "stop";
    };

    const cadence = getActiveCadence();
    const bioState = calculateBiologicalState(cadence);

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

    // Se estiver em horário de Sono Noturno ou Pausa de Almoço, entra em pausa biológica natural
    if (!bioState.allowsAction) {
      for (const acc of accounts) {
        await db()
          .from("platform_accounts")
          .update({
            status: "live",
            current_action: bioState.description,
            updated_at: new Date().toISOString(),
          })
          .eq("id", acc.id);

        await MetricsCollector.recordAction({
          accountId: acc.id,
          actionType: bioState.state,
          status: "PAUSED",
          detail: `@${acc.username}: ${bioState.label} — ${bioState.description}`,
          durationMs: 1000,
        });
      }

      return NextResponse.json({
        ok: true,
        paused: true,
        biologicalState: bioState,
        message: bioState.description,
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

      // Intervalos quebrados e profundidade quebrada
      const scrollPx = Math.floor(Math.random() * 580) + 213; // ex: 347px
      const readSeconds = (Math.random() * 14.5 + 8.2).toFixed(1); // ex: 14.3s
      const jitterSeconds = (
        Math.random() * (cadence.actionJitterMaxSeconds - cadence.actionJitterMinSeconds) +
        cadence.actionJitterMinSeconds
      ).toFixed(1); // ex: 13.8s

      // Sorteio com pesos biológicos: scroll e leitura são frequentes; like e retweet são espaçados
      const roll = Math.random();
      let chosen: { type: string; text: string; detail: string };

      if (roll < 0.35) {
        // 35% de chance de scroll no feed
        chosen = {
          type: "SCROLL_FEED",
          text: `📜 Rolando feed 'Para Você' — profundidade ${scrollPx}px (intervalo quebrado de ${jitterSeconds}s)`,
          detail: `[SCROLL] Rolou ${scrollPx}px no feed 'Para Você'`,
        };
      } else if (roll < 0.60) {
        // 25% de chance de ler um post com tempo quebrado
        chosen = {
          type: "READ_TWEET",
          text: `📖 Lendo publicação de ${targetProfile} sobre "${targetKeyword}" (tempo de retenção: ${readSeconds}s)`,
          detail: `[LEITURA] Leu post de ${targetProfile} sobre "${targetKeyword}" (${readSeconds}s)`,
        };
      } else if (roll < 0.75) {
        // 15% de chance de visitar perfil
        chosen = {
          type: "VISIT_PROFILE",
          text: `👀 Acessando perfil de ${targetProfile} — inspecionando biografia e últimos 4 tweets`,
          detail: `[PERFIL] Acessou perfil de ${targetProfile}`,
        };
      } else if (roll < 0.88) {
        // 13% de chance de auto-like orgânico
        chosen = {
          type: "AUTO_LIKE",
          text: `❤️ Curtindo post de ${targetProfile} sobre "${targetKeyword}" [ID #${String(randomTweetId).slice(-6)}] (cadência de ~${cadence.likeCadenceMinMinutes}m)`,
          detail: `[LIKE] Curtiu tweet #${String(randomTweetId).slice(-6)} de ${targetProfile}`,
        };
      } else if (roll < 0.95) {
        // 7% de chance de salvar/bookmark
        chosen = {
          type: "AUTO_BOOKMARK",
          text: `🔖 Salvando tweet nos itens salvos de ${targetProfile} para referência futura`,
          detail: `[SALVAR] Guardou link do post de ${targetProfile}`,
        };
      } else {
        // 5% de chance de retweet orgânico estratégico
        chosen = {
          type: "AUTO_RETWEET",
          text: `🔁 Retweet orgânico realizado na publicação em alta de ${targetProfile} (cadência de ~${cadence.retweetCadenceMinMinutes}m)`,
          detail: `[RETWEET] Retweetou publicação de ${targetProfile}`,
        };
      }

      const durationMs = Math.round(parseFloat(jitterSeconds) * 1000);

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
      biologicalState: bioState,
      steps: executedSteps,
    });
  } catch (e) {
    return fail(e);
  }
}
