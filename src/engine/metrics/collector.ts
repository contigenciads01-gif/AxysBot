import "server-only";
import { db } from "@/lib/supabase";
import type { PlatformType } from "../types";

export interface LogActionParams {
  accountId: string;
  platform?: PlatformType;
  taskId?: string | null;
  actionType: string;
  status: "COMPLETED" | "FAILED" | "PROCESSING" | "WAITING_RATE_LIMIT" | "PAUSED";
  detail?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  xPostId?: string | null;
  durationMs?: number | null;
  rateLimitRemaining?: number | null;
  rateLimitResetAt?: string | null;
}

export class MetricsCollector {
  /**
   * Grava uma ação no log de auditoria e atualiza as métricas diárias.
   */
  static async recordAction(params: LogActionParams): Promise<void> {
    const platform = params.platform ?? "x";
    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);

    // 1. Inserir no bot_actions_log
    try {
      await db().from("bot_actions_log").insert({
        account_id: params.accountId,
        platform,
        task_id: params.taskId ?? null,
        action_type: params.actionType,
        status: params.status,
        detail: params.detail?.slice(0, 2000) ?? null,
        error_code: params.errorCode ?? null,
        error_message: params.errorMessage?.slice(0, 2000) ?? null,
        x_post_id: params.xPostId ?? null,
        duration_ms: params.durationMs ?? null,
        rate_limit_remaining: params.rateLimitRemaining ?? null,
        rate_limit_reset_at: params.rateLimitResetAt ?? null,
        created_at: nowIso,
      });
    } catch (e) {
      console.error("[MetricsCollector] Falha ao gravar bot_actions_log:", e);
    }

    // 2. Atualizar contadores diários em account_metrics
    try {
      const isSuccess = params.status === "COMPLETED";
      const isPost = params.actionType === "post" || params.actionType === "thread";
      const isRepost = params.actionType === "repost";
      const isReply = params.actionType === "reply";
      const isRateLimit = params.status === "WAITING_RATE_LIMIT";

      // Busca registro do dia ou cria
      const { data: current } = await db()
        .from("account_metrics")
        .select("*")
        .eq("account_id", params.accountId)
        .eq("date", today)
        .maybeSingle();

      const patch = {
        account_id: params.accountId,
        date: today,
        posts_created: (current?.posts_created ?? 0) + (isSuccess && isPost ? 1 : 0),
        reposts_done: (current?.reposts_done ?? 0) + (isSuccess && isRepost ? 1 : 0),
        replies_sent: (current?.replies_sent ?? 0) + (isSuccess && isReply ? 1 : 0),
        tasks_completed: (current?.tasks_completed ?? 0) + (isSuccess ? 1 : 0),
        tasks_failed: (current?.tasks_failed ?? 0) + (params.status === "FAILED" ? 1 : 0),
        api_calls_made: (current?.api_calls_made ?? 0) + 1,
        rate_limits_hit: (current?.rate_limits_hit ?? 0) + (isRateLimit ? 1 : 0),
        uptime_seconds: (current?.uptime_seconds ?? 0) + Math.round((params.durationMs ?? 0) / 1000),
      };

      await db()
        .from("account_metrics")
        .upsert(patch, { onConflict: "account_id,date" });
    } catch (e) {
      console.error("[MetricsCollector] Falha ao atualizar account_metrics:", e);
    }
  }

  /**
   * Obtém métricas dos últimos N dias para a conta.
   */
  static async getHistory(accountId: string, days = 14) {
    const sinceDate = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    const { data } = await db()
      .from("account_metrics")
      .select("*")
      .eq("account_id", accountId)
      .gte("date", sinceDate)
      .order("date", { ascending: true });

    return data ?? [];
  }
}
