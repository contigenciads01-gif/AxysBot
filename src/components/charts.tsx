"use client";
import { useId, useMemo, useState } from "react";

export interface Point { x: string; y: number | null; label?: string }
const fmt = (n: number) => n.toLocaleString("pt-BR");
const r1 = (n: number) => Math.round(n * 10) / 10; // rendering-svg-precision

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function TableToggle({ points, unit, title }: { points: Point[]; unit: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? "Ocultar tabela" : "Ver tabela"}
      </button>
      {open ? (
        <table className="mt-2 w-full text-[12.5px] num">
          <caption className="sr-only">{title}</caption>
          <thead><tr className="text-[var(--muted)]"><th className="text-left font-medium py-1">Dia</th><th className="text-right font-medium py-1">{unit}</th></tr></thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.x} className="border-t border-[var(--line)]"><td className="py-1">{p.label ?? p.x}</td><td className="text-right py-1">{p.y == null ? "—" : fmt(p.y)}</td></tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ linha */
export function LineChart({ points, unit, title, color = "var(--s1)", height = 150 }: { points: Point[]; unit: string; title: string; color?: string; height?: number }) {
  const W = 560, H = height, P = { t: 10, r: 10, b: 22, l: 38 };
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const vals = points.map((p) => p.y).filter((v): v is number => v != null);
  const min = vals.length ? Math.min(...vals) : 0, max = vals.length ? Math.max(...vals) : 1;
  const pad = (max - min) * 0.15 || Math.max(1, max * 0.05);
  const lo = Math.max(0, min - pad), hi = max + pad;
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const X = (i: number) => P.l + (points.length < 2 ? iw / 2 : (i * iw) / (points.length - 1));
  const Y = (v: number) => P.t + ih - ((v - lo) / (hi - lo || 1)) * ih;

  const path = useMemo(() => {
    let d = "", started = false;
    points.forEach((p, i) => { if (p.y == null) { started = false; return; } d += `${started ? "L" : "M"}${r1(X(i))},${r1(Y(p.y))}`; started = true; });
    return d;
  }, [points, lo, hi]); // eslint-disable-line react-hooks/exhaustive-deps

  if (vals.length < 2) return <Empty title={title} hint={vals.length ? "A linha aparece a partir do segundo dia de sincronização." : undefined} />;
  const lastIdx = points.findLastIndex((p) => p.y != null);
  const ticks = [lo, (lo + hi) / 2, hi];

  return (
    <figure className="m-0">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label={title}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const b = e.currentTarget.getBoundingClientRect();
            const vx = ((e.clientX - b.left) / b.width) * W;
            let best = 0, bd = Infinity;
            points.forEach((p, i) => { const d = Math.abs(X(i) - vx); if (p.y != null && d < bd) { bd = d; best = i; } });
            setHover(best);
          }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity=".16" /><stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={P.l} x2={W - P.r} y1={r1(Y(t))} y2={r1(Y(t))} stroke="var(--line)" strokeWidth="1" />
              <text x={P.l - 7} y={r1(Y(t)) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--muted)" className="num">{fmt(Math.round(t))}</text>
            </g>
          ))}
          <path d={`${path}L${r1(X(lastIdx))},${P.t + ih}L${r1(X(points.findIndex((p) => p.y != null)))},${P.t + ih}Z`} fill={`url(#${gid})`} />
          <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={r1(X(lastIdx))} cy={r1(Y(points[lastIdx].y!))} r="4" fill={color} stroke="var(--surface)" strokeWidth="2" />
          {[0, Math.floor((points.length - 1) / 2), points.length - 1].map((i) => (
            <text key={i} x={r1(X(i))} y={H - 5} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize="10.5" fill="var(--muted)">{points[i].label ?? points[i].x}</text>
          ))}
          {hover != null && points[hover].y != null ? (
            <g pointerEvents="none">
              <line x1={r1(X(hover))} x2={r1(X(hover))} y1={P.t} y2={P.t + ih} stroke="var(--muted)" strokeDasharray="3 3" />
              <circle cx={r1(X(hover))} cy={r1(Y(points[hover].y!))} r="5" fill={color} stroke="var(--surface)" strokeWidth="2" />
            </g>
          ) : null}
        </svg>
        {hover != null && points[hover].y != null ? (
          <div className="pointer-events-none absolute top-0 panel px-2.5 py-1.5 text-[12px] shadow-md"
            style={{ left: `clamp(0px, calc(${(X(hover) / W) * 100}% - 60px), calc(100% - 130px))` }}>
            <div className="text-[var(--muted)]">{points[hover].label ?? points[hover].x}</div>
            <div className="num font-semibold">{fmt(points[hover].y!)} {unit}</div>
          </div>
        ) : null}
      </div>
      <figcaption className="mt-1"><TableToggle points={points} unit={unit} title={title} /></figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ barras */
