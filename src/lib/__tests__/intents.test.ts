import { describe, it, expect } from "vitest";
import { normalizeHandle, parsePostRef, postIntent, repostIntent, searchUrl, mentionsSearchUrl } from "../intents";

describe("@ da conta", () => {
  it("aceita @, link e maiusculas", () => {
    expect(normalizeHandle("@Thiago_01")).toBe("Thiago_01");
    expect(normalizeHandle("https://x.com/fulano?s=20")).toBe("fulano");
    expect(normalizeHandle("twitter.com/fulano/")).toBe("fulano");
  });
  it("recusa @ invalido", () => {
    expect(normalizeHandle("nome com espaco")).toBeNull();
    expect(normalizeHandle("a".repeat(16))).toBeNull();
    expect(normalizeHandle("")).toBeNull();
  });
});

describe("link de post", () => {
  it("le x.com, twitter.com, mobile e i/web", () => {
    expect(parsePostRef("https://x.com/nasa/status/1861111969639481848?s=46")).toEqual({ id: "1861111969639481848", handle: "nasa", url: "https://x.com/nasa/status/1861111969639481848" });
    expect(parsePostRef("mobile.twitter.com/nasa/status/123456789")?.id).toBe("123456789");
    expect(parsePostRef("https://x.com/i/web/status/123456789")?.handle).toBeNull();
    expect(parsePostRef("123456789012")?.id).toBe("123456789012");
  });
  it("recusa o que nao e post", () => {
    expect(parsePostRef("https://x.com/nasa")).toBeNull();
    expect(parsePostRef("https://evil.com/nasa/status/123456789")).toBeNull();
  });
});

describe("Web Intents oficiais", () => {
  it("post com texto codificado", () => {
    const u = new URL(postIntent("olá & #tag https://a.co"));
    expect(u.origin + u.pathname).toBe("https://x.com/intent/tweet");
    expect(u.searchParams.get("text")).toBe("olá & #tag https://a.co");
    expect(u.searchParams.has("in_reply_to")).toBe(false);
  });
  it("resposta leva in_reply_to", () => {
    expect(new URL(postIntent("oi", "42")).searchParams.get("in_reply_to")).toBe("42");
  });
  it("repost", () => {
    expect(repostIntent("123")).toBe("https://x.com/intent/retweet?tweet_id=123");
  });
  it("busca por tipo", () => {
    expect(new URL(searchUrl("ia brasil", "recentes")).searchParams.get("f")).toBe("live");
    expect(new URL(searchUrl("fulano", "perfis")).searchParams.get("f")).toBe("user");
    expect(new URL(searchUrl("x", "destaques")).searchParams.has("f")).toBe(false);
    expect(new URL(mentionsSearchUrl("eu")).searchParams.get("q")).toBe("@eu");
  });
});
