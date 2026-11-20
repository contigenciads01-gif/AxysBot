"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconAgenda, IconAjustes, IconBot, IconEscrever, IconPainel, IconRede, IconExterno } from "./icons";

const MAIN_NAV = [
  { href: "/", label: "Painel", Icon: IconPainel },
  { href: "/bot", label: "Bot", Icon: IconBot },
  { href: "/composer", label: "Escrever", Icon: IconEscrever },
  { href: "/agenda", label: "Agenda", Icon: IconAgenda },
  { href: "/x", label: "No X", Icon: IconRede },
] as const;

const HONEYHUB_LINKS = [
  { href: "https://www.cowboyhot.online/", label: "Cowboy Hot", icon: "🤠" },
  { href: "https://www.runninghub.ai/pt-br/workflow/2122523075878117378?source=workspace", label: "Motion H3", icon: "⚡" },
  { href: "https://www.runninghub.ai/pt-br/workflow/2116688281638338562?source=workspace", label: "Motion Normal", icon: "🎬" },
  { href: "https://www.runninghub.ai/workflow/2074247935650525186?source=workspace", label: "FaceSwap", icon: "🎭" },
  { href: "https://www.runninghub.ai/pt-br/workflow/2118213519791759362?source=workspace", label: "Upscale", icon: "💎" },
] as const;

