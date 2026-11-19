"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X_PAGES, mentionsSearchUrl, parsePostRef, postIntent, profileUrl, repostIntent, searchUrl, type SearchKind } from "@/lib/intents";
import { weightedLength, X_LIMIT } from "@/lib/thread";
import { fmtRelative, fmtTime } from "@/lib/format";
import type { Post } from "@/lib/types";
import { PublishFlow, openX, type Publishable } from "./publish-flow";
import { IconBusca, IconExterno, IconRepost, IconResposta, IconSpark } from "./icons";
import { useToast } from "./toast";

interface Embed { html: string; author_name: string; author_url: string; url: string; id: string; handle: string | null }
type Pending = { kind: "responder" | "repostar"; text?: string } | null;

declare global { interface Window { twttr?: { widgets?: { load: (el?: Element) => void } } } }

/** widgets.js oficial do X: transforma o blockquote do embed no card do post. */
function useWidgets() {
  return useCallback((el: Element | null) => {
    if (!el) return;
    if (window.twttr?.widgets) { window.twttr.widgets.load(el); return; }
    if (document.getElementById("x-widgets")) return;
    const s = document.createElement("script");
    s.id = "x-widgets"; s.async = true; s.src = "https://platform.twitter.com/widgets.js";
    s.onload = () => window.twttr?.widgets?.load(el);
    document.body.appendChild(s);
  }, []);
}

const KINDS: [SearchKind, string][] = [["recentes", "Recentes"], ["destaques", "Destaques"], ["perfis", "Perfis"], ["midia", "Mídia"]];

