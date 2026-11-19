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
    <div className="min-h-dvh md:grid md:grid-cols-[228px_1fr]">
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

        {/* 3. Ajustes no Final da Navegação */}
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

      <main id="conteudo" tabIndex={-1} className="min-w-0 outline-none px-4 md:px-7 py-5 md:py-7 pb-24 md:pb-10 max-w-[1240px] w-full">
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
