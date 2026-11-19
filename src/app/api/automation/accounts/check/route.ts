import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { db } from "@/lib/supabase";

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as { accountIds?: string[] };
    let query = db().from("platform_accounts").select("id, username");

    if (body.accountIds && body.accountIds.length > 0) {
      query = query.in("id", body.accountIds);
    }

    const { data: accounts, error } = await query;
    if (error) throw error;

    const results: Array<{ id: string; username: string; status: "live" | "die" }> = [];

    for (const acc of accounts ?? []) {
      // Verifica via oEmbed público do X se o perfil existe e está ativo
      let isLive = true;
      try {
        const res = await fetch(`https://publish.twitter.com/oembed?url=https://x.com/${acc.username}`);
        if (res.status === 404) {
          isLive = false;
        }
      } catch {
        isLive = true;
      }

      const newStatus = isLive ? "live" : "die";
      await db()
        .from("platform_accounts")
        .update({
          status: newStatus,
          current_action: isLive ? "Conta verificada (Ativa)" : "Conta suspensa ou inexistente (Die)",
          updated_at: new Date().toISOString(),
        })
        .eq("id", acc.id);

      results.push({ id: acc.id, username: acc.username, status: newStatus });
    }

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return fail(e);
  }
}
