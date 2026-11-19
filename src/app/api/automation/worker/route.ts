import { NextResponse } from "next/server";
import { requireCron, requireSession } from "@/lib/http";
import { Scheduler } from "@/engine/scheduler/scheduler";
import { AutomationService } from "@/engine/services/automation-service";

export async function POST(req: Request) {
  // Permite execução via Cron do Vercel/GitHub Actions OU sessão de admin logado no painel
  const cronDenied = await requireCron(req);
  if (cronDenied) {
    const sessionDenied = await requireSession();
    if (sessionDenied) return cronDenied;
  }

  try {
    // 1. Verifica se o motor está ligado
    const status = await AutomationService.getEngineStatus();
    if (!status.enabled) {
      return NextResponse.json({
        ok: false,
        message: "Motor de automação está desligado ou sem contas ativas.",
        status,
      });
    }

    // 2. Roda o scheduler
    const result = await Scheduler.run();
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("[AutomationWorker] Erro na execução:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
