"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/toast";
import { DriveMediaItem, DriveConfig } from "@/app/api/drive/route";

export default function DriveMediaPage() {
  const toast = useToast();
  const [drive, setDrive] = useState<DriveConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Estados de edição em massa
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkHashtags, setBulkHashtags] = useState("#vip #exclusive #preview #lifestyle");
  const [bulkSuffix, setBulkSuffix] = useState("Conteúdo completo no link da bio 🔗");

  // Configuração de agendamento em lote
  const [startDateTime, setStartDateTime] = useState(() => {
    const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [intervalHours, setIntervalHours] = useState(4);

  // Carrega configuração e acervo do Drive
  async function loadDrive() {
    try {
      setLoading(true);
      const res = await fetch("/api/drive");
      const data = await res.json();
      if (data.ok && data.drive) {
        setDrive(data.drive);
      }
    } catch {
      toast.show("Erro ao carregar acervo do Drive.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDrive();
  }, []);

  // Intercalar itens (Foto -> Vídeo -> Foto -> Vídeo)
  function handleInterleave() {
    if (!drive) return;
    const photos = drive.items.filter((i) => i.type === "photo");
    const videos = drive.items.filter((i) => i.type === "video");
    const interleaved: DriveMediaItem[] = [];

    const maxLen = Math.max(photos.length, videos.length);
    for (let i = 0; i < maxLen; i++) {
      if (photos[i]) interleaved.push(photos[i]);
      if (videos[i]) interleaved.push(videos[i]);
    }

    setDrive({ ...drive, items: interleaved, autoInterleave: true });
    toast.show("🔀 Itens intercalados com sucesso: Foto ➔ Vídeo!");
  }

  // Atualizar campo de um item individual (1 a 1)
  function handleItemChange(id: string, field: "caption" | "hashtags", value: string) {
    if (!drive) return;
    const updated = drive.items.map((item) => {
      if (item.id !== id) return item;
      if (field === "caption") return { ...item, caption: value };
      if (field === "hashtags") {
        const tags = value.split(/[,\s]+/).map((t) => (t.startsWith("#") ? t : `#${t}`)).filter((t) => t.length > 1);
        return { ...item, hashtags: tags };
      }
      return item;
    });
    setDrive({ ...drive, items: updated });
  }

  // Gerar legendas e hashtags com IA
  async function handleGenerateCaptions() {
    if (!drive || drive.items.length === 0) return;
    setBusy("generate");
    try {
      const res = await fetch("/api/drive/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: drive.items, customHashtags: bulkHashtags }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setDrive({ ...drive, items: data.items });
      toast.show("✨ Legendas e hashtags geradas com IA para todo o acervo!");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao gerar legendas.");
    } finally {
      setBusy(null);
    }
  }

  // Aplicar edição em massa
  function handleApplyBulk(e: React.FormEvent) {
    e.preventDefault();
    if (!drive) return;

    const tags = bulkHashtags
      .split(/[,\s]+/)
      .map((t) => (t.startsWith("#") ? t : `#${t}`))
      .filter((t) => t.length > 1);

    const updated = drive.items.map((item) => ({
      ...item,
      hashtags: tags,
      caption: bulkSuffix ? `${item.caption.replace(/ -.*$/, "")}\n\n${bulkSuffix}`.trim() : item.caption,
    }));

    setDrive({ ...drive, items: updated });
    setBulkModalOpen(false);
    toast.show("⚡ Edição em massa aplicada a todas as mídias!");
  }

  // Salvar pasta e sincronizar
  async function handleSaveDriveFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!drive) return;
    setBusy("save_drive");
    try {
      const res = await fetch("/api/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderUrl: drive.folderUrl,
          folderName: drive.folderName,
          autoInterleave: drive.autoInterleave,
          autoPostingEnabled: drive.autoPostingEnabled,
          items: drive.items,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setDrive(data.drive);
      toast.show("💾 Pasta do Drive salva e sincronizada com sucesso!");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao salvar pasta.");
    } finally {
      setBusy(null);
    }
  }

  // Alternar Ligar / Desligar Postagens do Drive (Modo Apenas Aquecimento)
  async function togglePosting() {
    if (!drive) return;
    const next = !drive.autoPostingEnabled;
    setBusy("toggle_posting");
    try {
      const res = await fetch("/api/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoPostingEnabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setDrive(data.drive);
      toast.show(
        next
          ? "🚀 Postagens de Vídeos/Fotos ATIVADAS! O bot postará na agenda."
          : "🔥 Modo APENAS AQUECIMENTO ATIVO! Postagens de vídeos pausadas."
      );
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao alterar postagens.");
    } finally {
      setBusy(null);
    }
  }

  // Analisar Cenário, Roupa e Posição de um item individual com Visão IA
  async function handleAnalyzeItem(id: string) {
    if (!drive) return;
    const item = drive.items.find((i) => i.id === id);
    if (!item) return;

    setBusy(`analyze_${id}`);
    try {
      const res = await fetch("/api/drive/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const updated = drive.items.map((i) => (i.id === id ? data.item : i));
      setDrive({ ...drive, items: updated });
      toast.show(`👁️ Visão IA: Cenário e Roupa analisados! Legenda dedicada pronta.`);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro na análise visual.");
    } finally {
      setBusy(null);
    }
  }

  // Programar todos os posts na Agenda do X (analisando cenário, roupa e posição antes de agendar)
  async function handleScheduleAll() {
    if (!drive || drive.items.length === 0) return;
    setBusy("schedule_all");
    try {
      toast.show("👁️ Visão IA: Puxando mídias do Drive e analisando cenário, roupa e posição de cada uma...");

      // 1. Analisa itens que ainda não tiveram visão IA processada
      const analyzedItems: DriveMediaItem[] = [];
      for (const it of drive.items) {
        if (it.visualAnalysis) {
          analyzedItems.push(it);
        } else {
          try {
            const aRes = await fetch("/api/drive/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ item: it }),
            });
            const aData = await aRes.json();
            analyzedItems.push(aData.ok && aData.item ? aData.item : it);
          } catch {
            analyzedItems.push(it);
          }
        }
      }

      setDrive({ ...drive, items: analyzedItems });

      // 2. Agenda os posts com as legendas dedicadas
      const res = await fetch("/api/drive/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: analyzedItems,
          startDateTime,
          intervalHours,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Marca itens como agendados
      const updated = analyzedItems.map((i) => ({ ...i, status: "scheduled" as const }));
      setDrive({ ...drive, items: updated });

      toast.show(`🚀 ${data.count} posts programados com legendas dedicadas por cenário e roupa na Agenda do X!`);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao programar posts.");
    } finally {
      setBusy(null);
    }
  }

  // Puxar próximo lote de 6 fotos do Google Drive
  async function handlePullNext6() {
    setBusy("pull_6");
    try {
      const res = await fetch("/api/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pull_next_6" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setDrive(data.drive);
      toast.show("📦 Novo lote de 6 mídias puxado do Google Drive com sucesso!");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao puxar lote do Drive.");
    } finally {
      setBusy(null);
    }
  }

  // Descartar mídia da memória ativa (libera RAM) e puxa a próxima do Google Drive
  async function handleDiscardItem(itemId: string) {
    setBusy(`discard_${itemId}`);
    try {
      const res = await fetch("/api/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discard_published", publishedItemId: itemId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setDrive(data.drive);
      toast.show("🧹 Mídia descartada da memória do bot! Próxima foto do Drive puxada para manter o lote de 6.");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao descartar mídia.");
    } finally {
      setBusy(null);
    }
  }

  if (loading || !drive) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <span className="size-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        <p className="text-[13px] text-[var(--muted)]">Carregando acervo de mídia do Drive...</p>
      </div>
    );
  }

  const photosCount = drive.items.filter((i) => i.type === "photo").length;
  const videosCount = drive.items.filter((i) => i.type === "video").length;

  return (
    <div className="space-y-6 max-w-[1240px]">
      {/* 1. TOPO: TÍTULO & PAINEL DE CONEXÃO DO DRIVE */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--line)] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[22px]">📁</span>
            <h1 className="text-[22px] font-[750] tracking-tight text-[var(--ink)]">
              Drive de Mídia — Acervo de Fotos & Vídeos
            </h1>
            <span className="liquid-glass-chip px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
              CONECTADO
            </span>
          </div>
          <p className="text-[13px] text-[var(--ink-2)] mt-1">
            Conexão com Google Drive para intercalação de fotos e vídeos, criação inteligente de legendas com IA e agendamento em lote na conta do X.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* BOTÃO INDEPENDENTE: LIGAR / DESLIGAR POSTAGENS DE VÍDEO DO DRIVE */}
          <button
            type="button"
            onClick={togglePosting}
            disabled={busy === "toggle_posting"}
            className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-[650] flex items-center gap-2 border transition-all cursor-pointer shadow-sm select-none ${
              drive.autoPostingEnabled
                ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/50"
                : "bg-amber-950/40 border-amber-500/50 text-amber-300 hover:bg-amber-900/50"
            }`}
            title="Alternar entre postar vídeos na agenda ou apenas aquecer a conta"
          >
            <span
              className={`size-2 rounded-full transition-all ${
                drive.autoPostingEnabled
                  ? "bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse"
                  : "bg-amber-400 shadow-[0_0_8px_#fbbf24]"
              }`}
            />
            <span>{drive.autoPostingEnabled ? "Postar Vídeos: Ligado" : "Postar Vídeos: Pausado"}</span>
          </button>

          <button
            type="button"
            className="btn btn-glass flex items-center gap-1.5"
            onClick={handlePullNext6}
            disabled={busy !== null}
            title="Puxar lote de 6 em 6 mídias da pasta do Google Drive"
          >
            <span>🔄</span> {busy === "pull_6" ? "Puxando..." : "Puxar 6 do Drive"}
          </button>

          <button
            type="button"
            className="btn btn-glass flex items-center gap-1.5"
            onClick={handleInterleave}
            title="Intercalar automaticamente Foto ➔ Vídeo ➔ Foto ➔ Vídeo"
          >
            <span>🔀</span> Intercalar Foto/Vídeo
          </button>

          <button
            type="button"
            className="btn btn-glass flex items-center gap-1.5"
            onClick={() => setBulkModalOpen(true)}
          >
            <span>📝</span> Edição em Massa
          </button>

          <button
            type="button"
            className="btn btn-primary flex items-center gap-1.5"
            onClick={handleGenerateCaptions}
            disabled={busy !== null}
          >
            <span>✨</span> {busy === "generate" ? "Gerando com IA..." : "Gerar com IA"}
          </button>
        </div>
      </section>

      {/* BANNER INFORMATIVO DO MODO SELECIONADO */}
      {!drive.autoPostingEnabled ? (
        <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[12.5px] text-amber-200">
          <div className="flex items-center gap-2.5">
            <span className="text-[18px]">🔥</span>
            <div>
              <span className="font-[750] text-amber-300 block sm:inline">Modo Apenas Aquecimento Ativo:</span>{" "}
              <span>O bot está ligado e aquecendo a conta (curtidas, scroll, retenção), mas a postagem de vídeos e fotos do Drive está <strong>PAUSADA</strong>.</span>
            </div>
          </div>
          <button
            type="button"
            onClick={togglePosting}
            className="btn btn-xs bg-amber-500 hover:bg-amber-400 text-black font-[700] shrink-0"
          >
            Ligar Postagens
          </button>
        </div>
      ) : (
        <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[12.5px] text-emerald-200">
          <div className="flex items-center gap-2.5">
            <span className="text-[18px]">🚀</span>
            <div>
              <span className="font-[750] text-emerald-300 block sm:inline">Modo Completo Ativo:</span>{" "}
              <span>O robô aquece a conta normalmente no X e <strong>publica</strong> as fotos e vídeos intercalados do Drive conforme a agenda.</span>
            </div>
          </div>
          <button
            type="button"
            onClick={togglePosting}
            className="btn btn-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-[650] shrink-0 border border-zinc-700"
          >
            Pausar Vídeos (Apenas Aquecer)
          </button>
        </div>
      )}

      {/* 2. CARD DE CONFIGURAÇÃO DA PASTA DO DRIVE */}
      <form onSubmit={handleSaveDriveFolder} className="liquid-glass glass-card panel-pad space-y-4" data-glass>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
            <h3 className="font-[700] text-[14.5px] text-[var(--ink)]">
              Pasta do Google Drive Conectada
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] font-mono">
            <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
              📦 Lote Ativo: 6 na memória
            </span>
            <span className="px-2 py-0.5 rounded bg-sky-950/60 text-sky-300 border border-sky-500/30">
              💾 Salvo no Drive: {drive.totalInDrive || 12} arquivos
            </span>
            <span className="px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-500/30">
              🧹 Descartados da Memória: {drive.discardedCount || 0}
            </span>
          </div>
        </div>

        {/* Banner Explicativo de Descarte de Memória */}
        <div className="p-3 rounded-lg bg-sky-950/25 border border-sky-500/30 text-[12px] text-sky-200 leading-relaxed flex items-start gap-2.5">
          <span className="text-[16px] shrink-0">💡</span>
          <div>
            <strong>Gestão de Memória Leve (6 em 6):</strong> Para manter a fluidez total e não pesar seu navegador, o bot carrega apenas <strong>6 mídias ativas</strong> na memória por vez. Ao publicar e confirmar um post no X, essa imagem é automaticamente <strong>descartada da memória do bot</strong> para liberar RAM, mantendo o arquivo 100% seguro no seu Google Drive, e a próxima foto da pasta entra no lote ativo.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div>
            <label className="text-[12px] font-[600] text-[var(--ink-2)] block mb-1">
              Link da Pasta do Google Drive (ou ID)
            </label>
            <input
              type="text"
              className="input text-[13px] font-mono"
              value={drive.folderUrl}
              onChange={(e) => setDrive({ ...drive, folderUrl: e.target.value })}
              placeholder="https://drive.google.com/drive/folders/..."
              required
            />
          </div>

          <div>
            <label className="text-[12px] font-[600] text-[var(--ink-2)] block mb-1">
              Nome da Pasta / Acervo
            </label>
            <input
              type="text"
              className="input text-[13px]"
              value={drive.folderName}
              onChange={(e) => setDrive({ ...drive, folderName: e.target.value })}
              placeholder="Ex: Acervo July Cardoso"
              required
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <label className="flex items-center gap-2 text-[12.5px] font-[550] text-[var(--ink-2)] cursor-pointer">
            <input
              type="checkbox"
              checked={drive.autoInterleave}
              onChange={(e) => setDrive({ ...drive, autoInterleave: e.target.checked })}
              className="size-4 cursor-pointer"
            />
            <span>Manter esteira sempre intercalando (1 Foto ➔ 1 Vídeo)</span>
          </label>

          <button
            type="submit"
            className="btn btn-sm btn-glass text-[12px] font-[600]"
            disabled={busy !== null}
          >
            {busy === "save_drive" ? "Salvando..." : "Salvar Pasta do Drive"}
          </button>
        </div>
      </form>

      {/* 3. BARRA DE AGENDAMENTO EM LOTE NA AGENDA */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-sky-950/40 via-purple-950/30 to-emerald-950/40 border border-sky-500/30 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-[700] text-[14px] text-sky-300">
            <span>🚀</span> Programação Direta para o X
          </div>
          <p className="text-[12.5px] text-[var(--ink-2)]">
            Os posts serão inseridos diretamente na fila da <strong>Agenda</strong> com espaçamento humano entre as publicações.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div>
            <span className="text-[11px] text-[var(--muted)] block">Primeiro Post às:</span>
            <input
              type="datetime-local"
              className="input text-[12px] h-9 mt-0.5"
              value={startDateTime}
              onChange={(e) => setStartDateTime(e.target.value)}
            />
          </div>

          <div>
            <span className="text-[11px] text-[var(--muted)] block">Intervalo:</span>
            <select
              className="input text-[12px] h-9 mt-0.5"
              value={intervalHours}
              onChange={(e) => setIntervalHours(Number(e.target.value))}
            >
              <option value={2}>A cada 2 horas</option>
              <option value={3}>A cada 3 horas</option>
              <option value={4}>A cada 4 horas (Recomendado)</option>
              <option value={6}>A cada 6 horas</option>
              <option value={8}>A cada 8 horas</option>
              <option value={12}>A cada 12 horas</option>
            </select>
          </div>

          <div className="self-end">
            <button
              type="button"
              className="btn btn-primary h-9 px-4 text-[12.5px] font-[650] flex items-center gap-1.5 shadow-lg shadow-sky-950/50"
              onClick={handleScheduleAll}
              disabled={busy !== null || drive.items.length === 0}
            >
              <span>📅</span> {busy === "schedule_all" ? "Programando..." : "Programar na Agenda"}
            </button>
          </div>
        </div>
      </div>

      {/* 4. LISTA DE ITENS INTERCALADOS (EDIÇÃO 1 A 1) */}
      <section className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-[750] text-[var(--ink)] flex items-center gap-2">
            <span>📸</span> Mídias Prontas para Publicação ({drive.items.length})
          </h2>
          <Link href="/agenda" className="text-[12.5px] font-[600] text-[var(--accent)] hover:underline">
            Ver Posts na Agenda ➔
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {drive.items.map((item, idx) => {
            const isVideo = item.type === "video";
            return (
              <div
                key={item.id}
                className="liquid-glass glass-card p-4 flex flex-col justify-between border border-[var(--line)] rounded-2xl relative overflow-hidden group hover:border-[var(--accent)]/50 transition-all"
                data-glass
              >
                {/* Cabeçalho do Card */}
                <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] pb-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10.5px] font-[750] font-mono tracking-wider ${
                        isVideo
                          ? "bg-purple-950/60 text-purple-300 border border-purple-500/40"
                          : "bg-sky-950/60 text-sky-300 border border-sky-500/40"
                      }`}
                    >
                      {isVideo ? "🎥 VÍDEO" : "📸 FOTO"}
                    </span>
                    <span className="text-[12px] font-mono text-[var(--muted)]">#{idx + 1}</span>
                    <span className="text-[12px] font-semibold text-[var(--ink)] truncate max-w-[180px]">
                      {item.title}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-[var(--muted)]">{item.sizeMb} MB</span>
                </div>

                {/* Conteúdo: Preview + Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-[110px_1fr] gap-3 my-3">
                  {/* Preview Visual */}
                  <div className="relative rounded-xl overflow-hidden aspect-square bg-zinc-900 border border-[var(--line)] flex items-center justify-center">
                    {/* Imagem ou Poster de Vídeo */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.previewUrl}
                      alt={item.title}
                      className="object-cover size-full group-hover:scale-105 transition-transform duration-300"
                    />
                    {isVideo && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <span className="size-8 rounded-full bg-white/20 backdrop-blur border border-white/50 flex items-center justify-center text-white text-[14px]">
                          ▶
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Edição de Legenda e Hashtags 1 a 1 */}
                  <div className="space-y-2">
                    {/* BADGES DA ANÁLISE VISUAL (CENÁRIO, ROUPA E POSIÇÃO) */}
                    {item.visualAnalysis ? (
                      <div className="p-2 rounded-lg bg-[var(--sunken)] border border-[var(--line)] text-[10.5px] space-y-1">
                        <div className="flex items-center gap-1.5 text-sky-400 font-semibold truncate">
                          <span>🏖️ Cenário:</span>
                          <span className="text-[var(--ink)] font-normal truncate">{item.visualAnalysis.scenario}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-purple-400 font-semibold truncate">
                          <span>👗 Roupa:</span>
                          <span className="text-[var(--ink)] font-normal truncate">{item.visualAnalysis.outfit}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-amber-400 font-semibold truncate">
                          <span>💃 Posição:</span>
                          <span className="text-[var(--ink)] font-normal truncate">{item.visualAnalysis.pose}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between p-1.5 rounded-lg bg-[var(--sunken)]/50 border border-[var(--line)] text-[10.5px]">
                        <span className="text-[var(--muted)]">Análise visual pendente</span>
                        <button
                          type="button"
                          onClick={() => handleAnalyzeItem(item.id)}
                          disabled={busy !== null}
                          className="text-sky-400 font-[650] hover:underline flex items-center gap-1"
                        >
                          <span>👁️</span> {busy === `analyze_${item.id}` ? "Analisando..." : "Analisar Cenário & Roupa"}
                        </button>
                      </div>
                    )}

                    <div>
                      <span className="text-[11px] font-[600] text-[var(--muted)] block">Legenda Dedicada:</span>
                      <textarea
                        className="input text-[12px] h-[68px] resize-none leading-relaxed mt-0.5"
                        value={item.caption}
                        onChange={(e) => handleItemChange(item.id, "caption", e.target.value)}
                        placeholder="Escreva a legenda desse post..."
                      />
                    </div>

                    <div>
                      <span className="text-[11px] font-[600] text-[var(--muted)] block">Hashtags:</span>
                      <input
                        type="text"
                        className="input text-[11.5px] h-8 font-mono text-sky-400 mt-0.5"
                        value={(item.hashtags || []).join(" ")}
                        onChange={(e) => handleItemChange(item.id, "hashtags", e.target.value)}
                        placeholder="#hashtag1 #hashtag2..."
                      />
                    </div>
                  </div>
                </div>

                {/* Rodapé do Card */}
                <div className="pt-2.5 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 font-mono text-emerald-400">
                      <span className="size-1.5 rounded-full bg-emerald-400" />
                      Drive (Ativa #{idx + 1}/6)
                    </span>
                    {item.visualAnalysis && (
                      <button
                        type="button"
                        onClick={() => handleAnalyzeItem(item.id)}
                        disabled={busy !== null}
                        className="text-xs text-[var(--muted)] hover:text-sky-400 underline font-mono ml-1"
                      >
                        Reanalisar 👁️
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDiscardItem(item.id)}
                      disabled={busy !== null}
                      title="Descartar da memória RAM do bot (continua 100% salva no Google Drive) e puxar a próxima foto"
                      className="text-[10.5px] text-amber-400/80 hover:text-amber-300 hover:underline flex items-center gap-1 font-mono cursor-pointer"
                    >
                      <span>🧹</span> Liberar da memória
                    </button>
                    <span className="text-zinc-600">·</span>
                    <span className="text-zinc-400 font-mono">
                      {item.status === "scheduled" ? "Agendado na esteira" : "Pronto para agendar"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. MODAL DE EDIÇÃO EM MASSA */}
      {bulkModalOpen && (
        <dialog open className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4 w-full h-full">
          <div className="bg-[var(--surface)] text-[var(--ink)] border border-[var(--line)] rounded-2xl max-w-[500px] w-full p-5 space-y-4 shadow-2xl enter">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <h3 className="font-[750] text-[16px] flex items-center gap-2">
                <span>📝</span> Edição em Massa de Legendas & Hashtags
              </h3>
              <button
                type="button"
                className="btn btn-ghost btn-xs text-[14px]"
                onClick={() => setBulkModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleApplyBulk} className="space-y-3.5">
              <div>
                <label className="text-[12px] font-[600] text-[var(--ink-2)] block mb-1">
                  Hashtags para aplicar em todos os posts:
                </label>
                <input
                  type="text"
                  className="input text-[12.5px] font-mono text-sky-400"
                  value={bulkHashtags}
                  onChange={(e) => setBulkHashtags(e.target.value)}
                  placeholder="#vip #exclusive #preview..."
                  required
                />
              </div>

              <div>
                <label className="text-[12px] font-[600] text-[var(--ink-2)] block mb-1">
                  Sufixo padrão de legenda (opcional):
                </label>
                <input
                  type="text"
                  className="input text-[12.5px]"
                  value={bulkSuffix}
                  onChange={(e) => setBulkSuffix(e.target.value)}
                  placeholder="Ex: Conteúdo completo no link da bio 🔗"
                />
                <span className="text-[11px] text-[var(--muted)] block mt-1">
                  Será adicionado no final da legenda de todas as fotos e vídeos.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--line)]">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setBulkModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Aplicar a Todos
                </button>
              </div>
            </form>
          </div>
        </dialog>
      )}

      {toast.node}
    </div>
  );
}
