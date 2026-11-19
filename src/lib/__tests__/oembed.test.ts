import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fetchEmbed, sanitizeEmbedHtml, EmbedError } from "../oembed";

const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("embed oficial do X", () => {
  it("tira script e aceita o blockquote", () => {
    const h = sanitizeEmbedHtml('<blockquote class="twitter-tweet"><p>oi</p></blockquote>\n<script async src="https://platform.twitter.com/widgets.js"></script>');
    expect(h).toBe('<blockquote class="twitter-tweet"><p>oi</p></blockquote>');
  });
  it("recusa HTML fora do formato ou com handler", () => {
    expect(sanitizeEmbedHtml("<div>oi</div>")).toBeNull();
    expect(sanitizeEmbedHtml('<blockquote class="twitter-tweet" onmouseover="x()">a</blockquote>')).toBeNull();
    expect(sanitizeEmbedHtml('<blockquote class="twitter-tweet"><a href="javascript:x()">a</a></blockquote>')).toBeNull();
  });
  it("devolve autor e html", async () => {
    const f = ok({ html: '<blockquote class="twitter-tweet">a</blockquote>', author_name: "NASA", author_url: "https://twitter.com/NASA", url: "https://twitter.com/NASA/status/1" });
    const e = await fetchEmbed("https://x.com/NASA/status/1", { fetchImpl: f });
    expect(e.author_name).toBe("NASA");
    const called = new URL(String((f as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]));
    expect(called.searchParams.get("omit_script")).toBe("true");
    expect(called.searchParams.get("dnt")).toBe("true");
  });
  it("404 vira mensagem clara", async () => {
    await expect(fetchEmbed("https://x.com/a/status/1", { fetchImpl: ok({}, 404) })).rejects.toMatchObject({ status: 404 });
    await expect(fetchEmbed("https://x.com/a/status/1", { fetchImpl: ok({}, 404) })).rejects.toBeInstanceOf(EmbedError);
  });
});
