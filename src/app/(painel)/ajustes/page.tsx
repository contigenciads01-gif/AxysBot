import type { Metadata } from "next";
import { Suspense } from "react";
import { getAccount } from "@/lib/data";
import { getSetupStatus } from "@/lib/setup";
import { db } from "@/lib/supabase";
import { SettingsPanel } from "@/components/settings-panel";
import { SetupList } from "@/components/setup-list";

export const metadata: Metadata = { title: "Ajustes" };

export default async function AjustesPage() {
  const [setup, acc] = await Promise.all([getSetupStatus(), getAccount().catch(() => null)]);
  let budget = 10;
  if (acc) {
    const { data } = await db().from("settings").select("monthly_budget_usd").eq("account_id", acc.id).maybeSingle();
    budget = Number(data?.monthly_budget_usd ?? 10);
  }
  const pending = setup.filter((s) => !s.ok && s.key !== "conta");
  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <header><h1 className="h1">Ajustes</h1></header>
      <Suspense>
        <SettingsPanel account={acc ? { username: acc.username, display_name: acc.display_name, avatar_url: acc.avatar_url } : null} budget={budget} />
      </Suspense>
      {pending.length ? <div className="max-w-[720px]"><SetupList items={setup} /></div> : null}
    </div>
  );
}
