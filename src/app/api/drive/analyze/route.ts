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

// Catálogo de perfis visuais para análise aprofundada de cenário, roupa, posição e lado sexy da modelo July
const SCENARIO_DATABASE = [
  {
    keywords: ["praia", "beach", "mar", "sunset", "goldenhour", "sol", "verao", "bikini", "biquini"],
    scenario: "Praia paradisíaca com luz dourada natural tocando a pele (Golden Hour)",
    outfit: "Biquíni cortininha cavado valorizando marquinha de sol e decote",
    pose: "De costas olhando por cima do ombro com bumbum empinado e curvas em destaque",
    mood: "Sensualidade solar, provocante e irresistível",
    captions: [
      "Dourada pelo sol e esse biquíni cavado que valorizou cada curva minha... De frente ou de costas, qual foto desse ensaio te provocou mais? 🌊☀️🔥",
      "A luz desse pôr do sol na praia foi surreal... Mas confesso que esse biquíni deixou quase nada pra imaginação 🔥 O que você mais gosta no verão?",
      "Aquele fim de tarde quente que a gente não quer que acabe. De 0 a 10, quanto essa visão te desconcentrou hoje? 💛🔥",
    ],
    tags: ["#beachvibes", "#goldenhour", "#verao", "#biquini", "#sexy", "#curvas", "#vip"],
  },
  {
    keywords: ["lingerie", "quarto", "cama", "espelho", "noite", "intima", "bastidores", "provador"],
    scenario: "Quarto intimista com iluminação quente de meia-luz e espelho de corpo inteiro",
    outfit: "Lingerie rendada preta com transparência e decote provocante",
    pose: "Selfie sensual no espelho em ângulo lateral destacando quadril, cintura e decote",
    mood: "Altamente provocante, safada, misteriosa e exclusiva",
    captions: [
      "Confesso que esse espelho entrega mais do que deveria... Essa lingerie rendada e esse ângulo que vocês não cansam de pedir na DM 🔥 O que achou desse decote? 👀",
      "Detalhes íntimos que pouca gente tem o privilégio de ver de perto... Essa transparência ficou um absurdo 🖤 O restante sem censura tá no link da bio 😈",
      "Um spoiler rápido no espelho do quarto porque vocês não param de pedir no direct... Gostaram da pose ou preferem de costas? 👀🔥",
    ],
    tags: ["#bastidores", "#lingerie", "#sexy", "#vip", "#exclusivo", "#preview", "#corpo"],
  },
  {
    keywords: ["gym", "treino", "fitness", "workout", "academia", "shape", "foco", "bumbum"],
    scenario: "Academia moderna com iluminação dramática valorizando definição",
    outfit: "Top fitness decotado justo e shortinho de lycra coladinho",
    pose: "Postura provocante pós-treino destacando cintura fina, bumbum empinado e pernas torneadas",
    mood: "Gostosa, atlética, empoderada e sensual",
    captions: [
      "Treino de glúteo pago, bumbum na nuca e esse shortinho colado desenhando tudo... A endorfina bateu forte e o calor também 🔥 Quem aí curte mulher sarada?",
      "Constância acima de motivação. O shape responde ao esforço e as curvas não mentem... Comenta um fogo 🔥 se você não pula o treino!",
      "Bastidores do treino de hoje! Confesso que esse conjunto coladinho é meu favorito pra deixar vocês babando 👀🔥 Quer ver o alongamento no VIP?",
    ],
    tags: ["#fitness", "#gymgirl", "#shape", "#bumbumnanuca", "#sexy", "#foco", "#mulhergostosa"],
  },
  {
    keywords: ["vestido", "festa", "nightout", "jantar", "elegante", "glamour", "close", "cidade"],
    scenario: "Ambiente sofisticado noturno com penumbra sedutora e luzes da cidade",
    outfit: "Vestido curto preto justo com fenda lateral e decote acentuado",
    pose: "Em pé provocante com taça na mão, olhar fatal sedutor e costas semi-nuas",
    mood: "Sensual misteriosa, fatal, magnética e picante",
    captions: [
      "Sextou daquele jeito bem safado e misterioso... Esse vestidinho preto justo marca tudo o que você imagina e mais um pouco 🖤 Quer ver sem cortes? Link no perfil!",
      "Quando o look encaixa perfeitamente e o decote rouba a cena... Quantos elogios esse visual merece antes da noite começar de verdade? ✨🔥",
      "Pronta pra jantar fora... Mas confesso que a melhor parte é sempre quando a gente volta pro quarto 😉 O que achou desse decote?",
    ],
    tags: ["#nightout", "#glamour", "#sensual", "#vestidocurto", "#decote", "#vip", "#sexy"],
  },
  {
    keywords: ["reels", "shorts", "video", "movimento", "danca", "trend", "estudio"],
    scenario: "Estúdio fotográfico com iluminação de recorte e fundo contrastante",
    outfit: "Look sensual moderno com top cropped decotado e shortinho cintura baixa",
    pose: "Em movimento fluido provocante interagindo diretamente com a câmera e mordendo os lábios",
    mood: "Envolvente, provocante, dinâmica e magnética",
    captions: [
      "Aqueles 15 segundos nos bastidores que vão te fazer pausar várias vezes... O movimento do quadril e esse cropped justo não deixam dúvidas 🔥 Conteúdo completo no link da bio 😈",
      "Top tomara que caia bem justinho e aquele olhar que dispensa legenda... O que você faria se eu te mandasse esse vídeo na DM agora? 🎬🔥",
      "O ritmo certo e a energia quente do estúdio. Esse take sem censura mereceu sair do acervo pro feed ✨🔥 Comenta um fogo se você amou!",
    ],
    tags: ["#reels", "#video", "#sexy", "#trend", "#bastidores", "#exclusive", "#preview"],
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
