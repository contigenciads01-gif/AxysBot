import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const instrument = localFont({
  src: [
    { path: "./fonts/instrument-sans-latin-wght-normal.woff2", weight: "400 700", style: "normal" },
    { path: "./fonts/instrument-sans-latin-ext-wght-normal.woff2", weight: "400 700", style: "normal" },
  ],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "AXYSBOT", template: "%s · AXYSBOT" },
  description: "Agende, publique e acompanhe sua conta no X.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EFE9DD" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1013" },
  ],
};

/**
 * Aplica tema e densidade ANTES da hidratacao: sem flash do tema errado.
 * (vercel-react-best-practices: rendering-hydration-no-flicker)
 */
const prefsScript = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('axys.theme');var n=localStorage.getItem('axys.density');if(t!=='branco'&&t!=='bege'&&t!=='escuro'){t=matchMedia('(prefers-color-scheme: dark)').matches?'escuro':'bege'}if(n!=='compacto'&&n!=='amplo'){n='compacto'}d.dataset.theme=t;d.dataset.density=n}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="bege" data-density="compacto" className={instrument.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: prefsScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
