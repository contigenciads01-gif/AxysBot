import type { SetupItem } from "@/lib/setup";
import { IconCheck } from "./icons";

export function SetupList({ items }: { items: SetupItem[] }) {
  const done = items.filter((i) => i.ok).length;
  return (
    <section className="panel panel-pad">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="h2">Para o bot rodar</h2>
        <span className="label num">{done} de {items.length} prontos</span>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-[var(--sunken)] overflow-hidden">
        <div className="h-full bg-[var(--accent)] rounded-full transition-[width] duration-700" style={{ width: `${(done / items.length) * 100}%` }} />
      </div>
      <ol className="mt-4 flex flex-col gap-1">
        {items.map((i) => (
          <li key={i.key} className="flex gap-3 py-1.5">
            <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${i.ok ? "bg-[var(--ok)] text-white" : "border-[1.5px] border-[var(--line-strong)]"}`}>
              {i.ok ? <IconCheck size={13} /> : null}
            </span>
            <div className="min-w-0">
              <div className={i.ok ? "text-[var(--muted)]" : "font-[560]"}>{i.label}</div>
              {!i.ok ? <div className="text-[12.5px] text-[var(--ink-2)] mt-0.5">{i.hint}</div> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
