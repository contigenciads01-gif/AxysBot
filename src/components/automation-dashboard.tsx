"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type {
  AutomationTask,
  AutomationTaskType,
  EngineStatus,
  PlatformAccount,
  BotConfig,
  ActionLog,
} from "@/engine/types";
import { BarChart } from "./charts";
import {
  IconBot,
  IconCheck,
  IconPause,
  IconPlay,
  IconSync,
  IconX,
  IconEscrever,
  IconRepost,
  IconResposta,
} from "./icons";
import { useToast } from "./toast";
import { fmtNum, fmtRelative, fmtShortDate, fmtTime } from "@/lib/format";

interface Props {
  initialStatus: EngineStatus;
  initialAccounts: Array<PlatformAccount & { config?: BotConfig }>;
}

export function AutomationDashboard({ initialStatus, initialAccounts }: Props) {
  const toast = useToast();
  const [, startTransition] = useTransition();

  // Estados principais
  const [status, setStatus] = useState<EngineStatus>(initialStatus);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    initialAccounts[0]?.id || ""
  );
  const [tasks, setTasks] = useState<AutomationTask[]>([]);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Modal de Nova Tarefa
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskType, setTaskType] = useState<AutomationTaskType>("post");
  const [taskText, setTaskText] = useState("");
  const [threadItems, setThreadItems] = useState<string[]>(["", ""]);
  const [targetPostId, setTargetPostId] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");

  // Modal de Confirmação Obrigatória
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [pendingTaskData, setPendingTaskData] = useState<{
    accountId: string;
    type: AutomationTaskType;
    payload: Record<string, unknown>;
    scheduledFor?: string | null;
  } | null>(null);

  // Modal de Conectar Conta
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [manualHandle, setManualHandle] = useState("");
  const [manualToken, setManualToken] = useState("");
  const [oauthClientId, setOauthClientId] = useState("");

  // Polling automático
  const refresh = useCallback(async () => {
    try {
      const [statusRes, accsRes, tasksRes, logsRes] = await Promise.all([
        fetch("/api/automation/status", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/automation/accounts", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/automation/tasks?limit=30", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/automation/logs?limit=30", { cache: "no-store" }).then((r) => r.json()),
      ]);

      startTransition(() => {
        if (statusRes.ok && statusRes.status) setStatus(statusRes.status);
        if (accsRes.ok && accsRes.accounts) {
          setAccounts(accsRes.accounts);
          if (!selectedAccountId && accsRes.accounts.length > 0) {
            setSelectedAccountId(accsRes.accounts[0].id);
          }
        }
        if (tasksRes.ok && tasksRes.tasks) setTasks(tasksRes.tasks);
        if (logsRes.ok && logsRes.logs) setLogs(logsRes.logs);
      });
    } catch {
      // Falha de rede temporária engolida
    }
  }, [selectedAccountId]);

  useEffect(() => {
    refresh();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 12_000);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  // LIGAR / DESLIGAR Bot Geral
  async function toggleEngine() {
    setBusy("toggle");
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
      toast.show(next ? "⚡ Motor de Automação LIGADO!" : "⏸️ Motor de Automação DESLIGADO.");
      await refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao alterar estado do bot.");
    } finally {
      setBusy(null);
    }
  }

  // Executar Fila Agora
  async function runWorkerNow() {
    setBusy("worker");
    try {
      const res = await fetch("/api/automation/worker", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message);

      if (data.result?.worker) {
        const { completed, failed, rateLimited } = data.result.worker;
        toast.show(`Processamento concluído: ${completed} sucesso, ${failed} falhas, ${rateLimited} cota.`);
      } else {
        toast.show(data.message || "Fila processada.");
      }
      await refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Falha ao rodar fila.");
    } finally {
      setBusy(null);
    }
  }

  // Alternar pausa de conta individual
  async function toggleAccountPause(accId: string, currentPaused: boolean) {
    try {
      const res = await fetch(`/api/automation/accounts/${accId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !currentPaused }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.show(!currentPaused ? "Conta pausada" : "Conta retomada");
      await refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao atualizar conta.");
    }
  }

  // Preparar envio de tarefa (abre confirmação)
  function handleOpenConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAccountId) {
      toast.show("Selecione uma conta ativa primeiro.");
      return;
    }

    let payload: Record<string, unknown> = {};

    if (taskType === "post") {
      if (!taskText.trim()) {
        toast.show("Digite o texto da publicação.");
        return;
      }
      payload = { text: taskText.trim() };
    } else if (taskType === "thread") {
      const items = threadItems.map((s) => s.trim()).filter(Boolean);
      if (items.length < 2) {
        toast.show("A thread precisa de pelo menos 2 publicações.");
        return;
      }
      payload = { items };
    } else if (taskType === "reply") {
      if (!targetPostId.trim() || !taskText.trim()) {
        toast.show("Preencha o link/ID do post e o texto da resposta.");
        return;
      }
      payload = { post_id: targetPostId.replace(/\D/g, ""), text: taskText.trim() };
    } else if (taskType === "repost") {
      if (!targetPostId.trim()) {
        toast.show("Preencha o link/ID do post a ser repostado.");
        return;
      }
      payload = { post_id: targetPostId.replace(/\D/g, "") };
    }

    setPendingTaskData({
      accountId: selectedAccountId,
      type: taskType,
      payload,
      scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
    });

    setTaskModalOpen(false);
    setConfirmModalOpen(true);
  }

  // Confirmar e Enviar Tarefa
  async function executeConfirmedTask() {
    if (!pendingTaskData) return;
    setBusy("create_task");

    try {
      const res = await fetch("/api/automation/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...pendingTaskData,
          confirmed: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.show("✅ Tarefa enfileirada com sucesso!");
      setConfirmModalOpen(false);
      setPendingTaskData(null);
      setTaskText("");
      setTargetPostId("");
      setThreadItems(["", ""]);
      setScheduledFor("");
      await refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao agendar tarefa.");
    } finally {
      setBusy(null);
    }
  }

  // Cancelar Tarefa
  async function cancelTask(taskId: string) {
    try {
      const res = await fetch(`/api/automation/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.show("Tarefa cancelada.");
      await refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao cancelar tarefa.");
    }
  }

  // Conectar conta manual
  async function handleManualConnect(e: React.FormEvent) {
    e.preventDefault();
    setBusy("connect");
    try {
      const res = await fetch("/api/automation/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manual_connect",
          username: manualHandle,
          accessToken: manualToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.show(`Conta @${data.account.username} conectada!`);
      setConnectModalOpen(false);
      setManualHandle("");
      setManualToken("");
      await refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao conectar conta.");
    } finally {
      setBusy(null);
    }
  }

  // Conectar via OAuth 2.0 PKCE
  async function handleOAuthConnect() {
    setBusy("oauth");
    try {
      const res = await fetch("/api/automation/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "oauth_url",
          clientId: oauthClientId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.url) {
        if (data.codeVerifier) {
          document.cookie = `axys_pkce=${data.codeVerifier}; path=/; max-age=600; SameSite=Lax`;
        }
        window.location.href = data.url;
      }
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao iniciar OAuth.");
    } finally {
      setBusy(null);
    }
  }

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      {/* ============================================================== */}
      {/* 1. HERO MASTER CARD: BOTÃO GERAL DE LIGAR E DESLIGAR           */}
      {/* ============================================================== */}
      <section
        className="liquid-glass glass-card panel-pad flex flex-wrap items-center justify-between gap-4 border-2 transition-all"
        style={{
          borderColor: status.enabled
            ? "color-mix(in oklab, var(--ok) 40%, var(--line))"
            : "color-mix(in oklab, var(--warn) 40%, var(--line))",
        }}
        data-glass
      >
        <div className="flex items-center gap-4 min-w-0">
          <div
            className="size-12 rounded-full grid place-items-center shrink-0"
            style={{
              backgroundColor: status.enabled
                ? "color-mix(in oklab, var(--ok) 18%, transparent)"
                : "color-mix(in oklab, var(--warn) 18%, transparent)",
              color: status.enabled ? "var(--ok)" : "var(--warn)",
            }}
          >
            <IconBot size={26} />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span
                className={`dot ${status.enabled ? "dot-live" : ""}`}
                style={{ color: status.enabled ? "var(--ok)" : "var(--warn)" }}
              />
              <h1 className="text-[19px] font-[680] tracking-[-.02em]">
                {status.enabled ? "Motor de Automação Ativo" : "Motor de Automação Desligado"}
              </h1>
            </div>
            <p className="text-[13px] text-[var(--ink-2)] mt-0.5">
              {status.enabled
                ? `${status.active_accounts} conta(s) em operação · ${status.pending_tasks} tarefa(s) na fila`
                : "O bot está pausado. Nenhuma ação será executada até você ligar."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 ml-auto">
          <button
            type="button"
            className="btn btn-glass"
            onClick={runWorkerNow}
            disabled={busy !== null || !status.enabled}
            title="Executa agora as tarefas da fila sem esperar o agendador"
          >
            <IconSync size={15} className={busy === "worker" ? "animate-spin" : ""} />
            Rodar Fila Agora
          </button>

          <button
            type="button"
            onClick={toggleEngine}
            disabled={busy !== null}
            className={`btn text-[14px] px-5 h-11 font-[650] ${
              status.enabled
                ? "bg-[var(--bad)] text-white hover:opacity-90"
                : "btn-primary shadow-lg"
            }`}
          >
            {status.enabled ? (
              <>
                <IconPause size={17} /> DESLIGAR BOT
              </>
            ) : (
              <>
                <IconPlay size={17} /> LIGAR BOT
              </>
            )}
          </button>
        </div>
      </section>

      {/* AVISO DE SEGURANÇA: Zero contas ativas */}
      {status.active_accounts === 0 && (
        <div className="rounded-[var(--radius)] border border-[color-mix(in_oklab,var(--warn)_45%,var(--line))] bg-[color-mix(in_oklab,var(--warn)_8%,transparent)] p-4 text-[13.5px]">
          <strong className="text-[var(--warn)] font-[620]">
            Aviso de Proteção:
          </strong>{" "}
          O bot não executa ações sem contas ativas conectadas. Conecte sua conta do X abaixo para iniciar o aquecimento e automação.
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. CARDS DE MÉTRICAS RÁPIDAS                                   */}
      {/* ============================================================== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="panel panel-pad">
          <span className="label">Concluídas Hoje</span>
          <div className="num text-[24px] font-[650] mt-1 text-[var(--ok)]">
            {fmtNum(status.completed_today)}
          </div>
        </div>
        <div className="panel panel-pad">
          <span className="label">Falhas Hoje</span>
          <div className="num text-[24px] font-[650] mt-1 text-[var(--bad)]">
            {fmtNum(status.failed_today)}
          </div>
        </div>
        <div className="panel panel-pad">
          <span className="label">Na Fila</span>
          <div className="num text-[24px] font-[650] mt-1 text-[var(--accent)]">
            {fmtNum(status.pending_tasks)}
          </div>
        </div>
        <div className="panel panel-pad">
          <span className="label">Último Disparo</span>
          <div className="num text-[14px] font-[550] mt-2 text-[var(--ink-2)] truncate">
            {status.last_run_at ? fmtRelative(status.last_run_at, now) : "Nenhum ainda"}
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. GRID PRINCIPAL: CONTAS + TAREFAS + FEED                     */}
      {/* ============================================================== */}
      <div className="grid gap-[var(--gap)] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-start">
        {/* COLUNA ESQUERDA */}
        <div className="flex flex-col gap-[var(--gap)] min-w-0">
          {/* SEÇÃO: CONTAS CONECTADAS */}
          <section className="panel panel-pad" aria-label="Contas Conectadas">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <h2 className="h2">Contas Conectadas ({accounts.length})</h2>
                <p className="text-[12.5px] text-[var(--ink-2)] mt-0.5">
                  Cada conta tem suas próprias credenciais isoladas e criptografadas.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setConnectModalOpen(true)}
              >
                + Conectar Conta
              </button>
            </div>

            {accounts.length === 0 ? (
              <div className="sunken px-4 py-6 mt-4 text-center text-[13px] text-[var(--ink-2)]">
                Nenhuma conta conectada ao motor. Clique em <strong>+ Conectar Conta</strong> para autorizar o bot.
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-2.5">
                {accounts.map((acc) => {
                  const isSelected = acc.id === selectedAccountId;
                  return (
                    <div
                      key={acc.id}
                      onClick={() => setSelectedAccountId(acc.id)}
                      className={`cursor-pointer rounded-[var(--radius)] border p-3 transition-colors ${
                        isSelected
                          ? "border-[var(--accent)] bg-[var(--sunken)]"
                          : "border-[var(--line)] hover:border-[var(--line-strong)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="size-9 rounded-full bg-[var(--accent-wash)] text-[var(--accent)] font-[650] grid place-items-center shrink-0">
                            {acc.username[0]?.toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <div className="font-[620] text-[14px] truncate">
                              @{acc.username}
                            </div>
                            <div className="text-[12px] text-[var(--muted)] flex items-center gap-2">
                              <span className="tag capitalize">{acc.stage}</span>
                              <span>
                                {acc.paused ? "⏸️ Pausada" : "🟢 Ativa"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleAccountPause(acc.id, acc.paused);
                            }}
                          >
                            {acc.paused ? "Retomar" : "Pausar"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* SEÇÃO: FILA DE TAREFAS */}
          <section className="panel panel-pad" aria-label="Fila de Tarefas">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <h2 className="h2">Fila de Automação ({tasks.length})</h2>
                <p className="text-[12.5px] text-[var(--ink-2)] mt-0.5">
                  Tarefas aguardando execução ou agendadas.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setTaskModalOpen(true)}
                disabled={accounts.length === 0}
              >
                + Nova Tarefa
              </button>
            </div>

            {tasks.length === 0 ? (
              <div className="sunken px-4 py-6 mt-4 text-center text-[13px] text-[var(--ink-2)]">
                Fila de tarefas vazia. Clique em <strong>+ Nova Tarefa</strong> para programar publicações, threads ou respostas.
              </div>
            ) : (
              <ul className="mt-3 divide">
                {tasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-start justify-between gap-3 py-2.5 text-[13px]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="tag uppercase">{task.task_type}</span>
                        <span
                          className={`text-[11.5px] font-[600] ${
                            task.status === "completed"
                              ? "text-[var(--ok)]"
                              : task.status === "failed"
                              ? "text-[var(--bad)]"
                              : task.status === "processing"
                              ? "text-[var(--accent)]"
                              : "text-[var(--muted)]"
                          }`}
                        >
                          {task.status}
                        </span>
                        <span className="text-[12px] text-[var(--muted)] num">
                          {fmtTime(task.scheduled_for)}
                        </span>
                      </div>
                      <p className="text-[13px] text-[var(--ink)] mt-1 truncate">
                        {task.payload.text || (task.payload.items as string[])?.[0] || "Ação de automação"}
                      </p>
                      {task.error_message && (
                        <p className="text-[11.5px] text-[var(--bad)] mt-0.5">
                          {task.error_message}
                        </p>
                      )}
                    </div>

                    {["pending", "waiting_rate_limit", "paused"].includes(task.status) && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost text-[var(--bad)]"
                        onClick={() => cancelTask(task.id)}
                      >
                        Cancelar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* COLUNA DIREITA: FEED DE LOGS + CONFIGURAÇÃO */}
        <div className="flex flex-col gap-[var(--gap)] min-w-0">
          {/* SEÇÃO: AUDITORIA E LOGS AO VIVO */}
          <section className="panel panel-pad" aria-label="Histórico de Execução">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="h2">Logs de Atividade</h2>
              <span className="label num">Ao vivo</span>
            </div>

            {logs.length === 0 ? (
              <p className="mt-3 text-[13px] text-[var(--ink-2)]">
                Nenhum log registrado ainda.
              </p>
            ) : (
              <ul className="mt-2 divide max-h-[380px] overflow-y-auto">
                {logs.map((log) => (
                  <li key={log.id} className="py-2 text-[12.5px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-[600] uppercase text-[var(--ink)]">
                        {log.action_type}
                      </span>
                      <span
                        className={`text-[11px] font-[600] ${
                          log.status === "COMPLETED"
                            ? "text-[var(--ok)]"
                            : log.status === "FAILED"
                            ? "text-[var(--bad)]"
                            : "text-[var(--warn)]"
                        }`}
                      >
                        {log.status}
                      </span>
                    </div>
                    <p className="text-[var(--ink-2)] mt-0.5 line-clamp-2">
                      {log.detail || log.error_message || "Sem detalhes"}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--muted)]">
                      <span>{log.duration_ms ? `${log.duration_ms}ms` : ""}</span>
                      <span className="num">{fmtRelative(log.created_at, now)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* SEÇÃO: CONFIGURAÇÕES DA CONTA SELECIONADA */}
          {selectedAccount && (
            <section className="panel panel-pad" aria-label="Regras da Conta">
              <h2 className="h2">Regras de @{selectedAccount.username}</h2>
              <div className="mt-3 space-y-2.5 text-[13px]">
                <div className="flex justify-between border-b border-[var(--line)] pb-1.5">
                  <span className="text-[var(--muted)]">Horário de Operação</span>
                  <span className="font-medium">
                    {selectedAccount.config?.working_hours_start ?? "08:00"} até{" "}
                    {selectedAccount.config?.working_hours_end ?? "22:00"}
                  </span>
                </div>
                <div className="flex justify-between border-b border-[var(--line)] pb-1.5">
                  <span className="text-[var(--muted)]">Limite Diário de Posts</span>
                  <span className="font-medium num">
                    {selectedAccount.config?.daily_post_limit ?? 25} posts/dia
                  </span>
                </div>
                <div className="flex justify-between border-b border-[var(--line)] pb-1.5">
                  <span className="text-[var(--muted)]">Limite Diário de Reposts</span>
                  <span className="font-medium num">
                    {selectedAccount.config?.daily_repost_limit ?? 50} RTs/dia
                  </span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-[var(--muted)]">Pausa Automática em Erro</span>
                  <span className="font-medium">
                    {selectedAccount.config?.auto_pause_on_error ? "Ativada" : "Desativada"}
                  </span>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/* MODAL 1: CRIAR NOVA TAREFA                                     */}
      {/* ============================================================== */}
      {taskModalOpen && (
        <dialog open className="sheet">
          <div className="panel-pad max-w-[540px] w-full">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
              <h2 className="h2">Nova Tarefa de Automação</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setTaskModalOpen(false)}
              >
                <IconX size={16} />
              </button>
            </div>

            <form onSubmit={handleOpenConfirm} className="mt-4 flex flex-col gap-3">
              <div>
                <label className="label">Tipo de Ação</label>
                <div className="seg mt-1 w-full" role="group">
                  <button
                    type="button"
                    aria-pressed={taskType === "post"}
                    onClick={() => setTaskType("post")}
                  >
                    Post
                  </button>
                  <button
                    type="button"
                    aria-pressed={taskType === "thread"}
                    onClick={() => setTaskType("thread")}
                  >
                    Thread
                  </button>
                  <button
                    type="button"
                    aria-pressed={taskType === "reply"}
                    onClick={() => setTaskType("reply")}
                  >
                    Resposta
                  </button>
                  <button
                    type="button"
                    aria-pressed={taskType === "repost"}
                    onClick={() => setTaskType("repost")}
                  >
                    Repost
                  </button>
                </div>
              </div>

              {taskType === "post" && (
                <div>
                  <label className="label" htmlFor="task-text">
                    Texto do Tweet (máx 280 caracteres)
                  </label>
                  <textarea
                    id="task-text"
                    className="textarea mt-1"
                    rows={4}
                    value={taskText}
                    onChange={(e) => setTaskText(e.target.value)}
                    placeholder="O que o bot vai publicar no X?"
                    maxLength={280}
                    required
                  />
                  <div className="text-right text-[12px] text-[var(--muted)] mt-1">
                    {taskText.length}/280
                  </div>
                </div>
              )}

              {taskType === "thread" && (
                <div className="space-y-2">
                  <label className="label">Tweets da Thread</label>
                  {threadItems.map((item, idx) => (
                    <textarea
                      key={idx}
                      className="textarea"
                      rows={2}
                      value={item}
                      onChange={(e) => {
                        const next = [...threadItems];
                        next[idx] = e.target.value;
                        setThreadItems(next);
                      }}
                      placeholder={`Tweet #${idx + 1}`}
                      maxLength={280}
                      required
                    />
                  ))}
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setThreadItems([...threadItems, ""])}
                  >
                    + Adicionar outro tweet
                  </button>
                </div>
              )}

              {(taskType === "reply" || taskType === "repost") && (
                <div>
                  <label className="label" htmlFor="target-id">
                    Link ou ID do Post no X
                  </label>
                  <input
                    id="target-id"
                    className="input mt-1"
                    value={targetPostId}
                    onChange={(e) => setTargetPostId(e.target.value)}
                    placeholder="https://x.com/usuario/status/123456789..."
                    required
                  />
                </div>
              )}

              {taskType === "reply" && (
                <div>
                  <label className="label" htmlFor="reply-text">
                    Sua Resposta
                  </label>
                  <textarea
                    id="reply-text"
                    className="textarea mt-1"
                    rows={3}
                    value={taskText}
                    onChange={(e) => setTaskText(e.target.value)}
                    placeholder="Texto da resposta..."
                    maxLength={280}
                    required
                  />
                </div>
              )}

              <div>
                <label className="label" htmlFor="sched-time">
                  Agendar para (opcional — deixe vazio para enviar na próxima rodada)
                </label>
                <input
                  id="sched-time"
                  type="datetime-local"
                  className="input mt-1"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-[var(--line)]">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setTaskModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Prosseguir para Confirmação
                </button>
              </div>
            </form>
          </div>
        </dialog>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: CONFIRMAÇÃO OBRIGATÓRIA ANTES DE EXECUTAR NO X        */}
      {/* ============================================================== */}
      {confirmModalOpen && pendingTaskData && (
        <dialog open className="sheet">
          <div className="panel-pad max-w-[500px] w-full border-2 border-[var(--accent)]">
            <h2 className="h2 text-[var(--accent)]">
              ⚠️ Confirmar Ação no X
            </h2>
            <p className="text-[13px] text-[var(--ink-2)] mt-1">
              Esta ação será executada com a API oficial na conta autorizada:
            </p>

            <div className="sunken p-3 mt-3 space-y-1.5 text-[13px]">
              <div>
                <strong>Conta:</strong> @{selectedAccount?.username}
              </div>
              <div>
                <strong>Ação:</strong> <span className="uppercase">{pendingTaskData.type}</span>
              </div>
              {Boolean(pendingTaskData.payload.text) && (
                <div>
                  <strong>Texto:</strong> &quot;{String(pendingTaskData.payload.text)}&quot;
                </div>
              )}
              {Boolean(pendingTaskData.payload.post_id) && (
                <div>
                  <strong>Post Alvo:</strong> {String(pendingTaskData.payload.post_id)}
                </div>
              )}
              <div>
                <strong>Execução:</strong>{" "}
                {pendingTaskData.scheduledFor
                  ? `Agendado para ${fmtTime(pendingTaskData.scheduledFor)}`
                  : "Imediata (próximo ciclo)"}
              </div>
            </div>

            <p className="text-[11.5px] text-[var(--muted)] mt-2">
              Segurança AXYSBOT: Uma vez confirmada, a tarefa entrará na fila segura e respeitará os limites técnicos da API do X.
            </p>

            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-[var(--line)]">
              <button
                type="button"
                className="btn"
                onClick={() => setConfirmModalOpen(false)}
                disabled={busy !== null}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={executeConfirmedTask}
                disabled={busy !== null}
              >
                {busy === "create_task" ? "Agendando..." : "Sim, Executar Ação"}
              </button>
            </div>
          </div>
        </dialog>
      )}

      {/* ============================================================== */}
      {/* MODAL 3: CONECTAR CONTA                                        */}
      {/* ============================================================== */}
      {connectModalOpen && (
        <dialog open className="sheet">
          <div className="panel-pad max-w-[520px] w-full">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <h2 className="h2">Conectar Conta do X</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConnectModalOpen(false)}
              >
                <IconX size={16} />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <h3 className="font-[620] text-[14px]">Opção A: Conexão OAuth 2.0 Oficial</h3>
                <p className="text-[12.5px] text-[var(--ink-2)] mt-0.5">
                  Conexão oficial via portal de desenvolvedores do X.
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="Client ID do app X (opcional se no .env)"
                    value={oauthClientId}
                    onChange={(e) => setOauthClientId(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleOAuthConnect}
                    disabled={busy !== null}
                  >
                    Autorizar no X
                  </button>
                </div>
              </div>

              <div className="border-t border-[var(--line)] pt-3">
                <h3 className="font-[620] text-[14px]">Opção B: Conexão Direta com Token</h3>
                <p className="text-[12.5px] text-[var(--ink-2)] mt-0.5">
                  Insira o Bearer token do X da conta para salvar criptografado no banco.
                </p>
                <form onSubmit={handleManualConnect} className="mt-2 space-y-2">
                  <input
                    className="input"
                    placeholder="@seu_usuario_no_x"
                    value={manualHandle}
                    onChange={(e) => setManualHandle(e.target.value)}
                    required
                  />
                  <input
                    className="input"
                    type="password"
                    placeholder="Bearer Access Token do X"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    required
                  />
                  <button
                    type="submit"
                    className="btn btn-glass w-full"
                    disabled={busy !== null}
                  >
                    Salvar e Conectar Conta
                  </button>
                </form>
              </div>
            </div>
          </div>
        </dialog>
      )}

      {toast.node}
    </div>
  );
}
