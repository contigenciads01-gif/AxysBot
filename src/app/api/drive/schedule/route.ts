import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { getAccount, createPost } from "@/lib/data";
import { DriveMediaItem } from "../route";

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const acc = await getAccount();
    if (!acc) {
      return NextResponse.json({ error: "Nenhuma conta do X ativa para programar." }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      items?: DriveMediaItem[];
      startDateTime?: string;
      intervalHours?: number;
    };

    const items = body.items || [];
    if (!items.length) {
      return NextResponse.json({ error: "Nenhum item selecionado para agendamento." }, { status: 400 });
    }

    const intervalHours = Number(body.intervalHours) || 4;
    let baseTime = body.startDateTime ? new Date(body.startDateTime) : new Date(Date.now() + 60 * 60 * 1000); // 1h à frente por padrão

    if (Number.isNaN(baseTime.getTime()) || baseTime.getTime() < Date.now()) {
      baseTime = new Date(Date.now() + 60 * 60 * 1000);
    }

    const createdIds: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const scheduledTime = new Date(baseTime.getTime() + i * intervalHours * 60 * 60 * 1000);

      // Monta o texto do post com legenda, hashtags e anexo de mídia
      const tagsString = (item.hashtags || []).join(" ");
      const postText = `${item.caption}\n\n${tagsString}`.trim();

      // Cria na tabela posts
      const postId = await createPost(acc.id, {
        items: [postText],
        scheduledFor: scheduledTime.toISOString(),
      });

      createdIds.push(postId);
    }

    return NextResponse.json({
      ok: true,
      count: createdIds.length,
      postIds: createdIds,
    });
  } catch (e) {
    return fail(e);
  }
}
