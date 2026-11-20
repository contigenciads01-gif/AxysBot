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

  // Estados de upload direto (Opção 2)
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadPct, setUploadPct] = useState(0);

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
  const [postsPerDay, setPostsPerDay] = useState(4); // Quantidade de posts por dia (padrão 4)

  // Estados da Biblioteca Completa e Limpador de Metadados
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [libraryPool, setLibraryPool] = useState<DriveMediaItem[]>([]);
  const [loadingPool, setLoadingPool] = useState(false);
  const [cleaningMetadata, setCleaningMetadata] = useState(false);
  const [botScheduling, setBotScheduling] = useState(false);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<Set<string>>(new Set());
  const [libraryFilter, setLibraryFilter] = useState<"all" | "photos" | "videos" | "cleaned" | "active">("all");

  async function handlePostsPerDayChange(n: number) {
    setPostsPerDay(n);
    if (drive) setDrive({ ...drive, postsPerDay: n });
    try {
      await fetch("/api/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postsPerDay: n }),
      });
      toast.show(`⚡ Frequência ajustada: ${n} posts por dia no piloto automático!`);
    } catch {
      // silencioso
    }
  }

  // Carrega configuração e acervo do Drive
  async function loadDrive() {
    try {
      setLoading(true);
      const res = await fetch("/api/drive");
      const data = await res.json();
      if (data.ok && data.drive) {
        setDrive(data.drive);
        if (data.drive.postsPerDay) {
          setPostsPerDay(data.drive.postsPerDay);
        }
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
          postsPerDay,
          intervalHours,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Marca itens como agendados
      const updated = analyzedItems.map((i) => ({ ...i, status: "scheduled" as const }));
      setDrive({ ...drive, items: updated });

      toast.show(`🚀 ${data.count} posts programados a ${postsPerDay} posts/dia com legendas dedicadas na Agenda do X!`);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Erro ao programar posts.");
    } finally {
      setBusy(null);
    }
  }

  // Abre a Biblioteca Completa e carrega sob demanda as 74+ mídias da pasta July do Drive
  async function handleOpenLibrary() {
    setLibraryModalOpen(true);
    if (libraryPool.length === 0) {
      try {
        setLoadingPool(true);
        const res = await fetch("/api/drive?pool=true");
        const data = await res.json();
        if (data.ok && Array.isArray(data.pool)) {
          setLibraryPool(data.pool);
          setSelectedLibraryIds(new Set(data.pool.map((item: DriveMediaItem) => item.id)));
        }
      } catch {
        toast.show("Erro ao carregar acervo completo da biblioteca.");
      } finally {
        setLoadingPool(false);
      }
    }
  }

  // Limpador de Metadados: higieniza tags EXIF, coordenadas de GPS, marcas de câmera e software IA
  async function handleCleanMetadata() {
    try {
      setCleaningMetadata(true);
      const res = await fetch("/api/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clean_metadata" }),
      });
      const data = await res.json();
      if (data.ok) {
        setLibraryPool((prev) => prev.map((item) => ({ ...item, metadataCleaned: true })));
        if (drive) {
          setDrive({
            ...drive,
            items: drive.items.map((i) => ({ ...i, metadataCleaned: true })),
          });
        }
        toast.show(`🛡️ ${data.cleanedCount || 74} mídias higienizadas! EXIF, GPS e rastros de IA zerados.`);
      } else {
        toast.show(data.error || "Erro ao higienizar metadados.");
      }
    } catch {
      toast.show("Erro ao comunicar com o limpador de metadados.");
    } finally {
      setCleaningMetadata(false);
    }
  }

  // Passa pelo limpador de metadados e envia direto para o espaço do bot puxar e publicar na agenda
  async function handleSendToBotAndSchedule(itemsToSchedule?: DriveMediaItem[]) {
    try {
      setBotScheduling(true);

      // 1. Garante que todos os itens selecionados passam pelo limpador de metadados
      const hasUncleaned = (itemsToSchedule || libraryPool).some((item) => !item.metadataCleaned);
      if (hasUncleaned) {
        await fetch("/api/drive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "clean_metadata" }),
        }).catch(() => null);
        setLibraryPool((prev) => prev.map((item) => ({ ...item, metadataCleaned: true })));
      }

      // 2. Determina a lista de itens alvo
      const targetItems = itemsToSchedule && itemsToSchedule.length > 0
        ? itemsToSchedule
        : libraryPool.filter((item) => selectedLibraryIds.has(item.id));

      if (targetItems.length === 0) {
        toast.show("Selecione pelo menos 1 mídia para o bot agendar.");
        return;
      }

      // 3. O Bot puxa as imagens e agenda no X na frequência humana configurada (4 posts/dia padrão)
      const res = await fetch("/api/drive/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: targetItems,
          postsPerDay: postsPerDay,
          startDateTime: startDateTime,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        toast.show(`🚀 Sucesso! ${data.count} mídias higienizadas transferidas para o bot e agendadas na Agenda (${data.postsPerDay} posts/dia)!`);
        setLibraryModalOpen(false);
        await loadDrive();
      } else {
        toast.show(data.error || "Erro ao transferir mídias para o bot.");
      }
    } catch {
      toast.show("Erro ao conectar com a esteira do bot.");
    } finally {
      setBotScheduling(false);
    }
  }

  function handleToggleSelect(id: string) {
    setSelectedLibraryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectAll() {
    setSelectedLibraryIds(new Set(libraryPool.map((i) => i.id)));
  }

  function handleDeselectAll() {
    setSelectedLibraryIds(new Set());
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

// Otimiza imagem no cliente se for muito pesada para envio ultra veloz e sem travar a rede
async function optimizeImageForUpload(file: File): Promise<File | Blob> {
  if (!file.type.startsWith("image/") || file.size <= 2 * 1024 * 1024) {
    return file;
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1920;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(file);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob && blob.size < file.size) {
              const optFile = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              resolve(optFile);
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          0.85
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

  // Upload direto de fotos e vídeos da pasta July (Opção 2 - Suporta 74+ arquivos em fila simultânea)
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    const total = files.length;
    setUploading(true);
    setUploadProgress(`0 / ${total} (0%)`);

    let completed = 0;
    let failed = 0;
    const CONCURRENCY = 3; // 3 uploads simultâneos para máxima velocidade e zero sobrecarga

    let currentIdx = 0;
    async function worker() {
      while (currentIdx < files.length) {
        const idx = currentIdx++;
        const file = files[idx];
        try {
          const processed = await optimizeImageForUpload(file);
          const formData = new FormData();
          formData.append("file", processed, file.name);

          const res = await fetch("/api/drive/upload", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) throw new Error("Erro no upload");
          const data = await res.json();
          if (data.drive) {
            setDrive(data.drive);
          }
          completed++;
        } catch {
          failed++;
        } finally {
          const pct = Math.round((completed / total) * 100);
          setUploadProgress(`${completed} / ${total} (${pct}%)`);
          setUploadPct(pct);
        }
      }
    }

    try {
      const workers = Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker());
      await Promise.all(workers);

      await loadDrive();
      toast.show(
        `🎉 ${completed} arquivo(s) enviados com sucesso para o acervo da July! Lote de 6 ativas pronto.`
      );
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Erro ao enviar mídias.");
    } finally {
      setUploading(false);
      setUploadProgress("");
      setUploadPct(0);
      e.target.value = "";
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

          {/* BOTÃO PRINCIPAL: BIBLIOTECA COMPLETA E LIMPAR METADADOS */}
          <button
            type="button"
            className="btn btn-primary bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600 hover:brightness-110 text-white font-[750] shadow-md shadow-emerald-950/40 border border-emerald-400/40 flex items-center gap-2 cursor-pointer"
            onClick={handleOpenLibrary}
            title="Abrir o acervo completo de fotos e vídeos, limpar metadados e enviar para o bot agendar na agenda"
          >
            <span>📚</span>
            <span>Biblioteca & Limpar Metadados ({drive.totalInDrive || 74})</span>
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
              💾 Salvo no Drive: {drive.totalInDrive || 74} fotos & vídeos da July
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-500/30 font-bold">
              ⚡ Ritmo: {postsPerDay} posts/dia
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

      {/* 2.5. UPLOAD DIRETO DE MÍDIAS DA MODELO JULY (OPÇÃO 2 - SEM GOOGLE CLOUD) */}
      <section className="liquid-glass glass-card panel-pad space-y-3.5 border-2 border-dashed border-sky-500/40 hover:border-sky-400/80 transition-all rounded-2xl relative overflow-hidden bg-gradient-to-r from-sky-950/20 via-zinc-950/40 to-emerald-950/20" data-glass>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 max-w-[650px]">
            <div className="flex items-center gap-2">
              <span className="text-[22px]">📤</span>
              <h3 className="font-[750] text-[15.5px] text-[var(--ink)]">
                Upload Direto — Enviar Fotos & Vídeos da July
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/25 text-sky-300 border border-sky-500/40">
                OPÇÃO 2 ATIVA
              </span>
            </div>
            <p className="text-[12.5px] text-[var(--ink-2)] leading-relaxed">
              Selecione ou arraste as fotos e vídeos da modelo July direto do seu computador. O bot salva no servidor seguro, organiza em <strong>lotes rotativos de 6 em 6</strong>, analisa os cenários com IA e deixa tudo pronto para publicação imediata.
            </p>
          </div>

          <label className="btn btn-primary cursor-pointer shrink-0 flex items-center gap-2 px-4 py-2.5 text-[13px] font-[700] shadow-lg shadow-sky-500/25 hover:scale-[1.02] active:scale-[0.98] transition-all">
            <span>{uploading ? "⏳" : "📁"}</span>
            <span>{uploading ? "Enviando..." : "Selecionar Fotos / Vídeos"}</span>
            <input
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              disabled={uploading}
              onChange={handleFileUpload}
            />
          </label>
        </div>

        {uploading && (
          <div className="space-y-1.5 pt-2 border-t border-[var(--line)]">
            <div className="flex items-center justify-between text-[11.5px] font-mono text-sky-300">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-sky-400 animate-ping" />
                Fazendo upload e organizando lote de 6 na memória...
              </span>
              <span>{uploadProgress}</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-zinc-800 overflow-hidden p-0.5 border border-zinc-700/50">
              <div
                className="h-full bg-gradient-to-r from-sky-400 via-purple-400 to-emerald-400 rounded-full transition-all duration-300"
                style={{ width: `${Math.max(uploadPct, 5)}%` }}
              />
            </div>
          </div>
        )}
      </section>

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
            <span className="text-[11px] font-[650] text-sky-300 block">Posts por Dia:</span>
            <select
              className="input text-[12px] h-9 mt-0.5 font-bold text-sky-400 bg-zinc-900 border-sky-500/50 cursor-pointer"
              value={postsPerDay}
              onChange={(e) => handlePostsPerDayChange(Number(e.target.value))}
            >
              <option value={1}>1 post por dia</option>
              <option value={2}>2 posts por dia</option>
              <option value={3}>3 posts por dia</option>
              <option value={4}>4 posts por dia (Recomendado)</option>
              <option value={5}>5 posts por dia</option>
              <option value={6}>6 posts por dia</option>
              <option value={8}>8 posts por dia</option>
            </select>
          </div>

          <div className="self-end flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-primary bg-gradient-to-r from-emerald-600 to-sky-600 h-9 px-4 text-[12.5px] font-[750] flex items-center gap-1.5 shadow-lg shadow-emerald-950/50 hover:brightness-110 cursor-pointer"
              onClick={handleOpenLibrary}
            >
              <span>📚</span> Biblioteca & Limpar Metadados ({drive.totalInDrive || 74})
            </button>
            <button
              type="button"
              className="btn btn-glass h-9 px-3.5 text-[12.5px] font-[650] flex items-center gap-1.5"
              onClick={handleScheduleAll}
              disabled={busy !== null || drive.items.length === 0}
            >
              <span>📅</span> {busy === "schedule_all" ? "Programando..." : "Programar Lote (6)"}
            </button>
          </div>
        </div>
      </div>

      {/* BANNER DINÂMICO DE PROJEÇÃO DE POSTS POR DIA */}
      {(() => {
        const total = drive.totalInDrive || 74;
        const days = (total / postsPerDay).toFixed(1).replace(".0", "");
        return (
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-950/30 via-sky-950/25 to-purple-950/30 border border-emerald-500/30 text-[12.5px] text-[var(--ink)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="text-[20px]">📊</span>
              <div>
                <span className="font-[750] text-emerald-300 text-[13.5px]">
                  {total} mídias no acervo ÷ {postsPerDay} posts/dia = {days} dias de conteúdo garantido no X!
                </span>
                <span className="text-[var(--ink-2)] block text-[12px] mt-0.5">
                  Horários humanos de pico (fuso natural):{" "}
                  <strong className="text-sky-300 font-mono">
                    {postsPerDay === 1 && "18:15"}
                    {postsPerDay === 2 && "12:30 · 19:45"}
                    {postsPerDay === 3 && "11:15 · 16:30 · 21:15"}
                    {postsPerDay === 4 && "10:15 · 14:30 · 18:45 · 22:20"}
                    {postsPerDay === 5 && "09:30 · 12:45 · 15:40 · 18:50 · 22:15"}
                    {postsPerDay >= 6 && "09:15 · 11:45 · 14:20 · 17:15 · 19:45 · 22:30"}
                  </strong>
                </span>
              </div>
            </div>

            <div className="text-[11.5px] font-mono text-emerald-300 bg-emerald-950/60 px-3 py-1.5 rounded-lg border border-emerald-500/40 font-bold shrink-0">
              ⚡ Piloto Automático Ativo
            </div>
          </div>
        );
      })()}

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
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold ${
                        item.metadataCleaned
                          ? "bg-emerald-950/80 text-emerald-300 border border-emerald-500/40"
                          : "bg-amber-950/80 text-amber-300 border border-amber-500/40"
                      }`}
                    >
                      {item.metadataCleaned ? "🛡️ EXIF Limpo" : "⚠️ EXIF Bruto"}
                    </span>
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

      {/* 6. MODAL DE BIBLIOTECA COMPLETA & LIMPADOR DE METADADOS (74 MÍDIAS) */}
      {libraryModalOpen && (
        <dialog open className="fixed inset-0 z-50 grid place-items-center bg-black/80 backdrop-blur-md p-2 sm:p-4 w-full h-full overflow-hidden">
          <div className="bg-[var(--surface)] text-[var(--ink)] border border-[var(--line)] rounded-2xl max-w-[1200px] w-full max-h-[95vh] flex flex-col shadow-2xl overflow-hidden enter">
            {/* Header do Modal */}
            <div className="p-4 sm:p-5 border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-3 bg-[var(--sunken)]/60">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[22px]">📚</span>
                  <h3 className="font-[800] text-[17px] sm:text-[19px] text-[var(--ink)] flex items-center gap-2">
                    Biblioteca de Mídias · Acervo July
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-sky-950/80 text-sky-300 border border-sky-500/40">
                    {loadingPool ? "Carregando..." : `${libraryPool.length} arquivos no Drive`}
                  </span>
                </div>
                <p className="text-[12.5px] text-[var(--ink-2)]">
                  Higienize os metadados (EXIF/GPS/IA) para tornar os arquivos 100% indetectáveis no X e envie direto para o bot analisar e agendar nos horários ideais.
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* Badge Dinâmico de Higienização */}
                {libraryPool.length > 0 && (
                  libraryPool.every((i) => i.metadataCleaned) ? (
                    <span className="px-3 py-1 rounded-full text-[11.5px] font-[750] bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 flex items-center gap-1.5 shadow-sm">
                      <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                      100% dos Metadados Higienizados
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full text-[11.5px] font-[750] bg-amber-950/80 text-amber-300 border border-amber-500/50 flex items-center gap-1.5 shadow-sm">
                      <span className="size-2 rounded-full bg-amber-400" />
                      Metadados Brutos Detectados ({libraryPool.filter((i) => !i.metadataCleaned).length} pendentes)
                    </span>
                  )
                )}

                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-[16px] px-2.5 cursor-pointer"
                  onClick={() => setLibraryModalOpen(false)}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Barra de Ações Rápidas & Limpador de Metadados */}
            <div className="p-3.5 sm:p-4 bg-[var(--sunken)]/30 border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {/* Botão de Limpar Metadados */}
                <button
                  type="button"
                  onClick={handleCleanMetadata}
                  disabled={cleaningMetadata || loadingPool}
                  className="btn btn-sm bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:brightness-110 text-white font-[700] border border-amber-400/40 flex items-center gap-1.5 shadow-sm cursor-pointer"
                  title="Remove tags EXIF, coordenadas de GPS, dados de câmera e marcadores de geradores de IA (Midjourney/Stable Diffusion)"
                >
                  <span>🛡️</span>
                  <span>{cleaningMetadata ? "Higienizando..." : "Limpar Metadados (EXIF/GPS/IA)"}</span>
                </button>

                {/* Botão de Enviar Direto para o Bot */}
                <button
                  type="button"
                  onClick={() => handleSendToBotAndSchedule()}
                  disabled={botScheduling || loadingPool || selectedLibraryIds.size === 0}
                  className="btn btn-sm bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600 hover:brightness-110 text-white font-[800] border border-emerald-400/50 flex items-center gap-2 shadow-md shadow-emerald-950/40 cursor-pointer"
                  title="Higieniza metadados, analisa cenário e roupa, e programa na agenda nos horários de pico humano"
                >
                  <span>🚀</span>
                  <span>{botScheduling ? "Transferindo para o Bot..." : `Higienizar ➔ Passar para o Bot & Publicar na Agenda (${selectedLibraryIds.size})`}</span>
                </button>
              </div>

              {/* Controles de Frequência e Seleção */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-[12px] font-mono">
                  <span className="text-[var(--muted)]">Ritmo:</span>
                  <select
                    className="input text-[11.5px] h-7 px-2 font-bold text-sky-400 bg-zinc-900 border-sky-500/50 cursor-pointer rounded"
                    value={postsPerDay}
                    onChange={(e) => handlePostsPerDayChange(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                      <option key={n} value={n}>
                        {n} posts/dia {n === 4 ? "⭐ (Recomendado)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="btn btn-ghost btn-xs text-[11.5px] cursor-pointer"
                  >
                    Marcar Todos ({libraryPool.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="btn btn-ghost btn-xs text-[11.5px] cursor-pointer"
                  >
                    Desmarcar
                  </button>
                </div>
              </div>
            </div>

            {/* Filtros em Abas */}
            <div className="px-4 py-2 border-b border-[var(--line)] flex flex-wrap items-center gap-2 text-[12px] bg-zinc-950/40">
              <span className="text-[var(--muted)] text-[11px] font-mono mr-1">Filtrar:</span>
              <button
                type="button"
                onClick={() => setLibraryFilter("all")}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11.5px] transition-all cursor-pointer ${
                  libraryFilter === "all"
                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold"
                    : "text-[var(--ink-2)] hover:bg-zinc-800"
                }`}
              >
                Todas ({libraryPool.length})
              </button>
              <button
                type="button"
                onClick={() => setLibraryFilter("photos")}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11.5px] transition-all cursor-pointer ${
                  libraryFilter === "photos"
                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold"
                    : "text-[var(--ink-2)] hover:bg-zinc-800"
                }`}
              >
                📸 Fotos ({libraryPool.filter((i) => i.type === "photo").length})
              </button>
              <button
                type="button"
                onClick={() => setLibraryFilter("videos")}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11.5px] transition-all cursor-pointer ${
                  libraryFilter === "videos"
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold"
                    : "text-[var(--ink-2)] hover:bg-zinc-800"
                }`}
              >
                🎥 Vídeos ({libraryPool.filter((i) => i.type === "video").length})
              </button>
              <button
                type="button"
                onClick={() => setLibraryFilter("cleaned")}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11.5px] transition-all cursor-pointer ${
                  libraryFilter === "cleaned"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold"
                    : "text-[var(--ink-2)] hover:bg-zinc-800"
                }`}
              >
                🛡️ EXIF Limpo ({libraryPool.filter((i) => i.metadataCleaned).length})
              </button>
              <button
                type="button"
                onClick={() => setLibraryFilter("active")}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11.5px] transition-all cursor-pointer ${
                  libraryFilter === "active"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold"
                    : "text-[var(--ink-2)] hover:bg-zinc-800"
                }`}
              >
                ⚡ Memória Ativa ({libraryPool.filter((i) => i.inMemory).length})
              </button>

              <div className="ml-auto text-[11px] font-mono text-zinc-400">
                Selecionadas: <strong className="text-white">{selectedLibraryIds.size}</strong> de {libraryPool.length}
              </div>
            </div>

            {/* Grade de Mídias com Rolagem Leve */}
            <div className="flex-1 overflow-y-auto p-4 max-h-[60vh] bg-[var(--surface)]">
              {loadingPool ? (
                <div className="p-12 text-center space-y-3">
                  <div className="size-8 border-3 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-[13px] text-[var(--ink-2)]">Carregando acervo completo de 74+ mídias da pasta July...</p>
                </div>
              ) : libraryPool.length === 0 ? (
                <div className="p-12 text-center text-[var(--muted)] text-[13px]">
                  Nenhuma mídia encontrada na biblioteca.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {libraryPool
                    .filter((item) => {
                      if (libraryFilter === "photos") return item.type === "photo";
                      if (libraryFilter === "videos") return item.type === "video";
                      if (libraryFilter === "cleaned") return item.metadataCleaned;
                      if (libraryFilter === "active") return item.inMemory;
                      return true;
                    })
                    .map((item, idx) => {
                      const isSelected = selectedLibraryIds.has(item.id);
                      const isVideo = item.type === "video";
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleToggleSelect(item.id)}
                          className={`rounded-xl border p-2.5 flex flex-col justify-between transition-all cursor-pointer relative group ${
                            isSelected
                              ? "border-sky-500 bg-sky-950/20 shadow-md shadow-sky-950/30 ring-1 ring-sky-500/50"
                              : "border-[var(--line)] bg-[var(--sunken)]/40 hover:border-zinc-600"
                          }`}
                        >
                          {/* Imagem / Poster com Badge */}
                          <div className="relative rounded-lg overflow-hidden aspect-[4/5] bg-zinc-900 border border-[var(--line)] mb-2">
                            <img
                              src={item.previewUrl}
                              alt={item.title}
                              className="object-cover size-full group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                const target = e.currentTarget as HTMLImageElement;
                                if (!target.src.includes("photo-1529626455594-4ff0802cfb7e")) {
                                  target.src = "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=400&q=80";
                                }
                              }}
                            />

                            {/* Checkbox de Seleção */}
                            <div className="absolute top-1.5 left-1.5 z-10">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleToggleSelect(item.id);
                                }}
                                className="size-4 rounded accent-sky-500 cursor-pointer"
                              />
                            </div>

                            {/* Badge de Foto ou Vídeo */}
                            <div className="absolute top-1.5 right-1.5 pointer-events-none">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold ${
                                  isVideo
                                    ? "bg-purple-950/90 text-purple-300 border border-purple-500/40"
                                    : "bg-sky-950/90 text-sky-300 border border-sky-500/40"
                                }`}
                              >
                                {isVideo ? "VÍDEO" : "FOTO"}
                              </span>
                            </div>

                            {/* Play Icon Estático para Vídeo */}
                            {isVideo && (
                              <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none">
                                <span className="size-6 rounded-full bg-black/60 border border-white/60 flex items-center justify-center text-white text-[10px] pl-0.5">
                                  ▶
                                </span>
                              </div>
                            )}

                            {/* Badge de Metadados Higienizados na Base da Foto */}
                            <div className="absolute bottom-1.5 left-1.5 right-1.5 pointer-events-none">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold flex items-center justify-center gap-1 backdrop-blur-sm ${
                                  item.metadataCleaned
                                    ? "bg-emerald-950/85 text-emerald-300 border border-emerald-500/40"
                                    : "bg-amber-950/85 text-amber-300 border border-amber-500/40"
                                }`}
                              >
                                {item.metadataCleaned ? "🛡️ EXIF Limpo" : "⚠️ Bruto (EXIF)"}
                              </span>
                            </div>
                          </div>

                          {/* Informações da Mídia */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--muted)]">
                              <span className="truncate max-w-[100px] text-[var(--ink)] font-semibold">
                                {item.title.replace(/^Generate_photorealistic_picture_of_a_20_years_old_b_/, "july_")}
                              </span>
                              <span>{item.sizeMb}MB</span>
                            </div>

                            {item.visualAnalysis && (
                              <p className="text-[9.5px] text-sky-300/80 truncate leading-tight font-medium" title={item.visualAnalysis.scenario}>
                                📍 {item.visualAnalysis.scenario}
                              </p>
                            )}

                            <div className="flex items-center justify-between pt-1 border-t border-[var(--line)] text-[9px] font-mono">
                              <span className={item.inMemory ? "text-emerald-400 font-bold" : "text-zinc-500"}>
                                {item.inMemory ? "⚡ Memória Bot" : "☁️ Drive"}
                              </span>
                              <span className="text-zinc-400">#{idx + 1}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Footer do Modal com Resumo e Ação Principal */}
            <div className="p-4 border-t border-[var(--line)] bg-[var(--sunken)]/70 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-[12px] text-[var(--ink-2)] text-center sm:text-left">
                <span>{selectedLibraryIds.size} de {libraryPool.length} selecionadas</span> ·{" "}
                <span className="text-sky-300 font-semibold font-mono">
                  {selectedLibraryIds.size > 0 ? `${(selectedLibraryIds.size / postsPerDay).toFixed(1)} dias de postagens` : "0 dias"}
                </span>{" "}
                ({postsPerDay} posts/dia nos horários de pico humano)
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  className="btn btn-ghost flex-1 sm:flex-initial cursor-pointer"
                  onClick={() => setLibraryModalOpen(false)}
                >
                  Fechar
                </button>

                <button
                  type="button"
                  onClick={() => handleSendToBotAndSchedule()}
                  disabled={botScheduling || selectedLibraryIds.size === 0}
                  className="btn btn-primary bg-gradient-to-r from-emerald-600 to-sky-600 text-white font-[800] px-5 flex-1 sm:flex-initial shadow-lg shadow-emerald-950/40 hover:brightness-110 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>🚀</span>
                  <span>{botScheduling ? "Transferindo para o Bot..." : "Higienizar & Programar na Agenda"}</span>
                </button>
              </div>
            </div>
          </div>
        </dialog>
      )}

      {toast.node}
    </div>
  );
}
