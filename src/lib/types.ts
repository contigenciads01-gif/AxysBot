export type Theme = "branco" | "bege" | "escuro";
export type Density = "compacto" | "amplo";

export type PostStatus =
  | "rascunho" | "agendado" | "publicando" | "publicado" | "falhou" | "cancelado";

export interface XAccount {
  id: string;
  x_user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  token_expires_at: string | null;
  scopes: string[];
  connected_at: string;
}

export interface PostItem {
  id: string;
  post_id: string;
  position: number;
  body: string;
  x_post_id: string | null;
}

export interface Post {
  id: string;
  account_id: string;
  status: PostStatus;
  scheduled_for: string | null;
  published_at: string | null;
  x_post_id: string | null;
  error: string | null;
  attempts: number;
  est_cost_usd: number;
  created_at: string;
  items: PostItem[];
}

export interface MetricsDay {
  day: string;
  followers: number | null;
  impressions: number | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
}

export interface Mention {
  x_post_id: string;
  author_handle: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
  replied: boolean;
}

export interface RunLogEntry {
  id: number;
  kind: string;
  ok: boolean;
  detail: string | null;
  duration_ms: number | null;
  at: string;
}

/** Limite de um post no X para contas sem assinatura paga. */
export const X_POST_LIMIT = 280;
