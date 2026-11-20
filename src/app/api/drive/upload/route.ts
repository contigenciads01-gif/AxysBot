import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { db } from "@/lib/supabase";
import {
  DriveMediaItem,
  GOOGLE_DRIVE_FOLDER_POOL,
  driveStore,
} from "@/app/api/drive/route";

export const dynamic = "force-dynamic";

/**
 * Upload direto de fotos e vídeos da modelo para o Supabase Storage (Bucket 'media').
 * Suporta uploads individuais ou em fila/lote concorrente (otimizado para 74+ arquivos).
 */
export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const formData = await req.formData();
    const single = formData.get("file") as File | null;
    const all = formData.getAll("files") as File[];
    const files = single ? [single, ...all.filter((f) => f !== single)] : all;

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }

    const supabase = db();
    const uploadedItems: DriveMediaItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file || typeof file.arrayBuffer !== "function") continue;

      const isVideo = file.type.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(file.name);
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `july/${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${cleanName}`;

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const sizeMb = Number((buffer.length / (1024 * 1024)).toFixed(1));

      // Upload para o bucket público 'media'
      const { error: uploadError } = await supabase.storage
        .from("media")
        .upload(storagePath, buffer, {
          contentType: file.type || (isVideo ? "video/mp4" : "image/jpeg"),
          upsert: true,
        });

      if (uploadError) {
        console.error("Erro no upload do arquivo:", file.name, uploadError);
        continue;
      }

      // Obtém URL pública permanente do Supabase Storage
      const { data: pubData } = supabase.storage.from("media").getPublicUrl(storagePath);
      const publicUrl = pubData.publicUrl;

      const newItem: DriveMediaItem = {
        id: `upload-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        type: isVideo ? "video" : "photo",
        title: file.name,
        url: publicUrl,
        previewUrl: publicUrl,
        caption: isVideo
          ? `Bastidores em movimento que vocês sempre pedem 🔥 O que acharam dessa energia? Deixa um comentário! 🎬✨`
          : `Novo clique do ensaio... Esse olhar e esse look mereciam vir pro feed 🤍 Me conta: aprovado? ✨`,
        hashtags: isVideo
          ? ["#reels", "#bastidores", "#video", "#exclusivo", "#preview"]
          : ["#ensaio", "#lookdodia", "#lifestyle", "#vip", "#exclusive"],
        status: "ready",
        sizeMb,
        inMemory: true,
        visualAnalysis: {
          scenario: isVideo ? "Estúdio dinâmico em movimento" : "Ensaio fotográfico autêntico",
          outfit: "Look exclusivo July Cardoso",
          pose: "Posicionamento espontâneo para a câmera",
          mood: "Magnética, jovem e estilosa",
        },
      };

      uploadedItems.push(newItem);
    }

    if (uploadedItems.length === 0) {
      return NextResponse.json({ error: "Falha ao processar arquivo." }, { status: 500 });
    }

    // Adiciona as novas mídias reais no início do pool do acervo
    GOOGLE_DRIVE_FOLDER_POOL.unshift(...uploadedItems);
    driveStore.totalInDrive = GOOGLE_DRIVE_FOLDER_POOL.length;

    // Mantém exatamente o lote ativo de 6 mídias na memória do bot
    driveStore.items = GOOGLE_DRIVE_FOLDER_POOL.slice(0, 6).map((item) => ({
      ...item,
      inMemory: true,
    }));

    return NextResponse.json({
      ok: true,
      count: uploadedItems.length,
      item: uploadedItems[0],
      items: uploadedItems,
      drive: driveStore,
    });
  } catch (e) {
    return fail(e);
  }
}
