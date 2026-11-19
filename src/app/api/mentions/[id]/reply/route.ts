import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { getAccount } from "@/lib/data";
import { db, logRun } from "@/lib/supabase";
import { createPost } from "@/lib/x-api";
import { weightedLength, X_LIMIT } from "@/lib/thread";

type Ctx = { params: Promise<{ id: string }> };

/** Responde UMA mencao, por acao explicita do usuario no inbox. */
export async function POST(req: Request, ctx: Ctx) {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const acc = await getAccount();
    if (!acc) return NextResponse.json({ error: "Sem conta conectada." }, { status: 409 });
    const { text } = (await req.json()) as { text?: string };
    const body = text?.trim() ?? "";
    if (!body) return NextResponse.json({ error: "Escreva a resposta." }, { status: 400 });
    if (weightedLength(body) > X_LIMIT) return NextResponse.json({ error: `Passou de ${X_LIMIT} caracteres.` }, { status: 400 });

    const { data: m } = await db().from("mentions").select("x_post_id,replied")
      .eq("account_id", acc.id).eq("x_post_id", id).maybeSingle();
    if (!m) return NextResponse.json({ error: "Mencao nao encontrada." }, { status: 404 });
    if (m.replied) return NextResponse.json({ error: "Essa mencao ja foi respondida." }, { status: 409 });

    const replyId = await createPost(acc.id, body, id);
    await db().from("mentions").update({ replied: true, reply_post_id: replyId }).eq("x_post_id", id);
    await logRun({ account_id: acc.id, kind: "publicar", ok: true, detail: "Resposta a menção publicada" });
    return NextResponse.json({ ok: true, id: replyId });
  } catch (e) { return fail(e); }
}
