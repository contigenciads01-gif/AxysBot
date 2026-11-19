import "server-only";
import { encrypt, decrypt } from "@/lib/crypto";
import { db } from "@/lib/supabase";

export interface StoredTokens {
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[];
}

export class TokenVault {
  /**
   * Salva os tokens de forma segura e criptografada (AES-256-GCM).
   * O banco nunca enxerga o token em claro.
   */
  static async storeTokens(
    accountId: string,
    tokens: {
      accessToken: string;
      refreshToken?: string | null;
      expiresIn?: number; // em segundos
      scopes?: string[];
    }
  ): Promise<void> {
    const encryptedAccess = encrypt(tokens.accessToken);
    const encryptedRefresh = tokens.refreshToken ? encrypt(tokens.refreshToken) : null;
    const expiresAt = tokens.expiresIn
      ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
      : null;

    const patch: Record<string, unknown> = {
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      token_expires_at: expiresAt,
      error_message: null,
      last_error_at: null,
      updated_at: new Date().toISOString(),
    };

    if (tokens.scopes && tokens.scopes.length > 0) {
      patch.scopes = tokens.scopes;
    }

    const { error } = await db()
      .from("platform_accounts")
      .update(patch)
      .eq("id", accountId);

    if (error) {
      throw new Error(`Falha ao armazenar tokens seguros: ${error.message}`);
    }
  }

  /**
   * Obtém os tokens descriptografados de uma conta específica.
   */
  static async getTokens(accountId: string): Promise<StoredTokens> {
    const { data, error } = await db()
      .from("platform_accounts")
      .select("access_token, refresh_token, token_expires_at, scopes, is_active, paused")
      .eq("id", accountId)
      .single();

    if (error || !data) {
      throw new Error(`Conta não encontrada: ${accountId}`);
    }

    if (!data.is_active || data.paused) {
      throw new Error(`Conta inativa ou pausada: ${accountId}`);
    }

    try {
      const accessToken = decrypt(data.access_token);
      const refreshToken = data.refresh_token ? decrypt(data.refresh_token) : null;

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: data.token_expires_at,
        scopes: data.scopes ?? [],
      };
    } catch {
      throw new Error(`Falha na decriptografia dos tokens para a conta: ${accountId}`);
    }
  }

  /**
   * Verifica se o token já expirou ou está prestes a expirar (margem de 5 minutos).
   */
  static isTokenExpiring(expiresAt: string | null, marginSeconds = 300): boolean {
    if (!expiresAt) return false;
    const exp = new Date(expiresAt).getTime();
    const now = Date.now();
    return exp - now < marginSeconds * 1000;
  }

  /**
   * Revoga os tokens de uma conta (marca como inativa/revogada).
   */
  static async revokeTokens(accountId: string): Promise<void> {
    const { error } = await db()
      .from("platform_accounts")
      .update({
        access_token: "revogado",
        refresh_token: null,
        token_expires_at: null,
        is_active: false,
        paused: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId);

    if (error) {
      throw new Error(`Falha ao revogar tokens: ${error.message}`);
    }
  }
}
