import "server-only";
import { db } from "./supabase";
import { adminPassword, hasSessionSecret, hasTokenKey, supabaseSecretKey, supabaseUrl } from "./env";

export interface SetupItem { key: string; label: string; ok: boolean; hint: string }

/**
 * Colunas que o app le de cada tabela. Se o banco ja tiver uma tabela com o
 * mesmo nome criada por outro app (ex.: o painel antigo), o "create table if
 * not exists" do schema.sql pula ela — e a falta de coluna so apareceria
 * depois, como erro obscuro. Aqui a gente pega isso antes.
 */
const EXPECTED: Record<string, string> = {
  x_accounts: "id,x_user_id,username,access_token,refresh_token,token_expires_at",
  posts: "id,account_id,status,scheduled_for,claimed_at,attempts,est_cost_usd",
  post_items: "id,post_id,position,body,x_post_id",
  metrics_daily: "account_id,day,followers,impressions",
  post_metrics: "x_post_id,account_id,impressions",
  mentions: "x_post_id,account_id,author_handle,replied",
  settings: "account_id,theme,density,monthly_budget_usd,paused",
  api_usage: "id,account_id,operation,cost_usd",
  run_log: "id,account_id,kind,ok,detail",
};

/** Confere o que falta para o bot rodar. Le so a PRESENCA das variaveis, nunca o valor. */
export async function getSetupStatus(): Promise<SetupItem[]> {
  const has = (k: string, min = 1) => (process.env[k]?.trim().length ?? 0) >= min;

  const items: SetupItem[] = [
    { key: "senha", label: "Login do painel", ok: adminPassword().length >= 8 && hasSessionSecret(),
      hint: adminPassword().length < 8 ? "Defina ADMIN_PASSWORD (8+ caracteres). O usuário é admin, ou o valor de ADMIN_USER." : "Defina SESSION_SECRET ou ENCRYPTION_MASTER_KEY." },
    { key: "supabase", label: "Supabase configurado", ok: Boolean(supabaseUrl() && supabaseSecretKey()),
      hint: "Defina SUPABASE_URL e SUPABASE_SECRET_KEY (ou NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY)." },
    { key: "schema", label: "Tabelas criadas no banco", ok: false, hint: "Rode supabase/schema.sql no SQL Editor do Supabase." },
    { key: "x", label: "App do X configurado", ok: has("X_CLIENT_ID") && has("X_CLIENT_SECRET") && has("X_REDIRECT_URI"),
      hint: "Defina X_CLIENT_ID, X_CLIENT_SECRET e X_REDIRECT_URI (igual à Callback URI do app no X)." },
    { key: "cifra", label: "Chave de cifragem dos tokens", ok: hasTokenKey(),
      hint: "Defina TOKEN_ENCRYPTION_KEY ou ENCRYPTION_MASTER_KEY (16+ caracteres)." },
    { key: "cron", label: "Segredo do agendador", ok: has("CRON_SECRET", 16),
      hint: "Defina CRON_SECRET (16+ caracteres) no Vercel e o mesmo valor nos secrets do GitHub Actions (veja o README)." },
    { key: "ia", label: "IA do composer (opcional)", ok: has("ANTHROPIC_API_KEY"), hint: "Defina ANTHROPIC_API_KEY para gerar variações e threads." },
    { key: "conta", label: "Conta do X conectada", ok: false, hint: "Clique em Conectar conta do X, logo abaixo." },
  ];

  const at = (k: string) => items.find((i) => i.key === k)!;
  if (!at("supabase").ok) return items;

  try {
    const checks = await Promise.all(
      Object.entries(EXPECTED).map(async ([table, cols]) => {
        const { error } = await db().from(table).select(cols).limit(0);
        return { table, error };
      }),
    );
    const missing = checks.filter((c) => c.error && /does not exist|PGRST205|schema cache|Could not find the table/i.test(c.error.message) && !/column/i.test(c.error.message));
    const clash = checks.filter((c) => c.error && /column/i.test(c.error.message));
    const other = checks.filter((c) => c.error && !missing.includes(c) && !clash.includes(c));

    if (clash.length) {
      at("schema").hint = `Já existe no banco uma tabela com o mesmo nome e outras colunas: ${clash.map((c) => c.table).join(", ")}. Provavelmente do painel antigo. Use um projeto novo do Supabase, ou renomeie essas tabelas antes de rodar supabase/schema.sql.`;
    } else if (missing.length) {
      at("schema").hint = `Faltam ${missing.length} tabela(s): ${missing.map((c) => c.table).join(", ")}. Rode supabase/schema.sql no SQL Editor do Supabase.`;
    } else if (other.length) {
      at("schema").hint = `O banco recusou a leitura de ${other[0].table}: ${other[0].error!.message}`;
    } else {
      at("schema").ok = true;
      const { count } = await db().from("x_accounts").select("id", { head: true, count: "exact" }).neq("access_token", "revogado");
      at("conta").ok = (count ?? 0) > 0;
    }
  } catch (e) {
    at("schema").hint = `Não consegui falar com o Supabase: ${e instanceof Error ? e.message : String(e)}`;
  }
  return items;
}
