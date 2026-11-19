import "server-only";
import { db } from "./supabase";

export interface SetupItem { key: string; label: string; ok: boolean; hint: string }

/** Confere o que falta para o bot rodar. Le so a PRESENCA das variaveis, nunca o valor. */
export async function getSetupStatus(): Promise<SetupItem[]> {
  const has = (k: string, min = 1) => (process.env[k]?.length ?? 0) >= min;
  const hex64 = (k: string) => /^[0-9a-f]{64}$/i.test(process.env[k] ?? "");

  const items: SetupItem[] = [
    { key: "senha", label: "Senha do painel", ok: has("ADMIN_PASSWORD", 8) && has("SESSION_SECRET", 32), hint: "Defina ADMIN_PASSWORD (8+ caracteres) e SESSION_SECRET (openssl rand -hex 32)." },
    { key: "supabase", label: "Supabase configurado", ok: has("SUPABASE_URL") && has("SUPABASE_SECRET_KEY"), hint: "Defina SUPABASE_URL e SUPABASE_SECRET_KEY." },
    { key: "schema", label: "Tabelas criadas no banco", ok: false, hint: "Rode supabase/schema.sql no SQL Editor do Supabase." },
    { key: "x", label: "App do X configurado", ok: has("X_CLIENT_ID") && has("X_CLIENT_SECRET") && has("X_REDIRECT_URI"), hint: "Defina X_CLIENT_ID, X_CLIENT_SECRET e X_REDIRECT_URI (igual a Callback URI do app no X)." },
    { key: "cifra", label: "Chave de cifragem dos tokens", ok: hex64("TOKEN_ENCRYPTION_KEY"), hint: "TOKEN_ENCRYPTION_KEY precisa ter 64 caracteres hex (openssl rand -hex 32)." },
    { key: "cron", label: "Segredo do agendador", ok: has("CRON_SECRET", 16), hint: "Defina CRON_SECRET (16+ caracteres) no Vercel e o mesmo valor nos secrets do GitHub Actions (veja o README)." },
    { key: "ia", label: "IA do composer (opcional)", ok: has("ANTHROPIC_API_KEY"), hint: "Defina ANTHROPIC_API_KEY para gerar variações e threads." },
    { key: "conta", label: "Conta do X conectada", ok: false, hint: "Clique em Conectar conta do X, logo abaixo." },
  ];

  const sb = items.find((i) => i.key === "supabase")!;
  if (sb.ok) {
    try {
      const { error } = await db().from("settings").select("account_id", { head: true, count: "exact" });
      items.find((i) => i.key === "schema")!.ok = !error;
      if (error) items.find((i) => i.key === "schema")!.hint = `Rode supabase/schema.sql. Erro do banco: ${error.message}`;
      const { count } = await db().from("x_accounts").select("id", { head: true, count: "exact" }).neq("access_token", "revogado");
      items.find((i) => i.key === "conta")!.ok = (count ?? 0) > 0;
    } catch (e) {
      items.find((i) => i.key === "schema")!.hint = `Nao consegui falar com o Supabase: ${e instanceof Error ? e.message : e}`;
    }
  }
  return items;
}