export function Shell({ children, username }: { children: React.ReactNode; username: string | null }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="min-h-dvh w-full max-w-full md:grid md:grid-cols-[228px_1fr]">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 btn btn-primary">
        Pular para o conteúdo
      </a>

      {/* lateral: desktop */}
      <aside className="hidden md:flex flex-col gap-1 border-r border-[var(--line)] px-3 py-4 sticky top-0 h-dvh overflow-y-auto">
        <Link href="/" className="px-2.5 pb-4 text-[17px] font-[680] tracking-[-.03em] flex items-center justify-between">
          <span translate="no">axys<span className="text-[var(--accent)]">bot</span></span>
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--sunken)] border border-[var(--line)] text-[var(--muted)]">
            v2.4
          </span>
        </Link>

        {/* 1. Menu Principal */}
        <nav className="flex flex-col gap-0.5" aria-label="Principal">
          {MAIN_NAV.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-[var(--radius)] px-2.5 h-[var(--row)] font-[550] transition-colors ${
                active(href)
                  ? "liquid-glass-chip text-[var(--ink)]"
                  : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--sunken)] border border-transparent"
              }`}
            >
              <Icon size={17} className={active(href) ? "text-[var(--accent)]" : ""} />
              {label}
            </Link>
          ))}
        </nav>

        {/* 2. Divisor: Links HoneyHub & AI Workflows */}
        <div className="my-2 pt-2 border-t border-[var(--line)]">
          <div className="px-2.5 pb-1 text-[10.5px] font-[700] uppercase tracking-wider text-[var(--muted)] flex items-center justify-between">
            <span>HoneyHub & AI</span>
            <span className="text-[9px] text-amber-400 font-mono">EXTERNO</span>
          </div>
          <div className="flex flex-col gap-0.5 mt-1">
            {HONEYHUB_LINKS.map(({ href, label, icon }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-[var(--radius)] px-2.5 h-[34px] text-[12.5px] font-[500] text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--sunken)] transition-colors group"
                title={`Abrir ${label}`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="text-[14px]">{icon}</span>
                  <span className="truncate">{label}</span>
                </div>
                <IconExterno size={12} className="opacity-40 group-hover:opacity-100 transition-opacity shrink-0" />
              </a>
            ))}
          </div>
        </div>

        {/* 3. Acervo & Drive de Conteúdo (Fotos / Vídeos) + ChatGPT */}
        <div className="my-2 pt-2 border-t border-[var(--line)]">
          <div className="px-2.5 pb-1 text-[10.5px] font-[700] uppercase tracking-wider text-[var(--muted)] flex items-center justify-between">
            <span>Acervo & IA</span>
            <span className="text-[9px] text-sky-400 font-mono">DRIVE</span>
          </div>
          <div className="flex flex-col gap-0.5 mt-1">
            <Link
              href="/drive"
              aria-current={active("/drive") ? "page" : undefined}
              className={`flex items-center justify-between rounded-[var(--radius)] px-2.5 h-[34px] text-[12.5px] font-[550] transition-colors group ${
                active("/drive")
                  ? "liquid-glass-chip text-[var(--ink)]"
                  : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--sunken)]"
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <span className="text-[14px]">📁</span>
                <span className="truncate">Drive de Mídia</span>
              </div>
              <span className="text-[9px] font-mono px-1 rounded bg-[var(--surface)] text-sky-400 border border-[var(--line)]">
                FOTOS/VÍDEOS
              </span>
            </Link>

            {/* Limpar Metadados da Biblioteca */}
            <Link
              href="/drive?modal=library"
              className="flex items-center justify-between rounded-[var(--radius)] px-2.5 h-[34px] text-[12.5px] font-[500] text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--sunken)] transition-colors group mt-0.5"
              title="Abrir Biblioteca Completa e Higienizar Metadados (EXIF/GPS/IA)"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="text-[14px]">🛡️</span>
                <span className="truncate">Limpar Metadados</span>
              </div>
              <span className="text-[9px] font-mono px-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25">
                EXIF/IA
              </span>
            </Link>

            {/* ChatGPT com Logo e Texto Animado */}
            <a
              href="https://chatgpt.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-[var(--radius)] px-2.5 h-[34px] text-[12.5px] font-[500] hover:bg-[var(--sunken)] transition-colors group mt-0.5"
              title="Abrir ChatGPT"
            >
              <div className="flex items-center gap-2 truncate">
                <svg className="size-4 shrink-0 chatgpt-animated-icon text-[#10a37f]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1683a.071.071 0 0 1 .038.052v5.5826a4.5045 4.5045 0 0 1-4.4945 4.4947zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4997 4.4997 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1683a.0757.0757 0 0 1-.071 0l-4.8303-2.7866A4.5045 4.5045 0 0 1 2.3408 7.8956zm16.0993 3.8558L12.5973 8.3829l2.02-1.1636a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4949 4.4949 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.402-.6862zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L8.907 9.2298V6.8974a.0662.0662 0 0 1 .0331-.0615l4.8304-2.7866a4.5045 4.5045 0 0 1 6.6903 4.5952zM12 14.7702l-2.7487-1.587 2.7487-1.587 2.7487 1.587z" />
                </svg>
                <span className="chatgpt-animated-txt text-[13px]">ChatGPT</span>
              </div>
              <span className="text-[9px] px-1 rounded bg-emerald-500/10 text-emerald-400 font-mono border border-emerald-500/20 group-hover:bg-emerald-500/20">
                PRO
              </span>
            </a>
          </div>
        </div>

        {/* 4. Ajustes no Final da Navegação */}
        <div className="mt-1 pt-2 border-t border-[var(--line)]">
          <Link
            href="/ajustes"
            aria-current={active("/ajustes") ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-[var(--radius)] px-2.5 h-[var(--row)] font-[550] transition-colors ${
              active("/ajustes")
                ? "liquid-glass-chip text-[var(--ink)]"
                : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--sunken)] border border-transparent"
            }`}
          >
            <IconAjustes size={17} className={active("/ajustes") ? "text-[var(--accent)]" : ""} />
            Ajustes
          </Link>
        </div>

        {/* 4. Rodapé do Operador Admin & Modelo Ativa */}
        <div className="mt-auto pt-3 border-t border-[var(--line)] px-2.5">
          <div className="p-2.5 rounded-xl bg-[var(--sunken)]/60 border border-[var(--line)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-[650] text-[12px] text-emerald-400">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                Operador Admin
              </div>
              <span className="text-[9.5px] font-mono text-[var(--muted)] px-1 rounded bg-[var(--surface)] border border-[var(--line)]">
                MASTER
              </span>
            </div>

            <div className="mt-2 pt-2 border-t border-[var(--line)] text-[11.5px] text-[var(--ink-2)]">
              <span className="text-[var(--muted)] block text-[10px] uppercase font-semibold">Conta Modelo Ativa:</span>
              <div className="font-[600] text-[var(--ink)] truncate mt-0.5 flex items-center justify-between">
                <span>@{username || "JulyCardosoCirc"}</span>
                <span className="text-[10px] text-[var(--accent)] font-normal">Farm 10+</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* topo: mobile */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-12 border-b liquid-glass-bar">
        <Link href="/" className="text-[16px] font-[680] tracking-[-.03em]">
          <span translate="no">axys<span className="text-[var(--accent)]">bot</span></span>
        </Link>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="size-2 rounded-full bg-emerald-500" />
          <span className="text-[var(--muted)] truncate max-w-[140px]">Admin · @{username || "JulyCardosoCirc"}</span>
        </div>
      </header>

      <main id="conteudo" tabIndex={-1} className="min-w-0 outline-none px-4 md:px-8 py-5 md:py-7 pb-24 md:pb-10 w-full max-w-full overflow-x-hidden">
        {children}
      </main>

      {/* abas: mobile */}
      <nav aria-label="Principal" className="md:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-6 border-t liquid-glass-bar pb-[env(safe-area-inset-bottom)]">
        {[...MAIN_NAV, { href: "/ajustes", label: "Ajustes", Icon: IconAjustes }].map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active(href) ? "page" : undefined}
            className={`relative flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] font-[550] ${
              active(href) ? "text-[var(--accent)]" : "text-[var(--muted)]"
            }`}
          >
            <Icon size={20} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
