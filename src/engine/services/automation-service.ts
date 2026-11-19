import "server-only";
import { db } from "@/lib/supabase";
import { TaskValidator } from "../validators/task-validator";
import { TokenVault } from "../security/token-vault";
import type {
  AutomationTask,
  AutomationTaskPayload,
  AutomationTaskType,
  EngineStatus,
  PlatformAccount,
  BotConfig,
} from "../types";

export class AutomationService {
  /**
   * Status consolidado do motor de automação para o topo do Dashboard.
   */
  static async getEngineStatus(): Promise<EngineStatus> {
    const today = new Date().toISOString().slice(0, 10);

    const [
      { count: totalAccounts },
      { count: activeAccounts },
      { count: pendingTasks },
      { count: processingTasks },
      { data: todayMetrics },
      { data: lastLog },
      { data: engineSetting },
    ] = await Promise.all([
      db().from("platform_accounts").select("id", { count: "exact", head: true }),
      db().from("platform_accounts").select("id", { count: "exact", head: true }).eq("is_active", true).eq("paused", false),
      db().from("automation_tasks").select("id", { count: "exact", head: true }).in("status", ["pending", "waiting_rate_limit"]),
      db().from("automation_tasks").select("id", { count: "exact", head: true }).eq("status", "processing"),
      db().from("account_metrics").select("tasks_completed, tasks_failed").eq("date", today),
      db().from("bot_actions_log").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db().from("settings").select("paused").limit(1).maybeSingle(),
    ]);

    let completedToday = 0;
    let failedToday = 0;
    for (const m of todayMetrics ?? []) {
      completedToday += m.tasks_completed ?? 0;
      failedToday += m.tasks_failed ?? 0;
    }

    const isGloballyPaused = Boolean(engineSetting?.paused);

    return {
      enabled: !isGloballyPaused && (activeAccounts ?? 0) > 0,
      active_accounts: activeAccounts ?? 0,
      total_accounts: totalAccounts ?? 0,
      pending_tasks: pendingTasks ?? 0,
      processing_tasks: processingTasks ?? 0,
      completed_today: completedToday,
      failed_today: failedToday,
      uptime_seconds: 0,
      last_run_at: lastLog?.created_at ?? null,
    };
  }

  /**
   * Liga ou desliga o motor globalmente.
   */
  static async setEngineEnabled(enabled: boolean): Promise<void> {
    // Atualiza tabela settings.paused
    await db().from("settings").update({ paused: !enabled });
  }

  /**
   * Lista todas as contas de automação com suas respectivas configurações.
   */
  static async listAccounts(): Promise<Array<PlatformAccount & { config?: BotConfig }>> {
    const { data: accounts, error } = await db()
      .from("platform_accounts")
      .select("id, platform, username, display_name, avatar_url, stage, is_active, paused, error_message, last_error_at, connected_at, updated_at, token_expires_at, scopes, x_user_id, email, account_password, email_password, phone, auth_token, ct0, proxy, proxy_active, status, current_action, actions_today")
      .order("connected_at", { ascending: false });

    if (error) throw error;

    const { data: configs } = await db().from("bot_configs").select("*");
    const configMap = new Map((configs ?? []).map((c) => [c.account_id, c]));

    return (accounts ?? []).map((acc) => ({
      ...acc,
      access_token: "protegido", // Nunca vaza tokens
      config: configMap.get(acc.id),
    })) as Array<PlatformAccount & { config?: BotConfig }>;
  }

  /**
   * Pausa ou retoma uma conta individual.
   */
  static async toggleAccountPause(accountId: string, paused: boolean): Promise<void> {
    const { error } = await db()
      .from("platform_accounts")
      .update({ paused, updated_at: new Date().toISOString() })
      .eq("id", accountId);

    if (error) throw error;
  }

  /**
   * Atualiza as configurações de comportamento de uma conta.
   */
  static async updateAccountConfig(accountId: string, patch: Partial<BotConfig>): Promise<void> {
    const { error } = await db()
      .from("bot_configs")
      .upsert({ account_id: accountId, ...patch, updated_at: new Date().toISOString() });

    if (error) throw error;
  }

  /**
   * Desconecta uma conta do X com segurança.
   */
  static async deleteAccount(accountId: string): Promise<void> {
    await TokenVault.revokeTokens(accountId);
    const { error } = await db().from("platform_accounts").delete().eq("id", accountId);
    if (error) throw error;
  }

  /**
   * Cria uma nova tarefa validada e insere na fila de execução.
   */
  static async createTask(params: {
    accountId: string;
    type: AutomationTaskType;
    payload: AutomationTaskPayload;
    scheduledFor?: string | null;
    priority?: number;
  }): Promise<AutomationTask> {
    // 1. Validação estrita
    TaskValidator.validateTask(params.type, params.payload);

    // 2. Chave de idempotência anti-duplicação
    const idempotencyKey = TaskValidator.generateIdempotencyKey(
      params.accountId,
      params.type,
      params.payload
    );

    // 3. Salva no banco
    const scheduledFor = params.scheduledFor ? new Date(params.scheduledFor).toISOString() : new Date().toISOString();
    const priority = params.priority ?? 0;

    const { data: task, error } = await db()
      .from("automation_tasks")
      .insert({
        account_id: params.accountId,
        task_type: params.type,
        status: "pending",
        priority,
        payload: params.payload,
        idempotency_key: idempotencyKey,
        scheduled_for: scheduledFor,
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") { // unique constraint violation
        throw new Error("Tarefa duplicada detectada. A mesma ação já foi agendada recentemente.");
      }
      throw error;
    }

    // 4. Enfileira na fila de execução
    await db().from("automation_queue").insert({
      task_id: task.id,
      account_id: params.accountId,
      priority,
      scheduled_for: scheduledFor,
    });

    return task as AutomationTask;
  }

  /**
   * Cancela uma tarefa pendente.
   */
  static async cancelTask(taskId: string): Promise<void> {
    const { error } = await db()
      .from("automation_tasks")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", taskId)
      .in("status", ["pending", "waiting_rate_limit", "paused"]);

    if (error) throw error;
    await db().from("automation_queue").delete().eq("task_id", taskId);
  }

  /**
   * Lista tarefas com filtros.
   */
  static async listTasks(filters: {
    accountId?: string;
    status?: string[];
    type?: string;
    limit?: number;
  }): Promise<AutomationTask[]> {
    let q = db().from("automation_tasks").select("*").order("created_at", { ascending: false }).limit(filters.limit ?? 50);

    if (filters.accountId) q = q.eq("account_id", filters.accountId);
    if (filters.status && filters.status.length > 0) q = q.in("status", filters.status);
    if (filters.type) q = q.eq("task_type", filters.type);

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as AutomationTask[];
  }

  /**
   * Lista logs de ações com filtros.
   */
  static async listLogs(filters: {
    accountId?: string;
    limit?: number;
  }) {
    let q = db()
      .from("bot_actions_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(filters.limit ?? 50);

    if (filters.accountId) q = q.eq("account_id", filters.accountId);

    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }
}
