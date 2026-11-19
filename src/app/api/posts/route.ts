import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { getAccount, listPosts, createPost } from "@/lib/data";
import { weightedLength, X_LIMIT } from "@/lib/thread";
import type { PostStatus } from "@/lib/types";

export async function GET(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const acc = await getAccount();
    if (!acc) return NextResponse.json({ posts: [], account: null });
    const sp = new URL(req.url).searchParams;
    const status = sp.get("status")?.split(",").filter(Boolean) as PostStatus[] | undefined;
    const posts = await listPosts(acc.id, { status, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
    return NextResponse.json({ posts });
  } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const acc = await getAccount();
    if (!acc) return NextResponse.json({ error: "Conecte sua conta do X em Ajustes." }, { status: 409 });
    const body = (await req.json()) as { items?: unknown; scheduledFor?: string | null };
    const items = Array.isArray(body.items) ? body.items.map(String).map((s) => s.trim()).filter(Boolean) : [];
    if (!items.length) return NextResponse.json({ error: "Escreva o post antes de salvar." }, { status: 400 });
    if (items.length > 25) return NextResponse.json({ error: "Thread com no maximo 25 posts." }, { status: 400 });
    const tooLong = items.findIndex((t) => weightedLength(t) > X_LIMIT);
    if (tooLong >= 0) return NextResponse.json({ error: `O post ${tooLong + 1} passou de ${X_LIMIT} caracteres.` }, { status: 400 });

    let scheduledFor: string | null = null;
    if (body.scheduledFor) {
      const d = new Date(body.scheduledFor);
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Data invalida." }, { status: 400 });
      if (d.getTime() < Date.now() - 60_000) return NextResponse.json({ error: "Essa data ja passou." }, { status: 400 });
      scheduledFor = d.toISOString();
    }
    const id = await createPost(acc.id, { items, scheduledFor });
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) { return fail(e); }
}
