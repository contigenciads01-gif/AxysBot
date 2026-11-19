import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { getAccount, getDashboard } from "@/lib/data";

/** Lido pelo painel a cada 20 s. So le o NOSSO banco — zero custo na API do X. */
export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const acc = await getAccount();
    if (!acc) return NextResponse.json({ account: null });
    return NextResponse.json({ account: acc, ...(await getDashboard(acc.id)) });
  } catch (e) { return fail(e); }
}
