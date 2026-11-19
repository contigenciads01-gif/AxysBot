import { Shell } from "@/components/shell";
import { getAccount } from "@/lib/data";

export const dynamic = "force-dynamic";

async function loadShell() {
  try {
    const acc = await getAccount();
    return { username: acc?.username ?? null };
  } catch {
    return { username: null }; // banco ainda nao configurado: o painel abre e guia o setup
  }
}

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const { username } = await loadShell();
  return <Shell username={username}>{children}</Shell>;
}
