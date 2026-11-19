import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { AutomationService } from "@/engine/services/automation-service";

export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const status = await AutomationService.getEngineStatus();
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    return fail(e);
  }
}
