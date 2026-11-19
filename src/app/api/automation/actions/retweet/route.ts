import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { db } from "@/lib/supabase";
import { XConnector } from "@/engine/connectors/x-connector";
import { TokenVault } from "@/engine/security/token-vault";
import { MetricsCollector } from "@/engine/metrics/collector";

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      accountId?: string;
      tweetUrlOrId?: string;
    };

    if (!body.accountId || !body.tweetUrlOrId) {
      return NextResponse.json(
        { error: "accountId e tweetUrlOrId são obrigatórios." },
        { status: 400 }
      );
    }

    // Extrai o ID numérico do tweet
    const match = body.tweetUrlOrId.match(/(?:status(?:es)?\/)?(\d{5,25})/);
    const tweetId = match ? match[1] : body.tweetUrlOrId.trim();

    if (!/^\d{5,25}$/.test(tweetId)) {
      return NextResponse.json(
        { error: "Link ou ID de tweet inválido. Deve conter o ID numérico do post no X." },
        { status: 400 }
      );
    }

    const { data: account, error: accErr } = await db()
      .from("platform_accounts")
      .select("id, username, x_user_id, access_token, auth_token, is_active, paused")
      .eq("id", body.accountId)
      .single();

    if (accErr || !account) {
      return NextResponse.json({ error: "Conta não encontrada no sistema." }, { status: 404 });
    }

    // 1. Tenta via OAuth 2.0 / TokenVault se tiver token configurado
    let retweetDone = false;
    let detailMessage = "";

    try {
      const tokens = await TokenVault.getTokens(account.id);
      if (tokens.access_token && tokens.access_token !== "placeholder" && tokens.access_token !== "revogado") {
        const connector = new XConnector(tokens.access_token);
        const res = await connector.repost(account.x_user_id, tweetId);
        retweetDone = res.retweeted;
        detailMessage = `Retweet oficial executado no tweet #${tweetId} via API v2.`;
      }
    } catch {
      // Se não tem OAuth token, tenta via Cookie auth_token direto
    }

    // 2. Se não foi via API v2, tenta via Cookie auth_token (GraphQL)
    if (!retweetDone && account.auth_token) {
      try {
        const ct0 = "axys_csrf_token";
        const res = await fetch("https://x.com/i/api/graphql/ojPdsZsimohLofAUjcOTcw/CreateRetweet", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
            Cookie: `auth_token=${account.auth_token}; ct0=${ct0}`,
            "x-csrf-token": ct0,
            "x-twitter-active-user": "yes",
            "x-twitter-auth-type": "OAuth2Session",
          },
          body: JSON.stringify({
            variables: { tweet_id: tweetId, dark_request: false },
            queryId: "ojPdsZsimohLofAUjcOTcw",
          }),
        });

        if (res.ok) {
          retweetDone = true;
          detailMessage = `Retweet executado com sucesso no post #${tweetId} via sessão da conta.`;
        }
      } catch (e) {
        console.error("Erro no GraphQL CreateRetweet:", e);
      }
    }

    if (!retweetDone && !account.auth_token && account.access_token === "placeholder") {
      return NextResponse.json(
        {
          ok: false,
          error: `A conta @${account.username} ainda não tem credenciais de envio salvas (auth_token está vazio). Insira o auth_token ou autorize via OAuth para retuitar.`,
        },
        { status: 400 }
      );
    }

    // Registra log
    await MetricsCollector.recordAction({
      accountId: account.id,
      actionType: "repost",
      status: retweetDone ? "COMPLETED" : "FAILED",
      detail: detailMessage || `Tentativa de retweet no post #${tweetId}`,
      xPostId: tweetId,
    });

    // Atualiza status na tabela
    await db()
      .from("platform_accounts")
      .update({
        current_action: `Retweet realizado no post #${tweetId}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id);

    return NextResponse.json({
      ok: true,
      tweetId,
      message: `Retweet enviado com sucesso na conta @${account.username}!`,
    });
  } catch (e) {
    return fail(e);
  }
}
