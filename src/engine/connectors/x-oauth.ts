import "server-only";
import { createHash, randomBytes } from "node:crypto";

export interface TokenExchangeResult {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

export class XOAuth {
  private static readonly AUTH_URL = "https://twitter.com/i/oauth2/authorize";
  private static readonly TOKEN_URL = "https://api.x.com/2/oauth2/token";
  private static readonly REVOKE_URL = "https://api.x.com/2/oauth2/revoke";

  static readonly DEFAULT_SCOPES = [
    "tweet.read",
    "tweet.write",
    "users.read",
    "offline.access",
    "like.read",
    "like.write",
  ];

  /** Gera code_verifier para OAuth 2.0 PKCE */
  static generateCodeVerifier(): string {
    return randomBytes(32).toString("base64url");
  }

  /** Gera code_challenge a partir do code_verifier (S256) */
  static generateCodeChallenge(verifier: string): string {
    return createHash("sha256").update(verifier).digest("base64url");
  }

  /** Gera state aleatório para prevenir CSRF */
  static generateState(): string {
    return randomBytes(16).toString("base64url");
  }

  /**
   * Monta a URL de autorização no X para redirecionar o usuário.
   */
  static getAuthorizationUrl(options: {
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
    scopes?: string[];
  }): string {
    const scopes = options.scopes ?? this.DEFAULT_SCOPES;
    const url = new URL(this.AUTH_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", options.clientId);
    url.searchParams.set("redirect_uri", options.redirectUri);
    url.searchParams.set("scope", scopes.join(" "));
    url.searchParams.set("state", options.state);
    url.searchParams.set("code_challenge", options.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    return url.toString();
  }

  /**
   * Troca o authorization code pelos tokens de acesso e renovação.
   */
  static async exchangeCode(options: {
    code: string;
    codeVerifier: string;
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
  }): Promise<TokenExchangeResult> {
    const params = new URLSearchParams({
      code: options.code,
      grant_type: "authorization_code",
      client_id: options.clientId,
      redirect_uri: options.redirectUri,
      code_verifier: options.codeVerifier,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    if (options.clientSecret) {
      const basic = Buffer.from(`${options.clientId}:${options.clientSecret}`).toString("base64");
      headers.Authorization = `Basic ${basic}`;
    }

    const res = await fetch(this.TOKEN_URL, {
      method: "POST",
      headers,
      body: params.toString(),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Falha ao trocar código OAuth no X (${res.status}): ${err}`);
    }

    return (await res.json()) as TokenExchangeResult;
  }

  /**
   * Renova o token de acesso utilizando o refresh_token.
   */
  static async refreshAccessToken(options: {
    refreshToken: string;
    clientId: string;
    clientSecret?: string;
  }): Promise<TokenExchangeResult> {
    const params = new URLSearchParams({
      refresh_token: options.refreshToken,
      grant_type: "refresh_token",
      client_id: options.clientId,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    if (options.clientSecret) {
      const basic = Buffer.from(`${options.clientId}:${options.clientSecret}`).toString("base64");
      headers.Authorization = `Basic ${basic}`;
    }

    const res = await fetch(this.TOKEN_URL, {
      method: "POST",
      headers,
      body: params.toString(),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Falha ao renovar token no X (${res.status}): ${err}`);
    }

    return (await res.json()) as TokenExchangeResult;
  }

  /**
   * Revoga um token no X.
   */
  static async revokeToken(token: string, clientId: string, clientSecret?: string): Promise<boolean> {
    const params = new URLSearchParams({
      token,
      token_type_hint: "access_token",
      client_id: clientId,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    if (clientSecret) {
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      headers.Authorization = `Basic ${basic}`;
    }

    const res = await fetch(this.REVOKE_URL, {
      method: "POST",
      headers,
      body: params.toString(),
    });

    return res.ok;
  }
}
