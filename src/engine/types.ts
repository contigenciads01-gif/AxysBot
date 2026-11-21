export type PlatformType = 'x' | 'instagram' | 'tiktok';

export type AccountStage = 'connecting' | 'monitoring' | 'operating' | 'scaling';

export type AutomationTaskType = 'post' | 'thread' | 'reply' | 'repost' | 'undo_repost';

export type AutomationTaskStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled'
  | 'waiting_rate_limit';

export interface PlatformAccount {
  id: string;
  platform: PlatformType;
  oauth_client_id: string | null;
  oauth_client_secret?: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[];
  x_user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  stage: AccountStage;
  is_active: boolean;
  paused: boolean;
  email?: string | null;
  account_password?: string | null;
  email_password?: string | null;
  phone?: string | null;
  auth_token?: string | null;
  ct0?: string | null;
  proxy?: string | null;
  proxy_active?: boolean;
  two_factor_secret?: string | null;
  session_cookies?: string | null;
  warmup_strategy?: 'following' | 'hot_niche' | 'hybrid' | null;
  status?: string;
  current_action?: string | null;
  actions_today?: number;
  error_message: string | null;
  last_error_at: string | null;
  connected_at: string;
  updated_at: string;
}

export interface BotConfig {
  account_id: string;
  enabled: boolean;
  working_hours_start: string; // "08:00"
  working_hours_end: string;   // "22:00"
  working_days: number[];      // [1,2,3,4,5] (0=dom..6=sab)
  daily_post_limit: number;
  daily_repost_limit: number;
  min_interval_seconds: number;
  max_interval_seconds: number;
  timezone: string;
  auto_pause_on_error: boolean;
  max_retries: number;
  created_at?: string;
  updated_at?: string;
}

export interface AutomationTaskPayload {
  text?: string;
  items?: string[];
  post_id?: string;
  in_reply_to_id?: string;
  media_ids?: string[];
  quote_post_id?: string;
  [key: string]: unknown;
}

export interface AutomationTaskResult {
  x_post_id?: string;
  x_post_ids?: string[];
  reposted?: boolean;
  undone?: boolean;
  data?: unknown;
  rate_limit?: {
    remaining: number;
    reset_at: string;
  };
}

export interface AutomationTask {
  id: string;
  account_id: string;
  task_type: AutomationTaskType;
  status: AutomationTaskStatus;
  priority: number;
  payload: AutomationTaskPayload;
  result: AutomationTaskResult | null;
  x_post_id: string | null;
  error_message: string | null;
  error_code: string | null;
  attempts: number;
  max_attempts: number;
  scheduled_for: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface QueueItem {
  id: string;
  task_id: string;
  account_id: string;
  priority: number;
  scheduled_for: string;
  claimed_at: string | null;
  worker_id: string | null;
  created_at: string;
}

export interface ActionLog {
  id: number;
  account_id: string;
  platform: PlatformType;
  task_id: string | null;
  action_type: string;
  status: string;
  detail: string | null;
  error_code: string | null;
  error_message: string | null;
  x_post_id: string | null;
  duration_ms: number | null;
  rate_limit_remaining: number | null;
  rate_limit_reset_at: string | null;
  created_at: string;
}

export interface RateLimitInfo {
  account_id: string;
  endpoint: string;
  remaining: number;
  limit_total: number;
  reset_at: string;
  updated_at: string;
}

export interface AccountMetrics {
  account_id: string;
  date: string;
  posts_created: number;
  reposts_done: number;
  replies_sent: number;
  tasks_completed: number;
  tasks_failed: number;
  api_calls_made: number;
  rate_limits_hit: number;
  uptime_seconds: number;
}

export interface EngineStatus {
  enabled: boolean;
  active_accounts: number;
  total_accounts: number;
  pending_tasks: number;
  processing_tasks: number;
  completed_today: number;
  failed_today: number;
  uptime_seconds: number;
  last_run_at: string | null;
}
