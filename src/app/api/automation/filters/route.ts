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
      keywords: "marketing, tech, crypto, startup, ia, empreendedorismo, business",
      targetProfiles: "@elonmusk, @sama, @paulg",
      targetLinks: "",
      mirrorOwnReposts: true,
      discoveryMode: "hybrid" as const, // "hybrid" | "links" | "mirror" | "niche"
      autoLike: true,
      autoBookmark: true,
      autoRetweet: true,
      autoVisitProfile: true,
      autoComment: false,
      commentTemplates: "Excelente visão! 👏\nMuito bom esse insight.\nConcordo totalmente com esse ponto.",
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
    await db().from("settings").update({
      target_filters: body.filters,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, filters: body.filters });
  } catch (e) {
    return fail(e);
  }
}
