import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { db } from "@/lib/supabase";
import { TokenVault } from "@/engine/security/token-vault";

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      rawText?: string;
      accounts?: Array<{
        username: string;
        password?: string;
        email?: string;
        emailPassword?: string;
        phone?: string;
        authToken?: string;
        ct0?: string;
        proxy?: string;
      }>;
    };

    const toInsert: Array<{
      username: string;
      account_password?: string;
      email?: string;
      email_password?: string;
      phone?: string;
      auth_token?: string;
      ct0?: string;
      proxy?: string;
    }> = [];

    // 1. Parsing de texto bruto linha por linha: username|password|email|email_password|auth_token|proxy
    if (body.rawText) {
      const lines = body.rawText.split("\n").map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        // Suporta delimitadores |, :, ou vírgula
        const parts = line.split(/[|;]/).map((p) => p.trim());
        if (parts.length >= 1) {
          const username = parts[0].replace(/^@/, "");
          const password = parts[1] || undefined;
          const email = parts[2] || undefined;
          const emailPassword = parts[3] || undefined;
          const authToken = parts[4] || undefined;
          const proxy = parts[5] || undefined;

          toInsert.push({
            username,
            account_password: password,
            email,
            email_password: emailPassword,
            auth_token: authToken,
            proxy,
          });
        }
      }
    } else if (Array.isArray(body.accounts)) {
      for (const acc of body.accounts) {
        if (acc.username) {
          toInsert.push({
            username: acc.username.replace(/^@/, ""),
            account_password: acc.password,
            email: acc.email,
            email_password: acc.emailPassword,
            phone: acc.phone,
            auth_token: acc.authToken,
            ct0: acc.ct0,
            proxy: acc.proxy,
          });
        }
      }
    }

    if (toInsert.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma conta válida identificada. Use o formato username|senha|email|senha_email|token|proxy" },
        { status: 400 }
      );
    }

    const inserted: string[] = [];

    for (const item of toInsert) {
      const userId = `x_${item.username.toLowerCase()}`;
      const { data: acc, error } = await db()
        .from("platform_accounts")
        .upsert(
          {
            platform: "x",
            x_user_id: userId,
            username: item.username,
            display_name: item.username,
            account_password: item.account_password ?? null,
            email: item.email ?? null,
            email_password: item.email_password ?? null,
            phone: item.phone ?? null,
            auth_token: item.auth_token ?? null,
            ct0: item.ct0 ?? null,
            proxy: item.proxy ?? null,
            proxy_active: Boolean(item.proxy),
            access_token: item.auth_token || "placeholder",
            status: "live",
            current_action: "idle",
            stage: "operating",
            is_active: true,
            paused: false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "x_user_id" }
        )
        .select("id, username")
        .single();

      if (!error && acc) {
        inserted.push(acc.username);

        // Se veio token, criptografa no vault
        if (item.auth_token) {
          await TokenVault.storeTokens(acc.id, {
            accessToken: item.auth_token,
          }).catch(() => {});
        }

        // Garante config inicial
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
      }
    }

    return NextResponse.json({
      ok: true,
      count: inserted.length,
      imported: inserted,
    });
  } catch (e) {
    return fail(e);
  }
}
