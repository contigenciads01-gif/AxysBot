import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, xRedirectUri, X_SCOPES } from "@/lib/x-oauth";
import { getMeWithToken } from "@/lib/x-api";
import { db, logRun } from "@/lib/supabase";
import { encrypt, safeEqual } from "@/lib/crypto";
import { isValidSession, SESSION_COOKIE } from "@/lib/session";

export async function GET(req: NextRequest) {
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/ajustes?${q}`, req.url));
    res.cookies.delete({ name: "x_pkce", path: "/api/x" });
    res.cookies.delete({ name: "x_state", path: "/api/x" });
    res.cookies.delete({ name: "x_redirect", path: "/api/x" });
    return res;
  };
  // publico no proxy (o X redireciona pra ca), mas so aceita quem tem sessao
  if (!isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return back("x=negado");
  const code = sp.get("code"), state = sp.get("state");
  const savedState = req.cookies.get("x_state")?.value, verifier = req.cookies.get("x_pkce")?.value;
  if (!code || !state || !savedState || !verifier || !safeEqual(state, savedState)) {
    return back("x=estado_invalido");
  }

  try {
    // o code expira em 30 s: troca imediatamente
    const redirectUri = req.cookies.get("x_redirect")?.value || xRedirectUri(req.nextUrl.origin);
    const t = await exchangeCode(code, verifier, redirectUri);
    const me = await getMeWithToken(t.access_token);
    const { data, error } = await db().from("x_accounts").upsert({
      x_user_id: me.id,
      username: me.username,
      display_name: me.name,
      avatar_url: me.profile_image_url ?? null,
      access_token: encrypt(t.access_token),
      refresh_token: t.refresh_token ? encrypt(t.refresh_token) : null,
      token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      scopes: t.scope ? t.scope.split(" ") : [...X_SCOPES],
    }, { onConflict: "x_user_id" }).select("id").single<{ id: string }>();
    if (error || !data) throw error ?? new Error("falha ao salvar conta");
    await db().from("settings").upsert({ account_id: data.id }, { onConflict: "account_id", ignoreDuplicates: true });
    await logRun({ account_id: data.id, kind: "oauth", ok: true, detail: `@${me.username} conectado` });
    return back("x=conectado");
  } catch (e) {
    await logRun({ kind: "oauth", ok: false, detail: e instanceof Error ? e.message : String(e) });
    return back("x=falhou");
  }
}
