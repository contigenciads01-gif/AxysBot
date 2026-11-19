import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseSecretKey, supabaseUrl } from "./env";

/**
 * Cliente de servidor com a chave secreta. `server-only` faz o build FALHAR
 * se algum componente de cliente importar este modulo — a chave nunca vai
 * para o navegador.
 */
let cached: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (cached) return cached;
  const url = supabaseUrl();
  const key = supabaseSecretKey();
  if (!url || !key) {
    throw new ConfigError("Supabase nao configurado: defina SUPABASE_URL e SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY)");
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export class ConfigError extends Error {
  readonly config = true;
}

/** Registra o que o agendador fez. Nunca lanca: log nao derruba operacao. */
export async function logRun(entry: {
  account_id?: string | null;
  kind: "publicar" | "sync_metricas" | "sync_mencoes" | "oauth";
  ok: boolean;
  detail?: string;
  duration_ms?: number;
}): Promise<void> {
  try {
    await db().from("run_log").insert({
      account_id: entry.account_id ?? null,
      kind: entry.kind,
      ok: entry.ok,
      detail: entry.detail?.slice(0, 2000) ?? null,
      duration_ms: entry.duration_ms ?? null,
    });
  } catch {
    /* engolido de proposito */
  }
}
