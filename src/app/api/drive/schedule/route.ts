import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { getAccount } from "@/lib/data";
import { db } from "@/lib/supabase";
import { DriveMediaItem, driveStore, GOOGLE_DRIVE_FOLDER_POOL } from "../route";

// Horários de pico humano durante o dia (fuso horário biológico natural)
const HUMAN_DAILY_SLOTS: Record<number, { h: number; m: number }[]> = {
  1: [{ h: 18, m: 15 }],
  2: [
    { h: 12, m: 30 },
    { h: 19, m: 45 },
  ],
  3: [
    { h: 11, m: 15 },
    { h: 16, m: 30 },
    { h: 21, m: 15 },
  ],
  4: [
    { h: 10, m: 15 }, // Manhã (pós despertar)
    { h: 14, m: 30 }, // Pós almoço
    { h: 18, m: 45 }, // Fim de tarde / Volta pra casa
    { h: 22, m: 20 }, // Noite / Antes de dormir
  ],
  5: [
    { h: 9, m: 30 },
    { h: 12, m: 45 },
    { h: 15, m: 40 },
    { h: 18, m: 50 },
    { h: 22, m: 15 },
  ],
  6: [
    { h: 9, m: 15 },
    { h: 11, m: 45 },
    { h: 14, m: 20 },
    { h: 17, m: 15 },
    { h: 19, m: 45 },
    { h: 22, m: 30 },
  ],
};

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
      postsPerDay?: number;
    };

    const items = body.items || [];
    if (!items.length) {
      return NextResponse.json({ error: "Nenhum item selecionado para agendamento." }, { status: 400 });
    }

    const postsPerDay = Math.max(1, Math.min(12, Number(body.postsPerDay) || 4));
    const slots = HUMAN_DAILY_SLOTS[postsPerDay] || HUMAN_DAILY_SLOTS[4];

    // Data base inicial
    let baseDate = body.startDateTime ? new Date(body.startDateTime) : new Date();
    if (Number.isNaN(baseDate.getTime())) baseDate = new Date();

    const supabase = db();

    // 1. Busca todos os posts ativos existentes na conta para DESDUPLICAÇÃO ESTRITA
    const { data: existingPostsRaw } = await supabase
      .from("posts")
      .select("id, status, scheduled_for, items:post_items(id, position, body)")
      .eq("account_id", acc.id)
      .in("status", ["agendado", "publicando", "rascunho"]);

    const existingPosts = (existingPostsRaw || []) as {
      id: string;
      status: string;
      scheduled_for: string;
      items: { id: string; position: number; body: string }[];
    }[];

    function matchPostMedia(post: typeof existingPosts[0], it: DriveMediaItem): boolean {
      const pUrl = (it.previewUrl || "").toLowerCase().trim();
      const rawUrl = (it.url || "").toLowerCase().trim();
      const title = (it.title || "").toLowerCase().trim();

      return post.items.some((pi) => {
        const b = (pi.body || "").toLowerCase();
        if (pUrl && b.includes(pUrl)) return true;
        if (rawUrl && b.includes(rawUrl)) return true;
        if (title && b.includes(title)) return true;
        return false;
      });
    }

    const processedIds: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Cálculo de dia e slot do dia
      const dayOffset = Math.floor(i / postsPerDay);
      const slotIdx = i % postsPerDay;
      const slot = slots[slotIdx] || { h: 10 + slotIdx * 3, m: 15 };

      const scheduledTime = new Date(baseDate);
      scheduledTime.setDate(scheduledTime.getDate() + dayOffset);

      // Jitter humano (+/- 0 a 6 min) para o algoritmo do X não detectar padrão robótico
      const jitter = ((i * 3) % 7) - 3;
      scheduledTime.setHours(slot.h, Math.max(0, Math.min(59, slot.m + jitter)), 0, 0);

      // Se o horário calculado de hoje já passou, joga pro dia seguinte no mesmo slot
      if (scheduledTime.getTime() < Date.now() + 5 * 60 * 1000) {
        scheduledTime.setDate(scheduledTime.getDate() + 1);
      }

      // Monta o texto do post com legenda, hashtags e anexo de mídia congelada
      const tagsString = (item.hashtags || []).join(" ");
      const mediaTag = item.previewUrl ? `\n\n[midia:${item.previewUrl}|tipo:${item.type}]` : "";
      const postText = `${item.caption}\n\n${tagsString}${mediaTag}`.trim();

      // Procura se já existe post cadastrado para esta mesma mídia (DESDUPLICAÇÃO)
      const matchingPosts = existingPosts.filter((p) => matchPostMedia(p, item));

      if (matchingPosts.length > 0) {
        // Atualiza o post existente em vez de duplicar
        const primaryPost = matchingPosts[0];
        await supabase
          .from("posts")
          .update({
            scheduled_for: scheduledTime.toISOString(),
            status: "agendado",
            error: null,
            attempts: 0,
            claimed_at: null,
          })
          .eq("id", primaryPost.id);

        if (primaryPost.items && primaryPost.items.length > 0) {
          await supabase
            .from("post_items")
            .update({ body: postText })
            .eq("id", primaryPost.items[0].id);
        } else {
          await supabase
            .from("post_items")
            .insert({ post_id: primaryPost.id, position: 0, body: postText });
        }

        processedIds.push(primaryPost.id);

        // Se haviam duplicatas anteriores antigas para essa mesma mídia, remove-as
        for (const dup of matchingPosts.slice(1)) {
          await supabase.from("posts").delete().eq("id", dup.id);
        }
      } else {
        // Insere novo post único
        const { data: newP, error: postErr } = await supabase
          .from("posts")
          .insert({
            account_id: acc.id,
            status: "agendado",
            scheduled_for: scheduledTime.toISOString(),
          })
          .select("id")
          .single<{ id: string }>();

        if (postErr || !newP) {
          console.error("Erro ao inserir post único:", postErr);
          throw postErr || new Error("Falha ao criar post na agenda");
        }

        const { error: itemErr } = await supabase
          .from("post_items")
          .insert({ post_id: newP.id, position: 0, body: postText });

        if (itemErr) {
          console.error("Erro ao inserir post_item:", itemErr);
          throw itemErr;
        }

        processedIds.push(newP.id);
      }
    }

    // Sincroniza estado em memória
    driveStore.items = items.map((it) => ({ ...it, status: "scheduled" as const }));
    for (const it of items) {
      const pIdx = GOOGLE_DRIVE_FOLDER_POOL.findIndex((p) => p.id === it.id);
      if (pIdx !== -1) {
        GOOGLE_DRIVE_FOLDER_POOL[pIdx] = {
          ...GOOGLE_DRIVE_FOLDER_POOL[pIdx],
          status: "scheduled",
          caption: it.caption,
          hashtags: it.hashtags,
        };
      }
    }

    return NextResponse.json({
      ok: true,
      count: processedIds.length,
      postIds: processedIds,
      postsPerDay,
      daysCovered: Math.ceil(processedIds.length / postsPerDay),
    });
  } catch (e) {
    return fail(e);
  }
}
