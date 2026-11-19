import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { AutomationService } from "@/engine/services/automation-service";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const { id } = await params;
    await AutomationService.cancelTask(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
