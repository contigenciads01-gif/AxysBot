import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { getAccount, setPostStatus, deletePost } from "@/lib/data";

type Ctx = { params: Promise<{ id: string }> };
const ALLOWED = new Set(["agendado", "cancelado", "rascunho"]);

/** Reagendar, cancelar, devolver para rascunho ou repetir um que falhou. */
export async function PATCH(req: Request, ctx: Ctx) {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const acc = await getAccount();
    if (!acc) return NextResponse.json({ error: "Sem conta conectada." }, { status: 409 });
    const body = (await req.json()) as { status?: string; scheduledFor?: string | null };
    if (!body.status || !ALLOWED.has(body.status)) {
      return NextResponse.json({ error: "Status invalido." }, { status: 400 });
    }
    let when: string | null | undefined;
    if (body.status === "agendado") {
      const d = new Date(body.scheduledFor ?? Date.now() + 60_000);
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Data invalida." }, { status: 400 });
      when = d.toISOString();
    }
    await setPostStatus(acc.id, id, body.status as "agendado", when);
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const acc = await getAccount();
    if (!acc) return NextResponse.json({ error: "Sem conta conectada." }, { status: 409 });
    await deletePost(acc.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
