import { NextResponse } from "next/server";
import { requireCron, fail } from "@/lib/http";
import { runSync } from "@/lib/jobs";

export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = await requireCron(req);
  if (denied) return denied;
  try { return NextResponse.json({ synced: await runSync() }); }
  catch (e) { return fail(e); }
}
