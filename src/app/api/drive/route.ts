import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { isDrivePostingEnabled, setDrivePostingEnabled } from "@/lib/posting-switch";

export interface DriveMediaItem {
  id: string;
  type: "photo" | "video";
  title: string;
  url: string;
  previewUrl: string;
  caption: string;
  hashtags: string[];
  scheduledTime?: string;
  status: "idle" | "ready" | "scheduled" | "published" | "discarded";
  sizeMb?: number;
  inMemory: boolean; // Indica se está na memória ativa do bot
  visualAnalysis?: {
    scenario: string;
    outfit: string;
    pose: string;
    mood: string;
  };
}

export interface DriveConfig {
  folderUrl: string;
  connected: boolean;
  folderName: string;
  autoInterleave: boolean;
  autoPostingEnabled: boolean;
  batchSize: number; // Puxa de 6 em 6 para não pesar
  totalInDrive: number; // Total salvo no Google Drive
  discardedCount: number; // Descartados da memória após publicação
  items: DriveMediaItem[]; // Lote ativo de 6 mídias na memória
}

// =========================================================================
// ACERVO COMPLETO DO GOOGLE DRIVE (PASTA "July" - CONTIGENCIADS01@GMAIL.COM)
// =========================================================================
export const GOOGLE_DRIVE_FOLDER_POOL: DriveMediaItem[] = [
  {
    id: "july-drive-01",
    type: "photo",
    title: "Generate_photorealistic_picture_of_a_20_years_old_b_0.png",
    url: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=800&q=80",
    previewUrl: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=400&q=80",
    caption: "A energia das cores da rua e esse look preto básico... O que acharam desse clique? 🎨🖤",
    hashtags: ["#streetwear", "#grafite", "#ensaio", "#lookdodia", "#lifestyle"],
    status: "ready",
    sizeMb: 5.4,
    inMemory: true,
    visualAnalysis: {
      scenario: "Muro com grafite urbano colorido",
      outfit: "Blusa preta justa e calça streetwear",
      pose: "Em pé confiante de frente com olhar marcante",
      mood: "Urbana estilosa e magnética",
    },
  },
  {
    id: "july-drive-02",
    type: "video",
    title: "Generate_photorealistic_picture_of_a_20_years_old_b_1.png",
    url: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=800&q=80",
    previewUrl: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=400&q=80",
    caption: "Top branco tomara que caia e aquele olhar que não precisa de legenda... Gostam mais de vídeo ou foto minha? 🎬✨",
    hashtags: ["#reels", "#bastidores", "#topbranco", "#exclusivo", "#preview"],
    status: "ready",
    sizeMb: 16.8,
    inMemory: true,
    visualAnalysis: {
      scenario: "Mural artístico street art contemporâneo",
      outfit: "Top tomara que caia branco suave",
      pose: "Leve inclinação de cabeça com cabelos ondulados soltos",
      mood: "Charmosa, descontraída e envolvente",
    },
  },
  {
    id: "july-drive-03",
    type: "photo",
    title: "Generate_photorealistic_picture_of_a_20_years_old_b_2.png",
    url: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=800&q=80",
    previewUrl: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=400&q=80",
    caption: "Tarde tranquila na beira do lago. Boné, regata e natureza... De 0 a 10, que nota você dá pra essa paz? 🌿☀️",
    hashtags: ["#natureza", "#lago", "#bone", "#vibeboa", "#summer"],
    status: "ready",
    sizeMb: 4.8,
    inMemory: true,
    visualAnalysis: {
      scenario: "Beira de lago com árvores e luz natural de fim de tarde",
      outfit: "Regata preta e boné esportivo branco",
      pose: "Sentada de lado olhando por cima do ombro",
      mood: "Aventureira, esportiva e solar",
    },
  },
  {
    id: "july-drive-04",
    type: "video",
    title: "Generate_photorealistic_picture_of_a_20_years_old_b_3.png",
    url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80",
    previewUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80",
    caption: "Aqueles 15 segundos de vídeo ao ar livre que prendem a atenção... O conteúdo completo tá te esperando no link da bio 🔥",
    hashtags: ["#preview", "#video", "#reels", "#vip", "#novidades"],
    status: "ready",
    sizeMb: 14.5,
    inMemory: true,
    visualAnalysis: {
      scenario: "Parque ao ar livre com fundo verde natural",
      outfit: "Casaco jeans aberto e boné",
      pose: "Em pé interagindo com a câmera com sorriso sutil",
      mood: "Casual chic e espontânea",
    },
  },
  {
    id: "july-drive-05",
    type: "photo",
    title: "Generate_photorealistic_picture_of_a_20_years_old_b_4.png",
    url: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80",
    previewUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80",
    caption: "Selfie despretensiosa no espelho do provador. Provando looks novos pra próxima viagem... Aprovado? 👀👗",
    hashtags: ["#selfienoespelho", "#provador", "#look", "#fashion", "#style"],
    status: "ready",
    sizeMb: 3.9,
    inMemory: true,
    visualAnalysis: {
      scenario: "Espelho de provador de loja com iluminação suave",
      outfit: "Look casual moderno com celular na mão",
      pose: "Selfie no espelho mostrando silhueta",
      mood: "Próxima, íntima e espontânea",
    },
  },
  {
    id: "july-drive-06",
    type: "video",
    title: "Generate_photorealistic_picture_of_a_20_years_old_b_5.png",
    url: "https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&w=800&q=80",
    previewUrl: "https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&w=400&q=80",
    caption: "As luzes da cidade à noite combinam demais com essa vibe... Sextou da melhor forma! 🌃🖤",
    hashtags: ["#noite", "#nightout", "#cidade", "#sensual", "#vip"],
    status: "ready",
    sizeMb: 19.2,
    inMemory: true,
    visualAnalysis: {
      scenario: "Cenário noturno urbano com luzes desfocadas",
      outfit: "Regata cropped cinza escuro",
      pose: "Olhar sedutor por cima do ombro",
      mood: "Sensual misteriosa e magnética",
    },
  },
  // --- Próximos itens na fila do Google Drive (guardados com segurança na nuvem) ---
  {
    id: "july-drive-07",
    type: "photo",
    title: "Generate_photorealistic_picture_of_a_20_years_old_b_6.png",
    url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80",
    previewUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80",
    caption: "Camisa aberta e aquele clima intimista em casa. Um registro especial pro feed 🤍",
    hashtags: ["#intimista", "#pretoebranco", "#casa", "#exclusive"],
    status: "idle",
    sizeMb: 4.1,
    inMemory: false,
    visualAnalysis: {
      scenario: "Espelho do quarto com iluminação quente",
      outfit: "Camisa branca de botão e lingerie delicada",
      pose: "Selfie clássica com olhar suave",
      mood: "Intimista e confortável",
    },
  },
  {
    id: "july-drive-08",
    type: "video",
    title: "Generate_photorealistic_picture_of_a_20_years_old_b_7.png",
    url: "https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=800&q=80",
    previewUrl: "https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=400&q=80",
    caption: "Treino pago com sucesso! A endorfina bateu forte hoje 💪 Quem já treinou comenta um fogo 🔥",
    hashtags: ["#fitness", "#gymgirl", "#treinofeminino", "#shape", "#foco"],
    status: "idle",
    sizeMb: 21.0,
    inMemory: false,
    visualAnalysis: {
      scenario: "Academia moderna com aparelhos de musculação",
      outfit: "Top fitness e legging de treino",
      pose: "Postura pós-treino destacando definição",
      mood: "Determinada e focada",
    },
  },
  {
    id: "july-drive-09",
    type: "photo",
    title: "Generate_photorealistic_picture_of_a_20_years_old_b_8.png",
    url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80",
    previewUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80",
    caption: "Golden hour perfeito refletindo nos olhos... Dias ensolarados são os melhores ☀️✨",
    hashtags: ["#goldenhour", "#sorriso", "#summer", "#vibes", "#lifestyle"],
    status: "idle",
    sizeMb: 4.6,
    inMemory: false,
    visualAnalysis: {
      scenario: "Área externa com sol de fim de tarde",
      outfit: "Vestido leve de verão",
      pose: "Sorriso espontâneo para a câmera",
      mood: "Radiante e calorosa",
    },
  },
  {
    id: "july-drive-10",
    type: "video",
    title: "Generate_photorealistic_picture_of_a_20_years_old_b_9.png",
    url: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80",
    previewUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80",
    caption: "Um pouco dos bastidores que quase ninguém vê... Vale a pena conferir o link 🤫🎬",
    hashtags: ["#bastidores", "#reels", "#vip", "#exclusivo", "#shorts"],
    status: "idle",
    sizeMb: 17.5,
    inMemory: false,
    visualAnalysis: {
      scenario: "Estúdio com espelho de camarim",
      outfit: "Look de ensaio contemporâneo",
      pose: "Interação dinâmica em vídeo",
      mood: "Descontraída e provocante",
    },
  },
  {
    id: "july-drive-11",
    type: "photo",
    title: "Generate_photorealistic_picture_of_a_20_years_old_b_10.png",
    url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80",
    previewUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80",
    caption: "Dia de compras e provador... Esse look merece sair hoje à noite? 🛍️✨",
    hashtags: ["#lookdodia", "#shopping", "#espelho", "#fashion", "#style"],
    status: "idle",
    sizeMb: 4.2,
    inMemory: false,
    visualAnalysis: {
      scenario: "Provador moderno com luz suave",
      outfit: "Jeans e cropped neutro",
      pose: "Selfie com celular branco na mão",
      mood: "Casual e estilosa",
    },
  },
  {
    id: "july-drive-12",
    type: "video",
    title: "Generate_photorealistic_picture_of_a_20_years_old_b_11.png",
    url: "https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&w=800&q=80",
    previewUrl: "https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&w=400&q=80",
    caption: "Quando a música certa toca, a vibe muda na hora 🎶🔥 O que você tá ouvindo hoje?",
    hashtags: ["#musica", "#noite", "#vibe", "#reels", "#exclusivo"],
    status: "idle",
    sizeMb: 15.3,
    inMemory: false,
    visualAnalysis: {
      scenario: "Lounge urbano iluminado",
      outfit: "Top preto refinado",
      pose: "Movimento ao ritmo do ambiente",
      mood: "Animada e envolvente",
    },
  },
];

