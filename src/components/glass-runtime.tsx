"use client";
/*!
 * Liquid Glass — refracao (porta React do diretivo Angular de
 * stormaref/LiquidGlassSkill, assets/liquid-glass.directive.ts).
 *
 * The refraction field is a port of the fragment shader in liquid-glass-js
 * (https://github.com/dashersw/liquid-glass-js) — Copyright (c) 2025 Armagan
 * Amcalar, MIT. Permission is hereby granted, free of charge, to any person
 * obtaining a copy of that software to deal in it without restriction,
 * provided this notice travels with it; it is provided "as is", without
 * warranty of any kind. Keep this header on any copy or port.
 *
 * Em vez de um diretivo por elemento, um unico observador aplica a refracao a
 * todo elemento com [data-glass] e a todo .btn-primary, inclusive os que
 * entram depois (navegacao, listas). Formulas e constantes transcritas 1:1.
 */
import { useEffect } from "react";

interface Cfg { edgeIntensity: number; rimIntensity: number; baseIntensity: number; edgeDistance: number; rimDistance: number; baseDistance: number; cornerBoost: number; rippleEffect: number; blurRadius: number; warp: boolean }
const PRESET: Cfg = { edgeIntensity: 0.015, rimIntensity: 0.028, baseIntensity: 0.05, edgeDistance: 0.5, rimDistance: 1.7, baseDistance: 0.2, cornerBoost: 0.06, rippleEffect: 0.26, blurRadius: 2, warp: false };
const SUPERSAMPLE = 2;
const MAX_MAP_EDGE = 1400;
const BLUR_STD_PER_RADIUS = 0.35;
const SELECTOR = "[data-glass], .btn-primary";

interface FilterEntry { id: string; node: SVGFilterElement; refs: number }
const filters = new Map<string, FilterEntry>();
let defs: SVGSVGElement | null = null;
let nextId = 0;

function supported(): boolean {
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands;
  if (brands) return brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/i.test(b.brand));
  return /Chrome\//.test(navigator.userAgent);
}

function ensureDefs(): SVGSVGElement {
  if (!defs || !defs.isConnected) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "0"); svg.setAttribute("height", "0"); svg.setAttribute("aria-hidden", "true");
    svg.style.position = "fixed";
    svg.appendChild(document.createElementNS(ns, "defs"));
    document.body.appendChild(svg);
    defs = svg;
  }
  return defs;
}

function clampByte(v: number) { return Math.max(0, Math.min(255, Math.round(v))); }
function resolveRadius(computed: string, w: number, h: number) {
  const v = parseFloat(computed) || 0;
  return computed.trim().endsWith("%") ? (v / 100) * Math.min(w, h) : v;
}

