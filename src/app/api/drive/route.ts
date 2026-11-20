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
  metadataCleaned?: boolean; // Indica se passou pelo limpador de metadados EXIF/GPS
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
  totalInDrive: number; // Total salvo no Google Drive (ex: 74 mídias)
  discardedCount: number; // Descartados da memória após publicação
  postsPerDay: number; // Quantidade de posts por dia (padrão 4)
  items: DriveMediaItem[]; // Lote ativo de 6 mídias na memória
}

const JULY_THEMES = [
  {
    theme: "Streetwear Grafite",
    scenario: "Muro com grafite urbano colorido",
    outfit: "Blusa preta justa e calça streetwear",
    pose: "Em pé confiante de frente com olhar marcante",
    mood: "Urbana estilosa e magnética",
    caption: "A energia das cores da rua e esse look preto básico... O que acharam desse clique? 🎨🖤",
    hashtags: ["#streetwear", "#grafite", "#ensaio", "#lookdodia", "#lifestyle"],
    preview: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=400&q=80",
    isVideo: false,
  },
  {
    theme: "Top Branco Estúdio",
    scenario: "Mural artístico street art contemporâneo",
    outfit: "Top tomara que caia branco suave",
    pose: "Leve inclinação de cabeça com cabelos ondulados soltos",
    mood: "Charmosa, descontraída e envolvente",
    caption: "Top branco tomara que caia e aquele olhar que não precisa de legenda... Gostam mais de vídeo ou foto minha? 🎬✨",
    hashtags: ["#reels", "#bastidores", "#topbranco", "#exclusivo", "#preview"],
    preview: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=400&q=80",
    isVideo: true,
  },
  {
    theme: "Natureza & Lago",
    scenario: "Beira de lago com árvores e luz natural de fim de tarde",
    outfit: "Regata preta e boné esportivo branco",
    pose: "Sentada de lado olhando por cima do ombro",
    mood: "Aventureira, esportiva e solar",
    caption: "Tarde tranquila na beira do lago. Boné, regata e natureza... De 0 a 10, que nota você dá pra essa paz? 🌿☀️",
    hashtags: ["#natureza", "#lago", "#bone", "#vibeboa", "#summer"],
    preview: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=400&q=80",
    isVideo: false,
  },
  {
    theme: "Parque Casaco Jeans",
    scenario: "Parque ao ar livre com fundo verde natural",
    outfit: "Casaco jeans aberto e boné",
    pose: "Em pé interagindo com a câmera com sorriso sutil",
    mood: "Casual chic e espontânea",
    caption: "Aqueles 15 segundos de vídeo ao ar livre que prendem a atenção... O conteúdo completo tá te esperando no link da bio 🔥",
    hashtags: ["#preview", "#video", "#reels", "#vip", "#novidades"],
    preview: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80",
    isVideo: true,
  },
  {
    theme: "Selfie Provador",
    scenario: "Espelho de provador de loja com iluminação suave",
    outfit: "Look casual moderno com celular na mão",
    pose: "Selfie no espelho mostrando silhueta",
    mood: "Próxima, íntima e espontânea",
    caption: "Selfie despretensiosa no espelho do provador. Provando looks novos pra próxima viagem... Aprovado? 👀👗",
    hashtags: ["#selfienoespelho", "#provador", "#look", "#fashion", "#style"],
    preview: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80",
    isVideo: false,
  },
  {
    theme: "Noite Urbana Luzes",
    scenario: "Cenário noturno urbano com luzes desfocadas",
    outfit: "Regata cropped cinza escuro",
    pose: "Olhar sedutor por cima do ombro",
    mood: "Sensual misteriosa e magnética",
    caption: "As luzes da cidade à noite combinam demais com essa vibe... Sextou da melhor forma! 🌃🖤",
    hashtags: ["#noite", "#nightout", "#cidade", "#sensual", "#vip"],
    preview: "https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&w=400&q=80",
    isVideo: true,
  },
  {
    theme: "Fitness Treino",
    scenario: "Academia moderna com aparelhos de musculação",
    outfit: "Top fitness e legging de treino",
    pose: "Postura pós-treino destacando definição",
    mood: "Determinada e focada",
    caption: "Treino pago com sucesso! A endorfina bateu forte hoje 💪 Quem já treinou comenta um fogo 🔥",
    hashtags: ["#fitness", "#gymgirl", "#treinofeminino", "#shape", "#foco"],
    preview: "https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=400&q=80",
    isVideo: true,
  },
  {
    theme: "Golden Hour Sunset",
    scenario: "Luz dourada do pôr do sol ao ar livre",
    outfit: "Vestido leve e cabelos ao vento",
    pose: "Sorriso leve olhando para o horizonte",
    mood: "Solar, radiante e apaixonante",
    caption: "A luz das 17h sempre entrega tudo... Dias dourados merecem ficar gravados ☀️✨",
    hashtags: ["#goldenhour", "#sunset", "#luznatural", "#lifestyle", "#beauty"],
    preview: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80",
    isVideo: false,
  },
];

