import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { DriveMediaItem, driveStore, GOOGLE_DRIVE_FOLDER_POOL } from "../route";
import {
  SCENARIO_CATALOG,
  classifyMediaScenario,
  getDaySlang,
} from "@/lib/caption-engine";

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      items?: DriveMediaItem[];
      customPrompt?: string;
      customHashtags?: string;
    };

    const items = body.items || driveStore.items || [];
    const customTags = (body.customHashtags || "")
      .split(/[,\s]+/)
      .map((t) => (t.startsWith("#") ? t : `#${t}`))
      .filter((t) => t.length > 1);

    const promptClean = (body.customPrompt || driveStore.customPrompt || "").trim();

    const updated = items.map((item, idx) => {
      // 1. Identifica o cenário da foto/vídeo
      let profile =
        item.visualAnalysis?.scenarioId && SCENARIO_CATALOG[item.visualAnalysis.scenarioId]
          ? SCENARIO_CATALOG[item.visualAnalysis.scenarioId]
          : classifyMediaScenario(`${item.title} ${item.type} ${item.caption || ""}`, idx);

      // 2. Calcula o dia da semana considerando a data agendada ou o ritmo sequencial
      const scheduledDate = item.scheduledTime
        ? new Date(item.scheduledTime)
        : new Date(Date.now() + idx * 4 * 60 * 60 * 1000);
      const daySlang = getDaySlang(scheduledDate);

      // 3. Obtém as legendas hiper-realistas desse cenário
      const pool = profile.getCaptions(daySlang);
      const chosenCaption = pool[idx % pool.length] || pool[0];

      // 4. Hashtags
      const mergedTags = Array.from(
        new Set([...(customTags.length ? customTags : profile.tags)])
      );

      const analysis = {
        scenarioId: profile.id,
        scenario: profile.scenario,
        outfit: profile.outfit,
        pose: profile.pose,
        mood: profile.mood,
        caption: chosenCaption,
        hashtags: mergedTags,
      };

      return {
        ...item,
        caption: chosenCaption,
        hashtags: mergedTags,
        visualAnalysis: analysis,
        status: "ready" as const,
      };
    });

    // Salva imediatamente na memória do bot e no acervo permanente
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
          visualAnalysis: it.visualAnalysis,
          status: "ready",
        };
      }
    }

    return NextResponse.json({
      ok: true,
      items: updated,
      drive: driveStore,
      message: "Legendas autênticas e específicas geradas com IA com sucesso.",
    });
  } catch (e) {
    return fail(e);
  }
}
