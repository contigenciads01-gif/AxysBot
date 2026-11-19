"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ThemeSwitch, DensitySwitch } from "./prefs";
import { useToast } from "./toast";

const X_MSG: Record<string, string> = {
  conectado: "Conta do X conectada",
  negado: "Você cancelou a autorização no X",
  estado_invalido: "A autorização expirou. Tente conectar de novo",
  falhou: "O X recusou a conexão. Confira X_CLIENT_ID, X_CLIENT_SECRET e a Callback URI",
};

export function SettingsPanel({ account, budget }: { account: { username: string; display_name: string | null; avatar_url: string | null } | null; budget: number }) {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const [b, setB] = useState(String(budget));
  const flash = sp.get("x");

  async function saveBudget() {
    const r = await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ monthly_budget_usd: Number(b.replace(",", ".")) }) });
    toast.show(r.ok ? "Orçamento salvo" : (await r.json()).error);
  }
  async function disconnect() {
    if (!confirm("Desconectar a conta do X? O histórico fica guardado, mas nada mais é publicado até conectar de novo.")) return;
    const r = await fetch("/api/x/disconnect", { method: "POST" });
    if (r.ok) { toast.show("Conta desconectada"); router.refresh(); }
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="flex flex-col gap-[var(--gap)] max-w-[720px]">
      {flash && X_MSG[flash] ? (
        <div className={`panel panel-pad enter ${flash === "conectado" ? "border-[var(--ok)]" : "border-[var(--bad)]"}`} role="status">{X_MSG[flash]}.</div>
      ) : null}

      <section className="panel panel-pad">
        <h2 className="h2">Conta do X</h2>
        {account ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {account.avatar_url ? <img src={account.avatar_url} alt="" width={40} height={40} className="size-10 rounded-full" /> : null}
            <div className="min-w-0">
              <div className="font-[620]">{account.display_name ?? account.username}</div>
              <div className="text-[12.5px] text-[var(--muted)]">@{account.username}</div>
            </div>
            <div className="ml-auto flex gap-2">
              <a href="/api/x/connect" className="btn btn-sm">Reconectar</a>
              <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={disconnect}>Desconectar</button>
            </div>
          </div>
        ) : (
          <div className="mt-2">
            <p className="text-[13.5px] text-[var(--ink-2)] max-w-[56ch]">O painel pede permissão para ler seu perfil, publicar posts e ler menções. Nada é publicado sem estar na sua fila.</p>
            <a href="/api/x/connect" className="btn btn-primary mt-3">Conectar conta do X</a>
          </div>
        )}
      </section>

      <section className="panel panel-pad">
        <h2 className="h2">Aparência</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div><div className="label mb-1.5">Fundo</div><ThemeSwitch /></div>
          <div><div className="label mb-1.5">Densidade</div><DensitySwitch /></div>
        </div>
      </section>

      <section className="panel panel-pad">
        <h2 className="h2">Orçamento da API do X</h2>
        <p className="mt-1 text-[13px] text-[var(--ink-2)] max-w-[60ch]">O X cobra por uso: US$ 0,015 por post, US$ 0,20 se tiver link, US$ 0,005 por leitura. O painel avisa quando o mês chega a 80% do valor abaixo.</p>
        <div className="mt-3 flex items-end gap-2">
          <label className="block">
            <span className="label">Limite mensal em US$</span>
            <input className="input mt-1 w-[140px] num" name="orcamento" autoComplete="off" inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} />
          </label>
          <button type="button" className="btn" onClick={saveBudget}>Salvar orçamento</button>
        </div>
      </section>

      <section className="panel panel-pad flex items-center justify-between gap-3">
        <div><h2 className="h2">Sessão</h2><p className="text-[13px] text-[var(--ink-2)]">Você fica conectado por 14 dias neste navegador.</p></div>
        <button type="button" className="btn" onClick={logout}>Sair</button>
      </section>
      {toast.node}
    </div>
  );
}
