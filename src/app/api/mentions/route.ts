import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { getAccount } from "@/lib/data";
import { db } from "@/lib/supabase";

export async function GET(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const acc = await getAccount();
    if (!acc) return NextResponse.json({ mentions: [] });
    const onlyOpen = new URL(req.url).searchParams.get("abertas") === "1";
    let q = db().from("mentions")
      .select("x_post_id,author_handle,author_name,body,created_at,replied,reply_post_id")
      .eq("account_id", acc.id).order("created_at", { ascending: false }).limit(100);
    if (onlyOpen) q = q.eq("replied", false);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ mentions: data ?? [] });
  } catch (e) { return fail(e); }
}
