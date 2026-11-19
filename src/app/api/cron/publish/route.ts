import { NextResponse } from "next/server";
import { requireCron, fail } from "@/lib/http";
import { runPublisher } from "@/lib/jobs";

export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  try { return NextResponse.json(await runPublisher()); }
  catch (e) { return fail(e); }
}
