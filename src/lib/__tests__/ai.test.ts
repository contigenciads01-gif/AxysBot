import { describe, it, expect } from "vitest";
import { parseCompose } from "../ai";

describe("parse da resposta da IA", () => {
  it("aceita JSON puro", () => {
    expect(parseCompose('{"options":[{"label":"A","items":["oi"]}]}').options[0].items).toEqual(["oi"]);
  });
  it("aceita JSON cercado de markdown", () => {
    expect(parseCompose('```json\n{"options":[{"label":"A","items":["x","y"]}]}\n```').options[0].items).toHaveLength(2);
  });
  it("descarta opcoes vazias", () => {
    expect(parseCompose('{"options":[{"label":"vazia","items":[]},{"label":"ok","items":["a"]}]}').options).toHaveLength(1);
  });
  it("erro claro quando nao ha JSON", () => {
    expect(() => parseCompose("desculpe, nao consegui")).toThrow(/formato valido/);
  });
});
