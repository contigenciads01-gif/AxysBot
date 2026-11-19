import { createHash, createHmac } from "node:crypto";

/**
 * Leitura central das variaveis de ambiente.
 *
 * Aceita os nomes NOVOS (README) e os nomes que o projeto antigo ja tinha no
 * Vercel, para reaproveitar a configuracao existente sem copiar segredos:
 *   SUPABASE_URL          <- NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SECRET_KEY   <- SUPABASE_SERVICE_ROLE_KEY
 *   TOKEN_ENCRYPTION_KEY  <- derivada de ENCRYPTION_MASTER_KEY
 *   SESSION_SECRET        <- derivada de ENCRYPTION_MASTER_KEY
 * As derivacoes usam HMAC-SHA256 com rotulos diferentes: chaves independentes
 * entre si, e diferentes da chave mestra (que o app antigo pode ter usado).
 */
const pick = (...names: string[]) => {
  for (const n of names) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  return "";
};

export const supabaseUrl = () => pick("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
export const supabaseSecretKey = () => pick("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");

const master = () => pick("ENCRYPTION_MASTER_KEY");
const derive = (label: string) => createHmac("sha256", master()).update(`axysbot:${label}:v1`).digest();

/** 32 bytes para AES-256-GCM. */
export function tokenKey(): Buffer {
  const own = pick("TOKEN_ENCRYPTION_KEY");
  if (/^[0-9a-f]{64}$/i.test(own)) return Buffer.from(own, "hex");
  if (own.length >= 16) return createHash("sha256").update(own).digest();
  if (master().length >= 16) return derive("token");
  throw new Error("Defina TOKEN_ENCRYPTION_KEY ou ENCRYPTION_MASTER_KEY (16+ caracteres)");
}
export function hasTokenKey(): boolean {
  try { tokenKey(); return true; } catch { return false; }
}

export function sessionSecret(): string {
  const own = pick("SESSION_SECRET");
  if (own.length >= 32) return own;
  if (master().length >= 16) return derive("session").toString("hex");
  throw new Error("Defina SESSION_SECRET (32+ caracteres) ou ENCRYPTION_MASTER_KEY");
}
export function hasSessionSecret(): boolean {
  try { sessionSecret(); return true; } catch { return false; }
}

export const adminUser = () => pick("ADMIN_USER") || "admin";
export const adminPassword = () => pick("ADMIN_PASSWORD");
