// X falso (API v2 + OAuth2) e Anthropic falsa, para o teste ponta a ponta.
import http from "node:http";
const X_PORT = 4010, AI_PORT = 4020;
const tweets = new Map(); let seq = 1900000000000000000n;
const TOKENS = { access: "at-1", refresh: "rt-1" };
let mentionsServed = false;
const log = [];

function json(res, status, body, headers = {}) { res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(body)); }

http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    const u = new URL(req.url, "http://x");
    log.push(`${req.method} ${u.pathname}`);
    if (u.pathname === "/__log") return json(res, 200, { log, tweets: [...tweets.values()] });

    if (u.pathname === "/2/oauth2/token") {
      const p = new URLSearchParams(body);
      if (req.headers.authorization !== "Basic " + Buffer.from("cid-teste:csecret-teste").toString("base64")) return json(res, 401, { error: "unauthorized_client" });
      if (p.get("grant_type") === "authorization_code" && p.get("code") === "code-ok" && p.get("code_verifier")) return json(res, 200, { access_token: TOKENS.access, refresh_token: TOKENS.refresh, expires_in: 7200, scope: "tweet.read tweet.write users.read offline.access", token_type: "bearer" });
      if (p.get("grant_type") === "refresh_token" && p.get("refresh_token") === TOKENS.refresh) { TOKENS.access = "at-2"; TOKENS.refresh = "rt-2"; return json(res, 200, { access_token: "at-2", refresh_token: "rt-2", expires_in: 7200, scope: "", token_type: "bearer" }); }
      return json(res, 400, { error: "invalid_grant", error_description: "Value passed for the token was invalid." });
    }
    if (req.headers.authorization !== `Bearer ${TOKENS.access}`) return json(res, 401, { title: "Unauthorized", detail: "Unauthorized" });

    if (u.pathname === "/2/users/me") return json(res, 200, { data: { id: "9001", username: "thiago_teste", name: "Thiago Teste", profile_image_url: null, public_metrics: { followers_count: 1287, following_count: 310, tweet_count: 842 } } });
    if (u.pathname === "/2/tweets" && req.method === "POST") {
      const b = JSON.parse(body);
      if (b.text.includes("FALHAR")) return json(res, 403, { title: "Forbidden", detail: "You are not allowed to create a Tweet with duplicate content." });
      if (b.reply && !tweets.has(b.reply.in_reply_to_tweet_id)) return json(res, 400, { detail: "reply target not found" });
      const id = String(++seq); tweets.set(id, { id, text: b.text, reply_to: b.reply?.in_reply_to_tweet_id ?? null });
      return json(res, 201, { data: { id, text: b.text } });
    }
    if (u.pathname === "/2/tweets" && req.method === "GET") {
      const ids = (u.searchParams.get("ids") ?? "").split(",").filter((i) => tweets.has(i));
      return json(res, 200, { data: ids.map((id, i) => ({ id, text: tweets.get(id).text, public_metrics: { impression_count: 400 + i * 37, like_count: 12 + i, reply_count: 3, retweet_count: 2, quote_count: 0, bookmark_count: 1 } })) });
    }
    if (/^\/2\/users\/\d+\/mentions$/.test(u.pathname)) {
      if (mentionsServed && u.searchParams.get("since_id")) return json(res, 200, { meta: { result_count: 0 } });
      mentionsServed = true;
      for (const id of ["1800000000000000002","1800000000000000001"]) tweets.set(id, { id, text: "(mencao)", reply_to: null, external: true });
      return json(res, 200, {
        data: [
          { id: "1800000000000000002", text: "@thiago_teste gostei muito da thread de ontem, tem material sobre isso?", author_id: "77", created_at: new Date(Date.now() - 3600e3).toISOString() },
          { id: "1800000000000000001", text: "@thiago_teste qual ferramenta você usa pra agendar?", author_id: "78", created_at: new Date(Date.now() - 7200e3).toISOString() },
        ],
        includes: { users: [{ id: "77", username: "ana_dev", name: "Ana Souza" }, { id: "78", username: "rafa_mkt", name: "Rafael Lima" }] },
      });
    }
    json(res, 404, { title: "Not Found" });
  });
}).listen(X_PORT, () => console.log(`[mock] X em http://127.0.0.1:${X_PORT}`));

http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    if (req.headers["x-api-key"] !== "sk-teste") return json(res, 401, { error: { message: "invalid x-api-key" } });
    const prompt = JSON.parse(body).messages[0].content;
    const options = prompt.includes("para esta mencao")
      ? [{ label: "Direta", items: ["Valeu, Ana! Vou juntar o material e posto aqui amanhã."] }, { label: "Curta", items: ["Obrigado! Tem sim, te mando já."] }]
      : prompt.includes("numa thread")
      ? [{ label: "Thread", items: ["Agendar posts mudou minha rotina no X.", "Escrevo tudo no domingo e o painel publica na semana.", "Sobra tempo pra responder quem comenta."] }]
      : [{ label: "Direto", items: ["Escrevi a semana inteira de posts em 20 minutos."] }, { label: "Pessoal", items: ["Testei agendar tudo no domingo. Funcionou melhor do que eu esperava."] }];
    json(res, 200, { content: [{ type: "text", text: "```json\n" + JSON.stringify({ options }) + "\n```" }] });
  });
}).listen(AI_PORT, () => console.log(`[mock] Anthropic em http://127.0.0.1:${AI_PORT}`));
