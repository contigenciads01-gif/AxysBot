import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { getAccount } from "@/lib/data";
import { db, logRun } from "@/lib/supabase";
import { normalizeHandle, profileUrl } from "@/lib/intents";
import { fetchEmbed, EmbedError } from "@/lib/oembed";

/**
 * Identifica a conta do X pelo @, sem OAuth e sem API paga.
 * Confere se o perfil existe pelo embed oficial (gratuito). Nao guarda
 * senha, cookie nem token: as acoes acontecem no seu navegador, no x.com.
 */
export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const body = (await req.json().catch(() => ({}))) as { username?: string };
    const handle = normalizeHandle(String(body.username ?? ""));
    if (!handle) return NextResponse.json({ error: "Digite um @ válido: letras, números e _, até 15 caracteres." }, { status: 400 });

    let displayName: string | null = null;
    try {
      const e = await fetchEmbed(profileUrl(handle));
      displayName = e.author_name || null;
    } catch (e) {
      if (e instanceof EmbedError && e.status === 404) {
        return NextResponse.json({ error: `Não achei o perfil @${handle} no X.` }, { status: 404 });
      }
      // X fora do ar: identifica mesmo assim, sem o nome
    }

    const current = await getAccount();
    const row = { username: handle, display_name: displayName, avatar_url: null, access_token: "sem-api", refresh_token: null, token_expires_at: null, scopes: ["web-intents"] };
    let id: string;
    if (current) {
      const { error } = await db().from("x_accounts").update({ ...row, x_user_id: `handle:${handle.toLowerCase()}` }).eq("id", current.id);
      if (error) throw error;
      id = current.id;
    } else {
      const { data, error } = await db().from("x_accounts")
        .upsert({ ...row, x_user_id: `handle:${handle.toLowerCase()}` }, { onConflict: "x_user_id" })
        .select("id").single<{ id: string }>();
      if (error || !data) throw error ?? new Error("Falha ao salvar a conta.");
      id = data.id;
    }
    await db().from("settings").upsert({ account_id: id }, { onConflict: "account_id", ignoreDuplicates: true });
    await logRun({ account_id: id, kind: "conta", ok: true, detail: `Conta @${handle} identificada` });
    return NextResponse.json({ ok: true, username: handle, display_name: displayName });
  } catch (e) { return fail(e); }
}

/** Desvincula o @ (o histórico fica guardado). */
export async function DELETE() {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const acc = await getAccount();
    if (acc) {
      const { error } = await db().from("x_accounts").update({ access_token: "revogado" }).eq("id", acc.id);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
