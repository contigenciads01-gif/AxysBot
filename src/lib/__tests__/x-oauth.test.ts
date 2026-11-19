import { describe, it, expect, beforeAll, vi } from "vitest";
import { createHash } from "node:crypto";
import { createPkce, buildAuthorizeUrl, exchangeCode, refreshTokens, xRedirectUri, XAuthError, X_TOKEN_URL } from "../x-oauth";

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
    const t = await exchangeCode("code123", "ver123", "https://app.test/api/x/callback", f as unknown as typeof fetch);
    expect(t.access_token).toBe("at");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(X_TOKEN_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe("Basic " + Buffer.from("cid:csecret").toString("base64"));
    const body = new URLSearchParams(init.body as string);
    expect(body.get("code_verifier")).toBe("ver123");
    expect(body.get("redirect_uri")).toBe("https://app.test/api/x/callback");
    expect(body.get("grant_type")).toBe("authorization_code");
  });
  it("cliente publico (sem secret): sem Basic auth, com client_id no corpo", async () => {
    const old = process.env.X_CLIENT_SECRET;
    delete process.env.X_CLIENT_SECRET;
    const f = vi.fn(async () => new Response(JSON.stringify({ access_token: "at", expires_in: 7200, scope: "", token_type: "bearer" }), { status: 200 }));
    await exchangeCode("c", "v", "https://r", f as unknown as typeof fetch);
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(new URLSearchParams(init.body as string).get("client_id")).toBe("cid");
    process.env.X_CLIENT_SECRET = old;
  });
  it("endereco de retorno: explicito > dominio do Vercel > origem", () => {
    const keep = { r: process.env.X_REDIRECT_URI, v: process.env.VERCEL_PROJECT_PRODUCTION_URL };
    process.env.X_REDIRECT_URI = "https://explicito/api/x/callback";
    expect(xRedirectUri("https://origem")).toBe("https://explicito/api/x/callback");
    delete process.env.X_REDIRECT_URI;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "axysbotpuro.vercel.app";
    expect(xRedirectUri("https://origem")).toBe("https://axysbotpuro.vercel.app/api/x/callback");
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    expect(xRedirectUri("https://origem")).toBe("https://origem/api/x/callback");
    process.env.X_REDIRECT_URI = keep.r ?? ""; if (keep.v) process.env.VERCEL_PROJECT_PRODUCTION_URL = keep.v;
  });
  it("invalid_grant no refresh pede reconexao", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Value passed for the token was invalid." }), { status: 400 }));
    await expect(refreshTokens("velho", f as unknown as typeof fetch)).rejects.toSatisfy(
      (e: unknown) => e instanceof XAuthError && e.needsReconnect,
    );
  });
});
