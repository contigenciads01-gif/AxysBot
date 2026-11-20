import type { Metadata } from "next";
import { AutomationService } from "@/engine/services/automation-service";
import { AntidetectDashboard } from "@/components/antidetect-dashboard";

export const metadata: Metadata = {
  title: "Aquecedor & Multi-Contas · AXYSBOT",
  description: "Gerenciamento multi-contas, proxies isoladas e motor de aquecimento humano para o X",
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
    <div className="flex flex-col gap-[var(--gap)] w-full max-w-full">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Aquecedor de Contas & Multi-Perfil</h1>
          <p className="mt-1 text-[var(--ink-2)] max-w-[75ch]">
            Controle de contas com e-mail, senha, proxies dedicadas, inicialização isolada no Chrome e aquecimento orgânico indetectável.
          </p>
        </div>
      </header>

      <AntidetectDashboard initialStatus={status} initialAccounts={accounts} />
    </div>
  );
}
