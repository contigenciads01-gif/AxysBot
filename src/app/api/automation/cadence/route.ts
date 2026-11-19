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

export function getActiveCadence(): HumanCadenceConfig {
  return savedCadence;
}

export function calculateBiologicalState(cadence: HumanCadenceConfig = savedCadence) {
  // Pega a hora atual no fuso de São Paulo / Brasil
  const now = new Date();
  const timeStr = now.toLocaleTimeString("pt-BR", {
    timeZone: cadence.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const [currH, currM] = timeStr.split(":").map(Number);
  const currentMinutes = currH * 60 + currM;

  // 1. Checa Sono Noturno (ex: 23:45 até 07:15)
  if (cadence.nightSleep.enabled) {
    const [sleepH, sleepM] = cadence.nightSleep.start.split(":").map(Number);
    const [wakeH, wakeM] = cadence.nightSleep.end.split(":").map(Number);
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
        description: `Conta dormindo naturalmente. Retomada às ${cadence.nightSleep.end}`,
        allowsAction: false,
        nextResume: cadence.nightSleep.end,
      };
    }
  }

  // 2. Checa Pausa de Almoço (ex: 12:15 às 13:40)
  if (cadence.lunchPause.enabled) {
    const [lunchStartH, lunchStartM] = cadence.lunchPause.start.split(":").map(Number);
    const [lunchEndH, lunchEndM] = cadence.lunchPause.end.split(":").map(Number);
    const lunchStartMinutes = lunchStartH * 60 + lunchStartM;
    const lunchEndMinutes = lunchEndH * 60 + lunchEndM;

    if (currentMinutes >= lunchStartMinutes && currentMinutes < lunchEndMinutes) {
      return {
        state: "LUNCH_PAUSE" as const,
        label: "🍽️ Pausa de Almoço (Intervalo Humano)",
        description: `Pausa para refeição das ${cadence.lunchPause.start} às ${cadence.lunchPause.end}`,
        allowsAction: false,
        nextResume: cadence.lunchPause.end,
      };
    }
  }

  // 3. Estado Ativo Normal (Sessão com Jitter Quebrado)
  const nextJitterSeconds = +(
    Math.random() * (cadence.actionJitterMaxSeconds - cadence.actionJitterMinSeconds) +
    cadence.actionJitterMinSeconds
  ).toFixed(1);

  return {
    state: "ACTIVE_SESSION" as const,
    label: "🟢 Sessão de Uso Ativa (Celular na Mão)",
    description: `Navegando com intervalos quebrados (próxima ação em ${nextJitterSeconds}s)`,
    allowsAction: true,
    nextJitterSeconds,
  };
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

    savedCadence = {
      ...savedCadence,
      ...body.cadence,
      lunchPause: {
        ...savedCadence.lunchPause,
        ...(body.cadence.lunchPause || {}),
      },
      nightSleep: {
        ...savedCadence.nightSleep,
        ...(body.cadence.nightSleep || {}),
      },
    };

    // Sincroniza working_hours_start e end em bot_configs se aplicável
    try {
      await db().from("bot_configs").update({
        working_hours_start: savedCadence.nightSleep.end + ":00",
        working_hours_end: savedCadence.nightSleep.start + ":00",
        min_interval_seconds: Math.round(savedCadence.actionJitterMinSeconds),
        max_interval_seconds: Math.round(savedCadence.actionJitterMaxSeconds),
        updated_at: new Date().toISOString(),
      });
    } catch {
      // ignora se falhar
    }

    return NextResponse.json({
      ok: true,
      cadence: savedCadence,
      biologicalState: calculateBiologicalState(savedCadence),
    });
  } catch (e) {
    return fail(e);
  }
}