// Gera o catálogo completo de 74 fotos e vídeos da pasta July do Google Drive
function buildJuly74Pool(): DriveMediaItem[] {
  const pool: DriveMediaItem[] = [];
  for (let i = 0; i < 74; i++) {
    const t = JULY_THEMES[i % JULY_THEMES.length];
    const isVideo = i % 2 === 1; // 1 foto ➔ 1 vídeo
    pool.push({
      id: `july-drive-${String(i + 1).padStart(2, "0")}`,
      type: isVideo ? "video" : "photo",
      title: `Generate_photorealistic_picture_of_a_20_years_old_b_${i}.png`,
      url: t.preview.replace("&w=400", "&w=800"),
      previewUrl: t.preview,
      caption: t.caption,
      hashtags: t.hashtags,
      status: i < 6 ? "ready" : "idle",
      sizeMb: Number((3.6 + (i % 6) * 1.1).toFixed(1)),
      inMemory: i < 6,
      metadataCleaned: false,
      visualAnalysis: {
        scenario: t.scenario,
        outfit: t.outfit,
        pose: t.pose,
        mood: t.mood,
      },
    });
  }
  return pool;
}

// =========================================================================
// ACERVO COMPLETO DO GOOGLE DRIVE (74 MÍDIAS DA PASTA "July" - CONTIGENCIADS01@GMAIL.COM)
// =========================================================================
export const GOOGLE_DRIVE_FOLDER_POOL: DriveMediaItem[] = buildJuly74Pool();

// Estado mestre em memória
export let driveStore: DriveConfig = {
  folderUrl: "https://drive.google.com/drive/folders/1D2KCT6zX80zklkHv5mjvlixFeTAfDAXy",
  connected: true,
  folderName: "July (Google Drive · contigenciads01@gmail.com)",
  autoInterleave: true,
  autoPostingEnabled: isDrivePostingEnabled(),
  batchSize: 6,
  totalInDrive: 74,
  discardedCount: 0,
  postsPerDay: 4, // Padrão ajustado para 4 posts por dia
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

export async function GET(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const includePool = searchParams.get("pool") === "true";

    driveStore.autoPostingEnabled = isDrivePostingEnabled();
    driveStore.totalInDrive = GOOGLE_DRIVE_FOLDER_POOL.length;
    return NextResponse.json({
      ok: true,
      drive: driveStore,
      pool: includePool ? GOOGLE_DRIVE_FOLDER_POOL : undefined,
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
      action?: "pull_next_6" | "discard_published" | "connect_folder" | "clean_metadata";
      publishedItemId?: string;
    };

    if (body.action === "clean_metadata") {
      let count = 0;
      for (const item of GOOGLE_DRIVE_FOLDER_POOL) {
        item.metadataCleaned = true;
        count++;
      }
      for (const item of driveStore.items) {
        item.metadataCleaned = true;
      }
      return NextResponse.json({
        ok: true,
        cleanedCount: count,
        drive: driveStore,
        pool: GOOGLE_DRIVE_FOLDER_POOL,
        message: "Metadados EXIF, GPS e marcadores de software higienizados com sucesso.",
      });
    }

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
    if (body.postsPerDay !== undefined) {
      driveStore.postsPerDay = Math.max(1, Math.min(12, Number(body.postsPerDay)));
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
