import type { Metadata } from "next";
import { getAccount, listPosts } from "@/lib/data";
import { XController } from "@/components/x-controller";

export const metadata: Metadata = { title: "X Controller" };

export default async function XPage() {
  const acc = await getAccount().catch(() => null);
  const [ready, published] = acc
    ? await Promise.all([
        listPosts(acc.id, { status: ["agendado"], limit: 40 }),
        listPosts(acc.id, { status: ["publicado"], limit: 60 }).then((xs) =>
          xs.sort((a, b) => new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime()).slice(0, 8)),
      ]).catch(() => [[], []])
    : [[], []];
  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <header>
        <h1 className="h1">X Controller</h1>
        <p className="mt-1 text-[var(--ink-2)] max-w-[70ch]">Sem API paga: tudo usa os links oficiais do X. Publicar, responder e repostar abrem no x.com com o texto pronto, e só acontecem quando você confirma lá.</p>
      </header>
      <XController username={acc?.username ?? null} displayName={acc?.display_name ?? null} ready={ready} published={published} aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)} />
    </div>
  );
}
