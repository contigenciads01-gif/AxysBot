"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { weightedLength, splitIntoThread, X_LIMIT } from "@/lib/thread";
import { estimateThreadCost, containsUrl } from "@/lib/cost";
import { fmtUsd } from "@/lib/format";
import { IconLink, IconSpark, IconX } from "./icons";
import { useToast } from "./toast";

const DRAFT_KEY = "axys.draft.v1"; // versionado: se o formato mudar, rascunho antigo e ignorado
type Mode = "variacoes" | "thread" | "melhorar";
interface Option { label: string; items: string[] }

function Ring({ used }: { used: number }) {
  const pct = Math.min(1, used / X_LIMIT), left = X_LIMIT - used, r = 9, c = 2 * Math.PI * r;
  const color = left < 0 ? "var(--bad)" : left <= 20 ? "var(--warn)" : "var(--accent)";
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`${used} de ${X_LIMIT} caracteres`}>
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <circle cx="11" cy="11" r={r} fill="none" stroke="var(--line-strong)" strokeWidth="2.2" />
        <circle cx="11" cy="11" r={r} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 11 11)" style={{ transition: "stroke-dashoffset .2s, stroke .2s" }} />
      </svg>
      <span className="num text-[12px] font-[600]" style={{ color: left <= 20 ? color : "var(--muted)" }}>{left}</span>
    </span>
  );
}

