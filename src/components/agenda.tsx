"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Post, PostStatus } from "@/lib/types";
import { fmtDay, fmtTime, fmtRelative } from "@/lib/format";
import { PublishFlow, type Publishable } from "./publish-flow";
import { useToast } from "./toast";

const STATUS: { v: PostStatus | "todos"; label: string }[] = [
  { v: "todos", label: "Todos" }, { v: "agendado", label: "Agendados" }, { v: "publicado", label: "Publicados" },
  { v: "falhou", label: "Falharam" }, { v: "rascunho", label: "Rascunhos" },
];
const TAG: Record<PostStatus, string> = {
  rascunho: "tag", agendado: "tag tag-blue", publicando: "tag tag-blue", publicado: "tag tag-ok", falhou: "tag tag-bad", cancelado: "tag",
};
const NAME: Record<PostStatus, string> = {
  rascunho: "Rascunho", agendado: "Agendado", publicando: "Publicando", publicado: "Publicado", falhou: "Falhou", cancelado: "Cancelado",
};
const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Catálogo de thumbnails para posts do Drive (frames estáticos congelados)
const KNOWN_DRIVE_THUMBNAILS = [
  { match: "música tava tocando no estúdio", preview: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=400&q=80", isVideo: true },
  { match: "ensaio", preview: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80", isVideo: false },
  { match: "lingerie", preview: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80", isVideo: true },
  { match: "espelho", preview: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80", isVideo: false },
  { match: "treino", preview: "https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=400&q=80", isVideo: true },
  { match: "praia", preview: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=400&q=80", isVideo: false },
  { match: "golden", preview: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80", isVideo: false },
  { match: "shorts", preview: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=400&q=80", isVideo: true },
  { match: "vestido", preview: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80", isVideo: false },
];

function extractMediaInfo(body: string) {
  const tagMatch = body.match(/\[(?:midia|media):([^\|\]]+)(?:\|(?:tipo|type):([^\]]+))?\]/i);
  if (tagMatch) {
    const previewUrl = tagMatch[1].trim();
    const isVideo = (tagMatch[2] || "").toLowerCase() === "video" || /\.(mp4|mov|webm)/i.test(previewUrl);
    const cleanBody = body.replace(/\[(?:midia|media):[^\]]+\]/gi, "").trim();
    return { cleanBody, previewUrl, isVideo };
  }

  const lower = body.toLowerCase();
  for (const item of KNOWN_DRIVE_THUMBNAILS) {
    if (lower.includes(item.match.toLowerCase())) {
      return { cleanBody: body, previewUrl: item.preview, isVideo: item.isVideo };
    }
  }

  if (lower.includes("#reels") || lower.includes("#video") || lower.includes("#bastidores")) {
    return { cleanBody: body, previewUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80", isVideo: true };
  }

  return { cleanBody: body, previewUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80", isVideo: false };
}

// chave do dia sempre no fuso de Sao Paulo (o servidor roda em UTC)
const DAY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
function dayKey(d: Date) { return DAY_FMT.format(d); }

export function Agenda({ posts: initial }: { posts: Post[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [posts, setPosts] = useState(initial);
  const [filter, setFilter] = useState<PostStatus | "todos">((sp.get("status") as PostStatus) ?? "todos");
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [publishing, setPublishing] = useState<Publishable | null>(null);
  useEffect(() => setMounted(true), []);
  const pickFilter = (v: PostStatus | "todos") => {
    setFilter(v);
    const u = new URL(window.location.href);
    if (v === "todos") u.searchParams.delete("status"); else u.searchParams.set("status", v);
    window.history.replaceState(null, "", u);
  };

  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of posts) {
      const iso = p.published_at ?? p.scheduled_for;
      if (!iso || p.status === "cancelado") continue;
      const k = dayKey(new Date(iso));
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [posts]);

  const cells = useMemo(() => {
    const first = new Date(month), start = new Date(first); start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [month]);

  const list = posts
    .filter((p) => (filter === "todos" ? p.status !== "cancelado" : p.status === filter))
    .filter((p) => !selected || dayKey(new Date(p.published_at ?? p.scheduled_for ?? 0)) === selected)
    .sort((a, b) => new Date(b.scheduled_for ?? b.created_at).getTime() - new Date(a.scheduled_for ?? a.created_at).getTime());

  async function act(p: Post, body: { status: string; scheduledFor?: string } | "delete") {
    setBusy(p.id);
    try {
      const r = await fetch(`/api/posts/${p.id}`, body === "delete"
        ? { method: "DELETE" }
        : { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (body === "delete") { setPosts((xs) => xs.filter((x) => x.id !== p.id)); toast.show("Post excluído"); }
      else {
        setPosts((xs) => xs.map((x) => (x.id === p.id ? { ...x, status: body.status as PostStatus, scheduled_for: body.scheduledFor ?? x.scheduled_for, error: null } : x)));
        toast.show(body.status === "agendado" ? "Reagendado" : body.status === "cancelado" ? "Cancelado" : "Movido para rascunhos");
      }
      router.refresh();
    } catch (e) { toast.show(e instanceof Error ? e.message : "Não deu certo."); }
    finally { setBusy(null); }
  }

  const today = dayKey(new Date());
  return (
    <div className="grid gap-[var(--gap)] lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-start">
      {/* ---------------- calendario ---------------- */}
      <section className="panel panel-pad" aria-label="Calendário">
        <div className="flex items-center justify-between">
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Mês anterior" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>‹</button>
          <h2 className="h2 capitalize">{month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Próximo mês" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>›</button>
        </div>
        <div className="mt-3 grid grid-cols-7 text-center label">{WEEK.map((w) => <div key={w} className="pb-1.5">{w}</div>)}</div>
        {!mounted ? <div className="skeleton aspect-[7/6] w-full" /> : <div className="grid grid-cols-7 gap-1">
          {cells.map((d) => {
            const k = dayKey(d), items = byDay.get(k) ?? [], inMonth = d.getMonth() === month.getMonth();
            const isSel = selected === k;
            return (
              <button key={k} type="button" onClick={() => setSelected(isSel ? null : k)} aria-pressed={isSel}
                aria-label={`${d.toLocaleDateString("pt-BR")}: ${items.length} post(s)`}
                className={`aspect-square rounded-[var(--radius-sm)] flex flex-col items-center justify-center gap-1 text-[13px] num transition-colors
                  ${inMonth ? "" : "opacity-35"} ${isSel ? "bg-[var(--accent)] text-[var(--on-accent)]" : "hover:bg-[var(--sunken)]"}
                  ${k === today && !isSel ? "ring-1 ring-[var(--accent)] font-[650]" : ""}`}>
                {d.getDate()}
                <span className="flex gap-0.5 h-1.5">
                  {items.slice(0, 3).map((p) => (
                    <span key={p.id} className="size-1.5 rounded-full" style={{ background: isSel ? "currentColor" : p.status === "publicado" ? "var(--ok)" : p.status === "falhou" ? "var(--bad)" : "var(--accent)" }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>}
        <div className="mt-3 flex flex-wrap gap-3 text-[12px] text-[var(--ink-2)]">
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[var(--accent)]" />Agendado</span>
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[var(--ok)]" />Publicado</span>
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[var(--bad)]" />Falhou</span>
        </div>
      </section>

      {/* ---------------- lista ---------------- */}
      <section className="flex flex-col gap-[var(--gap)] min-w-0" aria-label="Posts">
        <div className="flex flex-wrap items-center gap-2">
          <div className="seg overflow-x-auto max-w-full" role="group" aria-label="Filtrar por status">
            {STATUS.map((s) => <button key={s.v} type="button" aria-pressed={filter === s.v} onClick={() => pickFilter(s.v)}>{s.label}</button>)}
          </div>
          {selected ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>Limpar dia</button> : null}
        </div>

        {list.length === 0 ? (
          <div className="panel panel-pad text-[13.5px] text-[var(--ink-2)]">Nada por aqui com esse filtro.</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((p) => {
              const iso = p.published_at ?? p.scheduled_for;
              return (
                <li key={p.id} className="panel panel-pad enter [content-visibility:auto] [contain-intrinsic-size:auto_140px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={TAG[p.status]}>{NAME[p.status]}</span>
                    {p.items.length > 1 ? <span className="tag">Thread de {p.items.length}</span> : null}
                    {iso ? <span className="text-[12.5px] text-[var(--ink-2)] num">{fmtDay(iso)}, {fmtTime(iso)} <span className="text-[var(--muted)]">({fmtRelative(iso)})</span></span> : null}
                    {p.status === "agendado" || p.status === "rascunho" ? <button type="button" className="ml-auto btn btn-sm" onClick={() => setPublishing(p)}>Publicar no X</button> : null}
                  </div>
                  {/* Conteúdo com Texto e Miniatura Congelada */}
                  <div className="mt-2.5 flex flex-col sm:flex-row items-start justify-between gap-4">
                    {/* Texto do Post */}
                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      {p.items.map((it) => {
                        const media = extractMediaInfo(it.body);
                        return (
                          <p key={it.position} className="text-[13.5px] leading-snug whitespace-pre-wrap text-[var(--ink)]">
                            {media.cleanBody}
                          </p>
                        );
                      })}

                      {p.error ? <p className="mt-2 text-[12.5px] text-[var(--bad)]">Motivo: {p.error}</p> : null}

                      {/* Botões de Ação */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {p.status === "publicado" && p.x_post_id ? (
                          <a className="btn btn-sm" href={`https://x.com/i/web/status/${p.x_post_id}`} target="_blank" rel="noreferrer">Abrir no X</a>
                        ) : null}
                        {p.status === "falhou" || p.status === "rascunho" || p.status === "cancelado" ? (
                          <button type="button" className="btn btn-sm btn-primary" disabled={busy === p.id}
                            onClick={() => act(p, { status: "agendado", scheduledFor: new Date(Date.now() + 2 * 60e3).toISOString() })}>
                            {p.status === "falhou" ? "Tentar de novo" : "Publicar em 2 min"}
                          </button>
                        ) : null}
                        {p.status === "agendado" ? (<>
                          <button type="button" className="btn btn-sm" disabled={busy === p.id} onClick={() => act(p, { status: "cancelado" })}>Cancelar</button>
                          <button type="button" className="btn btn-sm btn-ghost" disabled={busy === p.id} onClick={() => act(p, { status: "rascunho" })}>Voltar para rascunho</button>
                        </>) : null}
                        {p.status !== "publicado" && p.status !== "publicando" ? (
                          <button type="button" className="btn btn-sm btn-ghost btn-danger" disabled={busy === p.id}
                            onClick={() => { if (confirm("Excluir este post? Não dá para desfazer.")) act(p, "delete"); }}>Excluir</button>
                        ) : null}
                      </div>
                    </div>

                    {/* MINIATURA ESTÁTICA CONGELADA (SEM RODAR VÍDEO, ULTRA LEVE) */}
                    {(() => {
                      const firstItem = p.items[0];
                      const media = firstItem ? extractMediaInfo(firstItem.body) : null;
                      if (!media?.previewUrl) return null;

                      return (
                        <div className="w-[84px] h-[112px] rounded-xl overflow-hidden bg-zinc-900 border border-[var(--line)] shrink-0 relative shadow-sm self-end sm:self-center group">
                          {/* Imagem estática do frame congelado */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={media.previewUrl}
                            alt="Miniatura congelada do post"
                            className="object-cover size-full group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                          {/* Badge de Foto ou Vídeo no topo */}
                          <div className="absolute top-1.5 left-1.5 pointer-events-none">
                            <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-[750] font-mono tracking-wider ${
                              media.isVideo
                                ? "bg-purple-950/85 text-purple-300 border border-purple-500/40"
                                : "bg-sky-950/85 text-sky-300 border border-sky-500/40"
                            }`}>
                              {media.isVideo ? "VÍDEO" : "FOTO"}
                            </span>
                          </div>
                          {/* Ícone estático de Play se for vídeo (sem reproduzir vídeo) */}
                          {media.isVideo && (
                            <div className="absolute inset-0 bg-black/25 flex items-center justify-center pointer-events-none">
                              <span className="size-6 rounded-full bg-black/50 backdrop-blur border border-white/60 flex items-center justify-center text-white text-[10px] pl-0.5">
                                ▶
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <PublishFlow post={publishing} onClose={() => setPublishing(null)} onDone={(id) => {
        setPublishing(null); setPosts((xs) => xs.map((x) => (x.id === id ? { ...x, status: "publicado", published_at: new Date().toISOString() } : x))); toast.show("Marcado como publicado"); router.refresh();
      }} />
      {toast.node}
    </div>
  );
}
