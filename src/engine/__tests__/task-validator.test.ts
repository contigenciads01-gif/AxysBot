import { describe, it, expect } from "vitest";
import { TaskValidator, ValidationError } from "../validators/task-validator";

describe("TaskValidator", () => {
  describe("validatePost", () => {
    it("valida post com texto correto", () => {
      const res = TaskValidator.validatePost({ text: "Olá mundo do X!" });
      expect(res.text).toBe("Olá mundo do X!");
    });

    it("rejeita post vazio ou apenas com espaços", () => {
      expect(() => TaskValidator.validatePost({ text: "   " })).toThrow(ValidationError);
      expect(() => TaskValidator.validatePost({})).toThrow(ValidationError);
    });

    it("rejeita post acima de 280 caracteres", () => {
      const longText = "a".repeat(281);
      expect(() => TaskValidator.validatePost({ text: longText })).toThrow(ValidationError);
    });
  });

  describe("validateThread", () => {
    it("valida thread com 2 ou mais tweets", () => {
      const res = TaskValidator.validateThread({
        items: ["Tweet 1", "Tweet 2", "Tweet 3"],
      });
      expect(res.items).toHaveLength(3);
    });

    it("rejeita thread vazia", () => {
      expect(() => TaskValidator.validateThread({ items: [] })).toThrow(ValidationError);
    });

    it("rejeita thread com item que excede 280 caracteres", () => {
      expect(() =>
        TaskValidator.validateThread({ items: ["Normal", "a".repeat(285)] })
      ).toThrow(ValidationError);
    });
  });

  describe("validateReply", () => {
    it("valida reply com post_id numérico e texto", () => {
      const res = TaskValidator.validateReply({
        post_id: "123456789012345",
        text: "Ótimo ponto!",
      });
      expect(res.inReplyToId).toBe("123456789012345");
      expect(res.text).toBe("Ótimo ponto!");
    });

    it("rejeita reply sem post_id numérico", () => {
      expect(() =>
        TaskValidator.validateReply({ post_id: "invalido", text: "teste" })
      ).toThrow(ValidationError);
    });
  });

  describe("validateRepost", () => {
    it("valida repost com ID válido", () => {
      const res = TaskValidator.validateRepost({ post_id: "9876543210" });
      expect(res.targetTweetId).toBe("9876543210");
    });

    it("rejeita repost com ID vazio", () => {
      expect(() => TaskValidator.validateRepost({})).toThrow(ValidationError);
    });
  });

  describe("generateIdempotencyKey", () => {
    it("gera o mesmo hash para parâmetros idênticos", () => {
      const key1 = TaskValidator.generateIdempotencyKey("acc1", "post", { text: "Mesmo texto" });
      const key2 = TaskValidator.generateIdempotencyKey("acc1", "post", { text: "Mesmo texto" });
      expect(key1).toBe(key2);
    });

    it("gera hashes diferentes para textos diferentes", () => {
      const key1 = TaskValidator.generateIdempotencyKey("acc1", "post", { text: "Texto A" });
      const key2 = TaskValidator.generateIdempotencyKey("acc1", "post", { text: "Texto B" });
      expect(key1).not.toBe(key2);
    });
  });
});
