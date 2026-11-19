"use client";
import { useEffect, useRef, useState } from "react";
import { parsePostRef, postIntent } from "@/lib/intents";
import { IconExterno, IconCheck } from "./icons";

export interface Publishable { id: string; items: { position: number; body: string }[] }

/** Abre a tela do X numa aba nova. Sem opener: o x.com nao controla o painel. */
export function openX(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Publicar sem API: cada post abre no X ja escrito, e VOCE clica em Postar la.
 * Thread: o X so encadeia se souber o ID do post anterior, por isso o link
 * de cada post publicado e colado aqui antes de abrir o proximo.
 */
export function PublishFlow({ post, onClose, onDone }: { post: Publishable | null; onClose: () => void; onDone: (id: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [links, setLinks] = useState<string[]>([]);
  const [opened, setOpened] = useState<boolean[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = post ? [...post.items].sort((a, b) => a.position - b.position) : [];
  const isThread = items.length > 1;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (post) { setLinks(items.map(() => "")); setOpened(items.map(() => false)); setError(null); if (!d.open) d.showModal(); }
    else if (d.open) d.close();
  }, [post]); // eslint-disable-line react-hooks/exhaustive-deps

  const idAt = (i: number) => parsePostRef(links[i] ?? "")?.id ?? null;
  const canOpen = (i: number) => i === 0 || Boolean(idAt(i - 1));

  function open(i: number) {
    openX(postIntent(items[i].body, i > 0 ? idAt(i - 1) : null));
    setOpened((o) => o.map((v, j) => (j === i ? true : v)));
  }

  async function confirm() {
    if (!post) return;
    const bad = links.findIndex((l) => l.trim() && !parsePostRef(l));
    if (bad >= 0) { setError(`O link do post ${bad + 1} não parece um link de post do X.`); return; }
    setSaving(true); setError(null);
    try {
      const r = await fetch(`/api/posts/${post.id}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ links }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      onDone(post.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Não deu para salvar."); }
    finally { setSaving(false); }
  }

  return (
    <dialog ref={ref} className="sheet" aria-labelledby="pub-title" onClose={onClose} onCancel={onClose}>
      <div className="panel-pad">
        <h2 id="pub-title" className="h2">{isThread ? `Publicar thread de ${items.length} posts` : "Publicar no X"}</h2>
        <p className="mt-1 text-[13px] text-[var(--ink-2)] max-w-[56ch]">
          O X abre numa aba nova com o texto pronto. Confira e clique em <b>Postar</b> lá: nada sai sem o seu clique.
          {isThread ? " Depois de postar, copie o link do post e cole aqui para o próximo sair como resposta." : ""}
        </p>
        <ol className="mt-4 flex flex-col gap-3">
          {items.map((it, i) => (
            <li key={it.position} className="rounded-[var(--radius)] border border-[var(--line)] p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="label">{isThread ? `Post ${i + 1} de ${items.length}` : "Texto"}</span>
                {opened[i] ? <span className="tag tag-blue"><IconCheck size={12} />Aberto no X</span> : null}
              </div>
              <p className="mt-1 text-[13.5px] leading-snug whitespace-pre-wrap">{it.body}</p>
              <div className="mt-2.5 flex flex-wrap items-end gap-2">
                <button type="button" className={`btn btn-sm ${!opened[i] && canOpen(i) ? "btn-primary" : ""}`} disabled={!canOpen(i)} onClick={() => open(i)}>
                  <IconExterno size={14} />{i === 0 ? "Abrir no X" : "Abrir resposta no X"}
                </button>
                <label className="flex-1 min-w-[200px]">
                  <span className="label">Link do post publicado{i === items.length - 1 ? " (opcional)" : ""}</span>
                  <input className="input mt-1 h-9 text-[13px]" inputMode="url" autoComplete="off" placeholder="https://x.com/voce/status/…"
                    value={links[i] ?? ""} onChange={(e) => setLinks((l) => l.map((v, j) => (j === i ? e.target.value : v)))} />
                </label>
              </div>
              {i < items.length - 1 && !canOpen(i + 1) && opened[i] ? <p className="mt-1.5 text-[12px] text-[var(--muted)]">Cole o link deste post para liberar o próximo.</p> : null}
            </li>
          ))}
        </ol>
        {error ? <p className="mt-3 text-[12.5px] text-[var(--bad)]" role="alert">{error}</p> : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Fechar</button>
          <button type="button" className="btn btn-primary" disabled={saving || !opened.some(Boolean)} onClick={confirm}>
            {saving ? "Salvando…" : "Já publiquei, marcar como publicado"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
