"use client";
import { useState } from "react";
import { weightedLength, X_LIMIT } from "@/lib/thread";
import { fmtRelative } from "@/lib/format";
import { IconSpark } from "./icons";
import { useToast } from "./toast";

interface Mention { x_post_id: string; author_handle: string | null; author_name: string | null; body: string; created_at: string; replied: boolean; reply_post_id: string | null }

export function Inbox({ mentions: initial, aiEnabled }: { mentions: Mention[]; aiEnabled: boolean }) {
  const toast = useToast();
  const [mentions, setMentions] = useState(initial);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [suggest, setSuggest] = useState<{ loading: boolean; items: string[] }>({ loading: false, items: [] });
  const [sending, setSending] = useState(false);

  const shown = mentions.filter((m) => !onlyOpen || !m.replied);
  const open = (id: string) => { setOpenId(id === openId ? null : id); setDraft(""); setSuggest({ loading: false, items: [] }); };

  async function aiSuggest(m: Mention) {
    setSuggest({ loading: true, items: [] });
    try {
      const r = await fetch("/api/ai/compose", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "resposta", input: `@${m.author_handle}: ${m.body}` }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setSuggest({ loading: false, items: j.options.flatMap((o: { items: string[] }) => o.items).slice(0, 3) });
    } catch (e) { setSuggest({ loading: false, items: [] }); toast.show(e instanceof Error ? e.message : "A IA não respondeu."); }
  }

  async function reply(m: Mention) {
    setSending(true);
    try {
      const r = await fetch(`/api/mentions/${m.x_post_id}/reply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: draft }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMentions((xs) => xs.map((x) => (x.x_post_id === m.x_post_id ? { ...x, replied: true, reply_post_id: j.id } : x)));
      setOpenId(null); setDraft("");
      toast.show("Resposta publicada");
    } catch (e) { toast.show(e instanceof Error ? e.message : "Não deu para responder."); }
    finally { setSending(false); }
  }

  return (
    <div className="flex flex-col gap-[var(--gap)] max-w-[760px]">
      <div className="seg self-start" role="group" aria-label="Filtro">
        <button type="button" aria-pressed={onlyOpen} onClick={() => setOnlyOpen(true)}>Para responder</button>
        <button type="button" aria-pressed={!onlyOpen} onClick={() => setOnlyOpen(false)}>Todas</button>
      </div>

      {shown.length === 0 ? (
        <div className="panel panel-pad text-[13.5px] text-[var(--ink-2)]">
          {onlyOpen ? "Nenhuma menção esperando resposta." : "Nenhuma menção ainda."} As menções chegam na sincronização, a cada 2 horas, ou quando você clica em Sincronizar no Painel.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((m) => {
            const isOpen = openId === m.x_post_id, len = weightedLength(draft);
            return (
              <li key={m.x_post_id} className={`panel panel-pad ${isOpen ? "border-[var(--accent)]" : ""}`}>
                <button type="button" className="w-full text-left" onClick={() => open(m.x_post_id)} aria-expanded={isOpen}>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-[620]">{m.author_name ?? m.author_handle}</span>
                    <span className="text-[12.5px] text-[var(--muted)]">@{m.author_handle}</span>
                    <span className="ml-auto text-[12px] text-[var(--muted)] num">{fmtRelative(m.created_at)}</span>
                  </div>
                  <p className="mt-1 text-[13.5px] leading-snug whitespace-pre-wrap">{m.body}</p>
                  {m.replied ? <span className="tag tag-ok mt-2">Respondida</span> : null}
                </button>

                {isOpen && !m.replied ? (
                  <div className="mt-3 border-t border-[var(--line)] pt-3 enter">
                    <label className="label" htmlFor={`r-${m.x_post_id}`}>Sua resposta</label>
                    <textarea id={`r-${m.x_post_id}`} className="textarea mt-1" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
                    <div className="mt-1 flex items-center justify-between text-[12px]">
                      <span className={`num ${len > X_LIMIT ? "text-[var(--bad)] font-[600]" : "text-[var(--muted)]"}`}>{len} de {X_LIMIT}</span>
                    </div>
                    {suggest.items.length ? (
                      <div className="mt-2 flex flex-col gap-1.5">
                        {suggest.items.map((s, i) => (
                          <button key={i} type="button" onClick={() => setDraft(s)} className="text-left sunken px-3 py-2 text-[13px] hover:ring-1 hover:ring-[var(--accent)] enter" style={{ animationDelay: `${i * 50}ms` }}>{s}</button>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="btn btn-primary" disabled={!draft.trim() || len > X_LIMIT || sending} onClick={() => reply(m)}>{sending ? "Respondendo…" : "Responder"}</button>
                      {aiEnabled ? (
                        <button type="button" className="btn" disabled={suggest.loading} onClick={() => aiSuggest(m)}>
                          <IconSpark size={15} />{suggest.loading ? "Pensando…" : "Sugerir respostas"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {toast.node}
    </div>
  );
}
