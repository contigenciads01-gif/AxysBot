import { NextResponse } from "next/server";
import { requireSession, fail } from "@/lib/http";
import { db } from "@/lib/supabase";

export interface HumanCadenceConfig {
  sessionDurationMinMinutes: number; // Ex: 7.2 min
  sessionDurationMaxMinutes: number; // Ex: 14.5 min
  pocketCooldownMinMinutes: number;   // Ex: 18.0 min (celular no bolso)
  pocketCooldownMaxMinutes: number;   // Ex: 42.5 min
  actionJitterMinSeconds: number;     // Ex: 10.8s (tempo quebrado)
  actionJitterMaxSeconds: number;     // Ex: 23.4s
  likeCadenceMinMinutes: number;      // Ex: 3.5 min
  likeCadenceMaxMinutes: number;      // Ex: 8.0 min
  retweetCadenceMinMinutes: number;   // Ex: 28.0 min
  retweetCadenceMaxMinutes: number;   // Ex: 62.0 min
  lunchPause: {
    enabled: boolean;
    start: string; // "12:15"
    end: string;   // "13:40"
  };
  nightSleep: {
    enabled: boolean;
    start: string; // "23:45"
    end: string;   // "07:15"
  };
  timezone: string;
}

export const DEFAULT_CADENCE: HumanCadenceConfig = {
  sessionDurationMinMinutes: 7.5,
  sessionDurationMaxMinutes: 14.0,
  pocketCooldownMinMinutes: 18.5,
  pocketCooldownMaxMinutes: 42.0,
  actionJitterMinSeconds: 11.2,
  actionJitterMaxSeconds: 23.8,
  likeCadenceMinMinutes: 3.5,
  likeCadenceMaxMinutes: 7.8,
  retweetCadenceMinMinutes: 28.5,
  retweetCadenceMaxMinutes: 58.0,
  lunchPause: {
    enabled: true,
    start: "12:15",
    end: "13:40",
  },
  nightSleep: {
    enabled: true,
    start: "23:45",
    end: "07:15",
  },
  timezone: "America/Sao_Paulo",
};

// Memória de processo para manter estado circadiano contínuo da sessão
let savedCadence: HumanCadenceConfig = { ...DEFAULT_CADENCE };

export function sanitizeCadence(raw?: Partial<HumanCadenceConfig>): HumanCadenceConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CADENCE };

  const num = (v: unknown, fallback: number) => {
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  const safeTime = (v: unknown, fallback: string) => {
    const s = String(v ?? "").trim();
    if (/^\d{1,2}:\d{2}/.test(s)) {
      return s.slice(0, 5);
    }
    return fallback;
  };

  return {
    sessionDurationMinMinutes: num(raw.sessionDurationMinMinutes, DEFAULT_CADENCE.sessionDurationMinMinutes),
    sessionDurationMaxMinutes: num(raw.sessionDurationMaxMinutes, DEFAULT_CADENCE.sessionDurationMaxMinutes),
    pocketCooldownMinMinutes: num(raw.pocketCooldownMinMinutes, DEFAULT_CADENCE.pocketCooldownMinMinutes),
    pocketCooldownMaxMinutes: num(raw.pocketCooldownMaxMinutes, DEFAULT_CADENCE.pocketCooldownMaxMinutes),
    actionJitterMinSeconds: num(raw.actionJitterMinSeconds, DEFAULT_CADENCE.actionJitterMinSeconds),
    actionJitterMaxSeconds: num(raw.actionJitterMaxSeconds, DEFAULT_CADENCE.actionJitterMaxSeconds),
    likeCadenceMinMinutes: num(raw.likeCadenceMinMinutes, DEFAULT_CADENCE.likeCadenceMinMinutes),
    likeCadenceMaxMinutes: num(raw.likeCadenceMaxMinutes, DEFAULT_CADENCE.likeCadenceMaxMinutes),
    retweetCadenceMinMinutes: num(raw.retweetCadenceMinMinutes, DEFAULT_CADENCE.retweetCadenceMinMinutes),
    retweetCadenceMaxMinutes: num(raw.retweetCadenceMaxMinutes, DEFAULT_CADENCE.retweetCadenceMaxMinutes),
    lunchPause: {
      enabled: raw.lunchPause ? Boolean(raw.lunchPause.enabled) : DEFAULT_CADENCE.lunchPause.enabled,
      start: safeTime(raw.lunchPause?.start, DEFAULT_CADENCE.lunchPause.start),
      end: safeTime(raw.lunchPause?.end, DEFAULT_CADENCE.lunchPause.end),
    },
    nightSleep: {
      enabled: raw.nightSleep ? Boolean(raw.nightSleep.enabled) : DEFAULT_CADENCE.nightSleep.enabled,
      start: safeTime(raw.nightSleep?.start, DEFAULT_CADENCE.nightSleep.start),
      end: safeTime(raw.nightSleep?.end, DEFAULT_CADENCE.nightSleep.end),
    },
    timezone: String(raw.timezone || DEFAULT_CADENCE.timezone),
  };
}

