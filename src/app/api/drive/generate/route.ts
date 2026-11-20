import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { DriveMediaItem } from "../route";

const PHOTO_CAPTIONS = [
  "A luz certa muda tudo... Um pouco do que rolou no ensaio de hoje ✨ Qual foi sua foto favorita?",
  "Sextou daquele jeito que a gente gosta. Pronta pra sair ou melhor ficar em casa? 🖤",
  "Dias de sol e paz. Saudades de uma praia assim! De 0 a 10, que nota você dá pra essa vista? 🌊☀️",
  "Um olhar diz mais que mil palavras... O que você acha que eu estava pensando aqui? 😉",
  "Registros aleatórios que nunca tinham saído da galeria. Deixo no feed ou apago? 📸",
  "Detalhes que fazem a diferença. Quando o fotógrafo acerta em cheio o momento exato 💫",
];

const VIDEO_CAPTIONS = [
  "Aqueles 15 segundos que você não vai conseguir assistir só uma vez 🔥 O restante tá completo lá no link da bio...",
  "Um teaser rapidinho porque vocês pediram muito na DM... Gostaram do ângulo? 👀 Link no topo!",
  "Treino pago com sucesso! A endorfina bateu forte hoje 💪 Quem já treinou comenta um fogo 🔥",
  "Bastidores sem filtro pra vocês verem como realmente funciona por trás das câmeras 🎬 Gostam desse tipo de vídeo?",
  "A gravação completa desse dia ficou surreal. Um pedacinho pra aguçar a curiosidade 😈",
  "Duvido você adivinhar que música tava tocando no estúdio nessa hora 🎶 Deixa seu palpite!",
];

const HASHTAG_SETS = [
  ["#lifestyle", "#exclusive", "#preview", "#novidades", "#vip"],
  ["#bastidores", "#reels", "#model", "#trending", "#brazilian"],
  ["#lookdodia", "#glamour", "#ensaiovip", "#conteudovip", "#nightout"],
  ["#fitness", "#gymgirl", "#saude", "#foco", "#shape"],
  ["#beachvibes", "#summer", "#bikini", "#verao", "#biquini"],
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

    const updated = items.map((item, idx) => {
      const isVideo = item.type === "video";
      const captionsPool = isVideo ? VIDEO_CAPTIONS : PHOTO_CAPTIONS;
      const baseCaption = captionsPool[idx % captionsPool.length];

      const defaultTags = HASHTAG_SETS[idx % HASHTAG_SETS.length];
      const mergedTags = Array.from(new Set([...(customTags.length ? customTags : defaultTags)]));

      return {
        ...item,
        caption: body.customPrompt ? `${body.customPrompt} ✨ ${item.title.replace(/\.[^/.]+$/, "")}` : baseCaption,
        hashtags: mergedTags,
        status: "ready" as const,
      };
    });

    return NextResponse.json({
      ok: true,
      items: updated,
    });
  } catch (e) {
    return fail(e);
  }
}
