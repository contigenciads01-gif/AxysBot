const TZ = "America/Sao_Paulo";

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}
export function fmtDay(iso: string) {
  const d = new Date(iso), now = new Date();
  const key = (x: Date) => x.toLocaleDateString("pt-BR", { timeZone: TZ });
  const tomorrow = new Date(now.getTime() + 864e5);
  if (key(d) === key(now)) return "Hoje";
  if (key(d) === key(tomorrow)) return "Amanhã";
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: TZ }).replace(".", "");
}
export function fmtShortDate(day: string) {
  return new Date(day + "T12:00:00Z").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: TZ }).replace(".", "");
}
/** "em 2 h 14 min" / "há 5 min" */
export function fmtRelative(iso: string, now = Date.now()) {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60000);
  let s: string;
  if (m < 1) s = "menos de 1 min";
  else if (m < 60) s = `${m} min`;
  else if (m < 60 * 24) s = `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
  else s = `${Math.round(m / 1440)} dia${Math.round(m / 1440) > 1 ? "s" : ""}`;
  return diff >= 0 ? `em ${s}` : `há ${s}`;
}
export function fmtUsd(v: number) {
  return "US$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 3 : 2 });
}
export function fmtNum(v: number | null | undefined) {
  if (v == null) return "—";
  if (v >= 10000) return (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
  return v.toLocaleString("pt-BR");
}
