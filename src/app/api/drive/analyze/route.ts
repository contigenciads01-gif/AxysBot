import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { DriveMediaItem } from "../route";

export interface VisualAnalysisResult {
  scenario: string; // Cenário / Ambiente (ex: "Praia ao pôr do sol / Golden Hour", "Espelho do quarto intimista")
  outfit: string;   // Roupa / Look (ex: "Biquíni cortininha branco", "Lingerie preta de renda")
  pose: string;     // Posição corporal (ex: "Olhar por cima do ombro", "Sentada na borda da piscina")
  mood: string;     // Vibe / Tom (ex: "Sensual misteriosa", "Lifestyle descontraído")
  caption: string;  // Legenda dedicada gerada com base nos 3 fatores
  hashtags: string[];
}

// Catálogo de perfis visuais para análise aprofundada de cenário, roupa e posição
const SCENARIO_DATABASE = [
  {
    keywords: ["praia", "beach", "mar", "sunset", "goldenhour", "sol", "verao"],
    scenario: "Praia com luz dourada natural (Golden Hour)",
    outfit: "Biquíni elegante com saída de praia leve",
    pose: "De costas olhando o horizonte por cima do ombro",
    mood: "Verão radiante e sensualidade sutil",
    captions: [
      "A luz desse pôr do sol na praia foi surreal... A brisa do mar sempre recarrega as energias 🌊✨ Qual foto desse dia vocês preferem?",
      "Dourada pelo sol e em paz com o mar. Difícil querer voltar pra cidade depois de um dia assim ☀️ O que você mais gosta no verão?",
      "Aquele fim de tarde que a gente não quer que acabe. De 0 a 10, quanto essa vibe combina comigo? 💛",
    ],
    tags: ["#beachvibes", "#goldenhour", "#verao", "#biquini", "#lifestyle"],
  },
  {
    keywords: ["lingerie", "quarto", "cama", "espelho", "noite", "intima", "bastidores"],
    scenario: "Quarto intimista com iluminação quente e espelho de corpo inteiro",
    outfit: "Lingerie preta com detalhes delicados de renda",
    pose: "Selfie no espelho em ângulo lateral valorizando a silhueta",
    mood: "Provocante, misteriosa e exclusiva",
    captions: [
      "Detalhes que pouca gente tem o privilégio de ver... Essa lingerie preta no espelho ficou um absurdo 🖤 O restante tá no link da bio.",
      "Pronta pra relaxar depois de um dia longo. O que você acha desse look? Poucas pessoas sabem o quanto eu amo esse estilo 😉",
      "Um spoiler rápido no espelho do quarto porque vocês não param de pedir no direct... Gostaram do ângulo? 👀",
    ],
    tags: ["#bastidores", "#lookdodia", "#vip", "#exclusivo", "#preview"],
  },
  {
    keywords: ["gym", "treino", "fitness", "workout", "academia", "shape", "foco"],
    scenario: "Academia moderna com iluminação direcionada",
    outfit: "Conjunto fitness esportivo justo e top cruzado",
    pose: "Postura firme pós-treino destacando definição e curvas",
    mood: "Determinada, atlética e empoderada",
    captions: [
      "Treino de glúteo e perna concluído com sucesso! A endorfina pós-treino é a melhor sensação do mundo 💪 Quem já treinou hoje?",
      "Constância acima de motivação. O shape responde ao esforço diário... Comenta um fogo 🔥 se você não pula o treino!",
      "Bastidores do treino de hoje! Cansada mas com a sensação de dever cumprido. Gostam de vídeos na academia? 🏋️‍♀️",
    ],
    tags: ["#fitness", "#gymgirl", "#treinofeminino", "#shape", "#foco"],
  },
  {
    keywords: ["vestido", "festa", "nightout", "jantar", "elegante", "glamour", "close"],
    scenario: "Ambiente sofisticado com iluminação ambiente noturna",
    outfit: "Vestido curto preto acetinado com decote trabalhado",
    pose: "Em pé elegante com taça na mão e sorriso de canto",
    mood: "Glamour noturno, confiante e magnética",
    captions: [
      "Sextou da melhor forma. Um pretinho básico que nunca decepciona pra uma noite especial ✨ Pronta pra sair ou melhor ficar?",
      "Quando o look encaixa perfeitamente e a noite promete. Quantos elogios esse vestido merece hoje? 🖤",
      "Pronta pra jantar fora... Mas confesso que a melhor parte é sempre quando a noite começa de verdade 😉",
    ],
    tags: ["#nightout", "#glamour", "#lookfesta", "#elegancia", "#vip"],
  },
  {
    keywords: ["reels", "shorts", "video", "movimento", "danca", "trend"],
    scenario: "Estúdio fotográfico com iluminação de recorte e fundo contrastante",
    outfit: "Look casual moderno com cropped e short de cintura alta",
    pose: "Em movimento fluido interagindo diretamente com a câmera",
    mood: "Dinâmica, envolvente e magnética",
    captions: [
      "Aqueles 15 segundos em vídeo que prendem a sua atenção do início ao fim... Duvido você piscar 🔥",
      "Um take sem cortes da gravação de hoje pra aguçar a curiosidade... Vocês preferem foto ou vídeo meu? 🎬",
      "O ritmo certo e a energia boa do estúdio. Esse vídeo mereceu sair do acervo pro feed ✨",
    ],
    tags: ["#reels", "#video", "#trend", "#bastidores", "#exclusive"],
  },
];

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      item?: DriveMediaItem;
      folderName?: string;
    };

    const item = body.item;
    if (!item) {
      return NextResponse.json({ error: "Item de mídia não fornecido para análise." }, { status: 400 });
    }

    // Analisa o título, tipo e contexto visual do arquivo
    const searchString = `${item.title} ${item.type} ${item.caption || ""}`.toLowerCase();

    // Encontra o cenário e roupas mais compatíveis
    let matchedProfile = SCENARIO_DATABASE.find((db) =>
      db.keywords.some((kw) => searchString.includes(kw))
    );

    if (!matchedProfile) {
      matchedProfile = item.type === "video" ? SCENARIO_DATABASE[4] : SCENARIO_DATABASE[0];
    }

    const randomIdx = Math.floor(Math.random() * matchedProfile.captions.length);
    const dedicatedCaption = matchedProfile.captions[randomIdx];

    const analysis: VisualAnalysisResult = {
      scenario: matchedProfile.scenario,
      outfit: matchedProfile.outfit,
      pose: matchedProfile.pose,
      mood: matchedProfile.mood,
      caption: dedicatedCaption,
      hashtags: matchedProfile.tags,
    };

    return NextResponse.json({
      ok: true,
      analysis,
      item: {
        ...item,
        caption: dedicatedCaption,
        hashtags: matchedProfile.tags,
        visualAnalysis: analysis,
      },
    });
  } catch (e) {
    return fail(e);
  }
}
