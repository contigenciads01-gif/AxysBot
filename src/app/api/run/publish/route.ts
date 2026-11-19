import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { runPublisher } from "@/lib/jobs";

export const maxDuration = 60;

/** "Publicar vencidos agora" pelo painel — mesma fila segura do cron. */
export async function POST() {
  const denied = await requireSession();
  if (denied) return denied;
  try { return NextResponse.json(await runPublisher()); }
  catch (e) { return fail(e); }
}
