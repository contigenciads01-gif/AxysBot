import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="min-h-dvh grid place-items-center px-5">
      <div className="w-full max-w-[360px]">
        <div className="text-[22px] font-[680] tracking-[-.03em]">axys<span className="text-[var(--accent)]">bot</span></div>
        <p className="mt-1 text-[var(--ink-2)]">Entre para gerenciar sua conta no X.</p>
        <Suspense><LoginForm /></Suspense>
      </div>
    </main>
  );
}
