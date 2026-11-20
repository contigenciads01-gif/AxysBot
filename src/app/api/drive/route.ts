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
  status: "idle" | "ready" | "scheduled";
  sizeMb?: number;
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
  autoInterleave: boolean; // Intercalar Foto / Vídeo
  autoPostingEnabled: boolean; // Ligar / Desligar postagem de vídeos/fotos (Modo Apenas Aquecimento)
  items: DriveMediaItem[];
}

// Exemplos realistas e curados para o acervo de modelo
const DEFAULT_DRIVE_ITEMS: DriveMediaItem[] = [
  {
    id: "item-1",
    type: "photo",
    title: "Ensaio_GoldenHour_01.jpg",
    url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80",
    previewUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
    caption: "A luz certa muda tudo... Um pouco do que rolou no ensaio de hoje ✨ Qual foi sua foto favorita?",
    hashtags: ["#lifestyle", "#goldenhour", "#ensaio", "#preview", "#exclusive"],
    status: "ready",
    sizeMb: 4.2,
  },
  {
    id: "item-2",
    type: "video",
    title: "Bastidores_Lingerie_Reels.mp4",
    url: "https://assets.mixkit.co/videos/preview/mixkit-girl-in-a-leather-jacket-smiling-41131-large.mp4",
    previewUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80",
    caption: "Aqueles 15 segundos que você não vai conseguir assistir só uma vez 🔥 O restante tá completo lá no link da bio...",
    hashtags: ["#bastidores", "#reels", "#vip", "#exclusivo", "#novidades"],
    status: "ready",
    sizeMb: 18.5,
  },
  {
    id: "item-3",
    type: "photo",
    title: "Close_Espelho_Noite.jpg",
    url: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80",
    previewUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80",
    caption: "Sextou daquele jeito que a gente gosta. Pronta pra sair ou melhor ficar em casa? 🖤",
    hashtags: ["#lookdodia", "#nightout", "#vipcontent", "#blackout"],
    status: "ready",
    sizeMb: 3.8,
  },
  {
    id: "item-4",
    type: "video",
    title: "Preview_Proibido_Shorts.mp4",
    url: "https://assets.mixkit.co/videos/preview/mixkit-young-woman-posing-with-creative-lighting-41130-large.mp4",
    previewUrl: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=400&q=80",
    caption: "Um teaser rapidinho porque vocês pediram muito na DM... Gostaram do ângulo? 👀 Link no topo!",
    hashtags: ["#preview", "#exclusivo", "#novidade", "#sensual", "#trend"],
    status: "ready",
    sizeMb: 14.1,
  },
  {
    id: "item-5",
    type: "photo",
    title: "Bikini_Sunset_Beach.jpg",
    url: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=800&q=80",
    previewUrl: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=400&q=80",
    caption: "Dias de sol e paz. Saudades de uma praia assim! De 0 a 10, que nota você dá pra essa vista? 🌊☀️",
    hashtags: ["#beachvibes", "#summer", "#bikini", "#verao", "#biquini"],
    status: "ready",
    sizeMb: 5.1,
  },
  {
    id: "item-6",
    type: "video",
    title: "Gym_Workout_POV.mp4",
    url: "https://assets.mixkit.co/videos/preview/mixkit-woman-exercising-on-a-cross-trainer-machine-41132-large.mp4",
    previewUrl: "https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=400&q=80",
    caption: "Treino pago com sucesso! A endorfina bateu forte hoje 💪 Quem já treinou comenta um fogo 🔥",
    hashtags: ["#fitness", "#gymgirl", "#treinofeminino", "#shape", "#foco"],
    status: "ready",
    sizeMb: 22.4,
  },
];

let driveStore: DriveConfig = {
  folderUrl: "https://drive.google.com/drive/folders/17JULIE_CARDOSO_CONTENT_VAULT_2026",
  connected: true,
  folderName: "Acervo de Conteúdo Modelo (Fotos & Vídeos HD)",
  autoInterleave: true,
  autoPostingEnabled: isDrivePostingEnabled(),
  items: [...DEFAULT_DRIVE_ITEMS],
};

export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    driveStore.autoPostingEnabled = isDrivePostingEnabled();
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
    const body = (await req.json().catch(() => ({}))) as Partial<DriveConfig>;

    if (body.folderUrl !== undefined) {
      driveStore.folderUrl = String(body.folderUrl).trim();
      driveStore.connected = driveStore.folderUrl.length > 0;
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
      driveStore.items = body.items;
    }

    return NextResponse.json({
      ok: true,
      drive: driveStore,
    });
  } catch (e) {
    return fail(e);
  }
}
