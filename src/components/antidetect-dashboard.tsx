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

  // Plataforma Selecionada (Filtro) & Conta em Foco no Radar
  const [selectedPlatformTab, setSelectedPlatformTab] = useState<"all" | "x" | "instagram" | "tiktok">("all");
  const [focusedAccountId, setFocusedAccountId] = useState<string | null>(null);

  // Modal 3: Conexão Manual de Conta
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    platform: "x" as "x" | "instagram" | "tiktok",
    username: "",
    password: "",
    email: "",
    emailPassword: "",
    phone: "",
    authToken: "",
    ct0: "",
    proxy: "",
    twoFactorSecret: "",
    warmupStrategy: "following" as "following" | "hot_niche" | "hybrid",
  });

  // Modal 4: Filtros de Alvo & Interação do Nicho
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<NicheFilters>({
    keywords: "big ass, gostosas, beautiful woman, loirinhas, vazados, modelo, privacy, onlyfans, biquini, decote, sensual, ensaio",
    targetProfiles: "@JulyCardosoCirc, @modelos_brasil, @privacybrasil, @onlyfansbrasil",
    targetLinks: "",
    mirrorOwnReposts: true,
    discoveryMode: "niche",
    autoLike: true,
    autoBookmark: true,
    autoRetweet: true,
    autoVisitProfile: true,
    autoComment: false,
    commentTemplates: "Maravilhosa demais! 🔥\nPerfeita essa foto! 😍\nLinda demais, acompanhando aqui! ❤️",
  });

  // Modal: Dados da Conta & Diagnóstico (3 Pontinhos / Botão Direito)
  const [diagnosticAccount, setDiagnosticAccount] = useState<(PlatformAccount & { config?: BotConfig }) | null>(null);

  // HoloGlobe Telemetry States
  const [floatingPills, setFloatingPills] = useState<FloatingPill[]>([]);

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
  const [drivePostingEnabled, setDrivePostingEnabled] = useState(false);
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

  const fetchDrivePosting = useCallback(async () => {
    try {
      const res = await fetch("/api/drive", { cache: "no-store" });
      const data = await res.json();
      if (data.ok && data.drive) {
        setDrivePostingEnabled(Boolean(data.drive.autoPostingEnabled));
      }
    } catch {}
  }, []);

  // Alternar Ligar / Desligar Postagem de Vídeos do Drive
  async function toggleDrivePosting() {
    setBusy("toggle_drive_posting");
    try {
      const next = !drivePostingEnabled;
      const res = await fetch("/api/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoPostingEnabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setDrivePostingEnabled(Boolean(data.drive.autoPostingEnabled));
      toast.show(
        next
          ? "🚀 Postagens de Vídeos do Drive LIGADAS (Modo Completo)"
          : "🔥 Modo APENAS AQUECIMENTO ATIVO (Vídeos do Drive Pausados)"
      );
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao alternar postagens.");
    } finally {
      setBusy(null);
    }
  }

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
    fetchDrivePosting();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") {
        refresh();
        fetchCadence();
        fetchDrivePosting();
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
          } else if (s.actionType.includes("RETWEET")) {
            pIcon = "🔁";
            pText = `RT ${s.targetProfile || ""}`;
            pColor = "text-teal-400 border-teal-500/50 bg-teal-950/80";
          } else if (s.actionType.includes("SCROLL")) {
            pIcon = "📜";
            pText = "Scroll 380px";
            pColor = "text-sky-400 border-sky-500/50 bg-sky-950/80";
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
    const platform = acc.platform || "x";
    if (selectedPlatformTab !== "all" && platform !== selectedPlatformTab) {
      return false;
    }
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
      toast.show(next ? "⚡ BOT LIGADO!" : "⏸️ BOT DESLIGADO.");
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
          platform: manualForm.platform,
          accounts: [
            {
              platform: manualForm.platform,
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
        platform: "x",
        username: "",
        password: "",
        email: "",
        emailPassword: "",
        phone: "",
        authToken: "",
        ct0: "",
        proxy: "",
        twoFactorSecret: "",
        warmupStrategy: "following",
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

  const focusedAccount = focusedAccountId ? accounts.find((a) => a.id === focusedAccountId) || null : null;
  const activeAccount = focusedAccount || accounts.find((a) => a.status === "warming") || accounts[0] || null;
  const currentActionText = activeAccount?.current_action || (
    status.enabled
      ? (activeAccount?.platform === "instagram"
          ? "Navegando no Instagram: assistindo stories de quem você segue..."
          : activeAccount?.platform === "tiktok"
            ? "Navegando no TikTok: assistindo 70% de vídeo na FYP com jitter..."
            : "Inicializando esteira de aquecimento humano no X...")
      : "Robô pausado."
  );

  function getActionBadge(text: string) {
    if (text.includes("Stories") || text.includes("Story")) {
      return { label: "👁️ VENDO STORIES", bg: "bg-pink-500/20 text-pink-400 border-pink-500/40" };
    }
    if (text.includes("FYP") || text.includes("TikTok")) {
      return { label: "🎵 ROLANDO FYP", bg: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40" };
    }
    if (text.includes("Rolando feed") || text.includes("Scroll")) {
      return { label: "📜 SCROLL FEED", bg: "bg-sky-500/20 text-sky-400 border-sky-500/40" };
    }
    if (text.includes("Acessando perfil") || text.includes("Visitando") || text.includes("Seguindo")) {
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
    <div className="flex flex-col gap-4 w-full max-w-full">
      {/* ============================================================== */}
      {/* 1. MASTER BOT CARD: BOTÃO GERAL DE LIGAR E DESLIGAR VISÍVEL    */}
      {/* ============================================================== */}
      <section
        className={`liquid-glass glass-card panel-pad w-full flex flex-wrap items-center justify-between gap-4 border-2 transition-all ${
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

          {/* INTERRUPTOR CLARO: POSTAR MÍDIAS DO DRIVE */}
          <button
            type="button"
            onClick={toggleDrivePosting}
            disabled={busy === "toggle_drive_posting"}
            className={`px-3.5 py-1.5 rounded-xl text-[12px] font-[700] flex items-center gap-2 border transition-all cursor-pointer shadow-md select-none ${
              drivePostingEnabled
                ? "bg-emerald-950/60 border-emerald-500/60 text-emerald-300 hover:bg-emerald-900/70 shadow-emerald-950/30"
                : "bg-zinc-900/90 border-amber-500/50 text-amber-300 hover:bg-zinc-800"
            }`}
            title="Clique para alternar entre publicar fotos/vídeos do Drive ou apenas aquecer a conta"
          >
            <span className="text-[13px]">{drivePostingEnabled ? "▶️" : "⏸️"}</span>
            <div className="flex flex-col text-left leading-none">
              <span className="text-[9.5px] text-[var(--muted)] uppercase tracking-wider font-mono">
                Mídias Drive
              </span>
              <span className="text-[11.5px] font-[750]">
                {drivePostingEnabled ? "Postar: Ligado" : "Postar: Pausado"}
              </span>
            </div>
            <span
              className={`size-2 rounded-full transition-all ${
                drivePostingEnabled
                  ? "bg-emerald-400 shadow-[0_0_8px_#10b981] animate-pulse"
                  : "bg-amber-400 shadow-[0_0_6px_#f59e0b]"
              }`}
            />
          </button>

          {/* BOTÃO COMPACTO ARREDONDADO (LIGADO / DESLIGADO) */}
          <button
            type="button"
            onClick={toggleMasterEngine}
            disabled={busy === "toggle_master"}
            className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-[650] flex items-center gap-2 border transition-all cursor-pointer shadow-sm select-none ${
              status.enabled
                ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/50 shadow-emerald-950/20"
                : "bg-rose-950/40 border-rose-500/50 text-rose-300 hover:bg-rose-900/50 shadow-rose-950/20"
            }`}
            title={status.enabled ? "Bot ativo. Clique para desligar." : "Bot desligado. Clique para ligar."}
          >
            <span
              className={`size-2 rounded-full transition-all ${
                status.enabled
                  ? "bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse"
                  : "bg-rose-500 shadow-[0_0_8px_#f43f5e]"
              }`}
            />
            <span>{status.enabled ? "Ligado" : "Desligado"}</span>
          </button>
        </div>
      </section>

      {/* ============================================================== */}
      {/* 1.5 CONSOLE VISUAL DE OPERAÇÕES EM TEMPO REAL (MISSION CONTROL) */}
      {/* ============================================================== */}
      <section className="liquid-glass glass-card panel-pad w-full relative overflow-hidden border border-[var(--line)]" data-glass>
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
            {focusedAccount && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                <span>🎯</span> Foco: @{focusedAccount.username}
                <button
                  type="button"
                  onClick={() => setFocusedAccountId(null)}
                  className="ml-1 text-sky-400 hover:text-white"
                  title="Voltar ao Radar Global Multicontas"
                >
                  ✕
                </button>
              </span>
            )}
            <span className="liquid-glass-chip px-2.5 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
              {status.enabled ? "LIVE TELEMETRY" : "IDLE"}
            </span>
            <span
              className={`liquid-glass-chip px-2.5 py-0.5 text-[11px] font-semibold ${
                !drivePostingEnabled
                  ? "text-amber-400 border border-amber-500/30 bg-amber-950/30"
                  : "text-purple-300 border border-purple-500/30 bg-purple-950/30"
              }`}
            >
              {!drivePostingEnabled ? "🔥 APENAS AQUECIMENTO (VÍDEOS PAUSADOS)" : "🚀 AQUECIMENTO + VÍDEOS"}
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
                <span>{focusedAccount ? "🎯 Foco Exclusivo" : "Esteira Multi-Contas"}</span>
                {focusedAccount ? (
                  <button
                    type="button"
                    onClick={() => setFocusedAccountId(null)}
                    className="text-[10px] font-mono text-sky-400 hover:underline cursor-pointer"
                  >
                    Voltar Global ✕
                  </button>
                ) : (
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    {accounts.length} {accounts.length === 1 ? "Perfil" : "Perfis em Massa"}
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2.5">
                <div
                  className={`size-9 rounded-full border flex items-center justify-center font-bold text-[13px] ${
                    activeAccount?.platform === "instagram"
                      ? "bg-gradient-to-tr from-purple-900 to-pink-900 border-pink-500/40 text-pink-300"
                      : activeAccount?.platform === "tiktok"
                        ? "bg-zinc-900 border-cyan-500/40 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.2)]"
                        : "bg-[var(--surface)] border-[var(--line)] text-[var(--accent)]"
                  }`}
                >
                  {activeAccount?.platform === "instagram"
                    ? "📸"
                    : activeAccount?.platform === "tiktok"
                      ? "🎵"
                      : (activeAccount ? activeAccount.username.slice(0, 2).toUpperCase() : "X")}
                </div>
                <div className="min-w-0">
                  <div className="font-[700] text-[13.5px] truncate text-[var(--ink)] flex items-center gap-1.5">
                    <span>{activeAccount ? `@${activeAccount.username}` : "Nenhuma conta"}</span>
                    <span className="text-[9.5px] uppercase font-mono px-1 rounded bg-[var(--surface)] border border-[var(--line)] text-[var(--muted)]">
                      {activeAccount?.platform === "instagram" ? "Insta" : activeAccount?.platform === "tiktok" ? "TikTok" : "Twitter / X"}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--muted)] truncate">
                    {focusedAccount
                      ? "Modo Ativo: Seguindo + Próprio Perfil (Anti-Ban)"
                      : (accounts.length > 1 ? `Rotacionando com +${accounts.length - 1} contas no mesmo bot` : (activeAccount?.display_name || "Perfil Ativo"))}
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
      </section>

      {/* ============================================================== */}
      {/* 1.8 RIBBON DE PLATAFORMAS & MÉTRICAS (Linear / Vercel Style) */}
      {/* ============================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full">
        <div className="liquid-glass rounded-xl p-3 border border-[var(--line)] flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">Total de Perfis</div>
            <div className="text-[19px] font-[800] text-[var(--ink)] mt-0.5">{totalCount}</div>
          </div>
          <div className="size-8 rounded-lg bg-[var(--sunken)] border border-[var(--line)] flex items-center justify-center text-[15px]">
            🌐
          </div>
        </div>

        <div className="liquid-glass rounded-xl p-3 border border-[var(--line)] flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">Twitter / X</div>
            <div className="text-[19px] font-[800] text-sky-400 mt-0.5">
              {accounts.filter((a) => (a.platform || "x") === "x").length}
            </div>
          </div>
          <div className="size-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-[14px] font-bold text-sky-400">
            𝕏
          </div>
        </div>

        <div className="liquid-glass rounded-xl p-3 border border-[var(--line)] flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">Instagram</div>
            <div className="text-[19px] font-[800] text-pink-400 mt-0.5">
              {accounts.filter((a) => a.platform === "instagram").length}
            </div>
          </div>
          <div className="size-8 rounded-lg bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-[14px]">
            📸
          </div>
        </div>

        <div className="liquid-glass rounded-xl p-3 border border-[var(--line)] flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-bold text-[var(--muted)] tracking-wider">TikTok</div>
            <div className="text-[19px] font-[800] text-cyan-400 mt-0.5">
              {accounts.filter((a) => a.platform === "tiktok").length}
            </div>
          </div>
          <div className="size-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-[14px]">
            🎵
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. BARRA DE FERRAMENTAS: BUSCA + PLATAFORMAS + BOTÕES          */}
      {/* ============================================================== */}
      <div className="liquid-glass glass-card panel-pad w-full flex flex-col sm:flex-row flex-wrap items-center justify-between gap-3" data-glass>
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <div className="relative w-full sm:w-[220px]">
            <input
              type="text"
              className="input h-9 text-[13px] pl-3 w-full"
              placeholder="Buscar conta ou proxy..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* SELETOR DE ABAS DE PLATAFORMAS */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--sunken)] border border-[var(--line)] overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setSelectedPlatformTab("all")}
              className={`px-3 py-1 rounded-lg text-[12px] font-[650] transition-all cursor-pointer whitespace-nowrap ${
                selectedPlatformTab === "all"
                  ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm border border-[var(--line)]"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              Todas ({accounts.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedPlatformTab("x")}
              className={`px-3 py-1 rounded-lg text-[12px] font-[650] transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                selectedPlatformTab === "x"
                  ? "bg-zinc-900 text-white shadow-sm border border-zinc-700"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              <span>𝕏</span> Twitter ({accounts.filter((a) => (a.platform || "x") === "x").length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedPlatformTab("instagram")}
              className={`px-3 py-1 rounded-lg text-[12px] font-[650] transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                selectedPlatformTab === "instagram"
                  ? "bg-gradient-to-r from-purple-900 to-pink-900 text-pink-200 shadow-sm border border-pink-500/40"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              <span>📸</span> Instagram ({accounts.filter((a) => a.platform === "instagram").length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedPlatformTab("tiktok")}
              className={`px-3 py-1 rounded-lg text-[12px] font-[650] transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                selectedPlatformTab === "tiktok"
                  ? "bg-zinc-900 text-cyan-300 shadow-sm border border-cyan-500/40"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              <span>🎵</span> TikTok ({accounts.filter((a) => a.platform === "tiktok").length})
            </button>
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
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. RESUMO DOS FILTROS DO NICHO ATIVOS                          */}
      {/* ============================================================== */}
      <div className="sunken w-full px-4 py-2.5 text-[12.5px] flex flex-wrap items-center justify-between gap-2 border border-[var(--line)]">
        <div className="flex items-center gap-2 truncate">
          <span className="font-[650] text-[var(--accent)]">🎯 Alvos Ativos:</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold">NICHO HOT</span>
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
      <div className="panel overflow-hidden border border-[var(--line)] w-full">
        <div className="overflow-x-auto w-full">
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
                <th className="p-3 w-14 text-center select-none" title="Dados e Diagnóstico da Conta">⋯</th>
                <th className="p-3 min-w-[130px]">Plataforma</th>
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
                  <td colSpan={13} className="p-8 text-center text-[var(--ink-2)]">
                    Nenhuma conta cadastrada nesta visualização. Clique em <strong>+ Conectar Manual</strong> para adicionar sua conta.
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
                        focusedAccountId === acc.id
                          ? "border-l-4 border-l-sky-500 bg-sky-950/20"
                          : isSelected
                            ? "bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]"
                            : ""
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

                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDiagnosticAccount(acc);
                          }}
                          className="btn btn-xs btn-ghost border border-[var(--line)] hover:border-sky-500 hover:text-sky-400 font-bold px-2 py-0.5 rounded-lg text-[13px] transition-colors"
                          title="Ver Dados & Diagnóstico Completo da Conta"
                        >
                          ⋯
                        </button>
                      </td>

                      {/* PLATAFORMA BADGE */}
                      <td className="p-3 whitespace-nowrap">
                        {acc.platform === "instagram" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-[700] bg-gradient-to-r from-purple-900/40 via-pink-900/40 to-amber-900/40 border border-pink-500/30 text-pink-300">
                            <span>📸</span> Instagram
                          </span>
                        ) : acc.platform === "tiktok" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-[700] bg-zinc-900 border border-cyan-500/40 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.15)]">
                            <span>🎵</span> TikTok
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-[700] bg-zinc-900 border border-zinc-700 text-zinc-200">
                            <span>𝕏</span> Twitter
                          </span>
                        )}
                      </td>

                      <td className="p-3 font-[600] text-[var(--ink)]">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setFocusedAccountId(focusedAccountId === acc.id ? null : acc.id)}
                            className="hover:text-sky-400 font-[700] cursor-pointer flex items-center gap-1.5 transition-colors text-left"
                            title="Clique para alternar o foco do Radar nesta conta"
                          >
                            <span>@{acc.username}</span>
                            {focusedAccountId === acc.id && (
                              <span className="size-2 rounded-full bg-sky-400 animate-pulse" title="Em foco no Radar" />
                            )}
                          </button>
                          {!acc.auth_token && acc.access_token === "placeholder" && (
                            <span
                              className="text-[10px] text-amber-400 font-normal cursor-pointer hover:underline"
                              onClick={() => {
                                setEditingTokenAccount(acc);
                                setTokenModalOpen(true);
                              }}
                              title="Clique para adicionar auth_token e habilitar ações reais"
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
      <section className="panel panel-pad w-full" aria-label="Radar de Ações">
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
          <div className="px-3 py-1.5 border-b border-[var(--line)] text-[11.5px] font-[600] text-[var(--muted)] flex items-center justify-between">
            <span>@{contextMenu.account.username}</span>
            <span className="text-[10px] text-sky-400 font-mono">OPÇÕES</span>
          </div>

          <button
            type="button"
            className="w-full text-left px-3 py-2 rounded hover:bg-sky-500/10 flex items-center gap-2 transition-colors text-sky-400 font-[700] border-b border-[var(--line)]"
            onClick={() => {
              setDiagnosticAccount(contextMenu.account!);
              setContextMenu((prev) => ({ ...prev, visible: false }));
            }}
          >
            <span>📊</span> Dados da Conta & Diagnóstico
          </button>

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
      {/* 6.5 MODAL: DADOS DA CONTA & DIAGNÓSTICO (3 PONTINHOS / BOTÃO DIREITO) */}
      {/* ============================================================== */}
      {diagnosticAccount && (() => {
        const diagConnected = diagnosticAccount.connected_at
          ? new Date(diagnosticAccount.connected_at).getTime()
          : Date.now() - 3.5 * 86400000;
        const diagElapsedMs = Math.max(0, Date.now() - diagConnected);
        const diagDays = Math.max(1, Math.floor(diagElapsedMs / (1000 * 60 * 60 * 24)));
        const diagRemainderHours = Math.min(14.5, (diagElapsedMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const diagTotalHours = ((diagDays - 1) * 14.5 + diagRemainderHours).toFixed(1);

        const diagIsActive = diagnosticAccount.is_active && !diagnosticAccount.paused;
        const diagHasRestriction = Boolean(
          diagnosticAccount.error_message?.toLowerCase().includes("rate") ||
          diagnosticAccount.error_message?.toLowerCase().includes("limit") ||
          diagnosticAccount.error_message?.toLowerCase().includes("restriction") ||
          diagnosticAccount.status === "challenge" ||
          diagnosticAccount.status === "rate_limited"
        );
        const diagHasDropped = Boolean(
          diagnosticAccount.status === "die" ||
          diagnosticAccount.status === "error" ||
          (diagnosticAccount.error_message && !diagHasRestriction)
        );

        return (
          <dialog open className="sheet">
            <div className="panel-pad max-w-[660px] w-full border-2 border-sky-500/40 shadow-2xl bg-[var(--surface)] text-[var(--ink)]">
              {/* Topo / Header */}
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-3.5">
                <div className="flex items-center gap-3">
                  <div className="size-11 rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center font-bold text-[18px]">
                    📊
                  </div>
                  <div>
                    <h2 className="text-[18px] font-[750] tracking-tight flex items-center gap-2">
                      <span>Dados & Diagnóstico da Conta</span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
                        NICHO HOT
                      </span>
                    </h2>
                    <p className="text-[12.5px] text-[var(--ink-2)] mt-0.5">
                      Perfil: <strong className="text-[var(--ink)]">@{diagnosticAccount.username}</strong>
                      {diagnosticAccount.display_name ? ` · ${diagnosticAccount.display_name}` : ""}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setDiagnosticAccount(null)}
                >
                  <IconX size={16} />
                </button>
              </div>

              {/* Corpo com Métricas Principais */}
              <div className="mt-4 flex flex-col gap-3.5 text-[13px] max-h-[75vh] overflow-y-auto pr-1">
                {/* 1. Grade 4 Métricas de Desempenho e Aquecimento */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {/* Dias Aquecendo */}
                  <div className="p-3 rounded-xl border border-sky-500/25 bg-sky-950/15 flex flex-col justify-between">
                    <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
                      Dias Aquecendo
                    </span>
                    <div className="text-[22px] font-[800] text-sky-400 num mt-1">
                      {diagDays} <span className="text-[12px] font-normal text-sky-300">dias</span>
                    </div>
                    <span className="text-[10px] text-sky-300/80 mt-1">
                      Esteira contínua
                    </span>
                  </div>

                  {/* Horas Totais */}
                  <div className="p-3 rounded-xl border border-indigo-500/25 bg-indigo-950/15 flex flex-col justify-between">
                    <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
                      Horas Aquecendo
                    </span>
                    <div className="text-[22px] font-[800] text-indigo-400 num mt-1">
                      {diagTotalHours} <span className="text-[12px] font-normal text-indigo-300">h</span>
                    </div>
                    <span className="text-[10px] text-indigo-300/80 mt-1">
                      Ciclo circadiano
                    </span>
                  </div>

                  {/* Status da Conta */}
                  <div className={`p-3 rounded-xl border flex flex-col justify-between ${
                    diagIsActive
                      ? "border-emerald-500/25 bg-emerald-950/15"
                      : "border-rose-500/25 bg-rose-950/15"
                  }`}>
                    <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
                      Status da Conta
                    </span>
                    <div className={`text-[15px] font-[750] mt-1 flex items-center gap-1.5 ${
                      diagIsActive ? "text-emerald-400" : "text-rose-400"
                    }`}>
                      <span className={`size-2.5 rounded-full ${diagIsActive ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`} />
                      {diagIsActive ? "ATIVA" : "INATIVA"}
                    </div>
                    <span className="text-[10px] text-[var(--muted)] mt-1">
                      {(diagnosticAccount.status || "live").toUpperCase()}
                    </span>
                  </div>

                  {/* Ações Hoje */}
                  <div className="p-3 rounded-xl border border-purple-500/25 bg-purple-950/15 flex flex-col justify-between">
                    <span className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
                      Ações Hoje
                    </span>
                    <div className="text-[22px] font-[800] text-purple-400 num mt-1">
                      {diagnosticAccount.actions_today || 0}
                    </div>
                    <span className="text-[10px] text-purple-300/80 mt-1">
                      Interações orgânicas
                    </span>
                  </div>
                </div>

                {/* 2. Diagnóstico de Restrições e Shadowban */}
                <div className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                  diagHasRestriction
                    ? "border-amber-500/40 bg-amber-950/20 text-amber-200"
                    : "border-emerald-500/30 bg-emerald-950/10 text-emerald-300"
                }`}>
                  <span className="text-[20px] shrink-0 mt-0.5">
                    {diagHasRestriction ? "⚠️" : "🛡️"}
                  </span>
                  <div>
                    <div className="font-[750] text-[13.5px] flex items-center gap-2">
                      <span>Restrições & Shadowban do X:</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-mono font-bold ${
                        diagHasRestriction
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      }`}>
                        {diagHasRestriction ? "RESTRIÇÃO ENCONTRADA" : "CONTA 100% LIMPA"}
                      </span>
                    </div>
                    <p className="text-[12px] text-[var(--ink-2)] mt-1 leading-relaxed">
                      {diagHasRestriction
                        ? `Atenção: Foi detectada restrição temporária (${diagnosticAccount.error_message || "Rate limit ou confirmação pendente"}). O robô aguarda o cooldown seguro para proteger a conta.`
                        : "Nenhum shadowban, bloqueio de busca, limite de requisições ou restrição foi detectado. Sua conta possui excelente saúde algorítmica no X."}
                    </p>
                  </div>
                </div>

                {/* 3. Conexão e Quedas da Conta */}
                <div className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                  diagHasDropped
                    ? "border-rose-500/40 bg-rose-950/20 text-rose-200"
                    : "border-emerald-500/30 bg-emerald-950/10 text-emerald-300"
                }`}>
                  <span className="text-[20px] shrink-0 mt-0.5">
                    {diagHasDropped ? "🔴" : "🟢"}
                  </span>
                  <div>
                    <div className="font-[750] text-[13.5px] flex items-center gap-2">
                      <span>Estabilidade da Sessão & Quedas:</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-mono font-bold ${
                        diagHasDropped
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                          : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      }`}>
                        {diagHasDropped ? "FALHA / CONEXÃO CAÍDA" : "ZERO QUEDAS · CONEXÃO ESTÁVEL"}
                      </span>
                    </div>
                    <p className="text-[12px] text-[var(--ink-2)] mt-1 leading-relaxed">
                      {diagHasDropped
                        ? `Erro detectado: "${diagnosticAccount.error_message || "Sessão expirou ou proxy inacessível"}". Clique em 'Checar Conexão' ou faça login novamente.`
                        : "Sessão estável e autenticada. A conexão não caiu, os cookies e tokens permanecem válidos e o Chrome isolado está sincronizado."}
                    </p>
                  </div>
                </div>

                {/* 4. Ação ao Vivo Atual e Calibração no Nicho Hot */}
                <div className="p-3.5 rounded-xl border border-[var(--line)] bg-[var(--sunken)]/60 space-y-2">
                  <div className="flex items-center justify-between text-[12.5px] font-[700] text-[var(--ink)]">
                    <span className="flex items-center gap-1.5">
                      <span>⚡</span> Ação ao Vivo no Momento:
                    </span>
                    <span className="text-[11px] font-mono text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                      TELEMETRIA
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[var(--surface)] border border-[var(--line)] text-[12px] text-[var(--ink)] font-mono leading-relaxed">
                    {diagnosticAccount.current_action || "Aguardando próximo ciclo de aquecimento orgânico..."}
                  </div>
                  <p className="text-[11.5px] text-[var(--muted)]">
                    O robô analisa os posts do Nicho Hot (palavras-chave: <em>{filters.keywords.slice(0, 75)}...</em>) e interage organicamente para moldar o feed &quot;Para Você&quot;.
                  </p>
                </div>

                {/* 5. Dados de Credenciais e Isolamento */}
                <div className="p-3.5 rounded-xl border border-[var(--line)] bg-[var(--sunken)]/40">
                  <div className="font-[700] text-[12.5px] text-[var(--ink)] mb-2.5">
                    🛡️ Detalhes de Isolamento & Credenciais
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
                    <div className="p-2 rounded bg-[var(--surface)] border border-[var(--line)] flex justify-between items-center">
                      <span className="text-[var(--muted)]">E-mail:</span>
                      <span className="font-mono text-[var(--ink)] truncate max-w-[180px]">
                        {diagnosticAccount.email || "Não informado"}
                      </span>
                    </div>
                    <div className="p-2 rounded bg-[var(--surface)] border border-[var(--line)] flex justify-between items-center">
                      <span className="text-[var(--muted)]">Telefone:</span>
                      <span className="font-mono text-[var(--ink)]">
                        {diagnosticAccount.phone || "Não informado"}
                      </span>
                    </div>
                    <div className="p-2 rounded bg-[var(--surface)] border border-[var(--line)] flex justify-between items-center">
                      <span className="text-[var(--muted)]">Proxy / IP:</span>
                      <span className="font-mono text-[var(--ink)] truncate max-w-[180px]">
                        {diagnosticAccount.proxy || "IP Residencial Direto"}
                      </span>
                    </div>
                    <div className="p-2 rounded bg-[var(--surface)] border border-[var(--line)] flex justify-between items-center">
                      <span className="text-[var(--muted)]">Autenticação:</span>
                      <span className="text-emerald-400 font-semibold">
                        {diagnosticAccount.auth_token ? "Token Ativo (API Oficial)" : "Sessão Conectada"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rodapé com Ações Rápidas */}
              <div className="mt-4 pt-3 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleCheckAccount(diagnosticAccount);
                    }}
                    className="btn btn-sm btn-glass text-sky-400 font-[600]"
                  >
                    <span>🔄</span> Checar Conexão Agora
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenChrome(diagnosticAccount);
                    }}
                    className="btn btn-sm btn-glass font-[600]"
                  >
                    <span>🌐</span> Abrir no Navegador Isolado
                  </button>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => setDiagnosticAccount(null)}
                >
                  Fechar
                </button>
              </div>
            </div>
          </dialog>
        );
      })()}

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
                  placeholder={"https://x.com/JulyCardosoCirc/status/189283921000\nhttps://x.com/modelos_brasil/status/189283944000"}
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
                  Palavras-chave e Hashtags do Nicho Hot (separadas por vírgula)
                </label>
                <input
                  id="f-keywords"
                  className="input mt-1"
                  value={filters.keywords}
                  onChange={(e) => setFilters({ ...filters, keywords: e.target.value })}
                  placeholder="big ass, gostosas, beautiful woman, loirinhas, vazados, modelo, privacy, onlyfans, biquini, decote, sensual, ensaio"
                  required
                />
                <p className="text-[11px] text-[var(--muted)] mt-1">
                  O bot pesquisa essas palavras-chave e analisa o feed para encontrar posts similares aos da sua modelo, calibrando o algoritmo para o Nicho Hot.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="f-profiles">
                  Perfis de Referência do Nicho Hot (separados por vírgula)
                </label>
                <input
                  id="f-profiles"
                  className="input mt-1"
                  value={filters.targetProfiles}
                  onChange={(e) => setFilters({ ...filters, targetProfiles: e.target.value })}
                  placeholder="@JulyCardosoCirc, @modelos_brasil, @privacybrasil, @onlyfansbrasil"
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
              {/* ESCOLHA DA PLATAFORMA */}
              <div>
                <label className="label text-[11px] uppercase tracking-wider font-bold">
                  Plataforma da Conta *
                </label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setManualForm({ ...manualForm, platform: "x" })}
                    className={`px-3 py-2 rounded-xl text-[12px] font-[650] border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      manualForm.platform === "x"
                        ? "bg-zinc-900 border-zinc-600 text-white shadow-sm"
                        : "bg-[var(--sunken)] border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <span>𝕏</span> Twitter
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualForm({ ...manualForm, platform: "instagram" })}
                    className={`px-3 py-2 rounded-xl text-[12px] font-[650] border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      manualForm.platform === "instagram"
                        ? "bg-gradient-to-r from-purple-900/60 to-pink-900/60 border-pink-500/50 text-pink-200 shadow-sm"
                        : "bg-[var(--sunken)] border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <span>📸</span> Instagram
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualForm({ ...manualForm, platform: "tiktok" })}
                    className={`px-3 py-2 rounded-xl text-[12px] font-[650] border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      manualForm.platform === "tiktok"
                        ? "bg-zinc-900 border-cyan-500/50 text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                        : "bg-[var(--sunken)] border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <span>🎵</span> TikTok
                  </button>
                </div>
              </div>

              {/* ESTRATÉGIA DE AQUECIMENTO */}
              <div>
                <label className="label text-[11px] uppercase tracking-wider font-bold">
                  Estratégia de Aquecimento Humano
                </label>
                <select
                  className="input mt-1 text-[12.5px] cursor-pointer"
                  value={manualForm.warmupStrategy}
                  onChange={(e) =>
                    setManualForm({
                      ...manualForm,
                      warmupStrategy: e.target.value as "following" | "hot_niche" | "hybrid",
                    })
                  }
                >
                  <option value="following">⭐ Seguindo + Próprio Perfil (Recomendado Anti-Ban)</option>
                  <option value="hybrid">⚡ Híbrido (Seguindo + Nicho Hot Global)</option>
                  <option value="hot_niche">🔥 Apenas Busca Nicho Hot</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="m-user">
                    Username / @ da Conta *
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
                    Senha da Conta
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
                <span className="label text-[11.5px] text-[var(--accent)] font-semibold">
                  {manualForm.platform === "instagram"
                    ? "Cookies do Instagram & 2FA (Sessão Anti-Detect)"
                    : manualForm.platform === "tiktok"
                      ? "Cookies do TikTok (Sessão Anti-Detect)"
                      : "Login Instantâneo por Cookie do X (Opcional)"}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1.5">
                  <div>
                    <label className="label text-[11px]" htmlFor="m-token">
                      {manualForm.platform === "instagram"
                        ? "sessionid (Cookie Instagram)"
                        : manualForm.platform === "tiktok"
                          ? "sessionid (Cookie TikTok)"
                          : "auth_token (Cookie do X)"}
                    </label>
                    <input
                      id="m-token"
                      className="input mt-1 text-[12px] font-mono"
                      placeholder={
                        manualForm.platform === "instagram"
                          ? "sessionid do Instagram..."
                          : manualForm.platform === "tiktok"
                            ? "sessionid do TikTok..."
                            : "40 caracteres hex..."
                      }
                      value={manualForm.authToken}
                      onChange={(e) => setManualForm({ ...manualForm, authToken: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label text-[11px]" htmlFor="m-ct0">
                      {manualForm.platform === "instagram"
                        ? "Chave Secreta 2FA (TOTP de 32 letras)"
                        : manualForm.platform === "tiktok"
                          ? "msToken (Token de Sessão TikTok)"
                          : "ct0 (CSRF token)"}
                    </label>
                    <input
                      id="m-ct0"
                      className="input mt-1 text-[12px] font-mono"
                      placeholder={
                        manualForm.platform === "instagram"
                          ? "Ex: JBSWY3DPEHPK3PXP..."
                          : manualForm.platform === "tiktok"
                            ? "msToken..."
                            : "160 caracteres..."
                      }
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
