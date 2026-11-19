import { createHash } from "node:crypto";
import { randomToken } from "./crypto";

/**
 * OAuth 2.0 Authorization Code + PKCE (S256) do X.
 * Doc: https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/authorization-code
 *  - o "code" expira em 30 s: o callback troca na hora
 *  - access token dura 2 h; offline.access devolve refresh token
 */
export const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
export const X_TOKEN_URL = `${process.env.X_API_BASE || "https://api.x.com"}/2/oauth2/token`;
export const X_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"] as const;

export interface PkcePair { verifier: string; challenge: string }

export function createPkce(): PkcePair {
  const verifier = randomToken(48); // 64 chars base64url, dentro de 43..128
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthorizeUrl(p: {
  clientId: string; redirectUri: string; state: string; challenge: string;
}): string {
  const u = new URL(X_AUTHORIZE_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("scope", X_SCOPES.join(" "));
  u.searchParams.set("state", p.state);
  u.searchParams.set("code_challenge", p.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

function basicAuth(): string {
  const id = process.env.X_CLIENT_ID, secret = process.env.X_CLIENT_SECRET;
  if (!id || !secret) throw new Error("X_CLIENT_ID e X_CLIENT_SECRET nao configurados");
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

async function tokenRequest(body: Record<string, string>, fetchImpl: typeof fetch = fetch): Promise<TokenSet> {
  const res = await fetchImpl(X_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth() },
    body: new URLSearchParams({ ...body, client_id: process.env.X_CLIENT_ID ?? "" }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Partial<TokenSet> & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    const err = new XAuthError(json.error_description || json.error || `HTTP ${res.status}`);
    err.code = json.error;
    throw err;
  }
  return json as TokenSet;
}

export function exchangeCode(code: string, verifier: string, fetchImpl?: typeof fetch) {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.X_REDIRECT_URI ?? "",
    code_verifier: verifier,
  }, fetchImpl);
}

export function refreshTokens(refreshToken: string, fetchImpl?: typeof fetch) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl);
}

export class XAuthError extends Error {
  code?: string;
  /** invalid_grant = refresh token ja usado ou revogado -> reconectar */
  get needsReconnect() { return this.code === "invalid_grant"; }
}
