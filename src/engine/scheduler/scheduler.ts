import "server-only";
import { db } from "@/lib/supabase";
import { TaskWorker } from "../workers/task-worker";
import type { BotConfig } from "../types";

export class Scheduler {
  /**
   * Executa a rotina do agendador:
   * 1. Confere contas ativas e horários operacionais
   * 2. Enfileira tarefas vencidas
   * 3. Executa o worker de tarefas
   */
  static async run(): Promise<{
    enqueued: number;
    worker: { claimed: number; completed: number; failed: number; rateLimited: number };
  }> {
    const now = new Date();
    const nowIso = now.toISOString();

    // 1. Busca todas as contas ativas que não estão pausadas
    const { data: accounts } = await db()
      .from("platform_accounts")
      .select("id, username, is_active, paused")
      .eq("is_active", true)
      .eq("paused", false);

    if (!accounts || accounts.length === 0) {
      return {
        enqueued: 0,
        worker: { claimed: 0, completed: 0, failed: 0, rateLimited: 0 },
      };
    }

    let totalEnqueued = 0;

    // 2. Para cada conta, verifica horários e enfileira tarefas
    for (const acc of accounts) {
      const config = await this.getAccountConfig(acc.id);
      if (!config.enabled) continue;

      // Confere se hoje é dia útil operacional da conta
      const dayOfWeek = now.getDay(); // 0 = Domingo, 6 = Sábado
      if (!config.working_days.includes(dayOfWeek)) continue;

      // Confere se estamos dentro da janela de horário operacional
      const [startH, startM] = config.working_hours_start.split(":").map(Number);
      const [endH, endM] = config.working_hours_end.split(":").map(Number);
      const currentH = now.getHours();
      const currentM = now.getMinutes();

      const currentMinutes = currentH * 60 + currentM;
      const startMinutes = (startH ?? 8) * 60 + (startM ?? 0);
      const endMinutes = (endH ?? 22) * 60 + (endM ?? 0);

      if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
        continue;
      }

      // Enfileira tarefas pendentes que chegaram no horário e ainda não estão na fila
      const { data: dueTasks } = await db()
        .from("automation_tasks")
        .select("id, account_id, priority, scheduled_for")
        .eq("account_id", acc.id)
        .in("status", ["pending", "waiting_rate_limit"])
        .lte("scheduled_for", nowIso)
        .limit(10);

      if (dueTasks && dueTasks.length > 0) {
        for (const t of dueTasks) {
          // Verifica se já está na fila
          const { data: existing } = await db()
            .from("automation_queue")
            .select("id")
            .eq("task_id", t.id)
            .maybeSingle();

          if (!existing) {
            await db().from("automation_queue").insert({
              task_id: t.id,
              account_id: t.account_id,
              priority: t.priority,
              scheduled_for: t.scheduled_for,
            });
            totalEnqueued++;
          }
        }
      }
    }

    // 3. Roda o worker de tarefas
    const worker = new TaskWorker();
    const workerRes = await worker.processBatch(10);

    return {
      enqueued: totalEnqueued,
      worker: {
        claimed: workerRes.claimed,
        completed: workerRes.completed,
        failed: workerRes.failed,
        rateLimited: workerRes.rateLimited,
      },
    };
  }

  private static async getAccountConfig(accountId: string): Promise<BotConfig> {
    const { data } = await db()
      .from("bot_configs")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle();

    if (data) return data as BotConfig;

    // Config padrão segura caso ainda não tenha sido customizada
    return {
      account_id: accountId,
      enabled: true,
      working_hours_start: "08:00",
      working_hours_end: "22:00",
      working_days: [1, 2, 3, 4, 5],
      daily_post_limit: 25,
      daily_repost_limit: 50,
      min_interval_seconds: 120,
      max_interval_seconds: 600,
      timezone: "America/Sao_Paulo",
      auto_pause_on_error: true,
      max_retries: 3,
    };
  }
}
