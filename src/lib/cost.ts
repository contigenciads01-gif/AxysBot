/**
 * Precos da API do X (pay-per-use, desde 06/02/2026).
 * Fonte: https://docs.x.com/x-api/getting-started/pricing
 * Confira no Developer Console — o X pode mudar sem aviso.
 */
export const X_PRICES_USD = {
  post_create: 0.015,
  post_create_url: 0.2,
  post_read: 0.005,
  user_read: 0.01,
} as const;

export type BillableOp = keyof typeof X_PRICES_USD;

// Mesmo criterio que o X usa para decidir se um post "contem URL".
const URL_RE = /\bhttps?:\/\/[^\s]+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|br|dev|app|co|me|ly|gg|tv|ai|xyz)(?:\/[^\s]*)?/i;

export function containsUrl(text: string): boolean {
  return URL_RE.test(text);
}

export function opForPost(text: string): BillableOp {
  return containsUrl(text) ? "post_create_url" : "post_create";
}

export interface ThreadCost {
  total: number;
  withUrl: number;      // quantos itens custam o preco com link
  plain: number;
  /** quanto economizaria tirando os links */
  urlPremium: number;
}

export function estimateThreadCost(items: string[]): ThreadCost {
  let withUrl = 0;
  for (const t of items) if (containsUrl(t)) withUrl++;
  const plain = items.length - withUrl;
  const total = round4(withUrl * X_PRICES_USD.post_create_url + plain * X_PRICES_USD.post_create);
  const urlPremium = round4(withUrl * (X_PRICES_USD.post_create_url - X_PRICES_USD.post_create));
  return { total, withUrl, plain, urlPremium };
}

export function formatUsd(v: number): string {
  return "US$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: v < 1 ? 3 : 2, maximumFractionDigits: 3 });
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
