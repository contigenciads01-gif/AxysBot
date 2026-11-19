import "server-only";

export class RateLimitError extends Error {
  readonly status = 429;
  readonly remaining: number;
  readonly resetAt: Date;

  constructor(endpoint: string, remaining: number, resetTimestampSeconds: number) {
    const resetDate = new Date(resetTimestampSeconds * 1000);
    super(`Rate limit excedido para ${endpoint}. Próximo reset em ${resetDate.toISOString()}`);
    this.name = "RateLimitError";
    this.remaining = remaining;
    this.resetAt = resetDate;
  }
}

export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export class XApiError extends Error {
  readonly status: number;
  readonly details: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "XApiError";
    this.status = status;
    this.details = details;
  }
}

export interface XHeadersInfo {
  remaining: number;
  limitTotal: number;
  resetAt: string;
}

export interface TweetResponse {
  id: string;
  text: string;
  rateLimit: XHeadersInfo;
}

export interface RetweetResponse {
  retweeted: boolean;
  rateLimit: XHeadersInfo;
}

export interface UserResponse {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string;
  rateLimit: XHeadersInfo;
}

export class XConnector {
  private readonly baseUrl = "https://api.x.com/2";
  private readonly accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private extractRateLimits(headers: Headers): XHeadersInfo {
    const remaining = parseInt(headers.get("x-rate-limit-remaining") ?? "15", 10);
    const limitTotal = parseInt(headers.get("x-rate-limit-limit") ?? "15", 10);
    const resetSec = parseInt(headers.get("x-rate-limit-reset") ?? "0", 10);
    const resetAt = resetSec > 0
      ? new Date(resetSec * 1000).toISOString()
      : new Date(Date.now() + 15 * 60 * 1000).toISOString();

    return { remaining, limitTotal, resetAt };
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: string;
      body?: unknown;
    } = {}
  ): Promise<{ data: T; rateLimit: XHeadersInfo }> {
    const url = `${this.baseUrl}${endpoint}`;
    const method = options.method ?? "GET";
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": "AxysBot-Automation-Engine/1.0",
    };

    const res = await fetch(url, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const rateLimit = this.extractRateLimits(res.headers);

    if (res.status === 429) {
      const resetSec = parseInt(res.headers.get("x-rate-limit-reset") ?? "0", 10);
      throw new RateLimitError(endpoint, rateLimit.remaining, resetSec);
    }

    if (res.status === 401 || res.status === 403) {
      const errText = await res.text().catch(() => "");
      throw new AuthError(`Falha de autorização no X (status ${res.status}): ${errText}`, res.status);
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.detail || errBody?.title || errBody?.error || `Erro na API do X (${res.status})`;
      throw new XApiError(msg, res.status, errBody);
    }

    const json = (await res.json().catch(() => ({}))) as { data: T };
    return { data: json.data, rateLimit };
  }

  /**
   * Publica um tweet no perfil autenticado.
   */
  async createPost(text: string, options?: { inReplyToId?: string; quotePostId?: string }): Promise<TweetResponse> {
    const payload: Record<string, unknown> = { text };

    if (options?.inReplyToId) {
      payload.reply = { in_reply_to_tweet_id: options.inReplyToId };
    }
    if (options?.quotePostId) {
      payload.quote_tweet_id = options.quotePostId;
    }

    const { data, rateLimit } = await this.request<{ id: string; text: string }>("/tweets", {
      method: "POST",
      body: payload,
    });

    return {
      id: data.id,
      text: data.text,
      rateLimit,
    };
  }

  /**
   * Cria uma thread encadeada de tweets.
   */
  async createThread(items: string[]): Promise<{ ids: string[]; rateLimit: XHeadersInfo }> {
    if (!items.length) throw new Error("A thread precisa de pelo menos 1 tweet");

    const ids: string[] = [];
    let lastId: string | undefined = undefined;
    let lastRateLimit: XHeadersInfo = { remaining: 15, limitTotal: 15, resetAt: new Date().toISOString() };

    for (const text of items) {
      const res = await this.createPost(text, { inReplyToId: lastId });
      ids.push(res.id);
      lastId = res.id;
      lastRateLimit = res.rateLimit;
    }

    return { ids, rateLimit: lastRateLimit };
  }

  /**
   * Responde a uma publicação específica.
   */
  async replyToPost(inReplyToId: string, text: string): Promise<TweetResponse> {
    return this.createPost(text, { inReplyToId });
  }

  /**
   * Retweeta / reposta uma publicação.
   */
  async repost(userId: string, targetTweetId: string): Promise<RetweetResponse> {
    const { data, rateLimit } = await this.request<{ retweeted: boolean }>(`/users/${userId}/retweets`, {
      method: "POST",
      body: { tweet_id: targetTweetId },
    });

    return {
      retweeted: data?.retweeted ?? true,
      rateLimit,
    };
  }

  /**
   * Desfaz um retweet.
   */
  async undoRepost(userId: string, sourceTweetId: string): Promise<RetweetResponse> {
    const { data, rateLimit } = await this.request<{ retweeted: boolean }>(`/users/${userId}/retweets/${sourceTweetId}`, {
      method: "DELETE",
    });

    return {
      retweeted: data?.retweeted ?? false,
      rateLimit,
    };
  }

  /**
   * Consulta os dados do próprio usuário autenticado (/2/users/me).
   */
  async getMe(): Promise<UserResponse> {
    const { data, rateLimit } = await this.request<{
      id: string;
      name: string;
      username: string;
      profile_image_url?: string;
    }>("/users/me?user.fields=profile_image_url");

    return {
      id: data.id,
      name: data.name,
      username: data.username,
      profile_image_url: data.profile_image_url,
      rateLimit,
    };
  }

  /**
   * Consulta dados de um perfil pelo ID do X.
   */
  async getUser(userId: string): Promise<UserResponse> {
    const { data, rateLimit } = await this.request<{
      id: string;
      name: string;
      username: string;
      profile_image_url?: string;
    }>(`/users/${userId}?user.fields=profile_image_url`);

    return {
      id: data.id,
      name: data.name,
      username: data.username,
      profile_image_url: data.profile_image_url,
      rateLimit,
    };
  }

  /**
   * Pesquisa tweets recentes no X.
   */
  async searchTweets(query: string, maxResults = 10): Promise<{ tweets: Array<{ id: string; text: string }>; rateLimit: XHeadersInfo }> {
    const params = new URLSearchParams({
      query: query.trim(),
      max_results: String(Math.min(Math.max(maxResults, 10), 100)),
    });

    const { data, rateLimit } = await this.request<Array<{ id: string; text: string }>>(`/tweets/search/recent?${params}`);
    return {
      tweets: data ?? [],
      rateLimit,
    };
  }
}