export function BarChart({ points, unit, title, color = "var(--s1)", height = 140 }: { points: Point[]; unit: string; title: string; color?: string; height?: number }) {
  const W = 560, H = height, P = { t: 10, r: 6, b: 22, l: 32 };
  const [hover, setHover] = useState<number | null>(null);
  const vals = points.map((p) => p.y ?? 0);
  const max = niceMax(Math.max(...vals, 0));
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const slot = iw / Math.max(points.length, 1);
  const bw = Math.min(26, slot - 4); // >= 2px de respiro entre barras
  const base = P.t + ih;

  if (!points.length) return <Empty title={title} />;
  return (
    <figure className="m-0">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
          {[0, max / 2, max].map((t, i) => (
            <g key={i}>
              <line x1={P.l} x2={W - P.r} y1={r1(base - (t / max) * ih)} y2={r1(base - (t / max) * ih)} stroke={i === 0 ? "var(--line-strong)" : "var(--line)"} />
              <text x={P.l - 6} y={r1(base - (t / max) * ih) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--muted)" className="num">{fmt(t)}</text>
            </g>
          ))}
          {points.map((p, i) => {
            const v = p.y ?? 0, h = (v / max) * ih, x = P.l + i * slot + (slot - bw) / 2;
            const rad = Math.min(4, h, bw / 2);
            // topo arredondado (4px), base reta apoiada na linha
            const d = h <= 0 ? "" : `M${r1(x)},${r1(base)}V${r1(base - h + rad)}Q${r1(x)},${r1(base - h)} ${r1(x + rad)},${r1(base - h)}H${r1(x + bw - rad)}Q${r1(x + bw)},${r1(base - h)} ${r1(x + bw)},${r1(base - h + rad)}V${r1(base)}Z`;
            return (
              <g key={p.x} onMouseEnter={() => setHover(i)}>
                <rect x={P.l + i * slot} y={P.t} width={slot} height={ih} fill="transparent" />
                {d ? <path d={d} fill={color} opacity={hover == null || hover === i ? 1 : 0.45} style={{ transition: "opacity .15s" }} /> : null}
              </g>
            );
          })}
          {[0, points.length - 1].map((i) => (
            <text key={i} x={r1(P.l + i * slot + slot / 2)} y={H - 5} textAnchor={i === 0 ? "start" : "end"} fontSize="10.5" fill="var(--muted)">{points[i].label ?? points[i].x}</text>
          ))}
        </svg>
        {hover != null ? (
          <div className="pointer-events-none absolute top-0 panel px-2.5 py-1.5 text-[12px] shadow-md"
            style={{ left: `clamp(0px, calc(${((P.l + hover * slot + slot / 2) / W) * 100}% - 55px), calc(100% - 120px))` }}>
            <div className="text-[var(--muted)]">{points[hover].label ?? points[hover].x}</div>
            <div className="num font-semibold">{fmt(points[hover].y ?? 0)} {unit}</div>
          </div>
        ) : null}
      </div>
      <figcaption className="mt-1"><TableToggle points={points} unit={unit} title={title} /></figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ medidor */
export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const tone = pct >= 1 ? "var(--bad)" : pct >= 0.8 ? "var(--warn)" : "var(--accent)";
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className="h-2 rounded-full bg-[var(--sunken)] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: tone, transition: "width .6s var(--ease)" }} />
      </div>
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="sunken grid place-items-center text-center px-4 py-6 text-[13px] text-[var(--muted)]" role="img" aria-label={`${title}: sem dados ainda`}>
      {hint ?? "Os dados aparecem depois da primeira sincronização."}
    </div>
  );
}
