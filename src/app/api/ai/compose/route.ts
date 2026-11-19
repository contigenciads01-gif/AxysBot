import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { compose, type ComposeMode } from "@/lib/ai";

const MODES = new Set<ComposeMode>(["variacoes", "thread", "resposta", "melhorar"]);

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const { mode, input, tone } = (await req.json()) as { mode?: ComposeMode; input?: string; tone?: string };
    if (!mode || !MODES.has(mode)) return NextResponse.json({ error: "Modo invalido." }, { status: 400 });
    if (!input?.trim()) return NextResponse.json({ error: "Escreva algo para a IA trabalhar." }, { status: 400 });
    return NextResponse.json(await compose(mode, input, tone));
  } catch (e) { return fail(e); }
}
