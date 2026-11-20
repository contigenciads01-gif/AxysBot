"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Post, PostStatus } from "@/lib/types";
import { fmtDay, fmtTime, fmtRelative } from "@/lib/format";
import { PublishFlow, type Publishable } from "./publish-flow";
import { useToast } from "./toast";

const STATUS: { v: PostStatus | "todos"; label: string }[] = [
  { v: "todos", label: "Todos" },
  { v: "agendado", label: "Agendados" },
  { v: "publicado", label: "Publicados" },
  { v: "falhou", label: "Falharam" },
  { v: "rascunho", label: "Rascunhos" },
];

const TAG: Record<PostStatus, string> = {
  rascunho: "tag",
  agendado: "tag tag-blue",
  publicando: "tag tag-blue",
  publicado: "tag tag-ok",
  falhou: "tag tag-bad",
  cancelado: "tag",
};

const NAME: Record<PostStatus, string> = {
  rascunho: "Rascunho",
  agendado: "Agendado",
  publicando: "Publicando",
  publicado: "Publicado",
  falhou: "Falhou",
  cancelado: "Cancelado",
};

const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function extractMediaInfo(body: string, _seed?: string) {
  let previewUrl = "";
  let isVideo = false;
  let cleanBody = body;

  const tagMatch = body.match(/\[(?:midia|media):([^\|\]]+)(?:\|(?:tipo|type):([^\]]+))?\]/i);
  if (tagMatch) {
    const rawUrl = tagMatch[1].trim();
    isVideo = (tagMatch[2] || "").toLowerCase() === "video" || /\.(mp4|mov|webm)/i.test(rawUrl);
    cleanBody = body.replace(/\[(?:midia|media):[^\]]+\]/gi, "").trim();
    // Apenas mídias reais do usuário (bloqueia qualquer modelo/mock antigo do unsplash/mixkit)
    if (!rawUrl.includes("mixkit") && !rawUrl.includes("photo-15") && !rawUrl.includes("unsplash.com") && !rawUrl.includes("images.unsplash")) {
      previewUrl = rawUrl;
    } else {
      previewUrl = "";
    }
    return { cleanBody, previewUrl, isVideo };
  }

  // Se o post não tem anexo de mídia real, não inventa modelo de exemplo
  return { cleanBody: body, previewUrl: "", isVideo: false };
}

// Chave do dia sempre no fuso de São Paulo
const DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function dayKey(d: Date) {
  return DAY_FMT.format(d);
}

