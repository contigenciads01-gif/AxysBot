import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { getAccount } from "@/lib/data";
import { logRun } from "@/lib/supabase";
import { parsePostRef } from "@/lib/intents";

/** Registra no painel uma resposta ou repost que VOCE confirmou no X. */
export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const acc = await getAccount();
    if (!acc) return NextResponse.json({ error: "Identifique sua conta do X em Ajustes." }, { status: 409 });
    const b = (await req.json().catch(() => ({}))) as { kind?: string; post?: string; author?: string };
    if (b.kind !== "responder" && b.kind !== "repostar") return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    const ref = parsePostRef(String(b.post ?? ""));
    if (!ref) return NextResponse.json({ error: "Link de post inválido." }, { status: 400 });
    const who = b.author ? ` de ${String(b.author).slice(0, 60)}` : ref.handle ? ` de @${ref.handle}` : "";
    await logRun({ account_id: acc.id, kind: b.kind, ok: true, detail: `${b.kind === "responder" ? "Resposta enviada ao post" : "Repost do post"}${who}` });
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