// Estado mestre em memória
export let driveStore: DriveConfig = {
  folderUrl: "https://drive.google.com/drive/folders/1D2KCT6zX80zklkHv5mjvlixFeTAfDAXy",
  connected: true,
  folderName: "July (Google Drive · contigenciads01@gmail.com)",
  autoInterleave: true,
  autoPostingEnabled: isDrivePostingEnabled(),
  batchSize: 6,
  totalInDrive: GOOGLE_DRIVE_FOLDER_POOL.length,
  discardedCount: 0,
  // Mantém apenas o lote de 6 em memória ativa
  items: GOOGLE_DRIVE_FOLDER_POOL.slice(0, 6).map((i) => ({ ...i, inMemory: true })),
};

/**
 * Puxa o próximo lote de 6 mídias da fila do Google Drive
 */
export function pullNextBatchOf6(): DriveMediaItem[] {
  const available = GOOGLE_DRIVE_FOLDER_POOL.filter((i) => i.status !== "published" && i.status !== "discarded");
  const next6 = available.slice(0, 6).map((item) => ({ ...item, inMemory: true, status: "ready" as const }));
  driveStore.items = next6;
  return next6;
}

/**
 * Descarta da memória do bot a mídia que já foi publicada no X, mantendo salva no Google Drive.
 * Puxa imediatamente a próxima da fila para manter sempre 6 mídias ativas na esteira.
 */
