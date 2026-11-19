import { describe, it, expect } from "vitest";
import { containsUrl, estimateThreadCost, X_PRICES_USD } from "../cost";
import { weightedLength, splitIntoThread, X_LIMIT } from "../thread";

describe("custo da API do X", () => {
  it("detecta link com e sem protocolo", () => {
    expect(containsUrl("veja https://axys.dev/x")).toBe(true);
    expect(containsUrl("acesse axysbot.com.br hoje")).toBe(true);
    expect(containsUrl("sem link nenhum aqui. ponto final.")).toBe(false);
  });

  it("cobra o preco de link so nos itens com link", () => {
    const c = estimateThreadCost(["oi", "veja https://a.co", "fim"]);
    expect(c.withUrl).toBe(1);
    expect(c.plain).toBe(2);
    expect(c.total).toBeCloseTo(X_PRICES_USD.post_create_url + 2 * X_PRICES_USD.post_create, 4);
    expect(c.urlPremium).toBeCloseTo(0.185, 4);
  });
});

describe("contagem de caracteres do X", () => {
  it("todo link conta 23", () => {
    expect(weightedLength("https://exemplo.com/" + "a".repeat(200))).toBe(23);
    expect(weightedLength("ola https://a.co fim")).toBe(4 + 23 + 4);
  });
  it("emoji conta 1 por codepoint", () => {
    expect(weightedLength("🔥🔥")).toBe(2);
  });
});

describe("quebra em thread", () => {
  it("texto curto vira 1 item", () => {
    expect(splitIntoThread("ola mundo")).toEqual(["ola mundo"]);
  });
  it("nenhum item passa do limite, e nada se perde", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Frase numero ${i} com algum conteudo.`).join(" ");
    const parts = splitIntoThread(text, { numbered: true });
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(weightedLength(p)).toBeLessThanOrEqual(X_LIMIT);
    const joined = parts.map((p) => p.replace(/ \d+\/\d+$/, "")).join(" ").replace(/\s+/g, " ");
    expect(joined).toBe(text);
  });
  it("respeita paragrafos quando cabem", () => {
    expect(splitIntoThread("primeiro\n\nsegundo")).toEqual(["primeiro\n\nsegundo"]);
  });
  it("numera 1/n", () => {
    const parts = splitIntoThread("a ".repeat(400), { numbered: true });
    expect(parts[0]).toMatch(/ 1\/\d+$/);
    expect(parts.at(-1)).toMatch(new RegExp(` ${parts.length}/${parts.length}$`));
  });
});
