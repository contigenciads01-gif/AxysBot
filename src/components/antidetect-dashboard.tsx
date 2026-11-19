"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { PlatformAccount, BotConfig, ActionLog, EngineStatus } from "@/engine/types";
import { useToast } from "./toast";
import { fmtRelative, fmtTime } from "@/lib/format";
import {
  IconBot,
  IconCheck,
  IconExterno,
  IconLink,
  IconPause,
  IconPlay,
  IconRede,
  IconSync,
  IconX,
} from "./icons";

interface Props {
  initialAccounts: Array<PlatformAccount & { config?: BotConfig }>;
  initialStatus: EngineStatus;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  account: (PlatformAccount & { config?: BotConfig }) | null;
}

export function AntidetectDashboard({ initialAccounts, initialStatus }: Props) {
  const toast = useToast();
  const [, startTransition] = useTransition();

  // Dados
  const [accounts, setAccounts] = useState(initialAccounts);
  const [status, setStatus] = useState(initialStatus);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);

  // Filtro e Seleção
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Visibilidade de senhas (map de id -> boolean)
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [visibleEmailPasswords, setVisibleEmailPasswords] = useState<Record<string, boolean>>({});

  // Menu de Contexto (botão direito)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    account: null,
  });

  // Modais
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<
    "system" | "browser" | "data" | "ai" | "phone" | "captcha" | "cookie"
  >("cookie");

  // Configurações do Modal de Settings
  const [autoGetCookie, setAutoGetCookie] = useState(true);
  const [loginWithCookie, setLoginWithCookie] = useState(true);
  const [loginWithToken, setLoginWithToken] = useState(true);
  const [globalProxyEnabled, setGlobalProxyEnabled] = useState(true);

  // Modal de Importação em Lote
  const [importOpen, setImportOpen] = useState(false);
  const [rawImportText, setRawImportText] = useState("");

  // Modal de Conexão Manual (Sem Client ID)
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    username: "",
    displayName: "",
    password: "",
    email: "",
    emailPassword: "",
    phone: "",
    authToken: "",
    ct0: "",
    proxy: "",
  });

  // Submenu de cópia no menu de contexto
  const [copySubmenuOpen, setCopySubmenuOpen] = useState(false);

  // Polling automático dos dados e logs
  const refresh = useCallback(async () => {
    try {
      const [accsRes, statusRes, logsRes] = await Promise.all([
        fetch("/api/automation/accounts", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/automation/status", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/automation/logs?limit=40", { cache: "no-store" }).then((r) => r.json()),
      ]);

      startTransition(() => {
        if (accsRes.ok && accsRes.accounts) setAccounts(accsRes.accounts);
        if (statusRes.ok && statusRes.status) setStatus(statusRes.status);
        if (logsRes.ok && logsRes.logs) setLogs(logsRes.logs);
      });
    } catch {
      // Falha temporária engolida
    }
  }, []);

  useEffect(() => {
    refresh();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 8_000);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  // Fechar menu de contexto ao clicar fora
  useEffect(() => {
    const handleOutsideClick = () => {
      if (contextMenu.visible) {
        setContextMenu((prev) => ({ ...prev, visible: false }));
        setCopySubmenuOpen(false);
      }
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, [contextMenu.visible]);

  // Contadores
  const totalCount = accounts.length;
  const liveCount = accounts.filter((a) => a.status === "live" || a.status === "warming" || !a.status).length;
  const dieCount = accounts.filter((a) => a.status === "die").length;
  const selectedCount = selectedIds.size;

  // Filtragem da tabela
  const filteredAccounts = accounts.filter((acc) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      acc.username.toLowerCase().includes(q) ||
      (acc.display_name && acc.display_name.toLowerCase().includes(q)) ||
      (acc.email && acc.email.toLowerCase().includes(q)) ||
      (acc.proxy && acc.proxy.toLowerCase().includes(q))
    );
  });

  // Seleção de todas
  function toggleSelectAll() {
    if (selectedIds.size === filteredAccounts.length && filteredAccounts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAccounts.map((a) => a.id)));
    }
  }

  function toggleSelectOne(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  // ABRIR CHROME COM PERFIL E PROXY
  async function handleOpenChrome(acc: PlatformAccount) {
    setBusy(`chrome_${acc.id}`);
    try {
      const res = await fetch("/api/automation/browser/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: acc.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.show(`🌐 Google Chrome aberto para @${acc.username}!`);
      await refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao abrir o Google Chrome.");
    } finally {
      setBusy(null);
    }
  }

  // ABRIR CHROME EM LOTE PARA AS SELECIONADAS
  async function handleOpenChromeSelected() {
    if (selectedIds.size === 0) {
      toast.show("Selecione pelo menos uma conta.");
      return;
    }
    const targetAccounts = accounts.filter((a) => selectedIds.has(a.id));
    for (const acc of targetAccounts) {
      await handleOpenChrome(acc);
    }
  }

  // CHECK ACCOUNT (Testa se está Live ou Die)
  async function handleCheckAccount(acc: PlatformAccount) {
    try {
      const res = await fetch("/api/automation/accounts/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds: [acc.id] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.show(`Conta @${acc.username}: ${data.results?.[0]?.status === "live" ? "🟢 Live" : "🔴 Die"}`);
      await refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao verificar conta.");
    }
  }

  // EXECUTAR PASSO DE AQUECIMENTO HUMANO
  async function handleRunWarmup() {
    setBusy("warmup");
    try {
      const targetIds = selectedIds.size > 0 ? Array.from(selectedIds) : accounts.map((a) => a.id);
      const res = await fetch("/api/automation/warmup/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds: targetIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.show(`⚡ Aquecimento humano ativo em ${data.count} conta(s)!`);
      await refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Falha no aquecimento.");
    } finally {
      setBusy(null);
    }
  }

  // IMPORTAR CONTAS EM LOTE
  async function handleImportSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("import");
    try {
      const res = await fetch("/api/automation/accounts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: rawImportText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.show(`✅ ${data.count} conta(s) importada(s) com sucesso!`);
      setImportOpen(false);
      setRawImportText("");
      await refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao importar contas.");
    } finally {
      setBusy(null);
    }
  }

  // CONECTAR UMA CONTA MANUAL (Sem precisar de Client ID)
  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualForm.username.trim()) {
      toast.show("Informe o @username da conta.");
      return;
    }
    setBusy("manual_add");
    try {
      const res = await fetch("/api/automation/accounts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accounts: [
            {
              username: manualForm.username,
              password: manualForm.password || undefined,
              email: manualForm.email || undefined,
              emailPassword: manualForm.emailPassword || undefined,
              phone: manualForm.phone || undefined,
              authToken: manualForm.authToken || undefined,
              ct0: manualForm.ct0 || undefined,
              proxy: manualForm.proxy || undefined,
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.show(`✅ Conta @${manualForm.username.replace(/^@/, "")} conectada com sucesso!`);
      setManualModalOpen(false);
      setManualForm({
        username: "",
        displayName: "",
        password: "",
        email: "",
        emailPassword: "",
        phone: "",
        authToken: "",
        ct0: "",
        proxy: "",
      });
      await refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao conectar conta.");
    } finally {
      setBusy(null);
    }
  }

  // EXCLUIR CONTAS SELECIONADAS
  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Tem certeza que deseja excluir ${selectedIds.size} conta(s)?`)) return;

    for (const id of selectedIds) {
      await fetch(`/api/automation/accounts/${id}`, { method: "DELETE" }).catch(() => {});
    }
    toast.show("Contas excluídas.");
    setSelectedIds(new Set());
    await refresh();
  }

  // TOGGLE PROXY INDIVIDUAL
  async function handleToggleProxy(acc: PlatformAccount) {
    try {
      const nextActive = !acc.proxy_active;
      await fetch(`/api/automation/accounts/${acc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: { proxy_active: nextActive },
        }),
      });
      toast.show(nextActive ? `Proxy ativada para @${acc.username}` : `Proxy desativada para @${acc.username}`);
      await refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao alternar proxy.");
    }
  }

  // COPIAR PARA CLIPBOARD
  function copyText(text: string, label: string) {
    if (!text) {
      toast.show(`${label} não disponível para esta conta.`);
      return;
    }
    navigator.clipboard.writeText(text);
    toast.show(`${label} copiado!`);
  }

  // Disparar menu de contexto (Right Click)
  function handleContextMenu(e: React.MouseEvent, acc: PlatformAccount & { config?: BotConfig }) {
    e.preventDefault();
    e.stopPropagation();

    // Posiciona dentro dos limites da tela
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 340);

    setContextMenu({
      visible: true,
      x,
      y,
      account: acc,
    });
    setCopySubmenuOpen(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ============================================================== */}
      {/* 1. BARRA SUPERIOR: BUSCA + BADGES + BOTÕES DE AÇÃO             */}
      {/* ============================================================== */}
      <div className="liquid-glass glass-card panel-pad flex flex-wrap items-center justify-between gap-3" data-glass>
        {/* Lado Esquerdo: Campo de Busca + Badges */}
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <div className="relative w-[180px] sm:w-[220px]">
            <input
              type="text"
              className="input h-9 text-[13px] pl-3"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1.5 text-[12px] font-[600]">
            <span className="liquid-glass-chip px-2.5 py-1 text-[var(--accent)]">
              Total: {totalCount}
            </span>
            <span className="liquid-glass-chip px-2.5 py-1 text-[var(--ok)]">
              Live: {liveCount}
            </span>
            <span className="liquid-glass-chip px-2.5 py-1 text-[var(--bad)]">
              Die: {dieCount}
            </span>
            <span className="liquid-glass-chip px-2.5 py-1 text-[var(--ink)]">
              Selected: {selectedCount}
            </span>
          </div>
        </div>

        {/* Lado Direito: Botões de Lote */}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <button
            type="button"
            className="btn btn-sm btn-glass"
            onClick={handleOpenChromeSelected}
            disabled={selectedCount === 0 || busy !== null}
            title="Abre as contas selecionadas em instâncias isoladas do Google Chrome"
          >
            <IconExterno size={14} /> Close / Open chrome
          </button>

          <button
            type="button"
            className="btn btn-sm btn-ghost text-[var(--bad)]"
            onClick={handleDeleteSelected}
            disabled={selectedCount === 0}
            title="Excluir contas selecionadas"
          >
            Trash can
          </button>

          <button
            type="button"
            className="btn btn-sm btn-glass"
            onClick={() => setManualModalOpen(true)}
            title="Adicionar uma conta manualmente (sem precisar de Client ID)"
          >
            + Conectar Manual
          </button>

          <button
            type="button"
            className="btn btn-sm btn-glass"
            onClick={() => setImportOpen(true)}
          >
            + Importar em Lote
          </button>

          <button
            type="button"
            className="btn btn-sm btn-glass"
            onClick={() => setSettingsOpen(true)}
          >
            ⚙️ Settings
          </button>

          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={handleRunWarmup}
            disabled={busy !== null || accounts.length === 0}
          >
            <IconPlay size={14} /> Aquecer Contas
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. TABELA DE CONTAS MULTI-PERFIL (ESTILO DRAGON TOOLS)         */}
      {/* ============================================================== */}
      <div className="panel overflow-hidden border border-[var(--line)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--sunken)] font-[620] text-[var(--ink-2)] select-none">
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    className="cursor-pointer"
                    checked={selectedCount === filteredAccounts.length && filteredAccounts.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="p-3 w-12 text-center">STT</th>
                <th className="p-3 min-w-[150px]">Username</th>
                <th className="p-3 min-w-[130px]">Display Name</th>
                <th className="p-3 min-w-[110px]">Phone</th>
                <th className="p-3 min-w-[140px]">Password</th>
                <th className="p-3 min-w-[180px]">Email</th>
                <th className="p-3 min-w-[140px]">Email Password</th>
                <th className="p-3 min-w-[140px]">Proxy</th>
                <th className="p-3 min-w-[90px] text-center">Status</th>
                <th className="p-3 min-w-[200px]">Ação ao Vivo</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--line)]">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-[var(--ink-2)]">
                    Nenhuma conta cadastrada. Clique em <strong>+ Importar Contas</strong> para adicionar via texto ou token.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc, index) => {
                  const isSelected = selectedIds.has(acc.id);
                  const isPasswordVisible = visiblePasswords[acc.id] || false;
                  const isEmailPasswordVisible = visibleEmailPasswords[acc.id] || false;

                  return (
                    <tr
                      key={acc.id}
                      onContextMenu={(e) => handleContextMenu(e, acc)}
                      className={`transition-colors hover:bg-[var(--sunken)] ${
                        isSelected ? "bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          className="cursor-pointer"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(acc.id)}
                        />
                      </td>

                      {/* STT */}
                      <td className="p-3 text-center num text-[var(--muted)]">
                        {index + 1}
                      </td>

                      {/* Username */}
                      <td className="p-3 font-[600] text-[var(--ink)]">
                        <div className="flex items-center gap-1.5">
                          <span>@{acc.username}</span>
                        </div>
                      </td>

                      {/* Display Name */}
                      <td className="p-3 text-[var(--ink-2)] truncate max-w-[140px]">
                        {acc.display_name || "-"}
                      </td>

                      {/* Phone */}
                      <td className="p-3 text-[var(--muted)]">
                        {acc.phone || "-"}
                      </td>

                      {/* Password */}
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[12px]">
                            {acc.account_password
                              ? isPasswordVisible
                                ? acc.account_password
                                : "••••••••"
                              : "-"}
                          </span>
                          {acc.account_password && (
                            <button
                              type="button"
                              className="text-[var(--muted)] hover:text-[var(--ink)]"
                              onClick={() =>
                                setVisiblePasswords((prev) => ({
                                  ...prev,
                                  [acc.id]: !isPasswordVisible,
                                }))
                              }
                              title="Revelar/Ocultar Senha"
                            >
                              👁️
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Email */}
                      <td className="p-3 text-[var(--ink-2)] truncate max-w-[180px]">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{acc.email || "-"}</span>
                          {acc.email && (
                            <button
                              type="button"
                              className="text-[var(--muted)] hover:text-[var(--ink)]"
                              onClick={() => copyText(acc.email!, "Email")}
                              title="Copiar Email"
                            >
                              📋
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Email Password */}
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[12px]">
                            {acc.email_password
                              ? isEmailPasswordVisible
                                ? acc.email_password
                                : "••••••••"
                              : "-"}
                          </span>
                          {acc.email_password && (
                            <button
                              type="button"
                              className="text-[var(--muted)] hover:text-[var(--ink)]"
                              onClick={() =>
                                setVisibleEmailPasswords((prev) => ({
                                  ...prev,
                                  [acc.id]: !isEmailPasswordVisible,
                                }))
                              }
                              title="Revelar/Ocultar Senha do Email"
                            >
                              👁️
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Proxy */}
                      <td className="p-3">
                        {acc.proxy ? (
                          <div className="flex items-center gap-2">
                            <span
                              className={`tag text-[11px] truncate max-w-[110px] ${
                                acc.proxy_active ? "tag-green" : "tag-gray opacity-60"
                              }`}
                              title={acc.proxy}
                            >
                              {acc.proxy.replace(/https?:\/\//, "")}
                            </span>
                            <button
                              type="button"
                              className="text-[11px] text-[var(--muted)] hover:text-[var(--ink)]"
                              onClick={() => handleToggleProxy(acc)}
                              title="Ligar/Desligar Proxy"
                            >
                              {acc.proxy_active ? "🟢" : "⚪"}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[var(--muted)]">Sem proxy</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-3 text-center">
                        <span
                          className={`tag text-[11px] uppercase font-[650] ${
                            acc.status === "live"
                              ? "tag-green"
                              : acc.status === "warming"
                              ? "tag-blue dot-live"
                              : "tag-red"
                          }`}
                        >
                          {acc.status || "LIVE"}
                        </span>
                      </td>

                      {/* Ação ao Vivo */}
                      <td className="p-3 text-[12px] text-[var(--ink-2)] truncate max-w-[240px]">
                        <span className="truncate block" title={acc.current_action || "Aguardando próxima rotina"}>
                          {acc.current_action || "Aguardando rotina..."}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. LIVE RADAR FEED / LOGS DE ATIVIDADE AO VIVO                 */}
      {/* ============================================================== */}
      <section className="panel panel-pad" aria-label="Radar de Aquecimento Humano">
        <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] pb-2.5">
          <div className="flex items-center gap-2">
            <span className="dot dot-live" style={{ color: "var(--ok)" }} />
            <h2 className="h2 text-[14.5px]">Radar de Ações e Aquecimento ao Vivo</h2>
          </div>
          <span className="label num">Atualizando em tempo real</span>
        </div>

        <div className="mt-3 space-y-2 max-h-[220px] overflow-y-auto font-mono text-[11.5px]">
          {logs.length === 0 ? (
            <p className="text-[var(--muted)]">Nenhuma atividade registrada ainda. Clique em &quot;Aquecer Contas&quot; para iniciar.</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 text-[var(--ink-2)]">
                <span className="text-[var(--muted)] num shrink-0">
                  {fmtTime(log.created_at)}
                </span>
                <span
                  className={`font-[600] shrink-0 ${
                    log.status === "COMPLETED" ? "text-[var(--ok)]" : "text-[var(--warn)]"
                  }`}
                >
                  [{log.action_type.toUpperCase()}]
                </span>
                <span className="truncate">{log.detail || log.error_message}</span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ============================================================== */}
      {/* 4. MENU DE CONTEXTO (RIGHT-CLICK EXATO DA IMAGEM 2)            */}
      {/* ============================================================== */}
      {contextMenu.visible && contextMenu.account && (
        <div
          className="fixed z-50 min-w-[210px] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-2xl p-1 text-[13px] enter"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-[var(--line)] text-[11.5px] font-[600] text-[var(--muted)]">
            @{contextMenu.account.username}
          </div>

          <button
            type="button"
            className="w-full text-left px-3 py-2 rounded hover:bg-[var(--sunken)] flex items-center gap-2 transition-colors"
            onClick={() => {
              handleCheckAccount(contextMenu.account!);
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
          >
            <span>✓</span> Check account
          </button>

          <button
            type="button"
            className="w-full text-left px-3 py-2 rounded hover:bg-[var(--sunken)] flex items-center gap-2 transition-colors font-[600]"
            onClick={() => {
              toast.show(`Login efetuado para @${contextMenu.account!.username}`);
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
          >
            <span>𝕏</span> Login X
          </button>

          <button
            type="button"
            className="w-full text-left px-3 py-2 rounded hover:bg-[var(--sunken)] flex items-center gap-2 transition-colors"
            onClick={() => {
              toast.show(`Dados limpos e re-login agendado para @${contextMenu.account!.username}`);
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
          >
            <span>🔄</span> Clear data and re-login
          </button>

          <button
            type="button"
            className="w-full text-left px-3 py-2 rounded hover:bg-[var(--sunken)] flex items-center gap-2 transition-colors text-[var(--accent)] font-[600]"
            onClick={() => {
              handleOpenChrome(contextMenu.account!);
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
          >
            <span>🌐</span> Open chrome
          </button>

          <button
            type="button"
            className="w-full text-left px-3 py-2 rounded hover:bg-[var(--sunken)] flex items-center gap-2 transition-colors"
            onClick={() => {
              handleToggleProxy(contextMenu.account!);
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
          >
            <span>🛡️</span> Toggle Proxy ({contextMenu.account.proxy_active ? "Desativar" : "Ativar"})
          </button>

          {/* Submenu Copy > */}
          <div className="relative">
            <button
              type="button"
              className="w-full text-left px-3 py-2 rounded hover:bg-[var(--sunken)] flex items-center justify-between transition-colors"
              onClick={() => setCopySubmenuOpen(!copySubmenuOpen)}
            >
              <span className="flex items-center gap-2">
                <span>📋</span> Copy
              </span>
              <span>›</span>
            </button>

            {copySubmenuOpen && (
              <div className="absolute left-full top-0 ml-1 min-w-[170px] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-2xl p-1 text-[12.5px] enter">
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 rounded hover:bg-[var(--sunken)]"
                  onClick={() => {
                    copyText(contextMenu.account!.username, "Username");
                    setContextMenu((prev) => ({ ...prev, visible: false }));
                  }}
                >
                  Copy Username
                </button>
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 rounded hover:bg-[var(--sunken)]"
                  onClick={() => {
                    copyText(contextMenu.account!.account_password || "", "Senha");
                    setContextMenu((prev) => ({ ...prev, visible: false }));
                  }}
                >
                  Copy Password
                </button>
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 rounded hover:bg-[var(--sunken)]"
                  onClick={() => {
                    copyText(contextMenu.account!.email || "", "Email");
                    setContextMenu((prev) => ({ ...prev, visible: false }));
                  }}
                >
                  Copy Email
                </button>
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 rounded hover:bg-[var(--sunken)]"
                  onClick={() => {
                    copyText(contextMenu.account!.email_password || "", "Senha do Email");
                    setContextMenu((prev) => ({ ...prev, visible: false }));
                  }}
                >
                  Copy Email Password
                </button>
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 rounded hover:bg-[var(--sunken)]"
                  onClick={() => {
                    copyText(contextMenu.account!.proxy || "", "Proxy");
                    setContextMenu((prev) => ({ ...prev, visible: false }));
                  }}
                >
                  Copy Proxy
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-[var(--line)] my-1" />

          <button
            type="button"
            className="w-full text-left px-3 py-2 rounded hover:bg-[var(--sunken)] flex items-center gap-2 transition-colors text-[var(--bad)]"
            onClick={() => {
              if (confirm(`Remover conta @${contextMenu.account!.username}?`)) {
                fetch(`/api/automation/accounts/${contextMenu.account!.id}`, { method: "DELETE" }).then(refresh);
              }
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
          >
            <span>🗑️</span> Remove
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* 5. MODAL DE SETTINGS (EXATO DA IMAGEM 1)                        */}
      {/* ============================================================== */}
      {settingsOpen && (
        <dialog open className="sheet">
          <div className="panel-pad max-w-[680px] w-full p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)]">
              <h2 className="text-[17px] font-[650]">Settings</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSettingsOpen(false)}
              >
                <IconX size={16} />
              </button>
            </div>

            <div className="grid grid-cols-[200px_1fr] min-h-[340px]">
              {/* Barra lateral esquerda de abas */}
              <div className="border-r border-[var(--line)] p-2 space-y-0.5 bg-[var(--sunken)] text-[13px]">
                {[
                  { id: "system", label: "System settings", icon: "⚙️" },
                  { id: "browser", label: "Browser", icon: "🌐" },
                  { id: "data", label: "Data settings", icon: "💾" },
                  { id: "ai", label: "AI settings", icon: "🤖" },
                  { id: "phone", label: "Phone rental API", icon: "📱" },
                  { id: "captcha", label: "Captcha API", icon: "🧩" },
                  { id: "cookie", label: "Cookie settings", icon: "🍪" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSettingsTab(tab.id as any)}
                    className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 transition-colors ${
                      settingsTab === tab.id
                        ? "liquid-glass-chip font-[600] text-[var(--ink)]"
                        : "text-[var(--ink-2)] hover:bg-[var(--surface)]"
                    }`}
                  >
                    <span>{tab.icon}</span>
                    <span className="truncate">{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* Painel de Conteúdo da Direita */}
              <div className="p-5 flex flex-col justify-between">
                <div>
                  <div className="flex gap-4 border-b border-[var(--line)] pb-2 text-[13px] font-[600]">
                    <span className="text-[var(--accent)] border-b-2 border-[var(--accent)] pb-2">
                      General settings
                    </span>
                    <span className="text-[var(--muted)]">Thread settings</span>
                  </div>

                  {settingsTab === "cookie" && (
                    <div className="mt-5 space-y-4 text-[13px]">
                      <div className="flex items-center justify-between">
                        <label className="cursor-pointer" htmlFor="toggle-auto-cookie">
                          Automatically get account Cookie
                        </label>
                        <input
                          id="toggle-auto-cookie"
                          type="checkbox"
                          checked={autoGetCookie}
                          onChange={(e) => setAutoGetCookie(e.target.checked)}
                          className="size-4 cursor-pointer"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="cursor-pointer" htmlFor="toggle-login-cookie">
                          Login with account Cookie
                        </label>
                        <input
                          id="toggle-login-cookie"
                          type="checkbox"
                          checked={loginWithCookie}
                          onChange={(e) => setLoginWithCookie(e.target.checked)}
                          className="size-4 cursor-pointer"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="cursor-pointer" htmlFor="toggle-login-token">
                          Login with Auth Token
                        </label>
                        <input
                          id="toggle-login-token"
                          type="checkbox"
                          checked={loginWithToken}
                          onChange={(e) => setLoginWithToken(e.target.checked)}
                          className="size-4 cursor-pointer"
                        />
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-[var(--line)]">
                        <label className="cursor-pointer" htmlFor="toggle-proxy-global">
                          Proxy Rotativa / Dedicada Ativa
                        </label>
                        <input
                          id="toggle-proxy-global"
                          type="checkbox"
                          checked={globalProxyEnabled}
                          onChange={(e) => setGlobalProxyEnabled(e.target.checked)}
                          className="size-4 cursor-pointer"
                        />
                      </div>
                    </div>
                  )}

                  {settingsTab !== "cookie" && (
                    <div className="mt-5 text-[13px] text-[var(--ink-2)]">
                      Configurações avançadas de {settingsTab} ativas e sincronizadas com o motor de execução.
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-4 border-t border-[var(--line)] mt-6">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      toast.show("Configurações salvas com sucesso!");
                      setSettingsOpen(false);
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        </dialog>
      )}

      {/* ============================================================== */}
      {/* 6. MODAL DE IMPORTAR CONTAS EM LOTE                            */}
      {/* ============================================================== */}
      {importOpen && (
        <dialog open className="sheet">
          <div className="panel-pad max-w-[560px] w-full">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <h2 className="h2">Importar Contas do X em Lote</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setImportOpen(false)}
              >
                <IconX size={16} />
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="mt-4 flex flex-col gap-3">
              <p className="text-[12.5px] text-[var(--ink-2)]">
                Cole uma conta por linha. Formato suportado:
                <br />
                <code className="text-[var(--accent)] font-mono text-[11.5px]">
                  username|senha|email|senha_email|auth_token|proxy
                </code>
              </p>

              <textarea
                className="textarea font-mono text-[12px]"
                rows={8}
                placeholder="hailongii_987_vn|Long123456|elvira-261@hotmail.com|PassEmail123|token_abc...|http://user:pass@185.220.101.5:8080&#10;turkan_turk|Accn8899|sorbyrkaramikc4@hotmail.com|PassEmail456||"
                value={rawImportText}
                onChange={(e) => setRawImportText(e.target.value)}
                required
              />

              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setImportOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy === "import" || !rawImportText.trim()}
                >
                  {busy === "import" ? "Importando..." : "Importar Contas"}
                </button>
              </div>
            </form>
          </div>
        </dialog>
      )}

      {/* ============================================================== */}
      {/* 7. MODAL DE CONECTAR CONTA MANUAL (SEM CLIENT ID)              */}
      {/* ============================================================== */}
      {manualModalOpen && (
        <dialog open className="sheet">
          <div className="panel-pad max-w-[580px] w-full">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <div>
                <h2 className="h2">Conectar Conta Manualmente</h2>
                <p className="text-[12px] text-[var(--muted)] mt-0.5">
                  Não precisa de Client ID nem de API Developer. Funciona direto com e-mail, senha ou token.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setManualModalOpen(false)}
              >
                <IconX size={16} />
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="mt-4 flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Username */}
                <div>
                  <label className="label" htmlFor="m-user">
                    Username / @ do X *
                  </label>
                  <input
                    id="m-user"
                    className="input mt-1"
                    placeholder="@seuperfil"
                    value={manualForm.username}
                    onChange={(e) => setManualForm({ ...manualForm, username: e.target.value })}
                    required
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="label" htmlFor="m-pass">
                    Senha do X
                  </label>
                  <input
                    id="m-pass"
                    type="password"
                    className="input mt-1"
                    placeholder="••••••••"
                    value={manualForm.password}
                    onChange={(e) => setManualForm({ ...manualForm, password: e.target.value })}
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="label" htmlFor="m-email">
                    E-mail da Conta
                  </label>
                  <input
                    id="m-email"
                    type="email"
                    className="input mt-1"
                    placeholder="usuario@hotmail.com"
                    value={manualForm.email}
                    onChange={(e) => setManualForm({ ...manualForm, email: e.target.value })}
                  />
                </div>

                {/* Email Password */}
                <div>
                  <label className="label" htmlFor="m-epass">
                    Senha do E-mail (opcional)
                  </label>
                  <input
                    id="m-epass"
                    type="password"
                    className="input mt-1"
                    placeholder="••••••••"
                    value={manualForm.emailPassword}
                    onChange={(e) => setManualForm({ ...manualForm, emailPassword: e.target.value })}
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="label" htmlFor="m-phone">
                    Telefone (opcional)
                  </label>
                  <input
                    id="m-phone"
                    className="input mt-1"
                    placeholder="+55 11 9..."
                    value={manualForm.phone}
                    onChange={(e) => setManualForm({ ...manualForm, phone: e.target.value })}
                  />
                </div>

                {/* Proxy */}
                <div>
                  <label className="label" htmlFor="m-proxy">
                    Proxy Dedicada (opcional)
                  </label>
                  <input
                    id="m-proxy"
                    className="input mt-1"
                    placeholder="http://user:pass@host:port"
                    value={manualForm.proxy}
                    onChange={(e) => setManualForm({ ...manualForm, proxy: e.target.value })}
                  />
                </div>
              </div>

              {/* Seção Opcional de Cookies / Auth Token */}
              <div className="border-t border-[var(--line)] pt-2.5 mt-1">
                <span className="label text-[11.5px] text-[var(--accent)]">
                  Login Instantâneo por Cookie (Opcional)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1.5">
                  <div>
                    <label className="label text-[11px]" htmlFor="m-token">
                      auth_token (Cookie do X)
                    </label>
                    <input
                      id="m-token"
                      className="input mt-1 text-[12px] font-mono"
                      placeholder="40 caracteres hex..."
                      value={manualForm.authToken}
                      onChange={(e) => setManualForm({ ...manualForm, authToken: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label text-[11px]" htmlFor="m-ct0">
                      ct0 (CSRF token)
                    </label>
                    <input
                      id="m-ct0"
                      className="input mt-1 text-[12px] font-mono"
                      placeholder="160 caracteres..."
                      value={manualForm.ct0}
                      onChange={(e) => setManualForm({ ...manualForm, ct0: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-[var(--line)]">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setManualModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy === "manual_add" || !manualForm.username.trim()}
                >
                  {busy === "manual_add" ? "Salvando..." : "Salvar e Conectar"}
                </button>
              </div>
            </form>
          </div>
        </dialog>
      )}

      {toast.node}
    </div>
  );
}
