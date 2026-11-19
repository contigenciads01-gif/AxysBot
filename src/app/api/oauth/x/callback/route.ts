import { NextResponse } from "next/server";
import { XOAuth } from "@/engine/connectors/x-oauth";
import { XConnector } from "@/engine/connectors/x-connector";
import { TokenVault } from "@/engine/security/token-vault";
import { db } from "@/lib/supabase";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const origin = url.origin;

  if (error || !code) {
    const errorDesc = url.searchParams.get("error_description") || "Autorização cancelada no X";
    return NextResponse.redirect(`${origin}/bot?error=${encodeURIComponent(errorDesc)}`);
  }

  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const redirectUri = `${origin}/api/oauth/x/callback`;

  if (!clientId) {
    return NextResponse.redirect(`${origin}/bot?error=${encodeURIComponent("X_CLIENT_ID não configurado")}`);
  }

  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const match = cookieHeader.match(/(?:^|;\s*)axys_pkce=([^;]+)/);
    const codeVerifier = match ? decodeURIComponent(match[1]) : "";

    const tokenRes = await XOAuth.exchangeCode({
      code,
      codeVerifier,
      clientId,
      clientSecret,
      redirectUri,
    });

    const connector = new XConnector(tokenRes.access_token);
    const me = await connector.getMe();

    const { data: acc, error: accErr } = await db()
      .from("platform_accounts")
      .upsert(
        {
          platform: "x",
          oauth_client_id: clientId,
          x_user_id: me.id,
          username: me.username,
          display_name: me.name,
          avatar_url: me.profile_image_url ?? null,
          access_token: "placeholder",
          refresh_token: null,
          token_expires_at: null,
          scopes: tokenRes.scope ? tokenRes.scope.split(" ") : XOAuth.DEFAULT_SCOPES,
          stage: "operating",
          status: "live",
          current_action: "Conectado via OAuth 2.0",
          is_active: true,
          paused: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "x_user_id" }
      )
      .select("id")
      .single();

    if (accErr || !acc) throw accErr ?? new Error("Falha ao registrar conta.");

    await TokenVault.storeTokens(acc.id, {
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token,
      expiresIn: tokenRes.expires_in,
      scopes: tokenRes.scope?.split(" "),
    });

    await db().from("bot_configs").upsert(
      {
        account_id: acc.id,
        enabled: true,
        working_hours_start: "08:00",
        working_hours_end: "22:00",
        working_days: [1, 2, 3, 4, 5],
        daily_post_limit: 25,
        daily_repost_limit: 50,
      },
      { onConflict: "account_id", ignoreDuplicates: true }
    );

    const res = NextResponse.redirect(`${origin}/bot?connected=${encodeURIComponent(me.username)}`);
    res.cookies.delete("axys_pkce");
    return res;
  } catch (e) {
    console.error("[OAuthCallback /api/oauth/x/callback] Erro:", e);
    const msg = e instanceof Error ? e.message : "Falha na conexão OAuth";
    return NextResponse.redirect(`${origin}/bot?error=${encodeURIComponent(msg)}`);
  }
}
