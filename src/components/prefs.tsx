"use client";
import { useEffect, useState } from "react";
import type { Density, Theme } from "@/lib/types";

/** Tema e densidade: aplicados no <html>, guardados no navegador e no banco. */
export function usePrefs() {
  const [theme, setThemeState] = useState<Theme>("bege");
  const [density, setDensityState] = useState<Density>("compacto");

  useEffect(() => {
    const d = document.documentElement.dataset;
    setThemeState((d.theme as Theme) ?? "bege");
    setDensityState((d.density as Density) ?? "compacto");
  }, []);

  const persist = (patch: Record<string, string>) => {
    fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }).catch(() => {});
  };
  const setTheme = (t: Theme) => {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("axys.theme", t); } catch {}
    setThemeState(t); persist({ theme: t });
  };
  const setDensity = (n: Density) => {
    document.documentElement.dataset.density = n;
    try { localStorage.setItem("axys.density", n); } catch {}
    setDensityState(n); persist({ density: n });
  };
  return { theme, density, setTheme, setDensity };
}

export function ThemeSwitch() {
  const { theme, setTheme } = usePrefs();
  const opts: { v: Theme; label: string; swatch: string }[] = [
    { v: "branco", label: "Branco", swatch: "#FFFFFF" },
    { v: "bege", label: "Bege", swatch: "#EFE9DD" },
    { v: "escuro", label: "Escuro", swatch: "#16191E" },
  ];
  return (
    <div className="seg" role="group" aria-label="Tema">
      {opts.map((o) => (
        <button key={o.v} type="button" aria-pressed={theme === o.v} onClick={() => setTheme(o.v)} className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full border border-[var(--line-strong)]" style={{ background: o.swatch }} />
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DensitySwitch() {
  const { density, setDensity } = usePrefs();
  return (
    <div className="seg" role="group" aria-label="Densidade">
      <button type="button" aria-pressed={density === "compacto"} onClick={() => setDensity("compacto")}>Compacto</button>
      <button type="button" aria-pressed={density === "amplo"} onClick={() => setDensity("amplo")}>Amplo</button>
    </div>
  );
}
