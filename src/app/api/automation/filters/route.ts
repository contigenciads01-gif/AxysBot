import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { db } from "@/lib/supabase";

export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const { data } = await db()
      .from("settings")
      .select("target_filters")
      .limit(1)
      .maybeSingle();

    const defaultFilters = {
      keywords: "big ass, gostosas, beautiful woman, loirinhas, vazados, modelo, privacy, onlyfans, biquini, decote, sensual, ensaio",
      targetProfiles: "@JulyCardosoCirc, @modelos_brasil, @privacybrasil, @onlyfansbrasil",
      targetLinks: "",
      mirrorOwnReposts: true,
      discoveryMode: "niche" as const, // "niche" | "hybrid" | "links" | "mirror"
      autoLike: true,
      autoBookmark: true,
      autoRetweet: true,
      autoVisitProfile: true,
      autoComment: false,
      commentTemplates: "Maravilhosa demais! 🔥\nPerfeita essa foto! 😍\nLinda demais, acompanhando aqui! ❤️",
    };

    return NextResponse.json({
      ok: true,
      filters: data?.target_filters ? { ...defaultFilters, ...data.target_filters } : defaultFilters,
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as { filters?: unknown };
    if (!body.filters) {
      return NextResponse.json({ error: "Filtros não informados." }, { status: 400 });
    }

    // Salva ou atualiza os filtros
    const { data: existing } = await db().from("settings").select("id").limit(1).maybeSingle();
    if (existing?.id) {
      await db().from("settings").update({
        target_filters: body.filters,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await db().from("settings").insert({
        target_filters: body.filters,
        updated_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ ok: true, filters: body.filters });
  } catch (e) {
    return fail(e);
  }
}
