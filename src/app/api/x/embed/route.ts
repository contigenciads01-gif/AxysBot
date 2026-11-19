import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { parsePostRef } from "@/lib/intents";
import { fetchEmbed } from "@/lib/oembed";

/** Embed oficial de um post (oEmbed do X). Gratuito, sem chave. */
export async function GET(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const sp = new URL(req.url).searchParams;
    const ref = parsePostRef(sp.get("url") ?? "");
    if (!ref) return NextResponse.json({ error: "Cole o link de um post do X, como x.com/usuario/status/123…" }, { status: 400 });
    const embed = await fetchEmbed(ref.url, { theme: sp.get("theme") === "dark" ? "dark" : "light" });
    return NextResponse.json({ ...embed, id: ref.id, handle: ref.handle });
  } catch (e) { return fail(e); }
}
