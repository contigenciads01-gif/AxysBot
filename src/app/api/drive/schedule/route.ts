import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { getAccount } from "@/lib/data";
import { db } from "@/lib/supabase";
import { DriveMediaItem } from "../route";

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
    const createdIds: string[] = [];

    // Prepara os dados calculados para inserção em lote de alta performance
    const postsToInsert: {
      account_id: string;
      status: "agendado";
      scheduled_for: string;
    }[] = [];

    const postTexts: string[] = [];

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

      postsToInsert.push({
        account_id: acc.id,
        status: "agendado",
        scheduled_for: scheduledTime.toISOString(),
      });
      postTexts.push(postText);
    }

    // Inserção em lotes de 20 para evitar limites de tamanho e garantir velocidade instantânea
    const CHUNK_SIZE = 25;
    for (let i = 0; i < postsToInsert.length; i += CHUNK_SIZE) {
      const chunkPosts = postsToInsert.slice(i, i + CHUNK_SIZE);
      const chunkTexts = postTexts.slice(i, i + CHUNK_SIZE);

      const { data: insertedPosts, error: postErr } = await supabase
        .from("posts")
        .insert(chunkPosts)
        .select("id");

      if (postErr || !insertedPosts) {
        console.error("Erro na inserção de posts em lote:", postErr);
        throw postErr || new Error("Falha ao criar posts na agenda");
      }

      const itemsToInsert = insertedPosts.map((p, idx) => ({
        post_id: p.id,
        position: 0,
        body: chunkTexts[idx],
      }));

      const { error: itemErr } = await supabase.from("post_items").insert(itemsToInsert);
      if (itemErr) {
        console.error("Erro na inserção de post_items em lote:", itemErr);
        throw itemErr;
      }

      for (const p of insertedPosts) {
        createdIds.push(p.id);
      }
    }

    return NextResponse.json({
      ok: true,
      count: createdIds.length,
      postIds: createdIds,
      postsPerDay,
      daysCovered: Math.ceil(createdIds.length / postsPerDay),
    });
  } catch (e) {
    return fail(e);
  }
}
