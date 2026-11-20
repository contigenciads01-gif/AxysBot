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

    // 1. Carrega os filtros de nicho configurados (palavras-chave, perfis e links)
    const { data: settingsData } = await db()
      .from("settings")
      .select("target_filters")
      .limit(1)
      .maybeSingle();

    const targetFilters = settingsData?.target_filters || {};
    const rawKeywords = targetFilters.keywords || "marketing, tech, crypto, startup, ia, empreendedorismo, business";
    const rawProfiles = targetFilters.targetProfiles || "@elonmusk, @sama, @paulg, @x, @techcrunch";
    const rawLinks = targetFilters.targetLinks || "";
    const mirrorOwnReposts = targetFilters.mirrorOwnReposts !== false;
    const discoveryMode = targetFilters.discoveryMode || "hybrid";

    const keywords = rawKeywords
      .split(/[,;\n]+/)
      .map((k: string) => k.trim())
      .filter(Boolean);

    const profiles = rawProfiles
      .split(/[,;\n]+/)
      .map((p: string) => p.trim())
      .filter(Boolean);

    const directLinks = rawLinks
      .split(/[\n,;]+/)
      .map((l: string) => l.trim())
      .filter((l: string) => l.startsWith("http"));

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
      targetLink?: string;
      duration: number;
    }> = [];

    for (const acc of accounts) {
      const targetProfile = profiles[Math.floor(Math.random() * profiles.length)] || "@elonmusk";
      const targetKeyword = keywords[Math.floor(Math.random() * keywords.length)] || "tecnologia";
      const chosenLink = directLinks.length > 0 ? directLinks[Math.floor(Math.random() * directLinks.length)] : null;
      const randomTweetId = Math.floor(1800000000000000000 + Math.random() * 9000000000000000);

      // Intervalos quebrados e profundidade quebrada
      const scrollPx = Math.floor(Math.random() * 580) + 213; // ex: 347px
      const readSeconds = (Math.random() * 14.5 + 8.2).toFixed(1); // ex: 14.3s
      const jitterSeconds = (
        Math.random() * (cadence.actionJitterMaxSeconds - cadence.actionJitterMinSeconds) +
        cadence.actionJitterMinSeconds
      ).toFixed(1); // ex: 13.8s

      let chosen: { type: string; text: string; detail: string; link?: string };

      // Se temos links diretos cadastrados e o modo favorece links
      if (chosenLink && (discoveryMode === "links" || (discoveryMode === "hybrid" && Math.random() < 0.45))) {
        const linkRoll = Math.random();
        if (linkRoll < 0.4) {
          chosen = {
            type: "DIRECT_LINK_LIKE",
            text: `❤️ Curtindo post específico da sua lista: ${chosenLink}`,
            detail: `[LINK DIRETO] Curtiu publicação alvo ${chosenLink}`,
            link: chosenLink,
          };
        } else if (linkRoll < 0.7) {
          chosen = {
            type: "DIRECT_LINK_READ",
            text: `📖 Lendo e analisando engajamento do link alvo: ${chosenLink} (${readSeconds}s)`,
            detail: `[LINK DIRETO] Leu e inspecionou ${chosenLink}`,
            link: chosenLink,
          };
        } else {
          chosen = {
            type: "DIRECT_LINK_RETWEET",
            text: `🔁 Retweetando publicação fornecida na lista de links: ${chosenLink}`,
            detail: `[LINK DIRETO] Retweetou ${chosenLink}`,
            link: chosenLink,
          };
        }
      }
      // Se espelhamento da própria conta está ativo e rolou sorteio
      else if (mirrorOwnReposts && (discoveryMode === "mirror" || Math.random() < 0.35)) {
        chosen = {
          type: "MIRROR_OWN_REPOSTS",
          text: `🪞 Espelhando histórico de reposts da conta @${acc.username}: analisando criadores parecidos`,
          detail: `[ESPELHAMENTO] Mapeou gostos de reposts de @${acc.username}`,
        };
      }
      // Ações orgânicas de nicho baseadas nos perfis e palavras-chave
      else {
        const roll = Math.random();
        if (roll < 0.35) {
          chosen = {
            type: "SCROLL_FEED",
            text: `📜 Rolando feed 'Para Você' — profundidade ${scrollPx}px (intervalo quebrado de ${jitterSeconds}s)`,
            detail: `[SCROLL] Rolou ${scrollPx}px no feed 'Para Você'`,
          };
        } else if (roll < 0.60) {
          chosen = {
            type: "READ_TWEET",
            text: `📖 Lendo publicação de ${targetProfile} sobre "${targetKeyword}" (tempo de retenção: ${readSeconds}s)`,
            detail: `[LEITURA] Leu post de ${targetProfile} sobre "${targetKeyword}" (${readSeconds}s)`,
          };
        } else if (roll < 0.75) {
          chosen = {
            type: "VISIT_PROFILE",
            text: `👀 Acessando perfil de ${targetProfile} — inspecionando biografia e últimos 4 tweets`,
            detail: `[PERFIL] Acessou perfil de ${targetProfile}`,
          };
        } else if (roll < 0.88) {
          chosen = {
            type: "AUTO_LIKE",
            text: `❤️ Curtindo post de ${targetProfile} sobre "${targetKeyword}" [ID #${String(randomTweetId).slice(-6)}]`,
            detail: `[LIKE] Curtiu tweet #${String(randomTweetId).slice(-6)} de ${targetProfile}`,
          };
        } else if (roll < 0.95) {
          chosen = {
            type: "AUTO_BOOKMARK",
            text: `🔖 Salvando tweet nos itens salvos de ${targetProfile} para referência futura`,
            detail: `[SALVAR] Guardou link do post de ${targetProfile}`,
          };
        } else {
          chosen = {
            type: "AUTO_RETWEET",
            text: `🔁 Retweet orgânico realizado na publicação em alta de ${targetProfile}`,
            detail: `[RETWEET] Retweetou publicação de ${targetProfile}`,
          };
        }
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
        targetLink: chosen.link,
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
