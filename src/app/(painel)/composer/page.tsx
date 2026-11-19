import type { Metadata } from "next";
import Link from "next/link";
import { getAccount } from "@/lib/data";
import { Composer } from "@/components/composer";

export const metadata: Metadata = { title: "Escrever" };

export default async function ComposerPage() {
  const acc = await getAccount().catch(() => null);
  if (!acc) {
    return (
      <div className="max-w-[560px]">
        <h1 className="h1">Escrever</h1>
        <p className="mt-2 text-[var(--ink-2)]">Conecte sua conta do X para escrever e agendar posts.</p>
        <Link href="/ajustes" className="btn btn-primary mt-4">Conectar conta do X</Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <header>
        <h1 className="h1">Escrever</h1>
        <p className="mt-1 text-[var(--ink-2)]">Seu rascunho fica salvo neste navegador enquanto você escreve.</p>
      </header>
      <Composer aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)} username={acc.username} displayName={acc.display_name ?? acc.username} avatar={acc.avatar_url} />
    </div>
  );
}
