"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { PlatformAccount, BotConfig, ActionLog, EngineStatus } from "@/engine/types";
import { useToast } from "./toast";
import { fmtRelative, fmtTime } from "@/lib/format";
import {
  IconBot,
  IconCheck,
  IconExterno,
  IconPause,
  IconPlay,
  IconSync,
  IconX,
  IconRepost,
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

interface NicheFilters {
  keywords: string;
  targetProfiles: string;
  targetLinks?: string;
  mirrorOwnReposts?: boolean;
  discoveryMode?: "hybrid" | "links" | "mirror" | "niche";
  autoLike: boolean;
  autoBookmark: boolean;
  autoRetweet: boolean;
  autoVisitProfile: boolean;
  autoComment: boolean;
  commentTemplates: string;
}

interface FloatingPill {
  id: string;
  text: string;
  icon: string;
  color: string;
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

  // Filtro de Busca e Seleção
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Visibilidade de senhas
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [visibleEmailPasswords, setVisibleEmailPasswords] = useState<Record<string, boolean>>({});

  // Menu de Contexto (botão direito)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    account: null,
  });
  const [copySubmenuOpen, setCopySubmenuOpen] = useState(false);

  // Modal 1: Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<
    "system" | "browser" | "data" | "ai" | "phone" | "captcha" | "cookie"
  >("cookie");
  const [autoGetCookie, setAutoGetCookie] = useState(true);
  const [loginWithCookie, setLoginWithCookie] = useState(true);
  const [loginWithToken, setLoginWithToken] = useState(true);
  const [globalProxyEnabled, setGlobalProxyEnabled] = useState(true);

  // Modal 2: Importação em Lote
  const [importOpen, setImportOpen] = useState(false);
  const [rawImportText, setRawImportText] = useState("");

  // Modal 3: Conexão Manual de Conta
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    username: "",
    password: "",
    email: "",
    emailPassword: "",
    phone: "",
    authToken: "",
    ct0: "",
    proxy: "",
  });

  // Modal 4: Filtros de Alvo & Interação do Nicho
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<NicheFilters>({
    keywords: "marketing, tech, crypto, startup, ia, btc, business",
    targetProfiles: "@elonmusk, @sama, @paulg",
    targetLinks: "",
    mirrorOwnReposts: true,
    discoveryMode: "hybrid",
    autoLike: true,
    autoBookmark: true,
    autoRetweet: true,
    autoVisitProfile: true,
    autoComment: false,
    commentTemplates: "Excelente visão! 👏\nMuito bom esse insight.\nConcordo totalmente com esse ponto.",
  });

  // HoloGlobe & Smartphone Simulator States
  const [floatingPills, setFloatingPills] = useState<FloatingPill[]>([]);
  const [showMobileSim, setShowMobileSim] = useState(true);
  const [phoneScrollY, setPhoneScrollY] = useState(0);
  const [phoneTouchActive, setPhoneTouchActive] = useState(false);
  const [phoneLikeActive, setPhoneLikeActive] = useState(false);
  const [phoneRetweetActive, setPhoneRetweetActive] = useState(false);

  // Modal 5: Retweet Real de Teste
  const [retweetModalOpen, setRetweetModalOpen] = useState(false);
  const [targetTweetUrl, setTargetTweetUrl] = useState("");
  const [retweetTargetAccount, setRetweetTargetAccount] = useState<PlatformAccount | null>(null);

  // Modal 6: Editar Auth Token da Conta
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [editingTokenAccount, setEditingTokenAccount] = useState<PlatformAccount | null>(null);
  const [inputAuthToken, setInputAuthToken] = useState("");
  const [inputCt0, setInputCt0] = useState("");

  // Modal 8: Ritmo Humano, Intervalos & Pausas Biológicas
  const [cadenceModalOpen, setCadenceModalOpen] = useState(false);
  const [cadence, setCadence] = useState({
    sessionDurationMinMinutes: 7.5,
    sessionDurationMaxMinutes: 14.0,
    pocketCooldownMinMinutes: 18.5,
    pocketCooldownMaxMinutes: 42.0,
    actionJitterMinSeconds: 11.2,
    actionJitterMaxSeconds: 23.8,
    likeCadenceMinMinutes: 3.5,
    likeCadenceMaxMinutes: 7.8,
    retweetCadenceMinMinutes: 28.5,
    retweetCadenceMaxMinutes: 58.0,
    lunchPause: {
      enabled: true,
      start: "12:15",
      end: "13:40",
    },
    nightSleep: {
      enabled: true,
      start: "23:45",
      end: "07:15",
    },
    timezone: "America/Sao_Paulo",
  });
  const [bioState, setBioState] = useState<{
    state: string;
    label: string;
    description: string;
    allowsAction: boolean;
    nextResume?: string;
    nextJitterSeconds?: number;
  }>({
    state: "ACTIVE_SESSION",
    label: "🟢 Sessão Ativa (Celular na Mão)",
    description: "Navegação orgânica com jitter quebrado",
    allowsAction: true,
    nextJitterSeconds: 13.4,
  });

  const fetchCadence = useCallback(async () => {
    try {
      const res = await fetch("/api/automation/cadence", { cache: "no-store" });
      const data = await res.json();
      if (data.ok && data.cadence) {
        setCadence(data.cadence);
        if (data.biologicalState) setBioState(data.biologicalState);
      }
    } catch {}
  }, []);

  // Polling automático
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
      // Ignora falhas temporárias
    }
  }, []);

  useEffect(() => {
    refresh();
    fetchCadence();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") {
        refresh();
        fetchCadence();
      }
    }, 8_000);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  // Loop de Execução Contínua em Background (Quando o Bot está Ligado)
  useEffect(() => {
    if (!status.enabled || accounts.length === 0) return;

    const runWarmupStep = async () => {
      try {
        const res = await fetch("/api/automation/warmup/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "step" }),
        });
        const data = await res.json();
        if (data.steps && data.steps.length > 0) {
          const s = data.steps[0];
          const pillId = Math.random().toString(36).slice(2);
          let pIcon = "⚡";
          let pText = s.targetProfile || "Ação";
          let pColor = "text-emerald-400 border-emerald-500/50 bg-emerald-950/80";

          if (s.actionType.includes("LIKE")) {
            pIcon = "❤️";
            pText = `Like ${s.targetProfile || ""}`;
            pColor = "text-rose-400 border-rose-500/50 bg-rose-950/80";
            setPhoneLikeActive(true);
            setTimeout(() => setPhoneLikeActive(false), 1600);
          } else if (s.actionType.includes("RETWEET")) {
            pIcon = "🔁";
            pText = `RT ${s.targetProfile || ""}`;
            pColor = "text-teal-400 border-teal-500/50 bg-teal-950/80";
            setPhoneRetweetActive(true);
            setTimeout(() => setPhoneRetweetActive(false), 1600);
          } else if (s.actionType.includes("SCROLL")) {
            pIcon = "📜";
            pText = "Scroll 380px";
            pColor = "text-sky-400 border-sky-500/50 bg-sky-950/80";
            setPhoneTouchActive(true);
            setPhoneScrollY((prev) => (prev > 300 ? 0 : prev + 90));
            setTimeout(() => setPhoneTouchActive(false), 1200);
          } else if (s.actionType.includes("DIRECT_LINK")) {
            pIcon = "🔗";
            pText = "Link Alvo";
            pColor = "text-amber-400 border-amber-500/50 bg-amber-950/80";
          } else if (s.actionType.includes("MIRROR")) {
            pIcon = "🪞";
            pText = "Espelhando";
            pColor = "text-indigo-400 border-indigo-500/50 bg-indigo-950/80";
          } else if (s.actionType.includes("PROFILE")) {
            pIcon = "👀";
            pText = `Perfil ${s.targetProfile || ""}`;
            pColor = "text-purple-400 border-purple-500/50 bg-purple-950/80";
          }

          setFloatingPills((prev) => [...prev.slice(-2), { id: pillId, text: pText, icon: pIcon, color: pColor }]);
          setTimeout(() => {
            setFloatingPills((prev) => prev.filter((p) => p.id !== pillId));
          }, 1800);
        }
        await refresh();
      } catch {
        // ignora falhas temporárias
      }
    };

    const interval = setInterval(runWarmupStep, 8000);
    return () => clearInterval(interval);
  }, [status.enabled, accounts.length, refresh]);

  // Carrega filtros salvos
  useEffect(() => {
    fetch("/api/automation/filters", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.filters) setFilters(data.filters);
      })
      .catch(() => {});
  }, []);

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

  // Alternar Master ON/OFF
  async function toggleMasterEngine() {
    if (accounts.length === 0) {
      toast.show("❌ O robô não opera sem pelo menos uma conta conectada.");
      return;
    }
    setBusy("toggle_master");
    try {
      const next = !status.enabled;
      const res = await fetch("/api/automation/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setStatus(data.status);
      toast.show(next ? "⚡ BOT LIGADO E ATIVO!" : "⏸️ BOT DESLIGADO E PAUSADO.");
      await refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao alterar estado do bot.");
    } finally {
      setBusy(null);
    }
  }

  // Seleção
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

  // ABRIR CHROME INDIVIDUAL OU EM POPUP
  function handleOpenChrome(acc: PlatformAccount) {
    const popupWidth = 1050;
    const popupHeight = 750;
    const left = Math.max(0, (window.screen.width - popupWidth) / 2);
    const top = Math.max(0, (window.screen.height - popupHeight) / 2);

    // 1. Tenta acionar processo local caso rodando em localhost
    fetch("/api/automation/browser/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: acc.id }),
    }).catch(() => {});

    // 2. Abre a janela do navegador instantaneamente no monitor do usuário
    const win = window.open(
      `https://x.com/${acc.username}`,
      `x_profile_${acc.username}`,
      `width=${popupWidth},height=${popupHeight},left=${left},top=${top},menubar=no,status=no,toolbar=no`
    );

    if (win) {
      toast.show(`🌐 Janela isolada aberta para @${acc.username}!`);
    } else {
      toast.show("Permita pop-ups no seu navegador para abrir a janela separada.");
    }
  }

  function handleOpenChromeSelected() {
    if (selectedIds.size === 0) {
      toast.show("Selecione pelo menos uma conta.");
      return;
    }
    const targetAccounts = accounts.filter((a) => selectedIds.has(a.id));
    targetAccounts.forEach((acc) => handleOpenChrome(acc));
  }

  // CHECK ACCOUNT
  async function handleCheckAccount(acc: PlatformAccount) {
    try {
      const res = await fetch("/api/automation/accounts/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds: [acc.id] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const isLive = data.results?.[0]?.status === "live";
      toast.show(`Conta @${acc.username}: ${isLive ? "🟢 LIVE (Ativa)" : "🔴 DIE (Suspensa)"}`);
      await refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao verificar conta.");
    }
  }

  // DISPARAR RETWEET REAL
  async function handleExecuteRealRetweet(e: React.FormEvent) {
    e.preventDefault();
    if (!retweetTargetAccount || !targetTweetUrl.trim()) return;
    setBusy("retweet");
    try {
      const res = await fetch("/api/automation/actions/retweet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: retweetTargetAccount.id,
          tweetUrlOrId: targetTweetUrl.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.show(`✅ ${data.message}`);
      setRetweetModalOpen(false);
      setTargetTweetUrl("");
      await refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Falha ao enviar retweet.");
    } finally {
      setBusy(null);
    }
  }

  // SALVAR NOVO AUTH TOKEN NA CONTA
  async function handleSaveAuthToken(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTokenAccount) return;
    setBusy("save_token");
    try {
      const res = await fetch(`/api/automation/accounts/${editingTokenAccount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            auth_token: inputAuthToken.trim(),
            ct0: inputCt0.trim() || undefined,
          },
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);

      toast.show(`🔑 Token atualizado para @${editingTokenAccount.username}!`);
      setTokenModalOpen(false);
      setInputAuthToken("");
      setInputCt0("");
      await refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao atualizar token.");
    } finally {
      setBusy(null);
    }
  }

  // SALVAR FILTROS DE NICHO
  async function handleSaveFilters(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save_filters");
    try {
      const res = await fetch("/api/automation/filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.show("🎯 Filtros de nicho e interação salvos!");
      setFiltersOpen(false);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao salvar filtros.");
    } finally {
      setBusy(null);
    }
  }

  // SALVAR RITMO HUMANO & INTERVALOS BIOLÓGICOS
  async function handleSaveCadence(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save_cadence");
    try {
      const res = await fetch("/api/automation/cadence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cadence }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.show("⏰ Configurações de Ritmo Humano & Pausas salvas!");
      setCadenceModalOpen(false);
      await fetchCadence();
      await refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao salvar cadência.");
    } finally {
      setBusy(null);
    }
  }

  // EXECUTAR PASSO DE AQUECIMENTO
  async function handleRunWarmup() {
    if (accounts.length === 0) {
      toast.show("❌ Adicione pelo menos uma conta antes de aquecer.");
      return;
    }
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

  // CONECTAR UMA CONTA MANUAL
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

  // TOGGLE PROXY
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

  // COPIAR
  function copyText(text: string, label: string) {
    if (!text) {
      toast.show(`${label} não disponível para esta conta.`);
      return;
    }
    navigator.clipboard.writeText(text);
    toast.show(`${label} copiado!`);
  }

  // CONTEXT MENU
  function handleContextMenu(e: React.MouseEvent, acc: PlatformAccount & { config?: BotConfig }) {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 240);
    const y = Math.min(e.clientY, window.innerHeight - 380);

    setContextMenu({
      visible: true,
      x,
      y,
      account: acc,
    });
    setCopySubmenuOpen(false);
  }

  const activeAccount = accounts.find((a) => a.status === "warming") || accounts[0] || null;
  const currentActionText = activeAccount?.current_action || (status.enabled ? "Inicializando esteira de aquecimento humano..." : "Robô pausado.");

  function getActionBadge(text: string) {
    if (text.includes("Rolando feed") || text.includes("Scroll")) {
      return { label: "📜 SCROLL FEED", bg: "bg-sky-500/20 text-sky-400 border-sky-500/40" };
    }
    if (text.includes("Acessando perfil") || text.includes("Visitando")) {
      return { label: "👀 VISITANDO PERFIL", bg: "bg-purple-500/20 text-purple-400 border-purple-500/40" };
    }
    if (text.includes("Lendo publicação")) {
      return { label: "📖 LENDO POST", bg: "bg-amber-500/20 text-amber-400 border-amber-500/40" };
    }
    if (text.includes("Curtindo")) {
      return { label: "❤️ AUTO-LIKE", bg: "bg-rose-500/20 text-rose-400 border-rose-500/40" };
    }
    if (text.includes("Salvando tweet") || text.includes("Bookmark")) {
      return { label: "🔖 BOOKMARK", bg: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" };
    }
    if (text.includes("Retweet")) {
      return { label: "🔁 AUTO-RETWEET", bg: "bg-teal-500/20 text-teal-400 border-teal-500/40" };
    }
    if (text.includes("Pesquisando") || text.includes("Busca")) {
      return { label: "🔍 BUSCA NICHO", bg: "bg-indigo-500/20 text-indigo-400 border-indigo-500/40" };
    }
    if (text.includes("Pausa") || text.includes("Descanso")) {
      return { label: "⏳ DESCANSO NATURAL", bg: "bg-zinc-500/20 text-zinc-400 border-zinc-500/40" };
    }
    return { label: "⚡ EM OPERAÇÃO", bg: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" };
  }

  const actionBadge = getActionBadge(currentActionText);

  return (
    <div className="flex flex-col gap-4">
      {/* ============================================================== */}
      {/* 1. MASTER BOT CARD: BOTÃO GERAL DE LIGAR E DESLIGAR VISÍVEL    */}
      {/* ============================================================== */}
      <section
        className={`liquid-glass glass-card panel-pad flex flex-wrap items-center justify-between gap-4 border-2 transition-all ${
          status.enabled
            ? "border-emerald-500/50 bg-emerald-950/10 shadow-lg shadow-emerald-500/10"
            : "border-rose-500/50 bg-rose-950/10 shadow-lg shadow-rose-500/10"
        }`}
        data-glass
      >
        <div className="flex items-center gap-4 min-w-0">
          <div
            className={`size-14 rounded-2xl grid place-items-center shrink-0 transition-transform ${
              status.enabled
                ? "bg-emerald-500/20 text-emerald-400 scale-105"
                : "bg-rose-500/20 text-rose-400"
            }`}
          >
            <IconBot size={30} />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span
                className={`size-3 rounded-full ${
                  status.enabled
                    ? "bg-emerald-500 shadow-[0_0_12px_#10b981] animate-pulse"
                    : "bg-rose-500"
                }`}
              />
              <h2 className="text-[20px] font-[750] tracking-tight">
                {status.enabled ? (
                  <span className="text-emerald-400">BOT LIGADO — EM OPERAÇÃO</span>
                ) : (
                  <span className="text-rose-400">BOT DESLIGADO — PAUSADO</span>
                )}
              </h2>
            </div>

            <p className="text-[13px] text-[var(--ink-2)] mt-1">
              {accounts.length === 0 ? (
                <span className="text-amber-400 font-semibold">
                  ⚠️ O robô não opera sem uma conta conectada. Adicione pelo menos uma conta abaixo.
                </span>
              ) : status.enabled ? (
                `🟢 ${accounts.length} conta(s) monitorada(s) · Aquecimento humano e filtros ativos.`
              ) : (
                "🔴 Bot pausado. Nenhuma ação será realizada até você ligar."
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 ml-auto">
          <button
            type="button"
            className="btn btn-glass"
            onClick={() => setFiltersOpen(true)}
            title="Configurar palavras-chave e alvos de interação do bot"
          >
            🎯 Filtros de Alvo & Interação
          </button>

          <button
            type="button"
            className="btn btn-glass"
            onClick={() => setCadenceModalOpen(true)}
            title="Configurar intervalos quebrados, pausas de almoço e sono biológico"
          >
            ⏰ Ritmo & Pausas
          </button>

          {/* BOTÃO MASTER ON/OFF */}
          <button
            type="button"
            onClick={toggleMasterEngine}
            disabled={busy !== null || accounts.length === 0}
            className={`px-6 py-3 rounded-xl font-[750] text-[14px] flex items-center gap-2.5 transition-all shadow-md ${
              accounts.length === 0
                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700"
                : status.enabled
                ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30"
                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 animate-pulse"
            }`}
          >
            {accounts.length === 0 ? (
              <>🔒 Robô Bloqueado (0 Contas)</>
            ) : status.enabled ? (
              <>
                <IconPause size={18} /> DESLIGAR BOT
              </>
            ) : (
              <>
                <IconPlay size={18} /> LIGAR BOT
              </>
            )}
          </button>
        </div>
      </section>

      {/* ============================================================== */}
      {/* 1.5 CONSOLE VISUAL DE OPERAÇÕES EM TEMPO REAL (MISSION CONTROL) */}
      {/* ============================================================== */}
      <section className="liquid-glass glass-card panel-pad relative overflow-hidden border border-[var(--line)]" data-glass>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`size-2.5 rounded-full ${
                status.enabled ? "bg-emerald-500 shadow-[0_0_10px_#10b981] animate-ping" : "bg-zinc-600"
              }`}
            />
            <h3 className="text-[15px] font-[750] tracking-tight text-[var(--ink)] flex items-center gap-2">
              <span>🖥️</span> Console de Missão do Bot — Ações em Tempo Real
            </h3>
            <span className="liquid-glass-chip px-2.5 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
              {status.enabled ? "LIVE TELEMETRY" : "IDLE"}
            </span>
          </div>

          <div className="flex items-center gap-3 text-[12px] text-[var(--ink-2)]">
            {/* MINI GLOBO HOLOGRÁFICO COM PARTÍCULAS EMERGINDO */}
            <div className="relative size-12 flex items-center justify-center shrink-0" title="Radar Holográfico do Bot">
              {/* Esfera / Globo com rotação 3D */}
              <div className="size-11 rounded-full border-2 border-emerald-400/60 bg-emerald-950/40 shadow-[0_0_15px_rgba(16,185,129,0.35)] relative flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(56,189,248,0.5),rgba(16,185,129,0.2),transparent)]" />
                <div className="absolute inset-x-0 h-[1.5px] bg-emerald-400/70 top-1/2 -translate-y-1/2 shadow-[0_0_8px_#34d399]" />
                <div className="absolute inset-y-0 w-[1.5px] bg-emerald-400/70 left-1/2 -translate-x-1/2 shadow-[0_0_8px_#34d399]" />
                <div className="size-8 rounded-full border border-sky-400/50 animate-[spin_6s_linear_infinite]" />
                <span className="text-[13px] relative z-10 select-none">🌐</span>
              </div>

              {/* Partículas / Pills que saem de dentro do globo e somem em 1.8s */}
              {floatingPills.map((pill) => (
                <div
                  key={pill.id}
                  className={`holo-pill-float absolute pointer-events-none z-30 px-2 py-0.5 rounded-full text-[10px] font-bold border shadow-lg flex items-center gap-1 whitespace-nowrap ${pill.color}`}
                  style={{ top: "5%", left: "50%" }}
                >
                  <span>{pill.icon}</span>
                  <span className="truncate max-w-[90px]">{pill.text}</span>
                </div>
              ))}
            </div>

            <button
              type="button"
              className={`btn btn-xs ${showMobileSim ? "btn-primary" : "btn-glass"} flex items-center gap-1.5`}
              onClick={() => setShowMobileSim(!showMobileSim)}
              title="Alternar simulador de celular ativo"
            >
              <span>📱</span> {showMobileSim ? "Ocultar Celular" : "Ver Celular"}
            </button>

            <div className="hidden sm:flex items-center gap-1.5">
              <span className="font-mono text-[var(--muted)]">Ciclo:</span>
              <span className="font-semibold text-emerald-400">8s (Jitter Quebrado)</span>
            </div>
          </div>
        </div>

        {/* Grade de Telemetria ao Vivo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-3.5">
          {/* Card 1: Conta em Foco */}
          <div className="bg-[var(--sunken)]/60 rounded-xl p-3 border border-[var(--line)] flex flex-col justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] flex items-center justify-between">
                <span>Esteira Multi-Contas</span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                  {accounts.length} {accounts.length === 1 ? "Perfil" : "Perfis em Massa"}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2.5">
                <div className="size-9 rounded-full bg-[var(--surface)] border border-[var(--line)] flex items-center justify-center font-bold text-[13px] text-[var(--accent)]">
                  {activeAccount ? activeAccount.username.slice(0, 2).toUpperCase() : "X"}
                </div>
                <div className="min-w-0">
                  <div className="font-[700] text-[13.5px] truncate text-[var(--ink)]">
                    {activeAccount ? `@${activeAccount.username}` : "Nenhuma conta"}
                  </div>
                  <div className="text-[11px] text-[var(--muted)] truncate">
                    {accounts.length > 1 ? `Rotacionando com +${accounts.length - 1} contas no mesmo bot` : (activeAccount?.display_name || "Perfil Ativo")}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-[var(--line)] text-[11px] flex items-center justify-between text-[var(--ink-2)]">
              <span>Proxy / Rede:</span>
              <span className="font-mono text-emerald-400 font-semibold truncate max-w-[150px]">
                {activeAccount?.proxy_active && activeAccount?.proxy ? activeAccount.proxy : "IP Residencial Direto"}
              </span>
            </div>
          </div>

          {/* Card 2: Ação em Tempo Real */}
          <div className="bg-[var(--sunken)]/60 rounded-xl p-3 border border-[var(--line)] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Ação ao Vivo
                </div>
                <span className={`text-[10px] font-[750] px-2 py-0.5 rounded border uppercase tracking-wider ${actionBadge.bg}`}>
                  {actionBadge.label}
                </span>
              </div>

              <div className="mt-2 text-[13px] font-[650] text-[var(--ink)] leading-snug line-clamp-2">
                {currentActionText}
              </div>
            </div>

            {/* Barra de Progresso Animada */}
            <div className="mt-3">
              <div className="w-full bg-[var(--surface)] h-2 rounded-full overflow-hidden border border-[var(--line)]">
                <div
                  className={`h-full transition-all duration-700 ease-out ${
                    status.enabled
                      ? "bg-gradient-to-r from-sky-500 via-emerald-500 to-teal-400 animate-pulse w-full"
                      : "bg-zinc-700 w-0"
                  }`}
                />
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--muted)] font-mono">
                <span className="truncate text-sky-400">{filters.targetProfiles.split(",")[0] || "@elonmusk"}</span>
                <span className="text-emerald-400 font-bold">Jitter Ativo</span>
              </div>
            </div>
          </div>

          {/* Card 3: Ritmo Humano & Pausas Biológicas */}
          <div className="bg-[var(--sunken)]/60 rounded-xl p-3 border border-[var(--line)] flex flex-col justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] flex items-center justify-between">
                <span>Ciclo Circadiano & Ritmo</span>
                <span className="text-emerald-400 font-mono text-[10.5px]">SP (GMT-3)</span>
              </div>

              <div className="mt-1.5">
                <div className="text-[12.5px] font-[700] text-[var(--ink)] flex items-center gap-1.5 truncate">
                  {bioState.label}
                </div>
                <div className="text-[11px] text-[var(--muted)] mt-0.5 truncate" title={bioState.description}>
                  {bioState.description}
                </div>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-[var(--line)] space-y-1 text-[11px]">
              <div className="flex items-center justify-between text-[var(--ink-2)]">
                <span>Likes:</span>
                <span className="font-mono text-rose-400 font-semibold">1 a cada ~{cadence.likeCadenceMinMinutes}m - {cadence.likeCadenceMaxMinutes}m</span>
              </div>
              <div className="flex items-center justify-between text-[var(--ink-2)]">
                <span>Retweets:</span>
                <span className="font-mono text-teal-400 font-semibold">1 a cada ~{cadence.retweetCadenceMinMinutes}m - {cadence.retweetCadenceMaxMinutes}m</span>
              </div>
              <div className="flex items-center justify-between text-[var(--ink-2)]">
                <span>Almoço:</span>
                <span className="font-mono text-amber-400">{cadence.lunchPause.enabled ? `${cadence.lunchPause.start} às ${cadence.lunchPause.end}` : "Off"}</span>
              </div>
              <div className="flex items-center justify-between text-[var(--ink-2)]">
                <span>Sono:</span>
                <span className="font-mono text-indigo-400">{cadence.nightSleep.enabled ? `${cadence.nightSleep.start} às ${cadence.nightSleep.end}` : "Off"}</span>
              </div>

              <button
                type="button"
                className="btn btn-xs btn-glass w-full mt-1.5 text-[11px] font-[600]"
                onClick={() => setCadenceModalOpen(true)}
              >
                ⏰ Ajustar Ritmo & Intervalos
              </button>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* SIMULADOR VISUAL DE SMARTPHONE (CELULAR MEXENDO NA CONTA)     */}
        {/* ============================================================== */}
        {showMobileSim && (
          <div className="mt-4 pt-4 border-t border-[var(--line)] flex flex-col md:flex-row items-center justify-center gap-6 enter">
            {/* Moldura de Smartphone (iPhone Style) */}
            <div className="w-[280px] h-[480px] rounded-[38px] border-[5px] border-zinc-700 bg-zinc-950 shadow-2xl relative overflow-hidden flex flex-col p-2 shadow-emerald-950/20 shrink-0">
              {/* Dynamic Island / Notch */}
              <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-24 h-3.5 bg-black rounded-full z-40 flex items-center justify-between px-2">
                <span className={`size-1.5 rounded-full ${status.enabled ? "bg-emerald-500 animate-pulse" : "bg-zinc-700"}`} />
                <span className="size-1.5 rounded-full bg-zinc-800" />
              </div>

              {/* Barra de Status do Celular */}
              <div className="h-5 flex items-center justify-between px-3 text-[9.5px] font-semibold text-zinc-400 z-30 pt-0.5">
                <span>01:45</span>
                <div className="flex items-center gap-1.5 text-[8.5px]">
                  <span>5G</span>
                  <span>📶</span>
                  <span>96% 🔋</span>
                </div>
              </div>

              {/* Tela do Aplicativo do X */}
              <div className="flex-1 bg-black rounded-[28px] overflow-hidden flex flex-col relative text-white text-[11.5px]">
                {/* Header do X */}
                <div className="h-9 border-b border-zinc-800/80 flex items-center justify-between px-2.5 bg-black/90 backdrop-blur z-20">
                  <div className="size-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[9px] font-bold text-sky-400">
                    {activeAccount ? activeAccount.username.slice(0, 2).toUpperCase() : "X"}
                  </div>
                  <span className="text-[14px] font-black tracking-tight select-none">𝕏</span>
                  <span className="text-[10px] text-zinc-400 font-mono">60fps</span>
                </div>

                {/* Abas Para Você / Seguindo */}
                <div className="flex border-b border-zinc-800 text-[10.5px] font-semibold text-zinc-400 bg-black z-20">
                  <div className="flex-1 py-1 text-center text-white border-b-2 border-sky-500">
                    Para você
                  </div>
                  <div className="flex-1 py-1 text-center text-zinc-500">
                    Seguindo
                  </div>
                </div>

                {/* Feed Interativo com Scroll e Efeitos de Toque */}
                <div className="flex-1 overflow-hidden relative">
                  <div
                    className="p-2.5 space-y-2.5 transition-transform duration-700 ease-out"
                    style={{ transform: `translateY(-${phoneScrollY}px)` }}
                  >
                    {/* Post 1 */}
                    <div className="border-b border-zinc-800/80 pb-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className="size-6 rounded-full bg-purple-900/60 border border-purple-500/40 grid place-items-center text-[8.5px] font-bold text-purple-200">
                          EM
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-[10.5px] flex items-center gap-1 truncate">
                            <span>{filters.targetProfiles.split(",")[0] || "@elonmusk"}</span>
                            <span className="text-sky-400 text-[8px]">☑</span>
                          </div>
                          <span className="text-zinc-500 text-[9px]">há 12 min</span>
                        </div>
                      </div>
                      <p className="mt-1 text-[10.5px] text-zinc-200 leading-relaxed">
                        A automação inteligente e modelos autônomos no nicho de {filters.keywords.split(",")[0] || "marketing"} aceleram tudo.
                      </p>
                      <div className="flex items-center justify-between text-zinc-500 mt-1.5 px-1 text-[10px]">
                        <span>💬 142</span>
                        <span className={`flex items-center gap-1 transition-all ${phoneRetweetActive ? "text-emerald-400 font-bold scale-125" : ""}`}>
                          🔁 {phoneRetweetActive ? "1.8K" : "1.7K"}
                        </span>
                        <span className={`flex items-center gap-1 transition-all ${phoneLikeActive ? "text-rose-500 font-bold scale-125" : ""}`}>
                          ❤️ {phoneLikeActive ? "14.2K" : "14.1K"}
                        </span>
                        <span>🔖 89</span>
                      </div>
                    </div>

                    {/* Post 2 */}
                    <div className="border-b border-zinc-800/80 pb-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className="size-6 rounded-full bg-sky-900/60 border border-sky-500/40 grid place-items-center text-[8.5px] font-bold text-sky-200">
                          SM
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-[10.5px] flex items-center gap-1 truncate">
                            <span>{filters.targetProfiles.split(",")[1] || "@sama"}</span>
                            <span className="text-sky-400 text-[8px]">☑</span>
                          </div>
                          <span className="text-zinc-500 text-[9px]">há 34 min</span>
                        </div>
                      </div>
                      <p className="mt-1 text-[10.5px] text-zinc-200 leading-relaxed">
                        Agentes com comportamento orgânico que simulam pausas biológicas estão redefinindo interações reais.
                      </p>
                      <div className="flex items-center justify-between text-zinc-500 mt-1.5 px-1 text-[10px]">
                        <span>💬 88</span>
                        <span>🔁 612</span>
                        <span>❤️ 3.9K</span>
                        <span>🔖 55</span>
                      </div>
                    </div>

                    {/* Post 3 */}
                    <div className="border-b border-zinc-800/80 pb-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className="size-6 rounded-full bg-emerald-900/60 border border-emerald-500/40 grid place-items-center text-[8.5px] font-bold text-emerald-200">
                          PG
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-[10.5px] flex items-center gap-1 truncate">
                            <span>{filters.targetProfiles.split(",")[2] || "@paulg"}</span>
                          </div>
                          <span className="text-zinc-500 text-[9px]">há 1h</span>
                        </div>
                      </div>
                      <p className="mt-1 text-[10.5px] text-zinc-200 leading-relaxed">
                        A persistência e cadência humana superam qualquer esforço desordenado no nicho de {filters.keywords.split(",")[1] || "startups"}.
                      </p>
                      <div className="flex items-center justify-between text-zinc-500 mt-1.5 px-1 text-[10px]">
                        <span>💬 41</span>
                        <span>🔁 289</span>
                        <span>❤️ 1.5K</span>
                        <span>🔖 32</span>
                      </div>
                    </div>
                  </div>

                  {/* Indicador Tátil (Polegar Humano Simulando Toque na Tela) */}
                  {phoneTouchActive && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30">
                      <div className="size-8 rounded-full bg-sky-400/30 border-2 border-sky-400/80 shadow-[0_0_12px_#38bdf8] animate-ping" />
                    </div>
                  )}

                  {/* Coração Explodindo quando Dá Like */}
                  {phoneLikeActive && (
                    <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30 text-[32px] animate-bounce">
                      ❤️
                    </div>
                  )}
                </div>

                {/* Barra Inferior de Navegação do X */}
                <div className="h-8 border-t border-zinc-800/80 flex items-center justify-around text-zinc-400 text-[12px] bg-black/95 z-20">
                  <span className="text-white">🏠</span>
                  <span>🔍</span>
                  <span>⚡</span>
                  <span>🔔</span>
                  <span>✉️</span>
                </div>
              </div>
            </div>

            {/* Explicação e Telemetria do Simulador */}
            <div className="max-w-[440px] text-[12.5px] space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <h4 className="font-[750] text-[14px] text-[var(--ink)]">
                  Simulação Visual em Tempo Real (Mobile View)
                </h4>
              </div>
              <p className="text-[var(--ink-2)] leading-relaxed">
                Este simulador reflete em tempo real o que o motor de automação executa no navegador isolado: 
                <strong> rolagem do feed com curvas de Bezier</strong>, retenção de leitura em tweets, curtidas orgânicas e pausas humanas.
              </p>
              <div className="p-3 rounded-xl bg-[var(--sunken)]/60 border border-[var(--line)] space-y-1.5 text-[11.5px]">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">Modelo Ativa:</span>
                  <span className="font-semibold text-emerald-400">@{activeAccount?.username || "JulyCardosoCirc"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">Ação Física Simulada:</span>
                  <span className="font-mono text-sky-400">{phoneTouchActive ? "Polegar Arrastando Feed 👆" : phoneLikeActive ? "Toque de Curtida ❤️" : phoneRetweetActive ? "Retweetando 🔁" : "Lendo Publicação 👀"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">Modo de Alvo:</span>
                  <span className="font-mono text-amber-400 uppercase font-semibold">{filters.discoveryMode || "Híbrido"}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ============================================================== */}
      {/* 2. BARRA DE FERRAMENTAS: BUSCA + BADGES + BOTÕES               */}
      {/* ============================================================== */}
      <div className="liquid-glass glass-card panel-pad flex flex-wrap items-center justify-between gap-3" data-glass>
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

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <button
            type="button"
            className="btn btn-sm btn-glass"
            onClick={handleOpenChromeSelected}
            disabled={selectedCount === 0 || busy !== null}
            title="Abre as contas selecionadas em janelas isoladas"
          >
            <IconExterno size={14} /> Open browser
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

          <a
            href="/api/oauth/x/authorize"
            className="btn btn-sm btn-primary bg-sky-500 hover:bg-sky-400 text-white font-[600] flex items-center gap-1.5 shadow-md shadow-sky-500/20"
            title="Conectar sua conta do X com 1 clique oficial (sem precisar de F12 ou copiar tokens)"
          >
            <span>🔗</span> Conectar X Oficial (1-Clique)
          </a>

          <button
            type="button"
            className="btn btn-sm btn-primary"
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
      {/* 3. RESUMO DOS FILTROS DO NICHO ATIVOS                          */}
      {/* ============================================================== */}
      <div className="sunken px-4 py-2.5 text-[12.5px] flex flex-wrap items-center justify-between gap-2 border border-[var(--line)]">
        <div className="flex items-center gap-2 truncate">
          <span className="font-[650] text-[var(--accent)]">🎯 Alvos Ativos:</span>
          <span className="truncate text-[var(--ink-2)]">
            Palavras: <strong>{filters.keywords}</strong> · Perfis: <strong>{filters.targetProfiles}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11.5px] text-[var(--muted)] shrink-0">
          {filters.autoLike && <span className="tag tag-green">Curtir</span>}
          {filters.autoBookmark && <span className="tag tag-blue">Guardar</span>}
          {filters.autoRetweet && <span className="tag tag-purple">Retweetar</span>}
          {filters.autoVisitProfile && <span className="tag tag-gray">Visitar</span>}
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="text-[var(--accent)] font-[600] hover:underline ml-1"
          >
            Editar Filtros
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 4. TABELA DE CONTAS MULTI-PERFIL                               */}
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
                    Nenhuma conta cadastrada. Clique em <strong>+ Conectar Manual</strong> para adicionar sua conta.
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
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          className="cursor-pointer"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(acc.id)}
                        />
                      </td>

                      <td className="p-3 text-center num text-[var(--muted)]">
                        {index + 1}
                      </td>

                      <td className="p-3 font-[600] text-[var(--ink)]">
                        <div className="flex items-center gap-1.5">
                          <span>@{acc.username}</span>
                          {!acc.auth_token && acc.access_token === "placeholder" && (
                            <span
                              className="text-[10px] text-amber-400 font-normal cursor-pointer hover:underline"
                              onClick={() => {
                                setEditingTokenAccount(acc);
                                setTokenModalOpen(true);
                              }}
                              title="Clique para adicionar auth_token e habilitar retweets reais"
                            >
                              [sem token]
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-3 text-[var(--ink-2)] truncate max-w-[140px]">
                        {acc.display_name || "-"}
                      </td>

                      <td className="p-3 text-[var(--muted)]">
                        {acc.phone || "-"}
                      </td>

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
                              className="text-[11px]"
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
      {/* 5. RADAR DE AÇÕES E LOGS AO VIVO                               */}
      {/* ============================================================== */}
      <section className="panel panel-pad" aria-label="Radar de Ações">
        <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] pb-2.5">
          <div className="flex items-center gap-2">
            <span className="dot dot-live" style={{ color: "var(--ok)" }} />
            <h3 className="h2 text-[14.5px]">Radar de Ações e Aquecimento ao Vivo</h3>
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
      {/* 6. MENU DE CONTEXTO (RIGHT-CLICK)                              */}
      {/* ============================================================== */}
      {contextMenu.visible && contextMenu.account && (
        <div
          className="fixed z-50 min-w-[230px] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-2xl p-1 text-[13px] enter"
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

          <a
            href="/api/oauth/x/authorize"
            className="w-full text-left px-3 py-2 rounded hover:bg-[var(--sunken)] flex items-center gap-2 transition-colors text-sky-400 font-[600]"
            title="Autoriza a conta automaticamente via Twitter com 1 clique"
          >
            <span>🔗</span> Login X (Autorizar via 1-Clique)
          </a>

          <button
            type="button"
            className="w-full text-left px-3 py-2 rounded hover:bg-[var(--sunken)] flex items-center gap-2 transition-colors text-[var(--accent)] font-[600]"
            onClick={() => {
              setRetweetTargetAccount(contextMenu.account!);
              setRetweetModalOpen(true);
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
          >
            <span>🔁</span> Disparar Retweet Real Agora
          </button>

          <button
            type="button"
            className="w-full text-left px-3 py-2 rounded hover:bg-[var(--sunken)] flex items-center gap-2 transition-colors font-[600]"
            onClick={() => {
              setEditingTokenAccount(contextMenu.account!);
              setTokenModalOpen(true);
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
          >
            <span>🔑</span> Inserir / Editar Auth Token
          </button>

          <button
            type="button"
            className="w-full text-left px-3 py-2 rounded hover:bg-[var(--sunken)] flex items-center gap-2 transition-colors"
            onClick={() => {
              handleOpenChrome(contextMenu.account!);
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
          >
            <span>🌐</span> Open browser
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

          {/* Submenu Copy */}
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
      {/* 7. MODAL: FILTROS DE ALVO & INTERAÇÃO (NICHO)                  */}
      {/* ============================================================== */}
      {filtersOpen && (
        <dialog open className="sheet">
          <div className="panel-pad max-w-[620px] w-full">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <div>
                <h2 className="h2 text-[17px]">🎯 Filtros de Alvo & Interação do Nicho</h2>
                <p className="text-[12px] text-[var(--muted)] mt-0.5">
                  Configure quais assuntos e perfis o bot vai monitorar para curtir, salvar e interagir de forma humana.
                </p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFiltersOpen(false)}>
                <IconX size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveFilters} className="mt-4 flex flex-col gap-3.5 text-[13px] max-h-[75vh] overflow-y-auto pr-1">
              {/* Modo de Descoberta */}
              <div className="p-3 rounded-xl border border-[var(--line)] bg-[var(--sunken)]/60">
                <label className="label text-[12px] font-bold text-[var(--accent)]" htmlFor="f-mode">
                  Modo de Leitura e Descoberta de Alvos:
                </label>
                <select
                  id="f-mode"
                  className="input mt-1 font-medium"
                  value={filters.discoveryMode || "hybrid"}
                  onChange={(e) => setFilters({ ...filters, discoveryMode: e.target.value as any })}
                >
                  <option value="hybrid">🎯 Híbrido: Links Diretos + Espelhar Reposts + Nicho (Recomendado)</option>
                  <option value="links">🔗 Focar Apenas nos Links Diretos Fornecidos</option>
                  <option value="mirror">🪞 Espelhar Exclusivamente Reposts e Gostos da Própria Conta</option>
                  <option value="niche">🔍 Pesquisa por Palavras-chave e Perfis de Referência</option>
                </select>
                <p className="text-[11px] text-[var(--muted)] mt-1.5">
                  Escolha como o robô deve encontrar o que você realmente quer curtir e interagir.
                </p>
              </div>

              {/* Links Diretos de Posts */}
              <div className="p-3 rounded-xl border border-[var(--line)] bg-[var(--sunken)]/60">
                <label className="label text-[12px] font-bold flex items-center justify-between" htmlFor="f-links">
                  <span>🔗 Links Diretos de Publicações do X (O que curtir/retuitar)</span>
                  <span className="text-[10px] text-amber-400 font-mono">1 por linha</span>
                </label>
                <textarea
                  id="f-links"
                  className="input mt-1 h-20 text-[12px] font-mono leading-relaxed"
                  value={filters.targetLinks || ""}
                  onChange={(e) => setFilters({ ...filters, targetLinks: e.target.value })}
                  placeholder={"https://x.com/elonmusk/status/189283921000\nhttps://x.com/sama/status/189283944000"}
                />
                <p className="text-[11px] text-[var(--muted)] mt-1">
                  Cole os links exatos dos tweets que você quer que o bot curta, guarde ou use para interagir com quem engajou neles.
                </p>
              </div>

              {/* Espelhamento de Reposts da Própria Conta */}
              <div className="p-3 rounded-xl border border-[var(--line)] bg-[var(--sunken)]/60 flex items-center justify-between">
                <div>
                  <label className="font-[650] text-[12.5px] cursor-pointer flex items-center gap-1.5" htmlFor="f-mirror">
                    <span>🪞</span> Espelhar Reposts e Histórico da Própria Conta
                  </label>
                  <p className="text-[11px] text-[var(--muted)] mt-0.5">
                    O bot analisa o que a sua conta já repostou e curtiu no passado para interagir com posts do mesmo gosto.
                  </p>
                </div>
                <input
                  id="f-mirror"
                  type="checkbox"
                  checked={filters.mirrorOwnReposts !== false}
                  onChange={(e) => setFilters({ ...filters, mirrorOwnReposts: e.target.checked })}
                  className="size-4 cursor-pointer shrink-0"
                />
              </div>

              <div>
                <label className="label" htmlFor="f-keywords">
                  Palavras-chave e Hashtags do Nicho (separadas por vírgula)
                </label>
                <input
                  id="f-keywords"
                  className="input mt-1"
                  value={filters.keywords}
                  onChange={(e) => setFilters({ ...filters, keywords: e.target.value })}
                  placeholder="marketing, tech, crypto, startup, ia, btc, business"
                  required
                />
                <p className="text-[11px] text-[var(--muted)] mt-1">
                  O bot só vai interagir com tweets que contenham pelo menos um desses termos.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="f-profiles">
                  Perfis de Referência para Acompanhar (separados por vírgula)
                </label>
                <input
                  id="f-profiles"
                  className="input mt-1"
                  value={filters.targetProfiles}
                  onChange={(e) => setFilters({ ...filters, targetProfiles: e.target.value })}
                  placeholder="@elonmusk, @sama, @paulg"
                />
              </div>

              <div className="border-t border-[var(--line)] pt-3">
                <span className="label">Ações Permitidas na Esteira:</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.autoLike}
                      onChange={(e) => setFilters({ ...filters, autoLike: e.target.checked })}
                    />
                    <span>Curtir Tweets</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.autoBookmark}
                      onChange={(e) => setFilters({ ...filters, autoBookmark: e.target.checked })}
                    />
                    <span>Guardar Links</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.autoRetweet}
                      onChange={(e) => setFilters({ ...filters, autoRetweet: e.target.checked })}
                    />
                    <span>Retweetar Posts</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.autoVisitProfile}
                      onChange={(e) => setFilters({ ...filters, autoVisitProfile: e.target.checked })}
                    />
                    <span>Visitar Perfis</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.autoComment}
                      onChange={(e) => setFilters({ ...filters, autoComment: e.target.checked })}
                    />
                    <span>Comentar em Posts</span>
                  </label>
                </div>
              </div>

              {filters.autoComment && (
                <div>
                  <label className="label" htmlFor="f-comments">
                    Modelos de Comentários Humanos (um por linha):
                  </label>
                  <textarea
                    id="f-comments"
                    className="textarea mt-1"
                    rows={3}
                    value={filters.commentTemplates}
                    onChange={(e) => setFilters({ ...filters, commentTemplates: e.target.value })}
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--line)] mt-2">
                <button type="button" className="btn" onClick={() => setFiltersOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy === "save_filters"}>
                  Salvar Filtros
                </button>
              </div>
            </form>
          </div>
        </dialog>
      )}

      {/* ============================================================== */}
      {/* 8. MODAL: DISPARAR RETWEET REAL DE TESTE                       */}
      {/* ============================================================== */}
      {retweetModalOpen && retweetTargetAccount && (
        <dialog open className="sheet">
          <div className="panel-pad max-w-[500px] w-full border-2 border-[var(--accent)]">
            <h2 className="h2 text-[var(--accent)]">🔁 Disparar Retweet Real Agora</h2>
            <p className="text-[13px] text-[var(--ink-2)] mt-1">
              Testar a execução real de um Retweet na conta <strong>@{retweetTargetAccount.username}</strong>:
            </p>

            <form onSubmit={handleExecuteRealRetweet} className="mt-4 flex flex-col gap-3">
              <div>
                <label className="label" htmlFor="r-url">
                  Link ou ID do Tweet a ser Retweetado *
                </label>
                <input
                  id="r-url"
                  className="input mt-1"
                  placeholder="https://x.com/elonmusk/status/1892837465..."
                  value={targetTweetUrl}
                  onChange={(e) => setTargetTweetUrl(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-[var(--line)]">
                <button type="button" className="btn" onClick={() => setRetweetModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy === "retweet"}>
                  {busy === "retweet" ? "Retweetando..." : "Retuitar Agora!"}
                </button>
              </div>
            </form>
          </div>
        </dialog>
      )}

      {/* ============================================================== */}
      {/* 9. MODAL: EDITAR / INSERIR AUTH TOKEN DA CONTA                 */}
      {/* ============================================================== */}
      {tokenModalOpen && editingTokenAccount && (
        <dialog open className="sheet">
          <div className="panel-pad max-w-[500px] w-full">
            <h2 className="h2">🔑 Inserir Auth Token de @{editingTokenAccount.username}</h2>
            <p className="text-[12.5px] text-[var(--ink-2)] mt-1">
              Cole o cookie <code>auth_token</code> da conta logada no seu navegador para permitir retweets e curtidas imediatas sem precisar de senha ou captcha.
            </p>

            <form onSubmit={handleSaveAuthToken} className="mt-4 flex flex-col gap-3">
              <div>
                <label className="label" htmlFor="t-token">
                  auth_token (Cookie do X) *
                </label>
                <input
                  id="t-token"
                  className="input mt-1 font-mono text-[12px]"
                  placeholder="Ex: a1b2c3d4e5f6..."
                  value={inputAuthToken}
                  onChange={(e) => setInputAuthToken(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="label" htmlFor="t-ct0">
                  ct0 (Opcional)
                </label>
                <input
                  id="t-ct0"
                  className="input mt-1 font-mono text-[12px]"
                  placeholder="Ex: 1234567890abcdef..."
                  value={inputCt0}
                  onChange={(e) => setInputCt0(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-[var(--line)]">
                <button type="button" className="btn" onClick={() => setTokenModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy === "save_token"}>
                  {busy === "save_token" ? "Salvando..." : "Salvar Token"}
                </button>
              </div>
            </form>
          </div>
        </dialog>
      )}

      {/* ============================================================== */}
      {/* 10. MODAL: CONECTAR CONTA MANUAL                               */}
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
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManualModalOpen(false)}>
                <IconX size={16} />
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="mt-4 flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <button type="button" className="btn" onClick={() => setManualModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy === "manual_add" || !manualForm.username.trim()}>
                  {busy === "manual_add" ? "Salvando..." : "Salvar e Conectar"}
                </button>
              </div>
            </form>
          </div>
        </dialog>
      )}

      {/* ============================================================== */}
      {/* 11. MODAL: IMPORTAR EM LOTE                                    */}
      {/* ============================================================== */}
      {importOpen && (
        <dialog open className="sheet">
          <div className="panel-pad max-w-[560px] w-full">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <h2 className="h2">Importar Contas do X em Lote</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImportOpen(false)}>
                <IconX size={16} />
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="mt-4 flex flex-col gap-3">
              <p className="text-[12.5px] text-[var(--ink-2)]">
                Cole uma conta por linha no formato:
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
                <button type="button" className="btn" onClick={() => setImportOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy === "import" || !rawImportText.trim()}>
                  {busy === "import" ? "Importando..." : "Importar Contas"}
                </button>
              </div>
            </form>
          </div>
        </dialog>
      )}

      {/* ============================================================== */}
      {/* 12. MODAL: SETTINGS (DRAGON TOOLS)                             */}
      {/* ============================================================== */}
      {settingsOpen && (
        <dialog open className="sheet">
          <div className="panel-pad max-w-[680px] w-full p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)]">
              <h2 className="text-[17px] font-[650]">Settings</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSettingsOpen(false)}>
                <IconX size={16} />
              </button>
            </div>

            <div className="grid grid-cols-[200px_1fr] min-h-[340px]">
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
      {/* 8. MODAL: RITMO HUMANO, INTERVALOS & PAUSAS BIOLÓGICAS        */}
      {/* ============================================================== */}
      {cadenceModalOpen && (
        <dialog open className="sheet">
          <div className="panel-pad max-w-[620px] w-full">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <div>
                <h2 className="h2 text-[17px] flex items-center gap-2">
                  <span>⏰</span> Ritmo Humano, Intervalos & Pausas Biológicas
                </h2>
                <p className="text-[12px] text-[var(--muted)] mt-0.5">
                  Configure tempos quebrados, pausas de almoço e descanso noturno para simular comportamento 100% humano indetectável.
                </p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCadenceModalOpen(false)}>
                <IconX size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveCadence} className="mt-4 flex flex-col gap-4 text-[13px] max-h-[75vh] overflow-y-auto pr-1">
              {/* Seção 1: Intervalos Quebrados Entre Ações */}
              <div className="p-3.5 rounded-xl border border-[var(--line)] bg-[var(--sunken)]/50">
                <div className="font-[700] text-[13.5px] text-[var(--ink)] flex items-center justify-between">
                  <span>⏱️ Intervalos Quebrados entre Ações (Jitter)</span>
                  <span className="text-[11px] font-mono text-emerald-400 font-semibold">Números Quebrados</span>
                </div>
                <p className="text-[11.5px] text-[var(--muted)] mt-0.5">
                  Nenhum ser humano age de 30 em 30 segundos exatos. O bot varia com frações decimais orgânicas.
                </p>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="label text-[11.5px]">Intervalo Mínimo (segundos)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="5"
                      max="60"
                      className="input mt-1"
                      value={cadence.actionJitterMinSeconds}
                      onChange={(e) => setCadence({ ...cadence, actionJitterMinSeconds: parseFloat(e.target.value) || 10 })}
                      required
                    />
                  </div>
                  <div>
                    <label className="label text-[11.5px]">Intervalo Máximo (segundos)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="10"
                      max="120"
                      className="input mt-1"
                      value={cadence.actionJitterMaxSeconds}
                      onChange={(e) => setCadence({ ...cadence, actionJitterMaxSeconds: parseFloat(e.target.value) || 25 })}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Seção 2: Cadência de Curtidas e Retweets */}
              <div className="p-3.5 rounded-xl border border-[var(--line)] bg-[var(--sunken)]/50">
                <div className="font-[700] text-[13.5px] text-[var(--ink)]">
                  🎯 Frequência de Curtidas & Retweets
                </div>
                <p className="text-[11.5px] text-[var(--muted)] mt-0.5">
                  Tempo espaçado entre cada like e repost para evitar bloqueios do algoritmo do X.
                </p>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="label text-[11.5px]">Curtir a cada (minutos)</label>
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="number"
                        step="0.1"
                        min="1"
                        className="input"
                        value={cadence.likeCadenceMinMinutes}
                        onChange={(e) => setCadence({ ...cadence, likeCadenceMinMinutes: parseFloat(e.target.value) || 3 })}
                        placeholder="Mín"
                        required
                      />
                      <span className="text-[var(--muted)] text-[11px]">até</span>
                      <input
                        type="number"
                        step="0.1"
                        min="2"
                        className="input"
                        value={cadence.likeCadenceMaxMinutes}
                        onChange={(e) => setCadence({ ...cadence, likeCadenceMaxMinutes: parseFloat(e.target.value) || 8 })}
                        placeholder="Máx"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label text-[11.5px]">Retweet a cada (minutos)</label>
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="number"
                        step="0.5"
                        min="10"
                        className="input"
                        value={cadence.retweetCadenceMinMinutes}
                        onChange={(e) => setCadence({ ...cadence, retweetCadenceMinMinutes: parseFloat(e.target.value) || 25 })}
                        placeholder="Mín"
                        required
                      />
                      <span className="text-[var(--muted)] text-[11px]">até</span>
                      <input
                        type="number"
                        step="0.5"
                        min="20"
                        className="input"
                        value={cadence.retweetCadenceMaxMinutes}
                        onChange={(e) => setCadence({ ...cadence, retweetCadenceMaxMinutes: parseFloat(e.target.value) || 60 })}
                        placeholder="Máx"
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção 3: Sessões de Uso (Burst & Cooldown) */}
              <div className="p-3.5 rounded-xl border border-[var(--line)] bg-[var(--sunken)]/50">
                <div className="font-[700] text-[13.5px] text-[var(--ink)]">
                  📱 Sessões de Uso & Celular no Bolso
                </div>
                <p className="text-[11.5px] text-[var(--muted)] mt-0.5">
                  Simula o ato natural de abrir o app por alguns minutos e depois guardar o aparelho.
                </p>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="label text-[11.5px]">Sessão Ativa (minutos na mão)</label>
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="number"
                        step="0.5"
                        min="3"
                        className="input"
                        value={cadence.sessionDurationMinMinutes}
                        onChange={(e) => setCadence({ ...cadence, sessionDurationMinMinutes: parseFloat(e.target.value) || 7 })}
                        required
                      />
                      <span className="text-[var(--muted)] text-[11px]">a</span>
                      <input
                        type="number"
                        step="0.5"
                        min="5"
                        className="input"
                        value={cadence.sessionDurationMaxMinutes}
                        onChange={(e) => setCadence({ ...cadence, sessionDurationMaxMinutes: parseFloat(e.target.value) || 14 })}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label text-[11.5px]">Pausa no Bolso (minutos de descanso)</label>
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="number"
                        step="0.5"
                        min="10"
                        className="input"
                        value={cadence.pocketCooldownMinMinutes}
                        onChange={(e) => setCadence({ ...cadence, pocketCooldownMinMinutes: parseFloat(e.target.value) || 18 })}
                        required
                      />
                      <span className="text-[var(--muted)] text-[11px]">a</span>
                      <input
                        type="number"
                        step="0.5"
                        min="15"
                        className="input"
                        value={cadence.pocketCooldownMaxMinutes}
                        onChange={(e) => setCadence({ ...cadence, pocketCooldownMaxMinutes: parseFloat(e.target.value) || 45 })}
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção 4: Pausas Biológicas (Almoço & Sono Noturno) */}
              <div className="p-3.5 rounded-xl border border-[var(--line)] bg-[var(--sunken)]/50">
                <div className="font-[700] text-[13.5px] text-[var(--ink)]">
                  🍽️ Pausas Biológicas Humanas
                </div>

                {/* Pausa de Almoço */}
                <div className="mt-3 p-3 rounded-lg bg-[var(--surface)] border border-[var(--line)]">
                  <div className="flex items-center justify-between">
                    <label className="font-[600] text-[12.5px] flex items-center gap-2 cursor-pointer" htmlFor="toggle-lunch">
                      <span>🍽️</span> Pausa de Almoço
                    </label>
                    <input
                      id="toggle-lunch"
                      type="checkbox"
                      checked={cadence.lunchPause.enabled}
                      onChange={(e) => setCadence({ ...cadence, lunchPause: { ...cadence.lunchPause, enabled: e.target.checked } })}
                      className="size-4 cursor-pointer"
                    />
                  </div>
                  {cadence.lunchPause.enabled && (
                    <div className="grid grid-cols-2 gap-3 mt-2.5 pt-2 border-t border-[var(--line)]">
                      <div>
                        <span className="text-[11px] text-[var(--muted)]">Início do Almoço</span>
                        <input
                          type="time"
                          className="input mt-1"
                          value={cadence.lunchPause.start}
                          onChange={(e) => setCadence({ ...cadence, lunchPause: { ...cadence.lunchPause, start: e.target.value } })}
                          required
                        />
                      </div>
                      <div>
                        <span className="text-[11px] text-[var(--muted)]">Fim do Almoço</span>
                        <input
                          type="time"
                          className="input mt-1"
                          value={cadence.lunchPause.end}
                          onChange={(e) => setCadence({ ...cadence, lunchPause: { ...cadence.lunchPause, end: e.target.value } })}
                          required
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Sono Noturno */}
                <div className="mt-3 p-3 rounded-lg bg-[var(--surface)] border border-[var(--line)]">
                  <div className="flex items-center justify-between">
                    <label className="font-[600] text-[12.5px] flex items-center gap-2 cursor-pointer" htmlFor="toggle-sleep">
                      <span>🌙</span> Sono Noturno (Conta Dormindo)
                    </label>
                    <input
                      id="toggle-sleep"
                      type="checkbox"
                      checked={cadence.nightSleep.enabled}
                      onChange={(e) => setCadence({ ...cadence, nightSleep: { ...cadence.nightSleep, enabled: e.target.checked } })}
                      className="size-4 cursor-pointer"
                    />
                  </div>
                  {cadence.nightSleep.enabled && (
                    <div className="grid grid-cols-2 gap-3 mt-2.5 pt-2 border-t border-[var(--line)]">
                      <div>
                        <span className="text-[11px] text-[var(--muted)]">Horário de Dormir</span>
                        <input
                          type="time"
                          className="input mt-1"
                          value={cadence.nightSleep.start}
                          onChange={(e) => setCadence({ ...cadence, nightSleep: { ...cadence.nightSleep, start: e.target.value } })}
                          required
                        />
                      </div>
                      <div>
                        <span className="text-[11px] text-[var(--muted)]">Horário de Acordar</span>
                        <input
                          type="time"
                          className="input mt-1"
                          value={cadence.nightSleep.end}
                          onChange={(e) => setCadence({ ...cadence, nightSleep: { ...cadence.nightSleep, end: e.target.value } })}
                          required
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[var(--line)] mt-2">
                <span className="text-[11px] text-[var(--muted)]">
                  Fuso horário ativo: <strong>{cadence.timezone}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" className="btn btn-ghost" onClick={() => setCadenceModalOpen(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={busy !== null}>
                    {busy === "save_cadence" ? "Salvando..." : "Salvar Configurações de Ritmo"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </dialog>
      )}

      {toast.node}
    </div>
  );
}
