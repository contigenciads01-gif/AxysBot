import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { db } from "@/lib/supabase";
import { getAccount } from "@/lib/data";

/**
 * Desconecta SEM apagar historico: so invalida os tokens. (Apagar a linha
 * levaria posts, metricas e mencoes junto por causa do on delete cascade.)
 */
export async function POST() {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const acc = await getAccount();
    if (acc) {
      await db().from("x_accounts")
        .update({ access_token: "revogado", refresh_token: null, token_expires_at: null })
        .eq("id", acc.id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
