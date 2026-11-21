import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { AutomationService } from "@/engine/services/automation-service";
import { XOAuth } from "@/engine/connectors/x-oauth";
import { db } from "@/lib/supabase";

export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const accounts = await AutomationService.listAccounts();
    return NextResponse.json({ ok: true, accounts });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: "oauth_url" | "manual_connect";
      platform?: "x" | "instagram" | "tiktok";
      clientId?: string;
      redirectUri?: string;
      username?: string;
      accessToken?: string;
      refreshToken?: string;
      expiresIn?: number;
      userId?: string;
    };

    // 1. Gera URL de autorização OAuth 2.0 PKCE
    if (body.action === "oauth_url" || (!body.action && body.clientId)) {
      const clientId = body.clientId || process.env.X_CLIENT_ID;
      if (!clientId) {
        return NextResponse.json(
          { error: "Configure X_CLIENT_ID nas variáveis de ambiente ou informe o Client ID do seu aplicativo no portal developer.x.com" },
          { status: 400 }
        );
      }

      const redirectUri = body.redirectUri || `${new URL(req.url).origin}/api/oauth/x/callback`;
      const state = XOAuth.generateState();
      const codeVerifier = XOAuth.generateCodeVerifier();
      const codeChallenge = XOAuth.generateCodeChallenge(codeVerifier);

      const url = XOAuth.getAuthorizationUrl({
        clientId,
        redirectUri,
        state,
        codeChallenge,
      });

      return NextResponse.json({
        ok: true,
        url,
        state,
        codeVerifier,
      });
    }

    // 2. Conexão direta com tokens fornecidos
    if (body.action === "manual_connect" && body.username && body.accessToken) {
      const platform = body.platform || "x";
      const handle = body.username.replace(/^@/, "").trim();
      const userId = body.userId || `${platform}_${handle.toLowerCase()}`;

      const { data: newAcc, error } = await db()
        .from("platform_accounts")
        .upsert(
          {
            platform,
            x_user_id: userId,
            username: handle,
            display_name: handle,
            access_token: body.accessToken, // TokenVault will encrypt
            refresh_token: body.refreshToken ?? null,
            token_expires_at: body.expiresIn
              ? new Date(Date.now() + body.expiresIn * 1000).toISOString()
              : null,
            scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
            stage: "operating",
            is_active: true,
            paused: false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "x_user_id" }
        )
        .select("id, username")
        .single();

      if (error) throw error;

      // Cria config padrão
      await db().from("bot_configs").upsert(
        {
          account_id: newAcc.id,
          enabled: true,
          working_hours_start: "08:00",
          working_hours_end: "22:00",
          working_days: [1, 2, 3, 4, 5],
          daily_post_limit: 25,
          daily_repost_limit: 50,
        },
        { onConflict: "account_id" }
      );

      return NextResponse.json({ ok: true, account: newAcc });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (e) {
    return fail(e);
  }
}
