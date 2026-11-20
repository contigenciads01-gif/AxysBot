import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { getAccount, confirmPublished } from "@/lib/data";
import { logRun, db } from "@/lib/supabase";
import { discardPublishedDriveItem } from "@/app/api/drive/route";

type Ctx = { params: Promise<{ id: string }> };

/** Marca como publicado o post que voce confirmou na tela do X e descarta a mídia da memória do bot. */
export async function POST(req: Request, ctx: Ctx) {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const acc = await getAccount();
    if (!acc) return NextResponse.json({ error: "Identifique sua conta do X em Ajustes." }, { status: 409 });
    const b = (await req.json().catch(() => ({}))) as { links?: unknown };
    const links = Array.isArray(b.links) ? b.links.map((l) => (typeof l === "string" ? l : null)) : [];
    const r = await confirmPublished(acc.id, id, links);

    // Descarte inteligente da memória: remove a foto/vídeo publicada da memória ativa do bot,
    // mantendo o arquivo intacto no Google Drive, e puxa a próxima para manter o lote de 6.
    try {
      const { data: postItems } = await db()
        .from("post_items")
        .select("body")
        .eq("post_id", id);

      if (postItems && postItems.length > 0) {
        for (const it of postItems) {
          if (it.body) {
            discardPublishedDriveItem(it.body);
          }
        }
      }
    } catch (discardErr) {
      console.warn("Aviso ao descartar mídia da memória:", discardErr);
    }

    await logRun({
      account_id: acc.id,
      kind: "publicar",
      ok: true,
      detail: r.items > 1 ? `Thread de ${r.items} posts publicada por você no X` : "Post publicado por você no X (mídia descartada da memória RAM, salva no Drive)",
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e && typeof e === "object" && (e as { status?: number }).status === 404) return NextResponse.json({ error: "Post não encontrado." }, { status: 404 });
    return fail(e);
  }
}
