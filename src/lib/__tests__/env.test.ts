import { describe, it, expect, beforeEach } from "vitest";
import { supabaseUrl, supabaseSecretKey, tokenKey, sessionSecret, adminUser, hasTokenKey } from "../env";
import { checkLogin, createSessionValue, isValidSession } from "../session";
import { encrypt, decrypt } from "../crypto";

const KEYS = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "TOKEN_ENCRYPTION_KEY", "ENCRYPTION_MASTER_KEY", "SESSION_SECRET", "ADMIN_USER", "ADMIN_PASSWORD"];
beforeEach(() => { for (const k of KEYS) delete process.env[k]; });

describe("nomes antigos do Vercel (axysbotpuro)", () => {
  it("le NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    expect(supabaseUrl()).toBe("https://abc.supabase.co");
    expect(supabaseSecretKey()).toBe("service");
  });
  it("o nome novo tem prioridade", () => {
    process.env.SUPABASE_URL = "https://novo.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://velho.supabase.co";
    expect(supabaseUrl()).toBe("https://novo.supabase.co");
  });
  it("deriva chave de token e de sessao da ENCRYPTION_MASTER_KEY, diferentes entre si", () => {
    process.env.ENCRYPTION_MASTER_KEY = "uma-chave-mestra-qualquer-123";
    const t = tokenKey();
    expect(t.length).toBe(32);
    expect(sessionSecret()).not.toBe(t.toString("hex"));
    expect(sessionSecret()).not.toContain("uma-chave-mestra");
    expect(decrypt(encrypt("token-x"))).toBe("token-x");
    expect(isValidSession(createSessionValue())).toBe(true);
  });
  it("derivacao e estavel (mesma mestra -> mesma chave: tokens cifrados continuam legiveis)", () => {
    process.env.ENCRYPTION_MASTER_KEY = "uma-chave-mestra-qualquer-123";
    const a = tokenKey().toString("hex");
    process.env.ENCRYPTION_MASTER_KEY = "uma-chave-mestra-qualquer-123";
    expect(tokenKey().toString("hex")).toBe(a);
  });
  it("sem nenhuma chave, avisa", () => {
    expect(hasTokenKey()).toBe(false);
    expect(() => sessionSecret()).toThrow(/SESSION_SECRET/);
  });
});

describe("login usuario + senha", () => {
  beforeEach(() => { process.env.ENCRYPTION_MASTER_KEY = "uma-chave-mestra-qualquer-123"; process.env.ADMIN_PASSWORD = "admin123"; });
  it("usuario padrao e admin", () => {
    expect(adminUser()).toBe("admin");
    expect(checkLogin("admin", "admin123")).toBe(true);
  });
  it("usuario sem diferenciar maiusculas, senha sim", () => {
    expect(checkLogin("Admin ", "admin123")).toBe(true);
    expect(checkLogin("admin", "Admin123")).toBe(false);
  });
  it("usuario errado ou senha errada falham", () => {
    expect(checkLogin("root", "admin123")).toBe(false);
    expect(checkLogin("admin", "errada")).toBe(false);
  });
  it("ADMIN_USER troca o usuario", () => {
    process.env.ADMIN_USER = "thiago";
    expect(checkLogin("admin", "admin123")).toBe(false);
    expect(checkLogin("thiago", "admin123")).toBe(true);
  });
});