export function getActiveCadence(): HumanCadenceConfig {
  return savedCadence;
}

export function calculateBiologicalState(cadence: HumanCadenceConfig = savedCadence) {
  try {
    const safeCad = sanitizeCadence(cadence);
    const now = new Date();
    const timeStr = now.toLocaleTimeString("pt-BR", {
      timeZone: safeCad.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const [currH, currM] = (timeStr || "12:00").split(":").map((v) => parseInt(v, 10) || 0);
    const currentMinutes = currH * 60 + currM;

    // 1. Checa Sono Noturno (ex: 23:45 até 07:15)
    if (safeCad.nightSleep.enabled && safeCad.nightSleep.start && safeCad.nightSleep.end) {
      const [sleepH, sleepM] = safeCad.nightSleep.start.split(":").map((v) => parseInt(v, 10) || 0);
      const [wakeH, wakeM] = safeCad.nightSleep.end.split(":").map((v) => parseInt(v, 10) || 0);
      const sleepMinutes = sleepH * 60 + sleepM;
      const wakeMinutes = wakeH * 60 + wakeM;

      const isNight =
        sleepMinutes > wakeMinutes
          ? currentMinutes >= sleepMinutes || currentMinutes < wakeMinutes
          : currentMinutes >= sleepMinutes && currentMinutes < wakeMinutes;

      if (isNight) {
        return {
          state: "NIGHT_SLEEP" as const,
          label: "🌙 Modo Noturno (Descanso Biológico)",
          description: `Conta dormindo naturalmente. Retomada às ${safeCad.nightSleep.end}`,
          allowsAction: false,
          nextResume: safeCad.nightSleep.end,
        };
      }
    }

    // 2. Checa Pausa de Almoço (ex: 12:15 às 13:40)
    if (safeCad.lunchPause.enabled && safeCad.lunchPause.start && safeCad.lunchPause.end) {
      const [lunchStartH, lunchStartM] = safeCad.lunchPause.start.split(":").map((v) => parseInt(v, 10) || 0);
      const [lunchEndH, lunchEndM] = safeCad.lunchPause.end.split(":").map((v) => parseInt(v, 10) || 0);
      const lunchStartMinutes = lunchStartH * 60 + lunchStartM;
      const lunchEndMinutes = lunchEndH * 60 + lunchEndM;

      if (currentMinutes >= lunchStartMinutes && currentMinutes < lunchEndMinutes) {
        return {
          state: "LUNCH_PAUSE" as const,
          label: "🍽️ Pausa de Almoço (Intervalo Humano)",
          description: `Pausa para refeição das ${safeCad.lunchPause.start} às ${safeCad.lunchPause.end}`,
          allowsAction: false,
          nextResume: safeCad.lunchPause.end,
        };
      }
    }

    // 3. Estado Ativo Normal (Sessão com Jitter Quebrado)
    const minJ = Math.min(safeCad.actionJitterMinSeconds, safeCad.actionJitterMaxSeconds);
    const maxJ = Math.max(safeCad.actionJitterMinSeconds, safeCad.actionJitterMaxSeconds);
    const nextJitterSeconds = +(Math.random() * (maxJ - minJ) + minJ).toFixed(1);

    return {
      state: "ACTIVE_SESSION" as const,
      label: "🟢 Sessão de Uso Ativa (Celular na Mão)",
      description: `Navegando com intervalos quebrados (próxima ação em ${nextJitterSeconds}s)`,
      allowsAction: true,
      nextJitterSeconds,
    };
  } catch {
    return {
      state: "ACTIVE_SESSION" as const,
      label: "🟢 Sessão Ativa",
      description: "Operação orgânica ativa",
      allowsAction: true,
      nextJitterSeconds: 12.5,
    };
  }
}

export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const bioState = calculateBiologicalState(savedCadence);

    return NextResponse.json({
      ok: true,
      cadence: savedCadence,
      biologicalState: bioState,
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as { cadence?: Partial<HumanCadenceConfig> };
    if (!body.cadence) {
      return NextResponse.json({ error: "Configurações de cadência não informadas." }, { status: 400 });
    }

    savedCadence = sanitizeCadence(body.cadence);

    // Sincroniza working_hours_start e end em bot_configs com filtro seguro
    try {
      const client = db();
      await client
        .from("bot_configs")
        .update({
          working_hours_start: savedCadence.nightSleep.end.slice(0, 5) + ":00",
          working_hours_end: savedCadence.nightSleep.start.slice(0, 5) + ":00",
          min_interval_seconds: Math.round(savedCadence.actionJitterMinSeconds),
          max_interval_seconds: Math.round(savedCadence.actionJitterMaxSeconds),
          updated_at: new Date().toISOString(),
        })
        .neq("id", "00000000-0000-0000-0000-000000000000");
    } catch {
      // Ignora falhas de conexão de DB secundária
    }

    const bioState = calculateBiologicalState(savedCadence);

    return NextResponse.json({
      ok: true,
      cadence: savedCadence,
      biologicalState: bioState,
    });
  } catch (e) {
    return fail(e);
  }
}
