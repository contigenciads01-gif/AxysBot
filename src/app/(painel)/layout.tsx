import { Shell } from "@/components/shell";
import { getAccount } from "@/lib/data";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function loadShell() {
  try {
    const acc = await getAccount();
    if (!acc) return { username: null, open: 0 };
    const { count } = await db().from("mentions").select("x_post_id", { count: "exact", head: true }).eq("account_id", acc.id).eq("replied", false);
    return { username: acc.username, open: count ?? 0 };
  } catch {
    return { username: null, open: 0 }; // banco ainda nao configurado: o painel abre e guia o setup
  }
}

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const { username, open } = await loadShell();
  return <Shell username={username} openMentions={open}>{children}</Shell>;
}
