import type { Metadata } from "next";
import { AutomationService } from "@/engine/services/automation-service";
import { AutomationDashboard } from "@/components/automation-dashboard";

export const metadata: Metadata = {
  title: "Motor de Automação · AXYSBOT",
  description: "Gerenciamento do motor de automação e aquecimento de contas no X",
};

export default async function BotPage() {
  const [status, accounts] = await Promise.all([
    AutomationService.getEngineStatus().catch(() => ({
      enabled: false,
      active_accounts: 0,
      total_accounts: 0,
      pending_tasks: 0,
      processing_tasks: 0,
      completed_today: 0,
      failed_today: 0,
      uptime_seconds: 0,
      last_run_at: null,
    })),
    AutomationService.listAccounts().catch(() => []),
  ]);

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Motor de Automação</h1>
          <p className="mt-1 text-[var(--ink-2)] max-w-[70ch]">
            Execução de tarefas reais no X com controle de rate limit, isolamento de sessões, fila atômica e logs de auditoria.
          </p>
        </div>
      </header>

      <AutomationDashboard initialStatus={status} initialAccounts={accounts} />
    </div>
  );
}
