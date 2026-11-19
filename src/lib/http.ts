import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, isValidSession } from "./session";
import { safeEqual } from "./crypto";
import { verifyGithubOidc } from "./oidc";
import { ConfigError } from "./supabase";
import { XApiError } from "./x-api";
import { XAuthError } from "./x-oauth";

/** Defesa em profundidade: toda rota valida a sessao, nao so o proxy. */
export async function requireSession(): Promise<NextResponse | null> {
  const jar = await cookies();
  if (isValidSession(jar.get(SESSION_COOKIE)?.value)) return null;
  return NextResponse.json({ error: "Sessao expirada. Entre de novo." }, { status: 401 });
}

/**
 * Quem pode chamar o agendador:
 *  - GitHub Actions deste repositorio, com token OIDC assinado (sem segredo);
 *  - ou quem tiver o CRON_SECRET, se ele estiver definido (Vercel Cron, Pro).
 */
export async function requireCron(req: Request): Promise<NextResponse | null> {
  const got = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length >= 16 && safeEqual(got, `Bearer ${secret}`)) return null;
  const token = got.startsWith("Bearer ") ? got.slice(7) : "";
  if (token.split(".").length === 3) {
    try { if (await verifyGithubOidc(token)) return null; } catch { /* JWKS fora do ar: nega */ }
  }
  return NextResponse.json({ error: "nao autorizado" }, { status: 401 });
}

export function fail(e: unknown): NextResponse {
  if (e instanceof ConfigError) return NextResponse.json({ error: e.message, config: true }, { status: 503 });
  if (e instanceof XAuthError) return NextResponse.json({ error: e.message, reconnect: true }, { status: 401 });
  if (e instanceof XApiError) {
    return NextResponse.json({ error: e.message, resetAt: e.resetAt?.toISOString() }, { status: e.status === 429 ? 429 : 502 });
  }
  console.error("[axysbot]", e);
  // erros do supabase-js nao sao instancias de Error: lemos a mensagem mesmo assim
  const raw = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "";
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|getaddrinfo/i.test(raw + JSON.stringify(e ?? ""))) {
    return NextResponse.json({ error: "Não consegui falar com o Supabase. Confira SUPABASE_URL e se o projeto está ativo." }, { status: 503 });
  }
  if (/relation .* does not exist|PGRST205|schema cache/i.test(raw)) {
    return NextResponse.json({ error: "Tabelas não encontradas. Rode supabase/schema.sql no SQL Editor do Supabase." }, { status: 503 });
  }
  return NextResponse.json({ error: raw || "Erro inesperado" }, { status: 500 });
}
