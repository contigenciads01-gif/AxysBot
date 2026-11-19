import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * AES-256-GCM para os tokens do X antes de irem ao banco.
 * Formato gravado: iv.tag.payload (base64url). Chave: TOKEN_ENCRYPTION_KEY,
 * 32 bytes em hex (openssl rand -hex 32).
 */
function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY ?? "";
  const buf = Buffer.from(raw, "hex");
  if (buf.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY precisa ter 64 caracteres hex (openssl rand -hex 32)");
  }
  return buf;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const payload = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), payload].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(stored: string): string {
  const parts = stored.split(".");
  if (parts.length !== 3) throw new Error("token cifrado em formato invalido");
  const [iv, tag, payload] = parts.map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8");
}

/** Comparacao em tempo constante (nao vaza tamanho via timing de curto-circuito). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHmac("sha256", "cmp").update(a).digest();
  const hb = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
