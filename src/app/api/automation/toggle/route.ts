import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { AutomationService } from "@/engine/services/automation-service";

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as { enabled?: boolean };
    const enabled = Boolean(body.enabled);

    await AutomationService.setEngineEnabled(enabled);
    const status = await AutomationService.getEngineStatus();

    return NextResponse.json({ ok: true, enabled, status });
  } catch (e) {
    return fail(e);
  }
}
