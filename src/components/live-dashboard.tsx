"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { DashboardData } from "@/lib/data";
import type { Post } from "@/lib/types";
import { BarChart, LineChart, Meter } from "./charts";
import { IconPause, IconPlay, IconSync, IconEscrever } from "./icons";
import { useToast } from "./toast";
import { fmtDay, fmtNum, fmtRelative, fmtShortDate, fmtTime, fmtUsd } from "@/lib/format";

type Payload = DashboardData & { account: { username: string; display_name: string | null } | null };
const POLL_MS = 20_000; // le so o NOSSO banco: nao gasta credito na API do X

export function LiveDashboard({ initial, initialQueue, initialPaused }: { initial: Payload; initialQueue: Post[]; initialPaused: boolean }) {
  const [data, setData] = useState(initial);
  const [queue, setQueue] = useState(initialQueue);
  const [paused, setPaused] = useState(initialPaused);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  const [, startTransition] = useTransition();
  const toast = useToast();

  const refresh = useCallback(async () => {
    const [d, q] = await Promise.all([
      fetch("/api/dashboard", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/posts?status=agendado,publicando,falhou", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
    ]);
    startTransition(() => {
      if (d?.account) setData(d);
      if (q?.posts) setQueue(q.posts);
      setUpdatedAt(Date.now());
    });
  }, []);

  useEffect(() => {
    const poll = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(poll); clearInterval(tick); document.removeEventListener("visibilitychange", onVis); };
  }, [refresh]);

  async function act(kind: "pause" | "publish" | "sync") {
    setBusy(kind);
    try {
      if (kind === "pause") {
        const next = !paused;
        const r = await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ paused: next }) });
        if (!r.ok) throw new Error((await r.json()).error);
        setPaused(next);
        toast.show(next ? "Agendador pausado" : "Agendador ligado");
      } else if (kind === "publish") {
        const r = await fetch("/api/run/publish", { method: "POST" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        toast.show(j.claimed ? `Publicados: ${j.results.filter((x: { ok: boolean }) => x.ok).length} de ${j.claimed}` : "Nenhum post vencido agora");
      } else {
        const r = await fetch("/api/run/sync", { method: "POST" });
        if (!r.ok) throw new Error((await r.json()).error);
        toast.show("Métricas e menções sincronizadas");
      }
      await refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Não deu certo. Tente de novo.");
    } finally { setBusy(null); }
  }

  const followers = data.metrics.map((m) => ({ x: m.day, label: fmtShortDate(m.day), y: m.followers }));
  const last = data.metrics.at(-1), weekAgo = data.metrics.at(-8) ?? data.metrics[0];
  const followerDelta = last?.followers != null && weekAgo?.followers != null ? last.followers - weekAgo.followers : null;
  const perDay = data.perDay.map((d) => ({ x: d.day, label: fmtShortDate(d.day), y: d.count }));
  const upcoming = useMemo(() => queue.filter((p) => p.status !== "falhou").slice(0, 8), [queue]);
  const failed = queue.filter((p) => p.status === "falhou");
  const next = upcoming[0]?.scheduled_for ?? null;

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      {/* ---------------- controle do agendador ---------------- */}
      <section className="liquid-glass glass-card panel-pad flex flex-wrap items-center gap-x-5 gap-y-3" aria-label="Agendador" data-glass>
        <div className="flex items-center gap-3 min-w-0">
          <span className={`dot ${paused ? "" : "dot-live"}`} style={{ color: paused ? "var(--warn)" : "var(--ok)" }} />
          <div className="min-w-0">
            <div className="font-[620]">{paused ? "Agendador pausado" : "Agendador ligado"}</div>
            <div className="text-[12.5px] text-[var(--ink-2)] truncate">
              {paused ? "Nada sai até você ligar de novo." : next ? <>Próximo post <span className="num">{fmtRelative(next, now)}</span>, às <span className="num">{fmtTime(next)}</span></> : "Fila vazia. Escreva algo para agendar."}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 md:ml-auto">
          <button type="button" className={`btn ${paused ? "btn-primary" : "btn-glass"}`} onClick={() => act("pause")} disabled={busy !== null} aria-pressed={!paused}>
            {paused ? <IconPlay size={15} /> : <IconPause size={15} />}{paused ? "Ligar agendador" : "Pausar"}
          </button>
          <button type="button" className="btn btn-glass" onClick={() => act("publish")} disabled={busy !== null || paused}>
            {busy === "publish" ? "Publicando…" : "Publicar vencidos"}
          </button>
          <button type="button" className="btn btn-ghost btn-glass" onClick={() => act("sync")} disabled={busy !== null} title="Busca métricas e menções novas no X">
            <IconSync size={15} className={busy === "sync" ? "animate-spin" : ""} />Sincronizar
          </button>
        </div>
      </section>

      <div className="grid gap-[var(--gap)] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-start">
        <div className="flex flex-col gap-[var(--gap)] min-w-0">
        {/* ---------------- trilho da fila ---------------- */}
        <section className="panel panel-pad" aria-label="Fila de publicação">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="h2">Fila de publicação</h2>
            <Link href="/agenda" className="text-[12.5px] font-medium text-[var(--accent)] hover:underline">Abrir agenda</Link>
          </div>

          <ol className="mt-4 relative">
            <li className="relative pl-[100px] pb-4">
              <span className="absolute left-0 top-0 w-[70px] text-right label num" suppressHydrationWarning>{fmtTime(new Date(now).toISOString())}</span>
              <span className="absolute left-[78px] top-[7px] size-[9px] rounded-full bg-[var(--accent)] dot-live" style={{ color: "var(--accent)" }} />
              <span className="text-[12.5px] font-[600] text-[var(--accent)]">Agora</span>
            </li>
            {upcoming.length === 0 ? (
              <li className="relative pl-[100px] pb-2">
                <span className="absolute left-[82px] top-0 bottom-0 w-px bg-[var(--line)]" />
                <div className="sunken px-4 py-5 text-[13px] text-[var(--ink-2)]">
                  Nenhum post na fila.{" "}
                  <Link href="/composer" className="font-[600] text-[var(--accent)] hover:underline">Escrever o primeiro</Link>
                </div>
              </li>
            ) : (
              upcoming.map((p, i) => {
                const when = p.scheduled_for!;
                const showDay = i === 0 || fmtDay(when) !== fmtDay(upcoming[i - 1].scheduled_for!);
                return (
                  <li key={p.id} className="relative pl-[100px] pb-3 enter" style={{ animationDelay: `${i * 40}ms` }}>
                    <span className="absolute left-[82px] -top-3 bottom-0 w-px bg-[var(--line)]" />
                    <span className="absolute left-0 top-1 w-[70px] text-right leading-tight">
                      {showDay ? <span className="block label">{fmtDay(when)}</span> : null}
                      <span className="num font-[600] text-[13.5px]">{fmtTime(when)}</span>
                    </span>
                    <span className={`absolute left-[78.5px] top-[9px] size-[8px] rounded-full border-2 ${p.status === "publicando" ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--line-strong)] bg-[var(--surface)]"}`} />
                    <article className="rounded-[var(--radius)] border border-[var(--line)] px-3 py-2.5 hover:border-[var(--line-strong)] transition-colors">
                      <p className="text-[13.5px] leading-snug line-clamp-2">{p.items[0]?.body}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {p.items.length > 1 ? <span className="tag">Thread de {p.items.length}</span> : null}
                        {p.status === "publicando" ? <span className="tag tag-blue">Publicando</span> : <span className="text-[12px] text-[var(--muted)] num" suppressHydrationWarning>{fmtRelative(when, now)}</span>}
                      </div>
                    </article>
                  </li>
                );
              })
            )}
          </ol>

          {failed.length ? (
            <div className="mt-3 rounded-[var(--radius)] border border-[color-mix(in_oklab,var(--bad)_35%,var(--line))] px-3 py-2.5 text-[13px]">
              <span className="font-[600] text-[var(--bad)]">{failed.length} post{failed.length > 1 ? "s" : ""} não saíram.</span>{" "}
              <Link href="/agenda?status=falhou" className="font-[600] text-[var(--accent)] hover:underline">Ver e tentar de novo</Link>
            </div>
          ) : null}
        </section>

      {/* ---------------- atividade ---------------- */}
        <section className="panel panel-pad" aria-label="Atividade do agendador">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="h2">O que o agendador fez</h2>
          <span className="label num">{now - updatedAt < 60_000 ? "Ao vivo" : `Atualizado ${fmtRelative(new Date(updatedAt).toISOString(), now)}`}</span>
        </div>
        {data.runs.length === 0 ? (
          <p className="mt-3 text-[13px] text-[var(--ink-2)]">Ainda não rodou. O agendador confere a fila a cada 5 minutos.</p>
        ) : (
          <ul className="mt-2 divide">
            {data.runs.map((r, i) => (
              <li key={i} className="flex items-start gap-3 py-2 text-[13px]">
                <span className="dot mt-[7px]" style={{ color: r.ok ? "var(--ok)" : "var(--bad)" }} aria-label={r.ok ? "ok" : "falhou"} />
                <div className="min-w-0 flex-1 sm:flex sm:gap-3">
                  <span className="block sm:w-[86px] sm:shrink-0 text-[12px] sm:text-[13px] text-[var(--ink-2)]">{{ publicar: "Publicação", sync_metricas: "Métricas", sync_mencoes: "Menções", oauth: "Conexão" }[r.kind] ?? r.kind}</span>
                  <span className={`block min-w-0 sm:flex-1 sm:truncate ${r.ok ? "" : "text-[var(--bad)]"}`}>{r.detail}</span>
                </div>
                <span className="shrink-0 text-[12px] text-[var(--muted)] num">{fmtRelative(r.at, now).replace("há menos de 1 min", "agora")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
        </div>

        {/* ---------------- perfil ---------------- */}
        <section className="panel" aria-label="Seu perfil">
          <div className="panel-pad">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="h2">Seguidores</h2>
              <span className="label">30 dias</span>
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="big">{fmtNum(last?.followers)}</span>
              {followerDelta != null ? (
                <span className={`text-[12.5px] font-[600] num ${followerDelta >= 0 ? "text-[var(--ok)]" : "text-[var(--bad)]"}`}>
                  {followerDelta >= 0 ? "+" : ""}{fmtNum(followerDelta)} em 7 dias
                </span>
              ) : null}
            </div>
            <div className="mt-3"><LineChart points={followers} unit="seguidores" title="Seguidores nos últimos 30 dias" /></div>
          </div>

          <dl className="grid grid-cols-3 border-y border-[var(--line)] divide-x divide-[var(--line)]">
            {[["Impressões", last?.impressions], ["Curtidas", last?.likes], ["Respostas", last?.replies]].map(([k, v]) => (
              <div key={k as string} className="px-[var(--pad)] py-3">
                <dt className="label">{k}</dt>
                <dd className="num text-[18px] font-[620] tracking-[-.02em] mt-0.5">{fmtNum(v as number | null)}</dd>
              </div>
            ))}
          </dl>
          <p className="px-[var(--pad)] pt-2 text-[11.5px] text-[var(--muted)]">Soma dos posts publicados nos últimos 7 dias.</p>

          <div className="panel-pad">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="h2">Publicações por dia</h3>
              <span className="label num">{data.queue.publicado7d} na semana</span>
            </div>
            <div className="mt-2"><BarChart points={perDay} unit="posts" title="Posts publicados por dia, últimos 14 dias" /></div>
          </div>

          <div className="panel-pad border-t border-[var(--line)]">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="h2">Gasto com a API do X</h3>
              <span className="label">este mês</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="num text-[20px] font-[640] tracking-[-.02em]">{fmtUsd(data.spend.monthUsd)}</span>
              <span className="text-[12.5px] text-[var(--ink-2)] num">de {fmtUsd(data.spend.budgetUsd)}</span>
            </div>
            <div className="mt-2"><Meter value={data.spend.monthUsd} max={data.spend.budgetUsd} label="Gasto do mês em relação ao orçamento" /></div>
            {data.spend.monthUsd >= data.spend.budgetUsd * 0.8 ? (
              <p className="mt-2 text-[12.5px] text-[var(--warn)] font-[550]">Perto do orçamento. Ajuste em Ajustes ou reduza links nos posts.</p>
            ) : null}
          </div>
        </section>
      </div>

      <Link href="/composer" className="md:hidden btn btn-primary fixed right-4 bottom-[76px] z-20 shadow-lg rounded-full h-12 px-5">
        <IconEscrever size={17} />Escrever
      </Link>
      {toast.node}
    </div>
  );
}
