import Link from "next/link";
export default function NotFound() {
  return (
    <main className="min-h-dvh grid place-items-center px-5 text-center">
      <div><h1 className="h1">Essa página não existe</h1><Link href="/" className="btn btn-primary mt-4">Voltar ao painel</Link></div>
    </main>
  );
}
