import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/session";

/**
 * Next 16: `proxy` substitui `middleware` (runtime Node).
 * Tudo exige sessao, exceto login e crons (que tem o proprio
 * segredo). As rotas de API validam a sessao de novo (defesa em profundidade).
 */
const PUBLIC = ["/login", "/api/auth/login", "/api/cron/"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();

  let ok = false;
  try { ok = isValidSession(req.cookies.get(SESSION_COOKIE)?.value); } catch { ok = false; }
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sessao expirada. Entre de novo." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|ico|webp)$).*)"],
};
