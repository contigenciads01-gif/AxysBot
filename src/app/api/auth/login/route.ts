import { NextResponse } from "next/server";
import { checkPassword, createSessionValue, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/session";

// atraso fixo em falha: freia tentativa de forca bruta
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 8) {
    return NextResponse.json({ error: "Defina ADMIN_PASSWORD (min. 8 caracteres) nas variaveis de ambiente." }, { status: 503 });
  }
  if (!password || !checkPassword(password)) {
    await delay(900);
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSessionValue(), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: SESSION_TTL_MS / 1000,
  });
  return res;
}
