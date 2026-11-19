import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { XConnector, RateLimitError, AuthError } from "../connectors/x-connector";

describe("XConnector", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("cria post no X com sucesso", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({
        "x-rate-limit-remaining": "14",
        "x-rate-limit-limit": "15",
        "x-rate-limit-reset": "1795000000",
      }),
      json: async () => ({
        data: { id: "123456", text: "Post automático pelo AXYSBOT" },
      }),
    });

    const connector = new XConnector("fake_token");
    const res = await connector.createPost("Post automático pelo AXYSBOT");

    expect(res.id).toBe("123456");
    expect(res.text).toBe("Post automático pelo AXYSBOT");
    expect(res.rateLimit.remaining).toBe(14);
  });

  it("lança RateLimitError quando recebe status 429", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({
        "x-rate-limit-remaining": "0",
        "x-rate-limit-limit": "15",
        "x-rate-limit-reset": "1795000100",
      }),
      text: async () => "Rate limit exceeded",
    });

    const connector = new XConnector("fake_token");
    await expect(connector.createPost("Post")).rejects.toThrow(RateLimitError);
  });

  it("lança AuthError quando recebe status 401", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => "Unauthorized",
    });

    const connector = new XConnector("invalid_token");
    await expect(connector.createPost("Post")).rejects.toThrow(AuthError);
  });
});