function buildMap(w: number, h: number, radius: number, pageW: number, pageH: number, cfg: Cfg) {
  const ss = Math.max(0.25, Math.min(SUPERSAMPLE, MAX_MAP_EDGE / Math.max(w, h)));
  const bw = Math.max(1, Math.round(w * ss)), bh = Math.max(1, Math.round(h * ss));
  const r = radius * ss, minDim = Math.min(w, h);
  const dx = new Float32Array(bw * bh), dy = new Float32Array(bw * bh);
  let maxAbs = 0;
  for (let py = 0; py < bh; py++) {
    for (let px = 0; px < bw; px++) {
      const cx = (px + 0.5) / bw, cy = (py + 0.5) / bh;
      const tx = Math.abs(px + 0.5 - bw / 2) - (bw / 2 - r);
      const ty = Math.abs(py + 0.5 - bh / 2) - (bh / 2 - r);
      const outside = Math.hypot(Math.max(tx, 0), Math.max(ty, 0));
      const inside = Math.min(Math.max(tx, ty), 0);
      const distPx = Math.max(-(outside + inside - r), 0) / ss;
      const edgeFall = Math.exp(-distPx * cfg.edgeDistance);
      const rimFall = Math.exp(-distPx * cfg.rimDistance);
      const baseFall = 1 - Math.exp(-distPx * cfg.baseDistance);
      const total = (cfg.warp ? baseFall * cfg.baseIntensity : 0) + edgeFall * cfg.edgeIntensity + rimFall * cfg.rimIntensity;
      let nx = cx - 0.5, ny = cy - 0.5;
      const len = Math.hypot(nx, ny);
      if (len > 0) { nx /= len; ny /= len; }
      const cornerNorm = Math.max(Math.min(cx, 1 - cx), Math.min(cy, 1 - cy)) * minDim;
      const corner = Math.exp(-cornerNorm * 0.3) * cfg.cornerBoost;
      const ripple = Math.sin((distPx / minDim) * 25) * cfg.rippleEffect * rimFall;
      const fx = (nx * (total + corner) - ny * ripple) * pageW;
      const fy = (ny * (total + corner) + nx * ripple) * pageH;
      const i = py * bw + px;
      dx[i] = fx; dy[i] = fy;
      maxAbs = Math.max(maxAbs, Math.abs(fx), Math.abs(fy));
    }
  }
  const scale = Math.max(maxAbs * 2, 1e-4);
  const bias = scale * (128 / 255 - 0.5); // vies de decodificacao do feDisplacementMap
  const canvas = document.createElement("canvas");
  canvas.width = bw; canvas.height = bh;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(bw, bh);
  for (let i = 0; i < bw * bh; i++) {
    img.data[i * 4] = clampByte(255 * (0.5 + (dx[i] - bias) / scale));
    img.data[i * 4 + 1] = clampByte(255 * (0.5 + (dy[i] - bias) / scale));
    img.data[i * 4 + 2] = 128;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { mapUrl: canvas.toDataURL("image/png"), scale };
}

function acquire(key: string, w: number, h: number, radius: number, pageW: number, pageH: number, cfg: Cfg): FilterEntry {
  let entry = filters.get(key);
  if (entry && entry.node.isConnected) { entry.refs++; return entry; }
  if (entry) filters.delete(key);
  const { mapUrl, scale } = buildMap(w, h, radius, pageW, pageH, cfg);
  const id = `liquid-glass-${nextId++}`;
  const ns = "http://www.w3.org/2000/svg";
  const filter = document.createElementNS(ns, "filter");
  filter.setAttribute("id", id);
  const margin = scale / 2 + 3 * cfg.blurRadius * BLUR_STD_PER_RADIUS;
  const mx = (margin / w) * 100, my = (margin / h) * 100;
  filter.setAttribute("x", `${-mx}%`); filter.setAttribute("y", `${-my}%`);
  filter.setAttribute("width", `${100 + 2 * mx}%`); filter.setAttribute("height", `${100 + 2 * my}%`);
  filter.setAttribute("color-interpolation-filters", "sRGB");
  const feImage = document.createElementNS(ns, "feImage");
  feImage.setAttribute("href", mapUrl); feImage.setAttribute("x", "0"); feImage.setAttribute("y", "0");
  feImage.setAttribute("width", String(w)); feImage.setAttribute("height", String(h));
  feImage.setAttribute("preserveAspectRatio", "none"); feImage.setAttribute("result", "map");
  const feDisp = document.createElementNS(ns, "feDisplacementMap");
  feDisp.setAttribute("in", "SourceGraphic"); feDisp.setAttribute("in2", "map");
  feDisp.setAttribute("scale", String(scale));
  feDisp.setAttribute("xChannelSelector", "R"); feDisp.setAttribute("yChannelSelector", "G");
  feDisp.setAttribute("result", "displaced");
  const feBlur = document.createElementNS(ns, "feGaussianBlur");
  feBlur.setAttribute("in", "displaced");
  feBlur.setAttribute("stdDeviation", String(cfg.blurRadius * BLUR_STD_PER_RADIUS));
  filter.append(feImage, feDisp, feBlur);
  ensureDefs().querySelector("defs")!.appendChild(filter);
  entry = { id, node: filter, refs: 1 };
  filters.set(key, entry);
  return entry;
}

function release(key: string | null) {
  if (!key) return;
  const e = filters.get(key);
  if (e && --e.refs <= 0) { filters.delete(key); e.node.remove(); }
}

/** Uma instancia por elemento: ResizeObserver + rebuild coalescido por frame. */
class Glass {
  private key: string | null = null;
  private raf = 0;
  private ro: ResizeObserver;
  constructor(private el: HTMLElement) {
    this.ro = new ResizeObserver(() => this.schedule());
    this.ro.observe(el);
    this.schedule();
  }
  schedule() { cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => this.rebuild()); }
  private rebuild() {
    const w = Math.round(this.el.offsetWidth), h = Math.round(this.el.offsetHeight);
    if (w < 2 || h < 2) return;
    const radius = Math.min(resolveRadius(getComputedStyle(this.el).borderTopLeftRadius, w, h), Math.min(w, h) / 2);
    const pageW = window.innerWidth, pageH = window.innerHeight;
    const key = [w, h, radius, pageW, pageH].join("|");
    if (key === this.key) return;
    release(this.key);
    const entry = acquire(key, w, h, radius, pageW, pageH, PRESET);
    this.key = key;
    this.el.style.backdropFilter = `url(#${entry.id})`;
  }
  destroy() { this.ro.disconnect(); cancelAnimationFrame(this.raf); release(this.key); this.key = null; this.el.style.backdropFilter = ""; }
}

export function GlassRuntime() {
  useEffect(() => {
    if (!supported()) return; // Safari/Firefox: fica o blur do CSS
    const live = new Map<HTMLElement, Glass>();
    const attach = (root: ParentNode) => {
      root.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => { if (!live.has(el)) live.set(el, new Glass(el)); });
    };
    const sweep = () => {
      for (const [el, g] of live) if (!el.isConnected || !el.matches(SELECTOR)) { g.destroy(); live.delete(el); }
    };
    attach(document);
    let frame = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { sweep(); attach(document); });
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-glass"] });
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => { clearTimeout(debounce); debounce = setTimeout(() => live.forEach((g) => g.schedule()), 180); };
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      mo.disconnect(); cancelAnimationFrame(frame); clearTimeout(debounce);
      window.removeEventListener("resize", onResize);
      live.forEach((g) => g.destroy()); live.clear();
    };
  }, []);
  return null;
}