export function discardPublishedDriveItem(identifier: string): DriveMediaItem | null {
  if (!identifier) return null;
  const norm = identifier.toLowerCase().trim();

  const idx = driveStore.items.findIndex((i) => {
    return (
      i.id.toLowerCase() === norm ||
      i.title.toLowerCase() === norm ||
      (i.url && norm.includes(i.url.toLowerCase())) ||
      (i.previewUrl && norm.includes(i.previewUrl.toLowerCase())) ||
      (i.caption && norm.includes(i.caption.slice(0, 25).toLowerCase()))
    );
  });

  if (idx >= 0) {
    const item = driveStore.items[idx];
    item.status = "published";
    item.inMemory = false;
    driveStore.discardedCount++;

    // Procura a próxima mídia pendente no Google Drive pool para completar o lote de 6
    const nextCandidate = GOOGLE_DRIVE_FOLDER_POOL.find(
      (p) => !driveStore.items.some((active) => active.id === p.id) && p.status !== "published" && p.id !== item.id
    );

    if (nextCandidate) {
      nextCandidate.status = "ready";
      nextCandidate.inMemory = true;
      driveStore.items[idx] = { ...nextCandidate };
    } else {
      driveStore.items.splice(idx, 1);
    }
    return item;
  }
  return null;
}

export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    driveStore.autoPostingEnabled = isDrivePostingEnabled();
    driveStore.totalInDrive = GOOGLE_DRIVE_FOLDER_POOL.length;
    return NextResponse.json({
      ok: true,
      drive: driveStore,
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as Partial<DriveConfig> & {
      action?: "pull_next_6" | "discard_published" | "connect_folder";
      publishedItemId?: string;
    };

    if (body.action === "pull_next_6") {
      pullNextBatchOf6();
      return NextResponse.json({ ok: true, drive: driveStore });
    }

    if (body.action === "discard_published" && body.publishedItemId) {
      discardPublishedDriveItem(body.publishedItemId);
      return NextResponse.json({ ok: true, drive: driveStore });
    }

    if (body.folderUrl !== undefined) {
      driveStore.folderUrl = String(body.folderUrl).trim();
      driveStore.connected = driveStore.folderUrl.length > 0;
      if (body.folderUrl.includes("drive.google.com")) {
        driveStore.folderName = "July (Google Drive)";
      }
    }
    if (body.folderName !== undefined) {
      driveStore.folderName = String(body.folderName).trim();
    }
    if (body.autoInterleave !== undefined) {
      driveStore.autoInterleave = Boolean(body.autoInterleave);
    }
    if (body.autoPostingEnabled !== undefined) {
      driveStore.autoPostingEnabled = setDrivePostingEnabled(body.autoPostingEnabled);
    }
    if (Array.isArray(body.items)) {
      driveStore.items = body.items.slice(0, 6);
    }

    return NextResponse.json({
      ok: true,
      drive: driveStore,
    });
  } catch (e) {
    return fail(e);
  }
}
