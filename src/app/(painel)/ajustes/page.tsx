import type { Metadata } from "next";
import { getAccount } from "@/lib/data";
import { getSetupStatus } from "@/lib/setup";
import { SettingsPanel } from "@/components/settings-panel";
import { SetupList } from "@/components/setup-list";

export const metadata: Metadata = { title: "Ajustes" };

export default async function AjustesPage() {
  const [setup, acc] = await Promise.all([getSetupStatus(), getAccount().catch(() => null)]);
  const pending = setup.filter((s) => !s.ok && s.key !== "conta" && s.key !== "ia");
  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <header><h1 className="h1">Ajustes</h1></header>
      <SettingsPanel account={acc ? { username: acc.username, display_name: acc.display_name } : null} />
      {pending.length ? <div className="max-w-[720px]"><SetupList items={setup} /></div> : null}
    </div>
  );
}