export function XController({ username, displayName, ready, published, aiEnabled }: {
  username: string | null; displayName: string | null; ready: Post[]; published: Post[]; aiEnabled: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const loadWidgets = useWidgets();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<SearchKind>("recentes");
  const [link, setLink] = useState("");
  const [embed, setEmbed] = useState<Embed | null>(null);
  const [loading, setLoading] = useState(false);
  const [embedErr, setEmbedErr] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [replyOpen, setReplyOpen] = useState(false);
  const [suggest, setSuggest] = useState<{ loading: boolean; items: string[] }>({ loading: false, items: [] });
  const [pending, setPending] = useState<Pending>(null);
  const [queue, setQueue] = useState(ready);
  const [publishing, setPublishing] = useState<Publishable | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const embedRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => { if (embed) loadWidgets(embedRef.current); }, [embed, loadWidgets]);
  useEffect(() => { const d = confirmRef.current; if (!d) return; if (pending && !d.open) d.showModal(); if (!pending && d.open) d.close(); }, [pending]);

  function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) { toast.show("Digite o que procurar"); return; }
    openX(searchUrl(kind === "perfis" ? q.replace(/^@/, "") : q, kind));
  }

  async function view(e?: React.FormEvent, url = link) {
    e?.preventDefault();
    const ref = parsePostRef(url);
    if (!ref) { setEmbedErr("Cole o link de um post do X, como x.com/usuario/status/123…"); return; }
    setLoading(true); setEmbedErr(null); setEmbed(null); setReplyOpen(false); setReply(""); setSuggest({ loading: false, items: [] });
    try {
      const theme = document.documentElement.dataset.theme === "escuro" ? "dark" : "light";
      const r = await fetch(`/api/x/embed?url=${encodeURIComponent(ref.url)}&theme=${theme}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setEmbed(j);
    } catch (err) { setEmbedErr(err instanceof Error ? err.message : "Não deu para carregar o post."); }
    finally { setLoading(false); }
  }

  async function aiSuggest() {
    if (!embed) return;
    setSuggest({ loading: true, items: [] });
    try {
      const text = embedRef.current?.innerText?.slice(0, 1200) ?? "";
      const r = await fetch("/api/ai/compose", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "resposta", input: `${embed.author_name}: ${text}` }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setSuggest({ loading: false, items: j.options.flatMap((o: { items: string[] }) => o.items).slice(0, 3) });
    } catch (err) { setSuggest({ loading: false, items: [] }); toast.show(err instanceof Error ? err.message : "A IA não respondeu."); }
  }

  /** Abre a acao no X. O registro no painel so acontece quando voce confirma. */
  function go() {
    if (!embed || !pending) return;
    openX(pending.kind === "responder" ? postIntent(pending.text ?? "", embed.id) : repostIntent(embed.id));
  }
  async function done() {
    if (!embed || !pending) return;
    const r = await fetch("/api/x/activity", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: pending.kind, post: embed.url, author: embed.author_name }) });
    toast.show(r.ok ? (pending.kind === "responder" ? "Resposta registrada" : "Repost registrado") : "Não deu para registrar");
    if (pending.kind === "responder") { setReply(""); setReplyOpen(false); }
    setPending(null);
  }

  const len = weightedLength(reply);
  const due = queue.filter((p) => new Date(p.scheduled_for ?? 0).getTime() <= now);
  const later = queue.filter((p) => new Date(p.scheduled_for ?? 0).getTime() > now).slice(0, 5);

  return (
    <div className="grid gap-[var(--gap)] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-start">
      <div className="flex flex-col gap-[var(--gap)] min-w-0">
        {/* ---------------- conta + navegar ---------------- */}
        <section className="liquid-glass glass-card panel-pad" aria-label="Sua conta no X" data-glass>
          {username ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="size-10 rounded-full bg-[var(--accent-wash)] grid place-items-center font-[650] text-[var(--accent)]">{username[0]?.toUpperCase()}</span>
              <div className="min-w-0">
                <div className="font-[620]">{displayName ?? `@${username}`}</div>
                <div className="text-[12.5px] text-[var(--ink-2)]">@{username} · ações abrem no seu X, já logado neste navegador</div>
              </div>
              <button type="button" className="btn btn-sm btn-glass md:ml-auto" onClick={() => openX(profileUrl(username))}><IconExterno size={14} />Meu perfil</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[13.5px] text-[var(--ink-2)]">Diga qual é o seu @ para o painel montar os atalhos de menções e perfil.</p>
              <Link href="/ajustes" className="btn btn-primary btn-sm md:ml-auto">Identificar conta</Link>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Abrir no X">
            <button type="button" className="btn btn-glass" onClick={() => openX(X_PAGES.feed)}><IconExterno size={14} />Feed</button>
            <button type="button" className="btn btn-glass" onClick={() => openX(X_PAGES.explorar)}><IconExterno size={14} />Explorar</button>
            <button type="button" className="btn btn-glass" onClick={() => openX(X_PAGES.notificacoes)}><IconExterno size={14} />Notificações</button>
            <button type="button" className="btn btn-glass" onClick={() => openX(username ? mentionsSearchUrl(username) : X_PAGES.mencoes)}><IconExterno size={14} />Menções</button>
          </div>
        </section>

        {/* ---------------- pesquisa ---------------- */}
        <section className="panel panel-pad" aria-label="Pesquisar no X">
          <h2 className="h2">Pesquisar no X</h2>
          <form className="mt-3 flex flex-col gap-2.5" onSubmit={search}>
            <div className="seg self-start" role="group" aria-label="Tipo de busca">
              {KINDS.map(([v, l]) => <button key={v} type="button" aria-pressed={kind === v} onClick={() => setKind(v)}>{l}</button>)}
            </div>
            <div className="flex gap-2">
              <label className="flex-1"><span className="sr-only">Termo de busca</span>
                <input className="input" name="busca" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder={kind === "perfis" ? "nome ou @ do perfil" : "palavras, #hashtag, from:perfil…"} />
              </label>
              <button type="submit" className="btn btn-primary"><IconBusca size={15} />Pesquisar</button>
            </div>
            <p className="text-[12px] text-[var(--muted)]">Os resultados abrem no X, numa aba nova. Para ver um post aqui, cole o link dele logo abaixo.</p>
          </form>
        </section>

        {/* ---------------- ver publicacao ---------------- */}
        <section className="panel panel-pad" aria-label="Ver publicação">
          <h2 className="h2">Ver publicação</h2>
          <form className="mt-3 flex gap-2" onSubmit={view}>
            <label className="flex-1"><span className="sr-only">Link do post</span>
              <input className="input" name="link" inputMode="url" autoComplete="off" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://x.com/usuario/status/…" />
            </label>
            <button type="submit" className="btn" disabled={loading}>{loading ? "Carregando…" : "Ver"}</button>
          </form>
          {embedErr ? <p className="mt-2 text-[12.5px] text-[var(--bad)]" role="alert">{embedErr}</p> : null}
          {loading ? <div className="mt-3 skeleton h-40" /> : null}
          {embed ? (
            <div className="mt-3 enter">
              <div ref={embedRef} className="x-embed" dangerouslySetInnerHTML={{ __html: embed.html }} />
              <p className="mt-2 text-[12px] text-[var(--muted)]">Curtidas, reposts e respostas aparecem no card oficial do X acima. O painel não curte nada por você.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary" onClick={() => setReplyOpen((v) => !v)} aria-expanded={replyOpen}><IconResposta size={15} />Responder</button>
                <button type="button" className="btn" onClick={() => setPending({ kind: "repostar" })}><IconRepost size={15} />Repostar</button>
                <button type="button" className="btn btn-ghost" onClick={() => openX(embed.url)}><IconExterno size={14} />Abrir no X</button>
              </div>
              {replyOpen ? (
                <div className="mt-3 border-t border-[var(--line)] pt-3 enter">
                  <label className="label" htmlFor="resposta">Sua resposta para {embed.author_name || "o autor"}</label>
                  <textarea id="resposta" className="textarea mt-1" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} autoFocus />
                  <div className="mt-1 text-[12px]"><span className={`num ${len > X_LIMIT ? "text-[var(--bad)] font-[600]" : "text-[var(--muted)]"}`}>{len} de {X_LIMIT}</span></div>
                  {suggest.items.length ? (
                    <div className="mt-2 flex flex-col gap-1.5">
                      {suggest.items.map((s, i) => <button key={i} type="button" onClick={() => setReply(s)} className="text-left sunken px-3 py-2 text-[13px] hover:ring-1 hover:ring-[var(--accent)] enter" style={{ animationDelay: `${i * 50}ms` }}>{s}</button>)}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="btn btn-primary" disabled={!reply.trim() || len > X_LIMIT} onClick={() => setPending({ kind: "responder", text: reply })}>Revisar e responder</button>
                    {aiEnabled ? <button type="button" className="btn" disabled={suggest.loading} onClick={aiSuggest}><IconSpark size={15} />{suggest.loading ? "Pensando…" : "Sugerir respostas"}</button> : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      {/* ---------------- fila: publicar com confirmacao ---------------- */}
      <div className="flex flex-col gap-[var(--gap)] min-w-0">
        <section className="panel panel-pad" aria-label="Prontos para publicar">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="h2">Prontos para publicar</h2>
            <span className="label num">{due.length}</span>
          </div>
          {due.length === 0 ? (
            <p className="mt-2 text-[13px] text-[var(--ink-2)]">Nenhum post na hora agora. Quando um agendado chegar no horário, ele aparece aqui. <Link href="/composer" className="font-[600] text-[var(--accent)] hover:underline">Escrever</Link></p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {due.map((p) => (
                <li key={p.id} className="rounded-[var(--radius)] border border-[color-mix(in_oklab,var(--accent)_40%,var(--line))] p-3 enter">
                  <p className="text-[13.5px] leading-snug line-clamp-3">{p.items[0]?.body}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {p.items.length > 1 ? <span className="tag">Thread de {p.items.length}</span> : null}
                    <span className="text-[12px] text-[var(--muted)] num">era para {fmtTime(p.scheduled_for!)}</span>
                    <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={() => setPublishing(p)}>Publicar no X</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {later.length ? (
            <>
              <h3 className="label mt-4">Próximos</h3>
              <ul className="mt-1 divide">
                {later.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 py-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate">{p.items[0]?.body}</span>
                    <span className="shrink-0 text-[12px] text-[var(--muted)] num">{fmtRelative(p.scheduled_for!, now)}</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPublishing(p)}>Publicar já</button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        <section className="panel panel-pad" aria-label="Publicados por você">
          <h2 className="h2">Publicados por você</h2>
          {published.length === 0 ? (
            <p className="mt-2 text-[13px] text-[var(--ink-2)]">Nada ainda. Depois de publicar, cole o link do post no passo de confirmação para ele aparecer aqui.</p>
          ) : (
            <ul className="mt-1 divide">
              {published.map((p) => (
                <li key={p.id} className="flex items-center gap-2 py-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate">{p.items[0]?.body}</span>
                  {p.x_post_id ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const u = `https://x.com/${username ?? "i"}/status/${p.x_post_id}`; setLink(u); view(undefined, u); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Ver</button>
                  ) : <span className="text-[12px] text-[var(--muted)]">sem link</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* confirmacao de resposta / repost */}
      <dialog ref={confirmRef} className="sheet" aria-labelledby="conf-title" onClose={() => setPending(null)} onCancel={() => setPending(null)}>
        <div className="panel-pad">
          <h2 id="conf-title" className="h2">{pending?.kind === "responder" ? "Responder no X" : "Repostar no X"}</h2>
          <p className="mt-1 text-[13px] text-[var(--ink-2)]">
            {pending?.kind === "responder" ? "O X abre a resposta já escrita. Clique em Responder lá para enviar." : "O X abre a confirmação de repost. Clique em Repostar lá para confirmar."}
          </p>
          {pending?.kind === "responder" ? <p className="mt-3 sunken px-3 py-2 text-[13.5px] whitespace-pre-wrap">{pending.text}</p> : null}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" className="btn" onClick={() => setPending(null)}>Cancelar</button>
            <button type="button" className="btn" onClick={go}><IconExterno size={14} />Abrir no X</button>
            <button type="button" className="btn btn-primary" onClick={done}>Já confirmei no X</button>
          </div>
        </div>
      </dialog>

      <PublishFlow post={publishing} onClose={() => setPublishing(null)} onDone={(id) => {
        setPublishing(null); setQueue((xs) => xs.filter((x) => x.id !== id)); toast.show("Marcado como publicado"); router.refresh();
      }} />
      {toast.node}
    </div>
  );
}
