import { NextResponse } from "next/server";
import { requireSession } from "@/lib/http";
import { buildAuthorizeUrl, createPkce } from "@/lib/x-oauth";
import { randomToken } from "@/lib/crypto";

export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;
  const clientId = process.env.X_CLIENT_ID, redirectUri = process.env.X_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "Configure X_CLIENT_ID e X_REDIRECT_URI." }, { status: 503 });
  }
  const { verifier, challenge } = createPkce();
  const state = randomToken(24);
  const res = NextResponse.redirect(buildAuthorizeUrl({ clientId, redirectUri, state, challenge }));
  // verifier e state ficam em cookie httpOnly de vida curta (10 min)
  const opts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/api/x", maxAge: 600 };
  res.cookies.set("x_pkce", verifier, opts);
  res.cookies.set("x_state", state, opts);
  return res;
}
