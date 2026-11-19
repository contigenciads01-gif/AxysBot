import { createHmac } from "node:crypto";
import { safeEqual } from "./crypto";

/**
 * Sessao do painel: cookie assinado com HMAC-SHA256.
 * Valor = "<expira_em_ms>.<assinatura>". Sem estado no servidor.
 */
export const SESSION_COOKIE = "axys_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 dias

function secret(): string {
  const s = process.env.SESSION_SECRET ?? "";
  if (s.length < 32) throw new Error("SESSION_SECRET precisa de pelo menos 32 caracteres");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionValue(now = Date.now()): string {
  const exp = String(now + SESSION_TTL_MS);
  return `${exp}.${sign(exp)}`;
}

export function isValidSession(value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot < 1) return false;
  const exp = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < now) return false;
  try {
    return safeEqual(sig, sign(exp));
  } catch {
    return false;
  }
}

export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (expected.length < 8) return false; // painel fechado ate configurar senha
  return safeEqual(input, expected);
}
