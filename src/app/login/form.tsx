"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [user, setUser] = useState("admin");
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user, password: pw }) });
    if (r.ok) {
      const next = sp.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } else {
      setError((await r.json().catch(() => ({}))).error ?? "Não deu para entrar.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 liquid-glass glass-card panel-pad flex flex-col gap-3" data-glass>
      <label className="block">
        <span className="label">Usuário</span>
        <input name="username" className="input mt-1" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" spellCheck={false} autoCapitalize="none" required />
      </label>
      <label className="block">
        <span className="label">Senha</span>
        <input name="password" type="password" className="input mt-1" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" autoFocus required />
      </label>
      {error ? <p className="text-[13px] text-[var(--bad)]" role="alert">{error}</p> : null}
      <button type="submit" className="btn btn-primary mt-1" data-glass disabled={loading || !pw || !user}>{loading ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
