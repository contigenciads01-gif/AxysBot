import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt, safeEqual } from "../crypto";
import { createSessionValue, isValidSession, checkPassword, SESSION_TTL_MS } from "../session";

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
  process.env.SESSION_SECRET = "s".repeat(40);
  process.env.ADMIN_PASSWORD = "senha-forte-123";
});

describe("cifragem dos tokens", () => {
  it("ida e volta", () => {
    const t = "token-secreto-do-x";
    const enc = encrypt(t);
    expect(enc).not.toContain(t);
    expect(decrypt(enc)).toBe(t);
  });
  it("IV aleatorio: mesmo texto, cifras diferentes", () => {
    expect(encrypt("x")).not.toBe(encrypt("x"));
  });
  it("detecta adulteracao", () => {
    const [iv, tag, p] = encrypt("abc").split(".");
    const flipped = p.slice(0, -1) + (p.at(-1) === "A" ? "B" : "A");
    expect(() => decrypt([iv, tag, flipped].join("."))).toThrow();
  });
  it("comparacao segura", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("sessao do painel", () => {
  it("sessao valida passa", () => {
    expect(isValidSession(createSessionValue())).toBe(true);
  });
  it("sessao expirada falha", () => {
    const v = createSessionValue(Date.now() - SESSION_TTL_MS - 1000);
    expect(isValidSession(v)).toBe(false);
  });
  it("assinatura forjada falha", () => {
    const exp = String(Date.now() + 99999999);
    expect(isValidSession(`${exp}.assinatura-falsa`)).toBe(false);
  });
  it("prazo adulterado falha", () => {
    const [, sig] = createSessionValue().split(".");
    expect(isValidSession(`${Date.now() + 10 ** 12}.${sig}`)).toBe(false);
  });
  it("senha", () => {
    expect(checkPassword("senha-forte-123")).toBe(true);
    expect(checkPassword("errada")).toBe(false);
  });
  it("sem senha configurada, ninguem entra", () => {
    const old = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_PASSWORD = "";
    expect(checkPassword("")).toBe(false);
    process.env.ADMIN_PASSWORD = old;
  });
});
