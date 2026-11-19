/**
 * Contagem de caracteres do jeito do X: todo link conta 23 caracteres,
 * nao importa o tamanho real (t.co). Emojis contam pelo codepoint.
 */
export const X_LIMIT = 280;
const LINK_WEIGHT = 23;
const LINK_RE = /\bhttps?:\/\/[^\s]+/gi;

export function weightedLength(text: string): number {
  let len = 0;
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    len += [...text.slice(last, m.index)].length + LINK_WEIGHT;
    last = (m.index ?? 0) + m[0].length;
  }
  return len + [...text.slice(last)].length;
}

export function isTooLong(text: string, limit = X_LIMIT): boolean {
  return weightedLength(text) > limit;
}

/**
 * Quebra um texto longo em itens de thread respeitando o limite.
 * Prioridade de corte: paragrafo > frase > palavra. Nunca corta palavra no meio
 * (exceto uma palavra sozinha maior que o limite). Numeracao "1/n" opcional.
 */
export function splitIntoThread(text: string, opts: { numbered?: boolean; limit?: number } = {}): string[] {
  const limit = opts.limit ?? X_LIMIT;
  const reserve = opts.numbered ? 6 : 0; // " 10/12"
  const max = limit - reserve;
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const chunks: string[] = [];
  let current = "";
  const push = () => { if (current.trim()) chunks.push(current.trim()); current = ""; };
  const fits = (s: string) => weightedLength(s) <= max;

  for (const para of clean.split(/\n{2,}/)) {
    const candidate = current ? current + "\n\n" + para : para;
    if (fits(candidate)) { current = candidate; continue; }
    push();
    if (fits(para)) { current = para; continue; }
    // paragrafo maior que o limite: desce para frases
    for (const sentence of para.match(/[^.!?]+[.!?]*\s*/g) ?? [para]) {
      const c2 = current ? current + sentence : sentence;
      if (fits(c2)) { current = c2; continue; }
      push();
      if (fits(sentence)) { current = sentence; continue; }
      // frase maior que o limite: desce para palavras
      for (const word of sentence.split(/(\s+)/)) {
        const c3 = current + word;
        if (fits(c3)) { current = c3; continue; }
        push();
        current = fits(word) ? word.trimStart() : [...word].slice(0, max).join("");
      }
    }
  }
  push();

  if (opts.numbered && chunks.length > 1) {
    return chunks.map((c, i) => `${c} ${i + 1}/${chunks.length}`);
  }
  return chunks;
}
