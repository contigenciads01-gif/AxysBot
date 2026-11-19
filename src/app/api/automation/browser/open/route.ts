import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { db } from "@/lib/supabase";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as { accountId?: string };
    if (!body.accountId) {
      return NextResponse.json({ error: "accountId obrigatório" }, { status: 400 });
    }

    const { data: account, error } = await db()
      .from("platform_accounts")
      .select("id, username, proxy, proxy_active")
      .eq("id", body.accountId)
      .single();

    if (error || !account) {
      return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
    }

    // Diretório de perfil isolado para esta conta
    const baseDir = path.join(os.homedir(), ".axysbot", "chrome_profiles", account.username || account.id);
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    const chromePaths = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(os.homedir(), "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"),
    ];

    const chromeExe = chromePaths.find((p) => fs.existsSync(p));
    if (!chromeExe) {
      return NextResponse.json(
        { error: "Google Chrome não encontrado nas pastas padrão do Windows." },
        { status: 404 }
      );
    }

    const args = [
      `--user-data-dir=${baseDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      `--window-name=AXYSBOT - @${account.username}`,
    ];

    if (account.proxy && account.proxy_active) {
      // Ex: http://185.220.101.5:8080 ou socks5://185.220.101.5:1080
      args.push(`--proxy-server=${account.proxy}`);
    }

    args.push("https://x.com");

    const proc = spawn(chromeExe, args, {
      detached: true,
      stdio: "ignore",
    });
    proc.unref();

    return NextResponse.json({
      ok: true,
      message: `Chrome aberto para @${account.username} com perfil isolado${account.proxy && account.proxy_active ? ` e proxy ${account.proxy}` : ""}.`,
      profileDir: baseDir,
    });
  } catch (e) {
    return fail(e);
  }
}
