"use client";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel panel-pad max-w-[620px]">
      <h1 className="h2">Algo falhou ao carregar esta tela</h1>
      <p className="mt-1.5 text-[13.5px] text-[var(--ink-2)]">{error.message || "Erro inesperado."}</p>
      <p className="mt-1 text-[12.5px] text-[var(--muted)]">Se o erro fala de Supabase ou tabela, confira Ajustes: lá aparece o que falta configurar.</p>
      <button type="button" className="btn btn-primary mt-4" onClick={reset}>Tentar de novo</button>
    </div>
  );
}
