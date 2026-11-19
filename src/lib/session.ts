import { createHmac } from "node:crypto";
import { safeEqual } from "./crypto";
import { adminPassword, adminUser, sessionSecret } from "./env";

/**
 * Sessao do painel: cookie assinado com HMAC-SHA256.
 * Valor = "<expira_em_ms>.<assinatura>". Sem estado no servidor.
 */
export const SESSION_COOKIE = "axys_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 dias

const secret = sessionSecret;

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

/** Usuario (padrao "admin") + senha de ADMIN_PASSWORD. Os dois sempre comparados. */
export function checkLogin(user: string, password: string): boolean {
  const expected = adminPassword();
  if (expected.length < 8) return false; // painel fechado ate configurar senha
  const userOk = safeEqual(user.trim().toLowerCase(), adminUser().toLowerCase());
  const passOk = safeEqual(password, expected);
  return userOk && passOk;
}

export function checkPassword(input: string): boolean {
  return checkLogin(adminUser(), input);
}
