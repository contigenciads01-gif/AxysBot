import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { getAccount } from "@/lib/data";
import { db } from "@/lib/supabase";

export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const acc = await getAccount();
    if (!acc) return NextResponse.json({ settings: null });
    const { data } = await db().from("settings").select("theme,density,timezone,monthly_budget_usd,paused").eq("account_id", acc.id).maybeSingle();
    return NextResponse.json({ settings: data });
  } catch (e) { return fail(e); }
}

export async function PATCH(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const acc = await getAccount();
    if (!acc) return NextResponse.json({ error: "Conecte sua conta do X primeiro." }, { status: 409 });
    const b = (await req.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (b.theme && ["branco", "bege", "escuro"].includes(String(b.theme))) patch.theme = b.theme;
    if (b.density && ["compacto", "amplo"].includes(String(b.density))) patch.density = b.density;
    if (typeof b.paused === "boolean") patch.paused = b.paused;
    if (b.monthly_budget_usd !== undefined) {
      const v = Number(b.monthly_budget_usd);
      if (!Number.isFinite(v) || v < 0 || v > 10000) return NextResponse.json({ error: "Orcamento invalido." }, { status: 400 });
      patch.monthly_budget_usd = v;
    }
    const { error } = await db().from("settings").upsert({ account_id: acc.id, ...patch }, { onConflict: "account_id" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
