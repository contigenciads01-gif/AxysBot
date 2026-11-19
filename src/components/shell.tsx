"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconAgenda, IconAjustes, IconEscrever, IconInbox, IconPainel } from "./icons";

const NAV = [
  { href: "/", label: "Painel", Icon: IconPainel },
  { href: "/composer", label: "Escrever", Icon: IconEscrever },
  { href: "/agenda", label: "Agenda", Icon: IconAgenda },
  { href: "/inbox", label: "Menções", Icon: IconInbox },
  { href: "/ajustes", label: "Ajustes", Icon: IconAjustes },
] as const;

export function Shell({ children, username, openMentions }: { children: React.ReactNode; username: string | null; openMentions: number }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[208px_1fr]">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 btn btn-primary">Pular para o conteúdo</a>
      {/* lateral: desktop */}
      <aside className="hidden md:flex flex-col gap-1 border-r border-[var(--line)] px-3 py-5 sticky top-0 h-dvh">
        <Link href="/" className="px-2.5 pb-5 text-[17px] font-[680] tracking-[-.03em]">
          <span translate="no">axys<span className="text-[var(--accent)]">bot</span></span>
        </Link>
        <nav className="flex flex-col gap-0.5" aria-label="Principal">
          {NAV.map(({ href, label, Icon }) => (
            <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-[var(--radius)] px-2.5 h-[var(--row)] font-[550] transition-colors ${active(href) ? "bg-[var(--surface)] text-[var(--ink)] shadow-[0_1px_2px_rgb(0_0_0/.06)] border border-[var(--line)]" : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--sunken)] border border-transparent"}`}>
              <Icon size={17} className={active(href) ? "text-[var(--accent)]" : ""} />
              {label}
              {href === "/inbox" && openMentions > 0 ? (
                <span className="ml-auto num text-[11.5px] font-semibold text-[var(--accent)]">{openMentions}</span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-2.5 text-[12.5px] text-[var(--muted)]">
          {username ? <>Conectado como <span className="text-[var(--ink-2)] font-medium">@{username}</span></> : "Nenhuma conta do X"}
        </div>
      </aside>

      {/* topo: mobile */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-12 border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--plane)_85%,transparent)] backdrop-blur">
        <Link href="/" className="text-[16px] font-[680] tracking-[-.03em]"><span translate="no">axys<span className="text-[var(--accent)]">bot</span></span></Link>
        {username ? <span className="text-[12.5px] text-[var(--muted)]">@{username}</span> : null}
      </header>

      <main id="conteudo" tabIndex={-1} className="min-w-0 outline-none px-4 md:px-7 py-5 md:py-7 pb-24 md:pb-10 max-w-[1240px] w-full">{children}</main>

      {/* abas: mobile */}
      <nav aria-label="Principal" className="md:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-5 border-t border-[var(--line)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)]">
        {NAV.map(({ href, label, Icon }) => (
          <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
            className={`relative flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] font-[550] ${active(href) ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
            <Icon size={20} />
            {label}
            {href === "/inbox" && openMentions > 0 ? <span className="absolute top-2 right-[calc(50%-18px)] size-2 rounded-full bg-[var(--accent)]" /> : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}
