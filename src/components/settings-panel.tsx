"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeSwitch, DensitySwitch } from "./prefs";
import { useToast } from "./toast";

export function SettingsPanel({ account }: { account: { username: string; display_name: string | null } | null }) {
  const router = useRouter();
  const toast = useToast();
  const [handle, setHandle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(!account);

  async function identify(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/x/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: handle }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      toast.show(`Conta @${j.username} identificada`);
      setEditing(false); setHandle("");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Não deu para salvar."); }
    finally { setSaving(false); }
  }
  async function unlink() {
    if (!confirm("Desvincular este @? O histórico fica guardado.")) return;
    const r = await fetch("/api/x/account", { method: "DELETE" });
    if (r.ok) { toast.show("Conta desvinculada"); setEditing(true); router.refresh(); }
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="flex flex-col gap-[var(--gap)] max-w-[720px]">
      <section className="panel panel-pad">
        <h2 className="h2">Conta do X</h2>
        {account && !editing ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="size-10 rounded-full bg-[var(--accent-wash)] grid place-items-center font-[650] text-[var(--accent)]">{account.username[0]?.toUpperCase()}</span>
            <div className="min-w-0">
              <div className="font-[620]">{account.display_name ?? account.username}</div>
              <div className="text-[12.5px] text-[var(--muted)]">@{account.username}</div>
            </div>
            <div className="ml-auto flex gap-2">
              <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>Trocar @</button>
              <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={unlink}>Desvincular</button>
            </div>
          </div>
        ) : (
          <form className="mt-2" onSubmit={identify}>
            <p className="text-[13.5px] text-[var(--ink-2)] max-w-[60ch]">Grátis e sem API: o painel só precisa saber o seu @. Para publicar, responder e repostar, ele abre o x.com já logado neste navegador, e você confirma lá. Nenhuma senha, cookie ou token fica guardado aqui.</p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="label">Seu @ no X</span>
                <input className="input mt-1 w-[220px]" name="usuario_x" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="@seuperfil" value={handle} onChange={(e) => setHandle(e.target.value)} required />
              </label>
              <button type="submit" className="btn btn-primary" disabled={saving || !handle.trim()}>{saving ? "Conferindo…" : "Identificar conta"}</button>
              {account ? <button type="button" className="btn" onClick={() => setEditing(false)}>Cancelar</button> : null}
            </div>
            {error ? <p className="mt-2 text-[12.5px] text-[var(--bad)]" role="alert">{error}</p> : null}
          </form>
        )}
      </section>

      <section className="panel panel-pad">
        <h2 className="h2">Aparência</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div><div className="label mb-1.5">Fundo</div><ThemeSwitch /></div>
          <div><div className="label mb-1.5">Densidade</div><DensitySwitch /></div>
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
