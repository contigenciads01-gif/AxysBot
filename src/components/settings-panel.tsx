"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeSwitch, DensitySwitch } from "./prefs";
import { useToast } from "./toast";

export function SettingsPanel({
  account,
}: {
  account: { username: string; display_name: string | null } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [handle, setHandle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(!account);
  const [activeTab, setActiveTab] = useState<"rapido" | "developer">("rapido");

  async function identify(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/x/account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: handle }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      toast.show(`✅ Conta @${j.username} conectada com sucesso!`);
      setEditing(false);
      setHandle("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não deu para salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function unlink() {
    if (!confirm("Desvincular este @? O histórico fica guardado.")) return;
    const r = await fetch("/api/x/account", { method: "DELETE" });
    if (r.ok) {
      toast.show("Conta desvinculada");
      setEditing(true);
      router.refresh();
    }
  }

  async function logout() {
    if (!confirm("Deseja realmente sair da sua sessão?")) return;
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="flex flex-col gap-[var(--gap)] max-w-[760px]">
      {/* 1. GUIA RÁPIDO & CONEXÃO DA CONTA DO X */}
      <section className="panel panel-pad space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
          <div>
            <h2 className="h2 flex items-center gap-2">
              <span>🐦</span> Conta do X (Twitter)
            </h2>
            <p className="text-[12.5px] text-[var(--ink-2)] mt-0.5">
              Conecte sua conta para agendamento de posts, esteira do Drive e piloto automático.
            </p>
          </div>

          {account && !editing && (
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> Conectada
            </span>
          )}
        </div>

        {/* Guia Visual Explicativo: O que é preciso para conectar */}
        <div className="p-3.5 rounded-xl bg-gradient-to-r from-sky-950/25 via-zinc-950/40 to-emerald-950/25 border border-sky-500/30 text-[12.5px] space-y-2">
          <div className="flex items-center gap-2 font-[700] text-sky-300">
            <span>💡</span> Como conectar sua conta após criar o acesso?
          </div>
          <p className="text-[var(--ink-2)] leading-relaxed">
            É <strong>extremamente simples e rápido</strong>: você não precisa pagar API ($100/mês) nem configurar chaves complicadas. Basta digitar o <strong>nome de usuário (@)</strong> da sua conta! O robô prepara os tweets e mídias do Drive e publica direto no navegador.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
            <div className="p-2 rounded-lg bg-[var(--sunken)]/60 border border-[var(--line)]">
              <strong className="text-sky-300 block">1. Nome de Usuário</strong>
              <span className="text-[var(--muted)]">Seu @ no X (ex: @JulyCardoso)</span>
            </div>
            <div className="p-2 rounded-lg bg-[var(--sunken)]/60 border border-[var(--line)]">
              <strong className="text-emerald-300 block">2. Zero Custo</strong>
              <span className="text-[var(--muted)]">Sem taxas ou API paga do X</span>
            </div>
            <div className="p-2 rounded-lg bg-[var(--sunken)]/60 border border-[var(--line)]">
              <strong className="text-purple-300 block">3. Pronto na Hora</strong>
              <span className="text-[var(--muted)]">Conexão instantânea em 5s</span>
            </div>
          </div>
        </div>

        {account && !editing ? (
          <div className="p-4 rounded-xl bg-[var(--sunken)]/50 border border-[var(--line)] flex flex-wrap items-center gap-3.5">
            <span className="size-11 rounded-full bg-[var(--accent)] text-[var(--on-accent)] grid place-items-center font-[750] text-[16px] shadow-sm">
              {account.username[0]?.toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="font-[700] text-[15px] text-[var(--ink)]">
                {account.display_name ?? account.username}
              </div>
              <div className="text-[12.5px] text-[var(--accent)] font-mono">
                @{account.username}
              </div>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-sm btn-ghost cursor-pointer"
                onClick={() => setEditing(true)}
              >
                Trocar @
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost btn-danger cursor-pointer"
                onClick={unlink}
              >
                Desvincular
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Abas de Conexão: Modo Rápido (@) vs Modo Desenvolvedor (Client ID) */}
            <div className="flex items-center gap-2 border-b border-[var(--line)] pb-2">
              <button
                type="button"
                onClick={() => setActiveTab("rapido")}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-[650] transition-all cursor-pointer ${
                  activeTab === "rapido"
                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                    : "text-[var(--ink-2)] hover:bg-[var(--sunken)]"
                }`}
              >
                ⚡ Modo Rápido (Apenas @Usuário) — Recomendado
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("developer")}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-[650] transition-all cursor-pointer ${
                  activeTab === "developer"
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                    : "text-[var(--ink-2)] hover:bg-[var(--sunken)]"
                }`}
              >
                🔑 Modo API Developer (Client ID)
              </button>
            </div>

            {activeTab === "rapido" ? (
              <form onSubmit={identify} className="space-y-3">
                <p className="text-[13px] text-[var(--ink-2)] leading-relaxed">
                  Digite apenas o seu nome de usuário do X. O robô conecta imediatamente sem pedir senhas nem tokens.
                </p>
                <div className="flex flex-wrap items-end gap-2.5">
                  <label className="block">
                    <span className="label text-[12px]">Nome de Usuário (@ do X)</span>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] font-mono text-[14px]">
                        @
                      </span>
                      <input
                        className="input pl-7 w-[240px] text-[13px] font-mono"
                        name="usuario_x"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder="seuperfil"
                        value={handle.replace(/^@/, "")}
                        onChange={(e) => setHandle(e.target.value.replace(/^@/, ""))}
                        required
                      />
                    </div>
                  </label>
                  <button
                    type="submit"
                    className="btn btn-primary cursor-pointer text-[13px] font-[700]"
                    disabled={saving || !handle.trim()}
                  >
                    {saving ? "Conectando…" : "Conectar Conta"}
                  </button>
                  {account && (
                    <button
                      type="button"
                      className="btn cursor-pointer text-[13px]"
                      onClick={() => setEditing(false)}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
                {error && (
                  <p className="text-[12.5px] text-[var(--bad)] mt-2" role="alert">
                    {error}
                  </p>
                )}
              </form>
            ) : (
              <div className="space-y-3 p-3.5 rounded-xl bg-[var(--sunken)]/50 border border-[var(--line)] text-[12.5px]">
                <div className="space-y-1">
                  <strong className="text-[var(--ink)] block font-[700]">
                    Conexão Oficial via Twitter Developer (OAuth 2.0 PKCE)
                  </strong>
                  <p className="text-[var(--ink-2)] leading-relaxed">
                    Para publicar 100% em segundo plano via API oficial sem confirmação visual no navegador, configure seu <strong>Client ID</strong> no painel de desenvolvedor do X (developer.x.com).
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-zinc-950/60 border border-[var(--line)] font-mono text-[11.5px] space-y-1 text-zinc-300">
                  <div>1. Acesse o <strong>developer.x.com</strong> e crie um App Grátis</div>
                  <div>2. Em User Authentication Settings, selecione OAuth 2.0</div>
                  <div>3. Callback URL: <span className="text-sky-300 select-all">https://axysbotpuro.vercel.app/api/oauth/x/callback</span></div>
                  <div>4. Adicione <span className="text-amber-300">X_CLIENT_ID</span> nas variáveis da Vercel</div>
                </div>

                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <a
                    href="/api/oauth/x/authorize"
                    className="btn btn-sm btn-primary bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-[700] flex items-center gap-1.5"
                  >
                    <span>🚀</span> Conectar com Twitter OAuth 2.0
                  </a>
                  <button
                    type="button"
                    onClick={() => setActiveTab("rapido")}
                    className="btn btn-sm btn-ghost text-[12px]"
                  >
                    Voltar para Modo Rápido (@)
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 2. APARÊNCIA */}
      <section className="panel panel-pad">
        <h2 className="h2">Aparência</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="label mb-1.5">Fundo</div>
            <ThemeSwitch />
          </div>
          <div>
            <div className="label mb-1.5">Densidade</div>
            <DensitySwitch />
          </div>
        </div>
      </section>

      {/* 3. SESSÃO & SEGURANÇA */}
      <section className="panel panel-pad space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
          <div>
            <h2 className="h2 flex items-center gap-2">
              <span>🔐</span> Sessão & Segurança
            </h2>
            <p className="text-[12.5px] text-[var(--ink-2)] mt-0.5">
              Gerencie seu acesso administrativo e cookies de navegação.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-sky-950/80 text-sky-300 border border-sky-500/40">
              Sessão Ativa · 14 Dias
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="space-y-0.5 text-[13px] text-[var(--ink-2)]">
            <p>
              Conectado como <strong>Administrador</strong>. Seus cookies são protegidos com HTTP-only e criptografia AES-GCM.
            </p>
            <p className="text-[11.5px] text-[var(--muted)]">
              Ao sair, seu histórico e mídias agendadas continuam salvos com segurança.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-danger text-[12.5px] shrink-0 cursor-pointer font-[650]"
            onClick={logout}
          >
            Encerrar Sessão (Sair)
          </button>
        </div>
      </section>

      {toast.node}
    </div>
  );
}
