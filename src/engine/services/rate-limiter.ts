import "server-only";
import { db } from "@/lib/supabase";
import type { XHeadersInfo } from "../connectors/x-connector";

export class RateLimiter {
  /**
   * Verifica se a conta pode chamar o endpoint agora.
   */
  static async checkLimit(
    accountId: string,
    endpoint: string
  ): Promise<{ canProceed: boolean; resetAt?: Date; remaining?: number }> {
    const { data, error } = await db()
      .from("rate_limits")
      .select("remaining, reset_at")
      .eq("account_id", accountId)
      .eq("endpoint", endpoint)
      .maybeSingle();

    if (error || !data) {
      return { canProceed: true };
    }

    const resetAt = new Date(data.reset_at);
    const now = new Date();

    // Se já passou do horário de reset, a cota foi renovada pela API do X
    if (now >= resetAt) {
      return { canProceed: true };
    }

    // Se ainda restam chamadas antes do reset
    if (data.remaining > 0) {
      return { canProceed: true, remaining: data.remaining };
    }

    // Cota esgotada e reset ainda no futuro
    return {
      canProceed: false,
      resetAt,
      remaining: 0,
    };
  }

  /**
   * Atualiza as informações de rate limit após uma requisição real à API do X.
   */
  static async updateLimit(
    accountId: string,
    endpoint: string,
    rateLimit: XHeadersInfo
  ): Promise<void> {
    try {
      await db()
        .from("rate_limits")
        .upsert(
          {
            account_id: accountId,
            endpoint,
            remaining: rateLimit.remaining,
            limit_total: rateLimit.limitTotal,
            reset_at: rateLimit.resetAt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "account_id,endpoint" }
        );
    } catch (e) {
      console.error("[RateLimiter] Erro ao gravar rate_limits:", e);
    }
  }

  /**
   * Calcula tempo de backoff exponencial com jitter aleatório para evitar picos simultâneos.
   */
  static calculateBackoffMs(attempt: number, baseMs = 2000, maxMs = 120_000): number {
    const exp = Math.min(maxMs, baseMs * Math.pow(2, attempt));
    const jitter = Math.floor(Math.random() * (exp * 0.2)); // 20% jitter
    return exp + jitter;
  }
}