export function Agenda({ posts: initial }: { posts: Post[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();

  const [posts, setPosts] = useState(initial);
  const [filter, setFilter] = useState<PostStatus | "todos">((sp.get("status") as PostStatus) ?? "todos");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [publishing, setPublishing] = useState<Publishable | null>(null);

  // Layout: Lista (padrão compacto) ou Grade (cards visuais)
  const [layout, setLayout] = useState<"list" | "grid">("list");

  // Seleção múltipla para ações em massa
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Menus de 3 pontinhos (⋯)
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [activePostMenu, setActivePostMenu] = useState<string | null>(null);

  // Menu de contexto pelo botão direito do mouse
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; post: Post } | null>(null);

  useEffect(() => {
    setMounted(true);
    const savedLayout = localStorage.getItem("agenda_layout");
    if (savedLayout === "grid" || savedLayout === "list") {
      setLayout(savedLayout);
    }
  }, []);

  // Fecha menus ao clicar fora ou apertar Escape
  useEffect(() => {
    function handleGlobalClick() {
      setContextMenu(null);
      setBulkMenuOpen(false);
      setActivePostMenu(null);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setContextMenu(null);
        setBulkMenuOpen(false);
        setActivePostMenu(null);
      }
    }
    window.addEventListener("click", handleGlobalClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const pickFilter = (v: PostStatus | "todos") => {
    setFilter(v);
    const u = new URL(window.location.href);
    if (v === "todos") u.searchParams.delete("status");
    else u.searchParams.set("status", v);
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
    const first = new Date(month),
      start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [month]);

  const list = posts
    .filter((p) => (filter === "todos" ? p.status !== "cancelado" : p.status === filter))
    .filter((p) => !selected || dayKey(new Date(p.published_at ?? p.scheduled_for ?? 0)) === selected)
    .sort((a, b) => new Date(b.scheduled_for ?? b.created_at).getTime() - new Date(a.scheduled_for ?? a.created_at).getTime());

  // Ação individual (PATCH ou DELETE)
  async function act(p: Post, body: { status: string; scheduledFor?: string } | "delete") {
    setBusy(p.id);
    try {
      const r = await fetch(
        `/api/posts/${p.id}`,
        body === "delete"
          ? { method: "DELETE" }
          : { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (body === "delete") {
        setPosts((xs) => xs.filter((x) => x.id !== p.id));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(p.id);
          return next;
        });
        toast.show("🗑️ Post excluído com sucesso");
      } else {
        setPosts((xs) =>
          xs.map((x) =>
            x.id === p.id
              ? { ...x, status: body.status as PostStatus, scheduled_for: body.scheduledFor ?? x.scheduled_for, error: null }
              : x
          )
        );
        toast.show(
          body.status === "agendado" ? "🚀 Reagendado" : body.status === "cancelado" ? "⏸️ Cancelado" : "📝 Movido para rascunhos"
        );
      }
      router.refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Não deu certo.");
    } finally {
      setBusy(null);
    }
  }

  // Ações em massa para os posts selecionados
  async function actBulk(action: "cancelado" | "rascunho" | "delete" | "agendado") {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const count = ids.length;

    if (action === "delete") {
      if (!confirm(`Excluir ${count} post(s) selecionado(s) permanentemente? Não dá para desfazer.`)) return;
    }

    setBusy("bulk");
    try {
      const res = await fetch("/api/posts", {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "delete" ? { ids } : { ids, status: action }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);

      if (action === "delete") {
        setPosts((xs) => xs.filter((x) => !selectedIds.has(x.id)));
        toast.show(`🗑️ ${count} post(s) excluído(s) com sucesso`);
      } else {
        setPosts((xs) =>
          xs.map((x) => (selectedIds.has(x.id) ? { ...x, status: action, error: null } : x))
        );
        toast.show(
          action === "cancelado"
            ? `⏸️ ${count} post(s) cancelado(s)`
            : action === "rascunho"
            ? `📝 ${count} post(s) movido(s) para rascunho`
            : `🚀 ${count} post(s) reagendado(s)`
        );
      }
      setSelectedIds(new Set());
      router.refresh();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro na ação em massa.");
    } finally {
      setBusy(null);
    }
  }

  // Alternar seleção de um post
  function toggleSelect(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Selecionar todos os posts visíveis
  function selectAll() {
    const allIds = new Set(list.map((p) => p.id));
    setSelectedIds(allIds);
    toast.show(`🔘 ${allIds.size} post(s) selecionados`);
  }

  // Desmarcar todos
  function deselectAll() {
    setSelectedIds(new Set());
  }

  // Alternar layout (Lista <-> Grade)
  function toggleLayout() {
    const next = layout === "list" ? "grid" : "list";
    setLayout(next);
    localStorage.setItem("agenda_layout", next);
    toast.show(next === "grid" ? "🗂️ Layout alterado para Grade (Cards)" : "📋 Layout alterado para Lista");
  }

  // Copiar texto limpo do post
  function copyPostText(p: Post) {
    const text = p.items.map((it) => extractMediaInfo(it.body).cleanBody).join("\n\n");
    navigator.clipboard.writeText(text);
    toast.show("📋 Texto do tweet copiado!");
  }

  const today = dayKey(new Date());

  return (
    <div className="grid gap-[var(--gap)] lg:grid-cols-[minmax(0,390px)_minmax(0,1fr)] items-start">
      {/* ---------------- 1. CALENDÁRIO ---------------- */}
      <section className="panel panel-pad" aria-label="Calendário">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label="Mês anterior"
            onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          >
            ‹
          </button>
          <h2 className="h2 capitalize">
            {month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label="Próximo mês"
            onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          >
            ›
          </button>
        </div>
        <div className="mt-3 grid grid-cols-7 text-center label">
          {WEEK.map((w) => (
            <div key={w} className="pb-1.5">
              {w}
            </div>
          ))}
        </div>
        {!mounted ? (
          <div className="skeleton aspect-[7/6] w-full" />
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d) => {
              const k = dayKey(d),
                items = byDay.get(k) ?? [],
                inMonth = d.getMonth() === month.getMonth();
              const isSel = selected === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSelected(isSel ? null : k)}
                  aria-pressed={isSel}
                  aria-label={`${d.toLocaleDateString("pt-BR")}: ${items.length} post(s)`}
                  className={`aspect-square rounded-[var(--radius-sm)] flex flex-col items-center justify-center gap-1 text-[13px] num transition-colors
                    ${inMonth ? "" : "opacity-35"} ${isSel ? "bg-[var(--accent)] text-[var(--on-accent)]" : "hover:bg-[var(--sunken)]"}
                    ${k === today && !isSel ? "ring-1 ring-[var(--accent)] font-[650]" : ""}`}
                >
                  {d.getDate()}
                  <span className="flex gap-0.5 h-1.5">
                    {items.slice(0, 3).map((p) => (
                      <span
                        key={p.id}
                        className="size-1.5 rounded-full"
                        style={{
                          background: isSel
                            ? "currentColor"
                            : p.status === "publicado"
                            ? "var(--ok)"
                            : p.status === "falhou"
                            ? "var(--bad)"
                            : "var(--accent)",
                        }}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-3 text-[12px] text-[var(--ink-2)]">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-[var(--accent)]" />
            Agendado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-[var(--ok)]" />
            Publicado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-[var(--bad)]" />
            Falhou
          </span>
        </div>
      </section>

      {/* ---------------- 2. LISTA / GRADE DE POSTS COM 3 PONTINHOS & BOTÃO DIREITO ---------------- */}
      <section className="flex flex-col gap-[var(--gap)] min-w-0" aria-label="Posts">
        {/* Barra de Filtros, Layout e Menu de 3 Pontinhos */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="seg overflow-x-auto max-w-full" role="group" aria-label="Filtrar por status">
              {STATUS.map((s) => (
                <button
                  key={s.v}
                  type="button"
                  aria-pressed={filter === s.v}
                  onClick={() => pickFilter(s.v)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {selected && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSelected(null)}
              >
                Limpar dia
              </button>
            )}
          </div>

          {/* Controles de Layout e Menu de 3 Pontinhos da Barra */}
          <div className="flex items-center gap-1.5 relative">
            {/* Botão de Alternar Layout */}
            <button
              type="button"
              className="btn btn-sm btn-ghost flex items-center gap-1.5 text-[12px] cursor-pointer"
              onClick={toggleLayout}
              title={layout === "list" ? "Mudar layout para Grade (Cards)" : "Mudar layout para Lista Compacta"}
            >
              <span>{layout === "list" ? "🗂️" : "📋"}</span>
              <span className="hidden sm:inline font-mono">
                {layout === "list" ? "Grade" : "Lista"}
              </span>
            </button>

            {/* Menu de Três Pontinhos da Agenda (⋯) */}
            <div className="relative">
              <button
                type="button"
                className={`btn btn-sm btn-ghost px-2.5 font-bold text-[18px] leading-none transition-all cursor-pointer ${
                  bulkMenuOpen ? "bg-[var(--sunken)] ring-1 ring-[var(--accent)]" : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setBulkMenuOpen(!bulkMenuOpen);
                  setActivePostMenu(null);
                  setContextMenu(null);
                }}
                title="Ações da agenda e seleção em massa"
                aria-label="Mais opções"
              >
                ⋯
              </button>

              {bulkMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-1.5 w-60 rounded-xl bg-[var(--surface)] border border-[var(--line)] shadow-2xl p-1.5 z-50 enter flex flex-col gap-0.5 text-[12.5px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--sunken)] flex items-center gap-2 font-[650] text-[var(--ink)] cursor-pointer"
                    onClick={() => {
                      selectAll();
                      setBulkMenuOpen(false);
                    }}
                  >
                    <span>🔘</span> Selecionar Todos ({list.length})
                  </button>
                  {selectedIds.size > 0 && (
                    <button
                      type="button"
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--sunken)] flex items-center gap-2 text-[var(--muted)] cursor-pointer"
                      onClick={() => {
                        deselectAll();
                        setBulkMenuOpen(false);
                      }}
                    >
                      <span>🔲</span> Desmarcar Todos
                    </button>
                  )}
                  <div className="my-1 border-t border-[var(--line)]" />
                  <button
                    type="button"
                    disabled={selectedIds.size === 0 || busy === "bulk"}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--sunken)] flex items-center gap-2 disabled:opacity-40 cursor-pointer"
                    onClick={() => {
                      actBulk("cancelado");
                      setBulkMenuOpen(false);
                    }}
                  >
                    <span>⏸️</span> Cancelar Selecionados ({selectedIds.size})
                  </button>
                  <button
                    type="button"
                    disabled={selectedIds.size === 0 || busy === "bulk"}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--sunken)] flex items-center gap-2 disabled:opacity-40 cursor-pointer"
                    onClick={() => {
                      actBulk("rascunho");
                      setBulkMenuOpen(false);
                    }}
                  >
                    <span>📝</span> Voltar para Rascunho ({selectedIds.size})
                  </button>
                  <button
                    type="button"
                    disabled={selectedIds.size === 0 || busy === "bulk"}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--bad)]/15 text-[var(--bad)] flex items-center gap-2 font-[650] disabled:opacity-40 cursor-pointer"
                    onClick={() => {
                      actBulk("delete");
                      setBulkMenuOpen(false);
                    }}
                  >
                    <span>🗑️</span> Excluir Selecionados ({selectedIds.size})
                  </button>
                  <div className="my-1 border-t border-[var(--line)]" />
                  <button
                    type="button"
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--sunken)] flex items-center gap-2 cursor-pointer font-medium"
                    onClick={() => {
                      toggleLayout();
                      setBulkMenuOpen(false);
                    }}
                  >
                    <span>{layout === "list" ? "🗂️" : "📋"}</span>
                    <span>Alterar Layout para {layout === "list" ? "Grade" : "Lista"}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Indicador de Seleção Ativa no Topo */}
        {selectedIds.size > 0 && (
          <div className="p-2.5 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/30 flex items-center justify-between gap-2 text-[12.5px]">
            <span className="font-semibold text-[var(--accent)] flex items-center gap-2">
              <span className="size-2 rounded-full bg-[var(--accent)] animate-pulse" />
              {selectedIds.size} de {list.length} posts selecionados
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="btn btn-xs btn-ghost text-[11.5px]"
                onClick={() => actBulk("cancelado")}
              >
                ⏸️ Cancelar
              </button>
              <button
                type="button"
                className="btn btn-xs btn-ghost text-[11.5px]"
                onClick={() => actBulk("rascunho")}
              >
                📝 Rascunho
              </button>
              <button
                type="button"
                className="btn btn-xs bg-rose-600 hover:bg-rose-500 text-white font-bold"
                onClick={() => actBulk("delete")}
              >
                🗑️ Excluir ({selectedIds.size})
              </button>
              <button
                type="button"
                className="btn btn-xs btn-ghost text-[11px] text-[var(--muted)]"
                onClick={deselectAll}
              >
                ✕ Desmarcar
              </button>
            </div>
          </div>
        )}

        {/* Lista ou Grade de Posts */}
        {list.length === 0 ? (
          <div className="panel panel-pad text-[13.5px] text-[var(--ink-2)]">
            Nada por aqui com esse filtro.
          </div>
        ) : (
          <ul
            className={
              layout === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 gap-3"
                : "flex flex-col gap-2"
            }
          >
            {list.map((p) => {
              const iso = p.published_at ?? p.scheduled_for;
              const isSelected = selectedIds.has(p.id);

              return (
                <li
                  key={p.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({ x: e.clientX, y: e.clientY, post: p });
                    setActivePostMenu(null);
                    setBulkMenuOpen(false);
                  }}
                  className={`panel panel-pad enter [content-visibility:auto] [contain-intrinsic-size:auto_140px] relative transition-all ${
                    isSelected
                      ? "ring-2 ring-[var(--accent)] bg-[var(--accent)]/5 border-[var(--accent)]"
                      : "hover:border-[var(--accent)]/40"
                  }`}
                >
                  {/* Cabeçalho do Card com Checkbox, Status e Três Pontinhos */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Checkbox para seleção individual */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => toggleSelect(p.id, e as unknown as React.MouseEvent)}
                      className="size-4 cursor-pointer rounded border-[var(--line)] text-[var(--accent)] accent-[var(--accent)]"
                      title="Selecionar post"
                    />

                    <span className={TAG[p.status]}>{NAME[p.status]}</span>
                    {p.items.length > 1 && (
                      <span className="tag">Thread de {p.items.length}</span>
                    )}

                    {iso && (
                      <span className="text-[12px] sm:text-[12.5px] text-[var(--ink-2)] num">
                        {fmtDay(iso)}, {fmtTime(iso)}{" "}
                        <span className="text-[var(--muted)]">({fmtRelative(iso)})</span>
                      </span>
                    )}

                    {/* Botão de Ação Principal e Três Pontinhos Individuais */}
                    <div className="ml-auto flex items-center gap-1.5 relative">
                      {(p.status === "agendado" || p.status === "rascunho") && (
                        <button
                          type="button"
                          className="btn btn-sm cursor-pointer"
                          onClick={() => setPublishing(p)}
                        >
                          Publicar no X
                        </button>
                      )}

                      {/* Botão de Três Pontinhos do Post (⋯) */}
                      <div className="relative">
                        <button
                          type="button"
                          className={`btn btn-sm btn-ghost px-2 text-[16px] font-bold leading-none cursor-pointer ${
                            activePostMenu === p.id ? "bg-[var(--sunken)]" : ""
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePostMenu(activePostMenu === p.id ? null : p.id);
                            setBulkMenuOpen(false);
                            setContextMenu(null);
                          }}
                          title="Opções do post"
                          aria-label="Mais ações"
                        >
                          ⋯
                        </button>

                        {activePostMenu === p.id && (
                          <div
                            className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-[var(--surface)] border border-[var(--line)] shadow-2xl p-1.5 z-50 enter flex flex-col gap-0.5 text-[12px]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(p.status === "agendado" || p.status === "rascunho") && (
                              <button
                                type="button"
                                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--sunken)] flex items-center gap-2 font-[650] cursor-pointer"
                                onClick={() => {
                                  setActivePostMenu(null);
                                  setPublishing(p);
                                }}
                              >
                                <span>🚀</span> Publicar no X
                              </button>
                            )}

                            <button
                              type="button"
                              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--sunken)] flex items-center gap-2 cursor-pointer"
                              onClick={() => {
                                copyPostText(p);
                                setActivePostMenu(null);
                              }}
                            >
                              <span>📋</span> Copiar Texto
                            </button>

                            {p.status === "agendado" && (
                              <button
                                type="button"
                                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--sunken)] flex items-center gap-2 cursor-pointer"
                                onClick={() => {
                                  act(p, { status: "rascunho" });
                                  setActivePostMenu(null);
                                }}
                              >
                                <span>📝</span> Voltar para Rascunho
                              </button>
                            )}

                            {p.status === "agendado" && (
                              <button
                                type="button"
                                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--sunken)] flex items-center gap-2 cursor-pointer"
                                onClick={() => {
                                  act(p, { status: "cancelado" });
                                  setActivePostMenu(null);
                                }}
                              >
                                <span>⏸️</span> Cancelar Post
                              </button>
                            )}

                            <button
                              type="button"
                              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--sunken)] flex items-center gap-2 cursor-pointer"
                              onClick={() => {
                                toggleSelect(p.id);
                                setActivePostMenu(null);
                              }}
                            >
                              <span>{isSelected ? "🔲" : "☑️"}</span>
                              <span>{isSelected ? "Desmarcar" : "Selecionar"}</span>
                            </button>

                            <div className="my-1 border-t border-[var(--line)]" />

                            <button
                              type="button"
                              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--bad)]/15 text-[var(--bad)] flex items-center gap-2 font-[650] cursor-pointer"
                              onClick={() => {
                                setActivePostMenu(null);
                                if (confirm("Excluir este post? Não dá para desfazer.")) act(p, "delete");
                              }}
                            >
                              <span>🗑️</span> Excluir
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Conteúdo com Texto e Miniatura Congelada */}
                  <div className="mt-2.5 flex flex-row items-start justify-between gap-3 sm:gap-4">
                    {/* Texto do Post e Botões */}
                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      {p.items.map((it) => {
                        const media = extractMediaInfo(it.body, `${p.id}-${it.position}`);
                        return (
                          <p
                            key={it.position}
                            className="text-[13px] sm:text-[13.5px] leading-snug whitespace-pre-wrap text-[var(--ink)]"
                          >
                            {media.cleanBody}
                          </p>
                        );
                      })}

                      {p.error && (
                        <p className="mt-2 text-[12px] text-[var(--bad)]">Motivo: {p.error}</p>
                      )}

                      {/* Botões de Ação na barra inferior do post */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {p.status === "publicado" && p.x_post_id && (
                          <a
                            className="btn btn-sm"
                            href={`https://x.com/i/web/status/${p.x_post_id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Abrir no X ↗
                          </a>
                        )}

                        {p.status === "falhou" || p.status === "rascunho" || p.status === "cancelado" ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary cursor-pointer"
                            disabled={busy === p.id}
                            onClick={() =>
                              act(p, {
                                status: "agendado",
                                scheduledFor: new Date(Date.now() + 2 * 60e3).toISOString(),
                              })
                            }
                          >
                            {p.status === "falhou" ? "Tentar de novo" : "Publicar em 2 min"}
                          </button>
                        ) : null}

                        {p.status === "agendado" && (
                          <>
                            <button
                              type="button"
                              className="btn btn-sm cursor-pointer"
                              disabled={busy === p.id}
                              onClick={() => act(p, { status: "cancelado" })}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost cursor-pointer"
                              disabled={busy === p.id}
                              onClick={() => act(p, { status: "rascunho" })}
                            >
                              Voltar para rascunho
                            </button>
                          </>
                        )}

                        {p.status !== "publicado" && p.status !== "publicando" && (
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost btn-danger cursor-pointer"
                            disabled={busy === p.id}
                            onClick={() => {
                              if (confirm("Excluir este post? Não dá para desfazer.")) act(p, "delete");
                            }}
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    </div>

                    {/* MINIATURA ESTÁTICA CONGELADA (SEM RODAR VÍDEO, ULTRA LEVE) */}
                    {(() => {
                      const firstItem = p.items[0];
                      const media = extractMediaInfo(firstItem ? firstItem.body : "", p.id);
                      if (!media?.previewUrl) return null;

                      const secondItem = p.items[1];
                      const secondMedia = secondItem ? extractMediaInfo(secondItem.body, `${p.id}-2`) : null;

                      return (
                        <div className="flex items-center gap-2 shrink-0 self-start">
                          <div className="w-[78px] h-[104px] sm:w-[88px] sm:h-[116px] rounded-xl overflow-hidden bg-zinc-900 border border-[var(--line)] relative shadow-sm group">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={media.previewUrl}
                              alt="Miniatura congelada do post"
                              className="object-cover size-full group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
                              }}
                            />
                            {/* Badge de Foto ou Vídeo no topo */}
                            <div className="absolute top-1.5 left-1.5 pointer-events-none">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[8px] sm:text-[8.5px] font-[750] font-mono tracking-wider ${
                                  media.isVideo
                                    ? "bg-purple-950/85 text-purple-300 border border-purple-500/40"
                                    : "bg-sky-950/85 text-sky-300 border border-sky-500/40"
                                }`}
                              >
                                {media.isVideo ? "VÍDEO" : "FOTO"}
                              </span>
                            </div>
                            {/* Ícone de Play estático se for vídeo */}
                            {media.isVideo && (
                              <div className="absolute inset-0 bg-black/25 flex items-center justify-center pointer-events-none">
                                <span className="size-6 rounded-full bg-black/50 backdrop-blur border border-white/60 flex items-center justify-center text-white text-[10px] pl-0.5">
                                  ▶
                                </span>
                              </div>
                            )}
                          </div>

                          {secondMedia?.previewUrl && (
                            <div className="w-[78px] h-[104px] sm:w-[88px] sm:h-[116px] rounded-xl overflow-hidden bg-zinc-900 border border-[var(--line)] relative shadow-sm group hidden md:block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={secondMedia.previewUrl}
                                alt="Miniatura congelada 2"
                                className="object-cover size-full group-hover:scale-105 transition-transform duration-300"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
                                }}
                              />
                              <div className="absolute top-1.5 left-1.5 pointer-events-none">
                                <span className="px-1.5 py-0.5 rounded text-[8px] sm:text-[8.5px] font-[750] font-mono tracking-wider bg-sky-950/85 text-sky-300 border border-sky-500/40">
                                  {secondMedia.isVideo ? "VÍDEO" : "FOTO"}
                                </span>
                              </div>
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

      {/* ---------------- 3. MENU DE CONTEXTO PELO BOTÃO DIREITO DO MOUSE ---------------- */}
      {contextMenu && (
        <div
          className="fixed z-[100] w-60 rounded-xl bg-[var(--surface)]/95 backdrop-blur-md border border-[var(--line)] shadow-2xl p-1.5 enter flex flex-col gap-0.5 text-[12.5px]"
          style={{
            left: Math.min(
              contextMenu.x,
              typeof window !== "undefined" ? window.innerWidth - 250 : contextMenu.x
            ),
            top: Math.min(
              contextMenu.y,
              typeof window !== "undefined" ? window.innerHeight - 300 : contextMenu.y
            ),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2.5 py-1 text-[11px] font-mono text-[var(--muted)] border-b border-[var(--line)] mb-0.5 truncate flex items-center justify-between">
            <span>Ações Rápidas (Post)</span>
            <span className="text-[10px] text-[var(--ink-2)]">Botão Direito</span>
          </div>

          {(contextMenu.post.status === "agendado" || contextMenu.post.status === "rascunho") && (
            <button
              type="button"
              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--sunken)] flex items-center gap-2 font-[650] text-[var(--ink)] cursor-pointer"
              onClick={() => {
                const p = contextMenu.post;
                setContextMenu(null);
                setPublishing(p);
              }}
            >
              <span>🚀</span> Publicar no X
            </button>
          )}

          <button
            type="button"
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--sunken)] flex items-center gap-2 cursor-pointer"
            onClick={() => {
              copyPostText(contextMenu.post);
              setContextMenu(null);
            }}
          >
            <span>📋</span> Copiar Texto do Tweet
          </button>

          {contextMenu.post.status === "agendado" && (
            <button
              type="button"
              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--sunken)] flex items-center gap-2 cursor-pointer"
              onClick={() => {
                act(contextMenu.post, { status: "rascunho" });
                setContextMenu(null);
              }}
            >
              <span>📝</span> Voltar para Rascunho
            </button>
          )}

          {contextMenu.post.status === "agendado" && (
            <button
              type="button"
              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--sunken)] flex items-center gap-2 cursor-pointer"
              onClick={() => {
                act(contextMenu.post, { status: "cancelado" });
                setContextMenu(null);
              }}
            >
              <span>⏸️</span> Cancelar Agendamento
            </button>
          )}

          <div className="my-1 border-t border-[var(--line)]" />

          <button
            type="button"
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--sunken)] flex items-center gap-2 cursor-pointer font-medium"
            onClick={() => {
              toggleSelect(contextMenu.post.id);
              setContextMenu(null);
            }}
          >
            <span>{selectedIds.has(contextMenu.post.id) ? "🔲" : "☑️"}</span>
            <span>
              {selectedIds.has(contextMenu.post.id) ? "Desmarcar este Post" : "Selecionar este Post"}
            </span>
          </button>

          <button
            type="button"
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--sunken)] flex items-center gap-2 cursor-pointer font-medium"
            onClick={() => {
              selectAll();
              setContextMenu(null);
            }}
          >
            <span>🔘</span> Selecionar Todos ({list.length})
          </button>

          <button
            type="button"
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--sunken)] flex items-center gap-2 cursor-pointer font-medium"
            onClick={() => {
              toggleLayout();
              setContextMenu(null);
            }}
          >
            <span>{layout === "list" ? "🗂️" : "📋"}</span>
            <span>Mudar para {layout === "list" ? "Grade" : "Lista"}</span>
          </button>

          <div className="my-1 border-t border-[var(--line)]" />

          <button
            type="button"
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--bad)]/15 text-[var(--bad)] flex items-center gap-2 font-[650] cursor-pointer"
            onClick={() => {
              const p = contextMenu.post;
              setContextMenu(null);
              if (confirm("Excluir este post? Não dá para desfazer.")) act(p, "delete");
            }}
          >
            <span>🗑️</span> Excluir Post
          </button>
        </div>
      )}

      {/* ---------------- 4. BARRA FLUTUANTE DE AÇÕES EM MASSA NO RODAPÉ ---------------- */}
      {selectedIds.size > 0 && (
        <aside
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 liquid-glass glass-card px-5 py-3 rounded-2xl border border-[var(--accent)]/50 shadow-2xl flex flex-wrap items-center gap-3 animate-fade-in bg-[var(--surface)]/95 backdrop-blur-md"
          data-glass
        >
          <span className="font-[750] text-[13px] text-[var(--ink)] flex items-center gap-2">
            <span className="size-2 rounded-full bg-[var(--accent)] animate-pulse" />
            <span>{selectedIds.size} selecionado(s)</span>
          </span>

          <div className="h-4 w-px bg-[var(--line)]" />

          <button
            type="button"
            className="btn btn-sm btn-ghost text-[12px] cursor-pointer"
            disabled={busy === "bulk"}
            onClick={() => actBulk("cancelado")}
          >
            ⏸️ Cancelar
          </button>

          <button
            type="button"
            className="btn btn-sm btn-ghost text-[12px] cursor-pointer"
            disabled={busy === "bulk"}
            onClick={() => actBulk("rascunho")}
          >
            📝 Rascunho
          </button>

          <button
            type="button"
            className="btn btn-sm bg-rose-600 hover:bg-rose-500 text-white font-[700] text-[12px] cursor-pointer shadow-sm"
            disabled={busy === "bulk"}
            onClick={() => actBulk("delete")}
          >
            🗑️ Excluir Todos ({selectedIds.size})
          </button>

          <button
            type="button"
            className="btn btn-sm btn-ghost text-[11.5px] text-[var(--muted)] cursor-pointer"
            onClick={deselectAll}
          >
            ✕ Limpar
          </button>
        </aside>
      )}

      {/* ---------------- 5. FLUXO DE PUBLICAÇÃO NO X ---------------- */}
      <PublishFlow
        post={publishing}
        onClose={() => setPublishing(null)}
        onDone={(id) => {
          setPublishing(null);
          setPosts((xs) =>
            xs.map((x) =>
              x.id === id ? { ...x, status: "publicado", published_at: new Date().toISOString() } : x
            )
          );
          toast.show("Marcado como publicado");
          router.refresh();
        }}
      />
      {toast.node}
    </div>
  );
}
