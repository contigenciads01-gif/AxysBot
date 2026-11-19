import { describe, it, expect } from "vitest";
import { XOAuth } from "../connectors/x-oauth";

describe("XOAuth PKCE", () => {
  it("gera code_verifier válido", () => {
    const verifier = XOAuth.generateCodeVerifier();
    expect(verifier).toBeDefined();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });

  it("gera code_challenge derivado por SHA-256", () => {
    const verifier = "exemplo_verifier_pkce_12345678901234567890";
    const challenge = XOAuth.generateCodeChallenge(verifier);
    expect(challenge).toBeDefined();
    expect(typeof challenge).toBe("string");
  });

  it("monta URL de autorização correta para o X", () => {
    const urlStr = XOAuth.getAuthorizationUrl({
      clientId: "test_client_id",
      redirectUri: "https://axysbot.app/callback",
      state: "state_123",
      codeChallenge: "challenge_abc",
    });

    const url = new URL(urlStr);
    expect(url.hostname).toBe("twitter.com");
    expect(url.searchParams.get("client_id")).toBe("test_client_id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge")).toBe("challenge_abc");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});
