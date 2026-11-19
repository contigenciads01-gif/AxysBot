import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { AutomationService } from "@/engine/services/automation-service";
import type { AutomationTaskType, AutomationTaskPayload } from "@/engine/types";

export async function GET(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("account_id") ?? undefined;
    const type = searchParams.get("type") ?? undefined;
    const statusParam = searchParams.get("status");
    const status = statusParam ? statusParam.split(",") : undefined;
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);

    const tasks = await AutomationService.listTasks({
      accountId,
      type,
      status,
      limit,
    });

    return NextResponse.json({ ok: true, tasks });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      accountId?: string;
      type?: AutomationTaskType;
      payload?: AutomationTaskPayload;
      scheduledFor?: string | null;
      priority?: number;
      confirmed?: boolean;
    };

    if (!body.confirmed) {
      return NextResponse.json(
        { error: "Confirmação explícita obrigatória antes de agendar ações no X." },
        { status: 400 }
      );
    }

    if (!body.accountId || !body.type || !body.payload) {
      return NextResponse.json(
        { error: "Campos obrigatórios ausentes: accountId, type, payload." },
        { status: 400 }
      );
    }

    const task = await AutomationService.createTask({
      accountId: body.accountId,
      type: body.type,
      payload: body.payload,
      scheduledFor: body.scheduledFor,
      priority: body.priority,
    });

    return NextResponse.json({ ok: true, task });
  } catch (e) {
    return fail(e);
  }
}
