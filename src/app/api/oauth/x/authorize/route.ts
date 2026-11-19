import { NextResponse } from "next/server";
import { XOAuth } from "@/engine/connectors/x-oauth";

export async function GET(req: Request) {
  const urlObj = new URL(req.url);
  const origin = urlObj.origin;
  const clientId = process.env.X_CLIENT_ID;

  if (!clientId) {
    return NextResponse.redirect(`${origin}/bot?error=${encodeURIComponent("X_CLIENT_ID não configurado")}`);
  }

  const redirectUri = `${origin}/api/oauth/x/callback`;
  const state = XOAuth.generateState();
  const codeVerifier = XOAuth.generateCodeVerifier();
  const codeChallenge = XOAuth.generateCodeChallenge(codeVerifier);

  const authUrl = XOAuth.getAuthorizationUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge,
  });

  const response = NextResponse.redirect(authUrl);

  // Armazena codeVerifier em cookie seguro para troca no callback
  response.cookies.set("axys_pkce", codeVerifier, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
