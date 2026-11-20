import "server-only";
import { db } from "@/lib/supabase";
import { TokenVault } from "../security/token-vault";
import { XConnector, RateLimitError, AuthError, type XHeadersInfo } from "../connectors/x-connector";
import { RateLimiter } from "../services/rate-limiter";
import { MetricsCollector } from "../metrics/collector";
import { isDrivePostingEnabled } from "@/lib/posting-switch";
import type { AutomationTask } from "../types";

export interface WorkerProcessResult {
  claimed: number;
  completed: number;
  failed: number;
  rateLimited: number;
  durationMs: number;
}

export class TaskWorker {
  private readonly workerId: string;

  constructor(workerId = `worker-${Math.random().toString(36).slice(2, 8)}`) {
    this.workerId = workerId;
  }

  /**
   * Busca e processa as próximas tarefas pendentes da fila.
   */
  async processBatch(maxTasks = 5): Promise<WorkerProcessResult> {
    const start = Date.now();
    let completed = 0;
    let failed = 0;
    let rateLimited = 0;

    // 1. Reclama tarefas atômicas via RPC ou fallback direto
    const tasks = await this.claimTasks(maxTasks);
    if (!tasks || tasks.length === 0) {
      return { claimed: 0, completed: 0, failed: 0, rateLimited: 0, durationMs: Date.now() - start };
    }

    // 2. Executa cada tarefa com tratamento rigoroso
    for (const task of tasks) {
      try {
        const res = await this.executeSingleTask(task);
        if (res === "completed") completed++;
        else if (res === "rate_limited") rateLimited++;
        else failed++;
      } catch (e) {
        console.error(`[TaskWorker] Erro crítico na task ${task.id}:`, e);
        failed++;
      }
    }

    return {
      claimed: tasks.length,
      completed,
      failed,
      rateLimited,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Reclama tarefas via RPC claim_automation_tasks (com fallback resiliente).
   */
  private async claimTasks(maxTasks: number): Promise<AutomationTask[]> {
    try {
      const { data, error } = await db().rpc("claim_automation_tasks", {
        max_tasks: maxTasks,
        p_worker_id: this.workerId,
      });

      if (!error && Array.isArray(data)) {
        return data as AutomationTask[];
      }
    } catch {
      // Se a função SQL ainda não estiver no schema cache, roda query direta segura
    }

    // Fallback: Busca manual com atualização
    const nowIso = new Date().toISOString();
    const { data: queueItems } = await db()
      .from("automation_queue")
      .select("id, task_id")
      .lte("scheduled_for", nowIso)
      .is("claimed_at", null)
      .order("priority", { ascending: false })
      .order("scheduled_for", { ascending: true })
      .limit(maxTasks);

    if (!queueItems || queueItems.length === 0) return [];

    const queueIds = queueItems.map((q) => q.id);
    const taskIds = queueItems.map((q) => q.task_id);

    // Marca como claimed na fila
    await db()
      .from("automation_queue")
      .update({ claimed_at: nowIso, worker_id: this.workerId })
      .in("id", queueIds);

    // Busca e atualiza as tasks
    const { data: tasks } = await db()
      .from("automation_tasks")
      .update({
        status: "processing",
        started_at: nowIso,
        updated_at: nowIso,
      })
      .in("id", taskIds)
      .in("status", ["pending", "waiting_rate_limit"])
      .select("*");

    return (tasks ?? []) as AutomationTask[];
  }

  /**
   * Executa uma única tarefa.
   */
  private async executeSingleTask(
    task: AutomationTask
  ): Promise<"completed" | "failed" | "rate_limited"> {
    const taskStart = Date.now();

    // 1. Busca dados da conta
    const { data: account, error: accErr } = await db()
      .from("platform_accounts")
      .select("id, x_user_id, username, is_active, paused")
      .eq("id", task.account_id)
      .single();

    if (accErr || !account) {
      await this.markTaskFailed(task, "ACCOUNT_NOT_FOUND", "Conta associada à tarefa não encontrada.");
      return "failed";
    }

    if (!account.is_active || account.paused) {
      await this.markTaskPaused(task, "Conta inativa ou pausada pelo usuário.");
      return "failed";
    }

    // 2. Verifica Rate Limit no endpoint alvo
    const endpointName = this.getEndpointForTask(task.task_type);
    const limitCheck = await RateLimiter.checkLimit(account.id, endpointName);
    if (!limitCheck.canProceed && limitCheck.resetAt) {
      await this.markTaskRateLimited(task, limitCheck.resetAt);
      return "rate_limited";
    }

    // 3. Obtém tokens descriptografados
    let tokens;
    try {
      tokens = await TokenVault.getTokens(account.id);
    } catch (e) {
      await this.markTaskFailed(task, "AUTH_DECRYPT_FAIL", (e as Error).message);
      return "failed";
    }

    const connector = new XConnector(tokens.access_token);

    // 4. Executa a ação na API oficial do X
    try {
      let xPostId: string | null = null;
      let rateLimit: XHeadersInfo | undefined;
      const resultData: Record<string, unknown> = {};

      switch (task.task_type) {
        case "post": {
          if (!isDrivePostingEnabled()) {
            await this.markTaskPaused(task, "Modo Apenas Aquecimento ativo: postagens do Drive pausadas.");
            return "completed";
          }
          const text = String(task.payload.text ?? "");
          const res = await connector.createPost(text, {
            quotePostId: task.payload.quote_post_id ? String(task.payload.quote_post_id) : undefined,
          });
          xPostId = res.id;
          rateLimit = res.rateLimit;
          resultData.x_post_id = res.id;
          break;
        }

        case "thread": {
          const items = Array.isArray(task.payload.items) ? task.payload.items.map(String) : [];
          const res = await connector.createThread(items);
          xPostId = res.ids[0] ?? null;
          rateLimit = res.rateLimit;
          resultData.x_post_ids = res.ids;
          break;
        }

        case "reply": {
          const targetId = String(task.payload.post_id ?? task.payload.in_reply_to_id ?? "");
          const text = String(task.payload.text ?? "");
          const res = await connector.replyToPost(targetId, text);
          xPostId = res.id;
          rateLimit = res.rateLimit;
          resultData.x_post_id = res.id;
          break;
        }

        case "repost": {
          const targetId = String(task.payload.post_id ?? "");
          const res = await connector.repost(account.x_user_id, targetId);
          rateLimit = res.rateLimit;
          resultData.reposted = res.retweeted;
          break;
        }

        case "undo_repost": {
          const targetId = String(task.payload.post_id ?? "");
          const res = await connector.undoRepost(account.x_user_id, targetId);
          rateLimit = res.rateLimit;
          resultData.undone = true;
          break;
        }

        default:
          throw new Error(`Tipo de tarefa desconhecido: ${task.task_type}`);
      }

      const durationMs = Date.now() - taskStart;

      // 5. Sucesso: atualiza task e remove da fila
      await db()
        .from("automation_tasks")
        .update({
          status: "completed",
          result: resultData,
          x_post_id: xPostId,
          error_message: null,
          error_code: null,
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", task.id);

      // Remove da fila
      await db().from("automation_queue").delete().eq("task_id", task.id);

      // Atualiza controle de rate limits
      if (rateLimit) {
        await RateLimiter.updateLimit(account.id, endpointName, rateLimit);
      }

      // Registra log e métricas
      await MetricsCollector.recordAction({
        accountId: account.id,
        taskId: task.id,
        actionType: task.task_type,
        status: "COMPLETED",
        detail: `Ação ${task.task_type} executada com sucesso no X.`,
        xPostId,
        durationMs,
        rateLimitRemaining: rateLimit?.remaining,
        rateLimitResetAt: rateLimit?.resetAt,
      });

      return "completed";
    } catch (err) {
      const durationMs = Date.now() - taskStart;

      if (err instanceof RateLimitError) {
        await this.markTaskRateLimited(task, err.resetAt);
        await RateLimiter.updateLimit(account.id, endpointName, {
          remaining: 0,
          limitTotal: 15,
          resetAt: err.resetAt.toISOString(),
        });
        await MetricsCollector.recordAction({
          accountId: account.id,
          taskId: task.id,
          actionType: task.task_type,
          status: "WAITING_RATE_LIMIT",
          errorCode: "429",
          errorMessage: err.message,
          durationMs,
          rateLimitRemaining: 0,
          rateLimitResetAt: err.resetAt.toISOString(),
        });
        return "rate_limited";
      }

      if (err instanceof AuthError) {
        // Pausa a conta automaticamente para proteção
        await db()
          .from("platform_accounts")
          .update({
            paused: true,
            error_message: `Autorização revogada ou expirada no X (${err.message})`,
            last_error_at: new Date().toISOString(),
          })
          .eq("id", account.id);

        await this.markTaskFailed(task, "AUTH_ERROR", err.message);
        await MetricsCollector.recordAction({
          accountId: account.id,
          taskId: task.id,
          actionType: task.task_type,
          status: "FAILED",
          errorCode: String(err.status),
          errorMessage: err.message,
          durationMs,
        });
        return "failed";
      }

      // Erro genérico da API ou de rede
      const errMsg = err instanceof Error ? err.message : String(err);
      const nextAttempt = task.attempts + 1;

      if (nextAttempt < task.max_attempts) {
        const backoffMs = RateLimiter.calculateBackoffMs(nextAttempt);
        const nextScheduled = new Date(Date.now() + backoffMs).toISOString();

        await db()
          .from("automation_tasks")
          .update({
            status: "pending",
            attempts: nextAttempt,
            error_message: errMsg,
            scheduled_for: nextScheduled,
            updated_at: new Date().toISOString(),
          })
          .eq("id", task.id);

        // Atualiza horário na fila e solta o claim
        await db()
          .from("automation_queue")
          .update({
            scheduled_for: nextScheduled,
            claimed_at: null,
            worker_id: null,
          })
          .eq("task_id", task.id);
      } else {
        await this.markTaskFailed(task, "MAX_ATTEMPTS_EXCEEDED", `Falhou após ${nextAttempt} tentativas: ${errMsg}`);
      }

      await MetricsCollector.recordAction({
        accountId: account.id,
        taskId: task.id,
        actionType: task.task_type,
        status: "FAILED",
        errorMessage: errMsg,
        durationMs,
      });

      return "failed";
    }
  }

  private getEndpointForTask(type: string): string {
    switch (type) {
      case "post":
      case "thread":
      case "reply":
        return "/tweets";
      case "repost":
      case "undo_repost":
        return "/users/retweets";
      default:
        return "/general";
    }
  }

  private async markTaskRateLimited(task: AutomationTask, resetAt: Date): Promise<void> {
    const resetIso = resetAt.toISOString();
    await db()
      .from("automation_tasks")
      .update({
        status: "waiting_rate_limit",
        scheduled_for: resetIso,
        error_message: `Aguardando liberação de cota até ${resetIso}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id);

    await db()
      .from("automation_queue")
      .update({
        scheduled_for: resetIso,
        claimed_at: null,
        worker_id: null,
      })
      .eq("task_id", task.id);
  }

  private async markTaskFailed(task: AutomationTask, code: string, message: string): Promise<void> {
    await db()
      .from("automation_tasks")
      .update({
        status: "failed",
        error_code: code,
        error_message: message,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id);

    await db().from("automation_queue").delete().eq("task_id", task.id);
  }

  private async markTaskPaused(task: AutomationTask, message: string): Promise<void> {
    await db()
      .from("automation_tasks")
      .update({
        status: "paused",
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id);

    await db()
      .from("automation_queue")
      .update({ claimed_at: null, worker_id: null })
      .eq("task_id", task.id);
  }
}
