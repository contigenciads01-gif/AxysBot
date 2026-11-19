import { createHash } from "node:crypto";
import type { AutomationTaskPayload, AutomationTaskType } from "../types";

export class ValidationError extends Error {
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

export class TaskValidator {
  private static readonly MAX_TWEET_LENGTH = 280;

  static validatePost(payload: AutomationTaskPayload): { text: string } {
    const text = String(payload.text ?? "").trim();
    if (!text) {
      throw new ValidationError("O post precisa de um texto não vazio.", "text");
    }
    if (text.length > this.MAX_TWEET_LENGTH) {
      throw new ValidationError(`O texto excede o limite de ${this.MAX_TWEET_LENGTH} caracteres (atual: ${text.length}).`, "text");
    }
    return { text };
  }

  static validateThread(payload: AutomationTaskPayload): { items: string[] } {
    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    const items = rawItems.map((s) => String(s ?? "").trim()).filter(Boolean);

    if (items.length === 0) {
      throw new ValidationError("A thread precisa de pelo menos 1 tweet.", "items");
    }
    if (items.length > 25) {
      throw new ValidationError("A thread pode ter no máximo 25 tweets.", "items");
    }

    for (let i = 0; i < items.length; i++) {
      if (items[i].length > this.MAX_TWEET_LENGTH) {
        throw new ValidationError(`O tweet #${i + 1} excede o limite de ${this.MAX_TWEET_LENGTH} caracteres.`, `items[${i}]`);
      }
    }

    return { items };
  }

  static validateReply(payload: AutomationTaskPayload): { inReplyToId: string; text: string } {
    const text = String(payload.text ?? "").trim();
    const inReplyToId = String(payload.post_id ?? payload.in_reply_to_id ?? "").trim();

    if (!inReplyToId) {
      throw new ValidationError("O ID do post a ser respondido é obrigatório.", "post_id");
    }
    if (!/^\d{1,25}$/.test(inReplyToId)) {
      throw new ValidationError("ID do post inválido no X (deve ser numérico).", "post_id");
    }
    if (!text) {
      throw new ValidationError("O texto da resposta não pode ser vazio.", "text");
    }
    if (text.length > this.MAX_TWEET_LENGTH) {
      throw new ValidationError(`O texto da resposta excede ${this.MAX_TWEET_LENGTH} caracteres.`, "text");
    }

    return { inReplyToId, text };
  }

  static validateRepost(payload: AutomationTaskPayload): { targetTweetId: string } {
    const targetTweetId = String(payload.post_id ?? "").trim();
    if (!targetTweetId) {
      throw new ValidationError("O ID do post a ser repostado é obrigatório.", "post_id");
    }
    if (!/^\d{1,25}$/.test(targetTweetId)) {
      throw new ValidationError("ID do post inválido no X (deve ser numérico).", "post_id");
    }
    return { targetTweetId };
  }

  static validateTask(type: AutomationTaskType, payload: AutomationTaskPayload): void {
    switch (type) {
      case "post":
        this.validatePost(payload);
        break;
      case "thread":
        this.validateThread(payload);
        break;
      case "reply":
        this.validateReply(payload);
        break;
      case "repost":
      case "undo_repost":
        this.validateRepost(payload);
        break;
      default:
        throw new ValidationError(`Tipo de tarefa não suportado: ${type}`);
    }
  }

  /**
   * Gera uma chave de idempotência determinística para impedir tarefas duplicadas.
   */
  static generateIdempotencyKey(
    accountId: string,
    type: AutomationTaskType,
    payload: AutomationTaskPayload,
    scheduledWindowMinutes = 60
  ): string {
    // Janela temporal para permitir o mesmo texto em dias/horas diferentes, mas evitar disparos duplicados
    const timeWindow = Math.floor(Date.now() / (scheduledWindowMinutes * 60 * 1000));
    const content = JSON.stringify({ accountId, type, payload, timeWindow });
    return createHash("sha256").update(content).digest("hex");
  }
}
