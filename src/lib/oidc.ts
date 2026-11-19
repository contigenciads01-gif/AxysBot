import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

/**
 * Autenticacao do agendador SEM segredo compartilhado.
 *
 * O GitHub Actions emite, para cada execucao, um JWT assinado (OIDC). O painel
 * confere a assinatura com as chaves publicas do GitHub e exige que o token
 * venha DESTE repositorio e DESTE workflow, na branch main. Assim nao ha
 * CRON_SECRET para cadastrar nem para vazar.
 *
 * Doc: https://docs.github.com/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect
 */
export const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";
export const OIDC_AUDIENCE = "axysbot";
const DEFAULT_REPO = "contigenciads01-gif/AxysBot";
const WORKFLOW_PATH = ".github/workflows/agendador.yml";

type Jwks = { keys: (JsonWebKey & { kid?: string })[] };
type FetchJwks = () => Promise<Jwks>;

let cache: { at: number; jwks: Jwks } | null = null;
const defaultFetchJwks: FetchJwks = async () => {
  if (cache && Date.now() - cache.at < 60 * 60 * 1000) return cache.jwks;
  const res = await fetch(`${GITHUB_ISSUER}/.well-known/jwks`, { cache: "no-store" });
  if (!res.ok) throw new Error(`JWKS do GitHub indisponivel (HTTP ${res.status})`);
  const jwks = (await res.json()) as Jwks;
  cache = { at: Date.now(), jwks };
  return jwks;
};

const b64json = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

export function expectedRepo(): string {
  return (process.env.CRON_GITHUB_REPO || DEFAULT_REPO).toLowerCase();
}

export async function verifyGithubOidc(token: string, opts: { fetchJwks?: FetchJwks; now?: number } = {}): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  let header: { alg?: string; kid?: string }, claims: Record<string, unknown>;
  try { header = b64json(parts[0]); claims = b64json(parts[1]); } catch { return false; }
  if (header.alg !== "RS256" || !header.kid) return false;

  const jwks = await (opts.fetchJwks ?? defaultFetchJwks)();
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) return false;
  const ok = verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(parts[2], "base64url"));
  if (!ok) return false;

  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  const repo = expectedRepo();
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  return (
    claims.iss === GITHUB_ISSUER &&
    aud.includes(OIDC_AUDIENCE) &&
    typeof claims.exp === "number" && claims.exp > now &&
    (typeof claims.nbf !== "number" || claims.nbf <= now + 60) &&
    String(claims.repository ?? "").toLowerCase() === repo &&
    String(claims.job_workflow_ref ?? "").toLowerCase().startsWith(`${repo}/${WORKFLOW_PATH}@refs/heads/main`) &&
    ["schedule", "workflow_dispatch"].includes(String(claims.event_name))
  );
}
