import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { getAccount, listPosts } from "@/lib/data";
import { Agenda } from "@/components/agenda";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage() {
  const acc = await getAccount().catch(() => null);
  if (!acc) {
    return (<div className="max-w-[560px]"><h1 className="h1">Agenda</h1><p className="mt-2 text-[var(--ink-2)]">Conecte sua conta do X para ver a agenda.</p><Link href="/ajustes" className="btn btn-primary mt-4">Conectar conta do X</Link></div>);
  }
  const posts = await listPosts(acc.id, { limit: 300 });
  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="h1">Agenda</h1><p className="mt-1 text-[var(--ink-2)]">Clique num dia para ver só os posts dele.</p></div>
        <Link href="/composer" className="btn btn-primary">Escrever post</Link>
      </header>
      <Suspense><Agenda posts={posts} /></Suspense>
    </div>
  );
}
