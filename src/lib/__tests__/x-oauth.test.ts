import { describe, it, expect, beforeAll, vi } from "vitest";
import { createHash } from "node:crypto";
import { createPkce, buildAuthorizeUrl, exchangeCode, refreshTokens, XAuthError, X_TOKEN_URL } from "../x-oauth";

beforeAll(() => {
  process.env.X_CLIENT_ID = "cid";
  process.env.X_CLIENT_SECRET = "csecret";
  process.env.X_REDIRECT_URI = "https://app.test/api/x/callback";
});

describe("PKCE", () => {
  it("verifier no tamanho certo e challenge = S256(verifier)", () => {
    const { verifier, challenge } = createPkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });
});

describe("URL de autorizacao", () => {
  it("tem todos os parametros e escopos", () => {
    const u = new URL(buildAuthorizeUrl({ clientId: "cid", redirectUri: "https://r", state: "st", challenge: "ch" }));
    expect(u.origin + u.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("scope")).toBe("tweet.read tweet.write users.read offline.access");
    expect(u.searchParams.get("state")).toBe("st");
  });
});

describe("troca de token", () => {
  it("manda Basic auth, verifier e redirect", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 7200, scope: "", token_type: "bearer" }), { status: 200 }));
    const t = await exchangeCode("code123", "ver123", f as unknown as typeof fetch);
    expect(t.access_token).toBe("at");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(X_TOKEN_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe("Basic " + Buffer.from("cid:csecret").toString("base64"));
    const body = new URLSearchParams(init.body as string);
    expect(body.get("code_verifier")).toBe("ver123");
    expect(body.get("redirect_uri")).toBe("https://app.test/api/x/callback");
    expect(body.get("grant_type")).toBe("authorization_code");
  });
  it("invalid_grant no refresh pede reconexao", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Value passed for the token was invalid." }), { status: 400 }));
    await expect(refreshTokens("velho", f as unknown as typeof fetch)).rejects.toSatisfy(
      (e: unknown) => e instanceof XAuthError && e.needsReconnect,
    );
  });
});
