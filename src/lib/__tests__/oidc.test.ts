import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyGithubOidc, GITHUB_ISSUER } from "../oidc";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1" };
const fetchJwks = async () => ({ keys: [jwk] });
const now = Date.now();

function jwt(claims: Record<string, unknown>, key = privateKey, kid = "k1") {
  const h = Buffer.from(JSON.stringify({ alg: "RS256", kid })).toString("base64url");
  const p = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const s = sign("RSA-SHA256", Buffer.from(`${h}.${p}`), key).toString("base64url");
  return `${h}.${p}.${s}`;
}
const good = {
  iss: GITHUB_ISSUER, aud: "axysbot", exp: Math.floor(now / 1000) + 300, nbf: Math.floor(now / 1000) - 5,
  repository: "contigenciads01-gif/AxysBot", event_name: "schedule",
  job_workflow_ref: "contigenciads01-gif/AxysBot/.github/workflows/agendador.yml@refs/heads/main",
};
beforeAll(() => { delete process.env.CRON_GITHUB_REPO; });

describe("agendador autenticado por OIDC do GitHub", () => {
  it("aceita token valido deste repo e deste workflow", async () => {
    expect(await verifyGithubOidc(jwt(good), { fetchJwks, now })).toBe(true);
  });
  it("aceita disparo manual (workflow_dispatch)", async () => {
    expect(await verifyGithubOidc(jwt({ ...good, event_name: "workflow_dispatch" }), { fetchJwks, now })).toBe(true);
  });
  it("recusa assinatura de outra chave", async () => {
    expect(await verifyGithubOidc(jwt(good, other.privateKey), { fetchJwks, now })).toBe(false);
  });
  it("recusa outro repositorio (fork)", async () => {
    expect(await verifyGithubOidc(jwt({ ...good, repository: "atacante/AxysBot", job_workflow_ref: "atacante/AxysBot/.github/workflows/agendador.yml@refs/heads/main" }), { fetchJwks, now })).toBe(false);
  });
  it("recusa outro workflow ou outra branch", async () => {
    expect(await verifyGithubOidc(jwt({ ...good, job_workflow_ref: "contigenciads01-gif/AxysBot/.github/workflows/outro.yml@refs/heads/main" }), { fetchJwks, now })).toBe(false);
    expect(await verifyGithubOidc(jwt({ ...good, job_workflow_ref: "contigenciads01-gif/AxysBot/.github/workflows/agendador.yml@refs/heads/teste" }), { fetchJwks, now })).toBe(false);
  });
  it("recusa token expirado, audiencia errada, emissor errado e evento de PR", async () => {
    expect(await verifyGithubOidc(jwt({ ...good, exp: Math.floor(now / 1000) - 1 }), { fetchJwks, now })).toBe(false);
    expect(await verifyGithubOidc(jwt({ ...good, aud: "outra" }), { fetchJwks, now })).toBe(false);
    expect(await verifyGithubOidc(jwt({ ...good, iss: "https://evil" }), { fetchJwks, now })).toBe(false);
    expect(await verifyGithubOidc(jwt({ ...good, event_name: "pull_request" }), { fetchJwks, now })).toBe(false);
  });
  it("recusa lixo e alg none", async () => {
    expect(await verifyGithubOidc("abc", { fetchJwks, now })).toBe(false);
    const none = Buffer.from(JSON.stringify({ alg: "none", kid: "k1" })).toString("base64url") + "." + Buffer.from(JSON.stringify(good)).toString("base64url") + ".";
    expect(await verifyGithubOidc(none, { fetchJwks, now })).toBe(false);
  });
});
