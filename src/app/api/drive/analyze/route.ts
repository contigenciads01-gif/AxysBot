import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { DriveMediaItem } from "../route";
import {
  SCENARIO_CATALOG,
  classifyMediaScenario,
  getDaySlang,
  ScenarioProfile,
} from "@/lib/caption-engine";

export interface VisualAnalysisResult {
  scenarioId?: string;
  scenario: string;
  outfit: string;
  pose: string;
  mood: string;
  caption: string;
  hashtags: string[];
}

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      item?: DriveMediaItem;
      scenarioId?: string;
      fallbackIndex?: number;
      targetDate?: string;
    };

    const item = body.item;
    if (!item) {
      return NextResponse.json({ error: "Item de mídia não fornecido para análise." }, { status: 400 });
    }

    // Identifica o cenário solicitado ou detecta automaticamente
    let profile: ScenarioProfile;
    if (body.scenarioId && SCENARIO_CATALOG[body.scenarioId]) {
      profile = SCENARIO_CATALOG[body.scenarioId];
    } else {
      const searchString = `${item.title} ${item.type} ${item.caption || ""}`;
      profile = classifyMediaScenario(searchString, body.fallbackIndex || 0);
    }

    const daySlang = getDaySlang(body.targetDate || item.scheduledTime);
    const captions = profile.getCaptions(daySlang);
    const randomIdx = Math.floor(Math.random() * captions.length);
    const dedicatedCaption = captions[randomIdx] || captions[0];

    const analysis: VisualAnalysisResult = {
      scenarioId: profile.id,
      scenario: profile.scenario,
      outfit: profile.outfit,
      pose: profile.pose,
      mood: profile.mood,
      caption: dedicatedCaption,
      hashtags: profile.tags,
    };

    return NextResponse.json({
      ok: true,
      analysis,
      item: {
        ...item,
        caption: dedicatedCaption,
        hashtags: profile.tags,
        visualAnalysis: analysis,
      },
    });
  } catch (e) {
    return fail(e);
  }
}
