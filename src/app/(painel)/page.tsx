import { getAccount, getDashboard, listPosts } from "@/lib/data";
import { getSetupStatus } from "@/lib/setup";
import { db } from "@/lib/supabase";
import { LiveDashboard } from "@/components/live-dashboard";
import { SetupList } from "@/components/setup-list";
import Link from "next/link";

export default async function DashboardPage() {
  const setup = await getSetupStatus();
  const ready = setup.filter((s) => s.key !== "ia").every((s) => s.ok);

  if (!ready) {
    return (
      <div className="flex flex-col gap-[var(--gap)] max-w-[720px]">
        <header>
          <h1 className="h1">Vamos ligar o seu bot</h1>
          <p className="mt-1.5 text-[var(--ink-2)] max-w-[60ch]">Faltam alguns passos. Esta lista se atualiza sozinha quando você recarrega a página.</p>
        </header>
        <SetupList items={setup} />
        <div><Link href="/ajustes" className="btn btn-primary">Abrir Ajustes</Link></div>
      </div>
    );
  }

  const acc = (await getAccount())!;
  const [dash, queue, settings] = await Promise.all([
    getDashboard(acc.id),
    listPosts(acc.id, { status: ["agendado", "publicando", "falhou"], limit: 40 }),
    db().from("settings").select("paused").eq("account_id", acc.id).maybeSingle(),
  ]);

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Olá, {acc.display_name?.split(" ")[0] ?? `@${acc.username}`}</h1>
          <p className="mt-1 text-[var(--ink-2)]">
            {dash.queue.agendado ? `${dash.queue.agendado} post${dash.queue.agendado > 1 ? "s" : ""} na fila` : "Fila vazia"}
            {dash.ready ? `, ${dash.ready} pronto${dash.ready > 1 ? "s" : ""} para publicar` : ""}.
          </p>
        </div>
        <Link href="/composer" className="btn btn-primary hidden md:inline-flex">Escrever post</Link>
      </header>
      <LiveDashboard
        initial={{ ...dash, account: { username: acc.username, display_name: acc.display_name } }}
        initialQueue={queue}
        initialPaused={Boolean(settings.data?.paused)}
      />
    </div>
  );
}
