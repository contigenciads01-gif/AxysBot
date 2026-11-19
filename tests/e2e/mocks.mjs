// oEmbed do X falso (publish.twitter.com) e Anthropic falsa, para o teste ponta a ponta.
// Sem API paga: o painel so usa o embed oficial (gratuito) e os Web Intents.
import http from "node:http";
const X_PORT = 4010, AI_PORT = 4020;
const log = [];

function json(res, status, body, headers = {}) { res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(body)); }

http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/__log") return json(res, 200, { log });
  log.push(`${req.method} ${u.pathname}?${u.searchParams.toString()}`);
  if (u.pathname !== "/oembed") return json(res, 404, {});
  const target = u.searchParams.get("url") ?? "";
  if (/naoexiste/i.test(target)) return json(res, 404, { error: "not found" });
  const m = target.match(/x\.com\/([^/]+)(?:\/status\/(\d+))?/);
  if (!m) return json(res, 400, {});
  if (!m[2]) return json(res, 200, { html: `<blockquote class="twitter-timeline"><a href="https://twitter.com/${m[1]}">Posts de ${m[1]}</a></blockquote>\n<script async src="https://platform.twitter.com/widgets.js"></script>`, author_name: "Thiago Teste", author_url: `https://twitter.com/${m[1]}`, url: `https://twitter.com/${m[1]}` });
  return json(res, 200, {
    html: `<blockquote class="twitter-tweet"><p lang="pt">Qual ferramenta você usa pra agendar posts? Quero parar de postar no improviso.</p>&mdash; Ana Souza (@${m[1]}) <a href="https://twitter.com/${m[1]}/status/${m[2]}">19 de novembro de 2026</a></blockquote>\n<script async src="https://platform.twitter.com/widgets.js"></script>`,
    author_name: "Ana Souza", author_url: `https://twitter.com/${m[1]}`, url: `https://twitter.com/${m[1]}/status/${m[2]}`,
  });
}).listen(X_PORT, () => console.log(`[mock] oEmbed do X em http://127.0.0.1:${X_PORT}`));

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
