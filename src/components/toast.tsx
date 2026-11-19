"use client";
import { useCallback, useEffect, useState } from "react";

/** Toast unico, com aria-live: confirma a acao com o mesmo verbo do botao. */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3200);
    return () => clearTimeout(t);
  }, [msg]);
  const show = useCallback((m: string) => setMsg(m), []);
  const node = <div aria-live="polite" role="status">{msg ? <div className="toast">{msg}</div> : null}</div>;
  return { show, node };
}
