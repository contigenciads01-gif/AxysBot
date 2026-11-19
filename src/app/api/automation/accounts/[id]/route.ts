import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { AutomationService } from "@/engine/services/automation-service";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      paused?: boolean;
      config?: Record<string, unknown>;
    };

    if (body.paused !== undefined) {
      await AutomationService.toggleAccountPause(id, body.paused);
    }

    if (body.config) {
      await AutomationService.updateAccountConfig(id, body.config);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const { id } = await params;
    await AutomationService.deleteAccount(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
