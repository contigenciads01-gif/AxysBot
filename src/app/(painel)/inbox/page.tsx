import type { Metadata } from "next";
import Link from "next/link";
import { getAccount } from "@/lib/data";
import { db } from "@/lib/supabase";
import { Inbox } from "@/components/inbox";

export const metadata: Metadata = { title: "Menções" };

export default async function InboxPage() {
  const acc = await getAccount().catch(() => null);
  if (!acc) {
    return (<div className="max-w-[560px]"><h1 className="h1">Menções</h1><p className="mt-2 text-[var(--ink-2)]">Conecte sua conta do X para ver quem falou com você.</p><Link href="/ajustes" className="btn btn-primary mt-4">Conectar conta do X</Link></div>);
  }
  const { data } = await db().from("mentions")
    .select("x_post_id,author_handle,author_name,body,created_at,replied,reply_post_id")
    .eq("account_id", acc.id).order("created_at", { ascending: false }).limit(100);
  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <header><h1 className="h1">Menções</h1><p className="mt-1 text-[var(--ink-2)]">Cada resposta sai só quando você clica em Responder.</p></header>
      <Inbox mentions={data ?? []} aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)} />
    </div>
  );
}
