import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { runSync } from "@/lib/jobs";

export const maxDuration = 60;

export async function POST() {
  const denied = await requireSession();
  if (denied) return denied;
  try { return NextResponse.json({ synced: await runSync() }); }
  catch (e) { return fail(e); }
}