function pad(n: number) { return String(n).padStart(2, "0"); }
function toLocalInput(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function quickTimes() {
  const now = new Date();
  const inHour = new Date(now.getTime() + 3600e3); inHour.setMinutes(Math.ceil(inHour.getMinutes() / 5) * 5, 0, 0);
  const t9 = new Date(now); t9.setDate(t9.getDate() + 1); t9.setHours(9, 0, 0, 0);
  const t18 = new Date(now); t18.setHours(18, 0, 0, 0); if (t18 <= now) t18.setDate(t18.getDate() + 1);
  return [{ label: "Em 1 hora", d: inHour }, { label: t18.getDate() === now.getDate() ? "Hoje 18h" : "Amanhã 18h", d: t18 }, { label: "Amanhã 9h", d: t9 }];
}

export function Composer({ aiEnabled, username, displayName, avatar }: { aiEnabled: boolean; username: string; displayName: string; avatar: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<string[]>([""]);
  const [when, setWhen] = useState("");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<Mode>("variacoes");
  const [tone, setTone] = useState("");
  const [ai, setAi] = useState<{ loading: boolean; options: Option[]; error: string | null }>({ loading: false, options: [], error: null });
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  // calculado no navegador: o servidor do Vercel roda em UTC
  const [quick, setQuick] = useState<{ label: string; d: Date }[]>([]);
  const [minWhen, setMinWhen] = useState<string | undefined>(undefined);
  useEffect(() => { setQuick(quickTimes()); setMinWhen(toLocalInput(new Date())); }, []);
  const loaded = useRef(false);

  // rascunho local: recupera e salva
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) { const d = JSON.parse(raw); if (Array.isArray(d.items) && d.items.some((s: string) => s.trim())) setItems(d.items); }
    } catch {}
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ items })); } catch {} }, 400);
    return () => clearTimeout(t);
  }, [items]);

  const lengths = useMemo(() => items.map(weightedLength), [items]);
  const filled = items.filter((s) => s.trim());
  const cost = useMemo(() => estimateThreadCost(filled), [filled.join("\u0000")]); // eslint-disable-line react-hooks/exhaustive-deps
  const tooLong = lengths.some((l) => l > X_LIMIT);
  const canSave = filled.length > 0 && !tooLong && !saving;

  const update = (i: number, v: string) => setItems((xs) => xs.map((x, j) => (j === i ? v : x)));
  const addAfter = (i: number) => { setItems((xs) => [...xs.slice(0, i + 1), "", ...xs.slice(i + 1)]); setTimeout(() => refs.current[i + 1]?.focus(), 0); };
  const remove = (i: number) => setItems((xs) => (xs.length === 1 ? [""] : xs.filter((_, j) => j !== i)));
  const move = (i: number, dir: -1 | 1) => setItems((xs) => { const j = i + dir; if (j < 0 || j >= xs.length) return xs; const c = [...xs]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  const split = () => { const parts = splitIntoThread(items.join("\n\n"), { numbered: false }); if (parts.length) { setItems(parts); toast.show(`Dividido em ${parts.length} posts`); } };

  async function runAi() {
    const input = items.join("\n\n").trim();
    if (!input) { toast.show("Escreva uma ideia primeiro"); return; }
    setAi({ loading: true, options: [], error: null });
    try {
      const r = await fetch("/api/ai/compose", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, input, tone: tone || undefined }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setAi({ loading: false, options: j.options, error: null });
    } catch (e) { setAi({ loading: false, options: [], error: e instanceof Error ? e.message : "A IA não respondeu." }); }
  }

  async function save(schedule: boolean) {
    if (!canSave) return;
    if (schedule && !when) { toast.show("Escolha quando publicar"); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/posts", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: filled, scheduledFor: schedule ? new Date(when).toISOString() : null }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      toast.show(schedule ? "Agendado" : "Rascunho salvo");
      setTimeout(() => router.push(schedule ? "/" : "/agenda?status=rascunho"), 700);
    } catch (e) { toast.show(e instanceof Error ? e.message : "Não deu para salvar."); setSaving(false); }
  }

  return (
    <div className="grid gap-[var(--gap)] lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] items-start">
      {/* ---------------- editor ---------------- */}
      <section className="panel panel-pad" aria-label="Editor">
        <ol className="flex flex-col">
          {items.map((text, i) => (
            <li key={i} className="relative flex gap-3 enter">
              <div className="flex flex-col items-center pt-1">
                {avatar ? <img src={avatar} alt="" width={36} height={36} className="size-9 rounded-full" /> : <span className="size-9 rounded-full bg-[var(--accent-wash)] grid place-items-center font-[650] text-[var(--accent)]">{username[0]?.toUpperCase()}</span>}
                {i < items.length - 1 ? <span className="w-0.5 flex-1 bg-[var(--line)] my-1.5 rounded-full" /> : null}
              </div>
              <div className="min-w-0 flex-1 pb-4">
                <label className="sr-only" htmlFor={`post-${i}`}>{items.length > 1 ? `Post ${i + 1} da thread` : "Texto do post"}</label>
                <textarea id={`post-${i}`} ref={(el) => { refs.current[i] = el; }} value={text} rows={2}
                  onChange={(e) => update(i, e.target.value)}
                  placeholder={i === 0 ? "O que você quer publicar?" : "Continue a thread"}
                  className="grow-field w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-[var(--muted)] focus-visible:outline-none"
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addAfter(i); } }} />
                <div className="flex items-center gap-1.5 mt-1">
                  <Ring used={lengths[i]} />
                  {containsUrl(text) ? <span className="tag tag-warn" title="Post com link custa US$ 0,20 em vez de US$ 0,015"><IconLink size={13} />Link</span> : null}
                  <span className="ml-auto flex items-center gap-0.5">
                    {items.length > 1 ? (<>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Descer">↓</button>
                    </>) : null}
                    {items.length > 1 || text ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(i)} aria-label="Remover este post"><IconX size={14} /></button> : null}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
          <button type="button" className="btn btn-sm" onClick={() => addAfter(items.length - 1)} disabled={items.length >= 25}>Adicionar post à thread</button>
          {lengths.some((l) => l > X_LIMIT) || (items.length === 1 && lengths[0] > X_LIMIT * 0.9) ? (
            <button type="button" className="btn btn-sm" onClick={split}>Dividir em thread</button>
          ) : null}
          <span className="ml-auto self-center text-[12px] text-[var(--muted)] hidden sm:inline">Ctrl + Enter adiciona um post</span>
        </div>
      </section>

      {/* ---------------- lateral: agendar + IA ---------------- */}
      <div className="flex flex-col gap-[var(--gap)] lg:sticky lg:top-6">
        <section className="panel panel-pad" aria-label="Agendar">
          <h2 className="h2">Quando publicar</h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {quick.map((q) => (
              <button key={q.label} type="button" className={`btn btn-sm ${when === toLocalInput(q.d) ? "border-[var(--accent)] text-[var(--accent)]" : ""}`} onClick={() => setWhen(toLocalInput(q.d))}>{q.label}</button>
            ))}
          </div>
          <label className="block mt-3">
            <span className="label">Data e hora</span>
            <input type="datetime-local" className="input mt-1 num" value={when} min={minWhen} name="agendar_para" autoComplete="off" onChange={(e) => setWhen(e.target.value)} />
          </label>

          <div className="mt-4 sunken px-3 py-2.5 text-[13px]">
            <div className="flex justify-between gap-2"><span className="text-[var(--ink-2)]">Custo estimado na API do X</span><span className="num font-[620]">{fmtUsd(cost.total)}</span></div>
            {cost.withUrl ? (
              <p className="mt-1.5 text-[12px] text-[var(--warn)]">{cost.withUrl} post{cost.withUrl > 1 ? "s" : ""} com link. Sem os links, economiza {fmtUsd(cost.urlPremium)}.</p>
            ) : null}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <button type="button" className="btn btn-primary w-full" disabled={!canSave || !when} onClick={() => save(true)}>
              {saving ? "Agendando…" : filled.length > 1 ? `Agendar thread de ${filled.length}` : "Agendar post"}
            </button>
            <button type="button" className="btn w-full" disabled={!canSave} onClick={() => save(false)}>Salvar rascunho</button>
            {tooLong ? <p className="text-[12.5px] text-[var(--bad)]">Algum post passou de {X_LIMIT} caracteres.</p> : null}
          </div>
        </section>

        <section className="panel panel-pad" aria-label="Escrever com IA">
          <h2 className="h2 flex items-center gap-2"><IconSpark size={16} className="text-[var(--accent)]" />Escrever com IA</h2>
          {!aiEnabled ? (
            <p className="mt-2 text-[13px] text-[var(--ink-2)]">Configure ANTHROPIC_API_KEY para gerar variações e threads a partir do seu texto.</p>
          ) : (<>
            <div className="seg mt-3 w-full" role="group" aria-label="O que a IA faz">
              {([["variacoes", "Variações"], ["thread", "Virar thread"], ["melhorar", "Revisar"]] as const).map(([v, l]) => (
                <button key={v} type="button" className="flex-1" aria-pressed={mode === v} onClick={() => setMode(v)}>{l}</button>
              ))}
            </div>
            <label className="block mt-3">
              <span className="label">Tom (opcional)</span>
              <input className="input mt-1" name="tom" autoComplete="off" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="direto, bem-humorado, técnico…" />
            </label>
            <button type="button" className="btn w-full mt-3" onClick={runAi} disabled={ai.loading}>{ai.loading ? "Escrevendo…" : "Gerar sugestões"}</button>
            {ai.error ? <p className="mt-2 text-[12.5px] text-[var(--bad)]">{ai.error}</p> : null}
            {ai.loading ? <div className="mt-3 flex flex-col gap-2"><div className="skeleton h-16" /><div className="skeleton h-16" /></div> : null}
            <div className="mt-3 flex flex-col gap-2">
              {ai.options.map((o, k) => (
                <article key={k} className="rounded-[var(--radius)] border border-[var(--line)] p-3 enter" style={{ animationDelay: `${k * 60}ms` }}>
                  <div className="label">{o.label}</div>
                  <div className="mt-1 flex flex-col gap-1.5">
                    {o.items.map((t, j) => <p key={j} className="text-[13px] leading-snug whitespace-pre-wrap">{t}</p>)}
                  </div>
                  <button type="button" className="btn btn-sm mt-2" onClick={() => { setItems(o.items); toast.show("Sugestão aplicada"); }}>Usar esta</button>
                </article>
              ))}
            </div>
          </>)}
        </section>
      </div>

      <p className="sr-only">Publicando como {displayName} (@{username})</p>
      {toast.node}
    </div>
  );
}
