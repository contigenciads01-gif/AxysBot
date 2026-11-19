import "server-only";

/**
 * Composer com Claude (Messages API). Devolve JSON estruturado.
 * O modelo escreve NA VOZ do usuario, em pt-BR, conteudo original —
 * sem isca de engajamento, sem pedir like/RT, sem hashtag em excesso.
 */
const ENDPOINT = `${process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`;

export type ComposeMode = "variacoes" | "thread" | "resposta" | "melhorar";

const SYSTEM = `Voce e um redator que escreve posts para o X (Twitter) na voz do proprio autor.
Regras:
- Portugues do Brasil, natural, sem soar como IA. Nada de "Voce sabia que...", "Fio 🧵👇" ou listas de emoji.
- Conteudo original e honesto. Nao invente dados, numeros ou citacoes.
- Nao peca like, RT, follow ou "comenta aqui" (isca de engajamento).
- No maximo 1 hashtag, e so se fizer sentido.
- Cada post com no maximo 270 caracteres (link conta 23).
- Responda APENAS com JSON valido no formato pedido, sem texto antes ou depois.`;

function userPrompt(mode: ComposeMode, input: string, tone?: string): string {
  const t = tone ? `Tom desejado: ${tone}.\n` : "";
  switch (mode) {
    case "variacoes":
      return `${t}Escreva 3 versoes diferentes deste post, cada uma com um angulo distinto.\nTexto base:\n"""${input}"""\nFormato: {"options":[{"label":"curto rotulo do angulo","items":["post"]}]}`;
    case "thread":
      return `${t}Transforme esta ideia numa thread de 3 a 8 posts. O primeiro post precisa se sustentar sozinho.\nIdeia:\n"""${input}"""\nFormato: {"options":[{"label":"Thread","items":["post 1","post 2"]}]}`;
    case "resposta":
      return `${t}Sugira 3 respostas curtas e educadas para esta mencao. Responda ao que foi dito, sem vender nada.\nMencao recebida:\n"""${input}"""\nFormato: {"options":[{"label":"rotulo","items":["resposta"]}]}`;
    case "melhorar":
      return `${t}Revise este post: mais claro, mais direto, mesmo sentido. Devolva 2 opcoes.\nTexto:\n"""${input}"""\nFormato: {"options":[{"label":"rotulo","items":["post"]}]}`;
  }
}

export interface ComposeResult { options: { label: string; items: string[] }[] }

export async function compose(mode: ComposeMode, input: string, tone?: string): Promise<ComposeResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Configure ANTHROPIC_API_KEY para usar a IA.");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 1500,
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt(mode, input.slice(0, 4000), tone) }],
    }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `IA indisponivel (HTTP ${res.status})`);
  const text: string = (body.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
  return parseCompose(text);
}

/** Extrai o JSON mesmo se vier cercado de ``` ou texto solto. */
export function parseCompose(text: string): ComposeResult {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("A IA nao devolveu um formato valido. Tente de novo.");
  const parsed = JSON.parse(text.slice(start, end + 1)) as ComposeResult;
  const options = (parsed.options ?? [])
    .map((o) => ({ label: String(o.label ?? "Opcao"), items: (o.items ?? []).map(String).map((s) => s.trim()).filter(Boolean) }))
    .filter((o) => o.items.length);
  if (!options.length) throw new Error("A IA nao devolveu sugestoes. Tente de novo.");
  return { options };
}
