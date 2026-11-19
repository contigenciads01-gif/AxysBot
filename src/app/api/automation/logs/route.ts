import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { AutomationService } from "@/engine/services/automation-service";

export async function GET(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("account_id") ?? undefined;
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);

    const logs = await AutomationService.listLogs({ accountId, limit });
    return NextResponse.json({ ok: true, logs });
  } catch (e) {
    return fail(e);
  }
}
