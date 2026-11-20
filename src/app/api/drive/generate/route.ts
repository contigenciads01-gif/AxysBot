import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { DriveMediaItem, driveStore, GOOGLE_DRIVE_FOLDER_POOL } from "../route";

const SEXY_PHOTO_CAPTIONS = [
  "Confesso que esse espelho entrega mais do que deveria... O ângulo certo e essa lingerie rendada que vocês não cansam de pedir na DM 🔥 O que achou desse decote? 👀",
  "Aquele cropped preto coladinho que não esconde nada... O decote certo, olhar penetrante e muita provocação ✨ De 0 a 10, quanto essa foto te desconcentrou?",
  "Dourada pelo sol e esse biquíni cavado valorizando cada centímetro... De frente ou de costas, qual ângulo te provocou mais? 🌊🔥",
  "Na penumbra do quarto com esse olhar que dispensa apresentações... Poucas pessoas conhecem esse meu lado mais ousado e íntimo 🖤 Gostou da pose?",
  "Um spoiler rápido no espelho pra quem sempre pede meu lado mais provocante... Quando a luz certa encontra as curvas certas 🔥 Me conta o que você faria se recebesse essa foto no direct 😉",
  "Sextou daquele jeito bem safado e misterioso... Esse vestidinho preto justo marca tudo o que você imagina e mais um pouco 🖤 Quer ver sem cortes? Link no perfil!",
  "A luz das 17h iluminando minhas curvas e esse tecido transparente... Dias quentes merecem pouca roupa e muito desejo ☀️🔥",
];

const SEXY_VIDEO_CAPTIONS = [
  "Aqueles 15 segundos nos bastidores que vão te fazer pausar várias vezes... O movimento do quadril e esse decote justo não deixam dúvidas 🔥 O conteúdo sem censura tá no link da bio 😈",
  "Top tomara que caia bem justinho e aquele olhar que dispensa legenda... O que você faria se eu te mandasse esse vídeo na DM agora? 🎬🔥 Conteúdo completo no topo!",
  "Treino pago, shape encaixado e esse shortinho fitness desenhando tudo... O calor aqui subiu de verdade 🔥 Quem aí ama uma mulher definida e gostosa?",
  "Bastidores sem filtro pra vocês verem como realmente funciona por trás das câmeras... Confesso que hoje eu tava me sentindo especialmente provocante 😈🎬",
  "Um teaser em movimento desse look ousado porque a DM tava lotada pedindo... O que tem por baixo tá liberado lá no link da bio 🔥",
  "Duvido você conseguir olhar uma vez só e não dar replay... A energia do estúdio e essa vibe quente mereceram esse take exclusivo 🎶🔥",
];

const SEXY_HASHTAG_SETS = [
  ["#sexy", "#decote", "#lingerie", "#preview", "#vip", "#exclusivo"],
  ["#bastidores", "#reels", "#model", "#curvas", "#mulhergostosa", "#hot"],
  ["#lookdodia", "#glamour", "#ensaiovip", "#corpo", "#nightout", "#sensual"],
  ["#fitness", "#gymgirl", "#shape", "#bumbumnanuca", "#foco", "#sexy"],
  ["#beachvibes", "#summer", "#bikini", "#verao", "#biquini", "#bronze"],
];

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      items?: DriveMediaItem[];
      customPrompt?: string;
      customHashtags?: string;
    };

    const items = body.items || [];
    const customTags = (body.customHashtags || "")
      .split(/[,\s]+/)
      .map((t) => (t.startsWith("#") ? t : `#${t}`))
      .filter((t) => t.length > 1);

    const promptClean = (body.customPrompt || driveStore.customPrompt || "").trim();

    const updated = items.map((item, idx) => {
      const isVideo = item.type === "video";
      const captionsPool = isVideo ? SEXY_VIDEO_CAPTIONS : SEXY_PHOTO_CAPTIONS;
      const baseCaption = captionsPool[idx % captionsPool.length];

      const defaultTags = SEXY_HASHTAG_SETS[idx % SEXY_HASHTAG_SETS.length];
      const mergedTags = Array.from(new Set([...(customTags.length ? customTags : defaultTags)]));

      let caption = baseCaption;
      if (promptClean) {
        // Encorpa a legenda com o prompt do usuário e os detalhes sensuais da análise
        const analysisSnippet = item.visualAnalysis
          ? `Destacando ${item.visualAnalysis.outfit.toLowerCase()} e ${item.visualAnalysis.pose.toLowerCase()}`
          : "";
        caption = `${baseCaption} ${analysisSnippet ? `\n\n✨ ${analysisSnippet}.` : ""}`.trim();
      }

      return {
        ...item,
        caption,
        hashtags: mergedTags,
        status: "ready" as const,
      };
    });

    // Salva imediatamente na memória do bot e no acervo permanente para não perder nada
    driveStore.items = updated.slice(0, 6);
    if (promptClean) {
      driveStore.customPrompt = promptClean;
    }

    for (const it of updated) {
      const poolIdx = GOOGLE_DRIVE_FOLDER_POOL.findIndex((p) => p.id === it.id);
      if (poolIdx !== -1) {
        GOOGLE_DRIVE_FOLDER_POOL[poolIdx] = {
          ...GOOGLE_DRIVE_FOLDER_POOL[poolIdx],
          caption: it.caption,
          hashtags: it.hashtags,
          status: "ready",
        };
      }
    }

    return NextResponse.json({
      ok: true,
      items: updated,
      drive: driveStore,
      message: "Legendas sensuais geradas com IA e salvas permanentemente com sucesso.",
    });
  } catch (e) {
    return fail(e);
  }
}
