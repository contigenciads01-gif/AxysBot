-- ===============================================================
-- AXYSBOT - Migration: Motor de Automação
-- Adiciona tabelas, enums, funções e índices para o engine de
-- automação (tarefas, fila SKIP LOCKED, rate limits, métricas).
--
-- Idempotente: pode rodar de novo sem perder dados.
-- NÃO altera tabelas existentes (x_accounts, posts, etc.).
--
-- Requer: schema.sql já aplicado (depende de x_accounts, touch_updated_at).
-- ===============================================================

-- ---------------------------------------------------------------
-- ENUMS (idempotentes via DO $$ exception handler)
-- ---------------------------------------------------------------

do $$ begin
  create type public.platform_type as enum ('x');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.account_stage as enum ('connecting','monitoring','operating','scaling');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.automation_task_type as enum ('post','thread','reply','repost','undo_repost');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.automation_task_status as enum (
    'pending','processing','completed','failed','paused','cancelled','waiting_rate_limit'
  );
exception when duplicate_object then null; end $$;


-- ===============================================================
-- 1. platform_accounts — Contas de plataformas com OAuth 2.0
-- ===============================================================
create table if not exists public.platform_accounts (
  id                 uuid primary key default gen_random_uuid(),
  platform           public.platform_type not null default 'x',
  oauth_client_id    text,
  oauth_client_secret text,                       -- encrypted pela app (AES-256-GCM)
  access_token       text not null,               -- encrypted pela app
  refresh_token      text,                        -- encrypted pela app
  token_expires_at   timestamptz,
  scopes             text[] not null default '{}',
  x_user_id          text not null unique,
  username           text not null,
  display_name       text,
  avatar_url         text,
  stage              public.account_stage not null default 'connecting',
  is_active          boolean not null default true,
  paused             boolean not null default false,
  error_message      text,
  last_error_at      timestamptz,
  connected_at       timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Índices
create index if not exists platform_accounts_platform_idx
  on public.platform_accounts (platform) where is_active = true;
create index if not exists platform_accounts_stage_idx
  on public.platform_accounts (stage);
create index if not exists platform_accounts_x_user_id_idx
  on public.platform_accounts (x_user_id);

-- Trigger updated_at (reutiliza touch_updated_at do schema.sql)
drop trigger if exists platform_accounts_touch on public.platform_accounts;
create trigger platform_accounts_touch before update on public.platform_accounts
  for each row execute function public.touch_updated_at();


-- ===============================================================
-- 2. bot_configs — Configuração do bot por conta
-- ===============================================================
create table if not exists public.bot_configs (
  account_id          uuid primary key references public.platform_accounts(id) on delete cascade,
  enabled             boolean not null default true,
  working_hours_start time not null default '08:00',
  working_hours_end   time not null default '22:00',
  working_days        int[] not null default '{1,2,3,4,5}',  -- 0=dom..6=sab
  daily_post_limit    int not null default 25,
  daily_repost_limit  int not null default 50,
  min_interval_seconds int not null default 120,
  max_interval_seconds int not null default 600,
  timezone            text not null default 'America/Sao_Paulo',
  auto_pause_on_error boolean not null default true,
  max_retries         int not null default 3,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint working_hours_valid check (working_hours_start < working_hours_end),
  constraint interval_valid check (min_interval_seconds > 0 and max_interval_seconds >= min_interval_seconds),
  constraint limits_positive check (daily_post_limit >= 0 and daily_repost_limit >= 0)
);

-- PK já cobre a FK (account_id)

-- Trigger updated_at
drop trigger if exists bot_configs_touch on public.bot_configs;
create trigger bot_configs_touch before update on public.bot_configs
  for each row execute function public.touch_updated_at();


-- ===============================================================
-- 3. automation_tasks — Tarefas de automação
-- ===============================================================
create table if not exists public.automation_tasks (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.platform_accounts(id) on delete cascade,
  task_type        public.automation_task_type not null,
  status           public.automation_task_status not null default 'pending',
  priority         int not null default 0,
  payload          jsonb not null default '{}',
  result           jsonb,
  x_post_id        text,
  error_message    text,
  error_code       text,
  attempts         int not null default 0,
  max_attempts     int not null default 3,
  scheduled_for    timestamptz not null default now(),
  started_at       timestamptz,
  completed_at     timestamptz,
  duration_ms      int,
  idempotency_key  text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Índices
create index if not exists automation_tasks_account_id_idx
  on public.automation_tasks (account_id, created_at desc);
create index if not exists automation_tasks_status_idx
  on public.automation_tasks (status, scheduled_for)
  where status in ('pending','waiting_rate_limit');
create index if not exists automation_tasks_idempotency_idx
  on public.automation_tasks (idempotency_key) where idempotency_key is not null;
create index if not exists automation_tasks_x_post_id_idx
  on public.automation_tasks (x_post_id) where x_post_id is not null;

-- Trigger updated_at
drop trigger if exists automation_tasks_touch on public.automation_tasks;
create trigger automation_tasks_touch before update on public.automation_tasks
  for each row execute function public.touch_updated_at();


-- ===============================================================
-- 4. automation_queue — Fila de execução com SKIP LOCKED
-- ===============================================================
create table if not exists public.automation_queue (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.automation_tasks(id) on delete cascade,
  account_id    uuid not null references public.platform_accounts(id) on delete cascade,
  priority      int not null default 0,
  scheduled_for timestamptz not null default now(),
  claimed_at    timestamptz,
  worker_id     text,
  created_at    timestamptz not null default now()
);

-- Índices
create index if not exists automation_queue_task_id_idx
  on public.automation_queue (task_id);
create index if not exists automation_queue_account_id_idx
  on public.automation_queue (account_id);
create index if not exists automation_queue_pending_idx
  on public.automation_queue (priority desc, scheduled_for)
  where claimed_at is null;
create index if not exists automation_queue_claimed_idx
  on public.automation_queue (claimed_at)
  where claimed_at is not null;


-- ===============================================================
-- 5. bot_actions_log — Log detalhado de todas as ações
-- ===============================================================
create table if not exists public.bot_actions_log (
  id                   bigint generated always as identity primary key,
  account_id           uuid not null references public.platform_accounts(id) on delete cascade,
  platform             public.platform_type not null default 'x',
  task_id              uuid references public.automation_tasks(id) on delete set null,
  action_type          text not null,
  status               text not null,
  detail               text,
  error_code           text,
  error_message        text,
  x_post_id            text,
  duration_ms          int,
  rate_limit_remaining int,
  rate_limit_reset_at  timestamptz,
  created_at           timestamptz not null default now()
);

-- Índices
create index if not exists bot_actions_log_account_id_idx
  on public.bot_actions_log (account_id, created_at desc);
create index if not exists bot_actions_log_task_id_idx
  on public.bot_actions_log (task_id) where task_id is not null;
create index if not exists bot_actions_log_created_at_idx
  on public.bot_actions_log (created_at desc);


-- ===============================================================
-- 6. rate_limits — Controle de rate limits por conta/endpoint
-- ===============================================================
create table if not exists public.rate_limits (
  account_id  uuid not null references public.platform_accounts(id) on delete cascade,
  endpoint    text not null,
  remaining   int not null default 0,
  limit_total int not null default 0,
  reset_at    timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (account_id, endpoint)       -- PK composta cobre a FK
);

-- Trigger updated_at
drop trigger if exists rate_limits_touch on public.rate_limits;
create trigger rate_limits_touch before update on public.rate_limits
  for each row execute function public.touch_updated_at();


-- ===============================================================
-- 7. account_metrics — Métricas de automação por conta/dia
-- ===============================================================
create table if not exists public.account_metrics (
  account_id      uuid not null references public.platform_accounts(id) on delete cascade,
  date            date not null,
  posts_created   int not null default 0,
  reposts_done    int not null default 0,
  replies_sent    int not null default 0,
  tasks_completed int not null default 0,
  tasks_failed    int not null default 0,
  api_calls_made  int not null default 0,
  rate_limits_hit int not null default 0,
  uptime_seconds  int not null default 0,
  primary key (account_id, date)           -- PK composta cobre a FK
);


-- ===============================================================
-- FUNÇÕES
-- ===============================================================

-- ---------------------------------------------------------------
-- claim_automation_tasks(max_tasks, p_worker_id)
-- Reserva atomicamente tarefas pendentes da fila.
-- Com SKIP LOCKED, múltiplos workers nunca pegam a mesma tarefa.
-- Também reclama itens presos em claimed_at > 10min (worker morto).
-- ---------------------------------------------------------------
create or replace function public.claim_automation_tasks(
  max_tasks   int  default 5,
  p_worker_id text default 'default'
)
returns setof public.automation_tasks
language plpgsql security invoker set search_path = '' as $$
declare
  v_task_ids uuid[];
begin
  -- 1. Claim queue items (pending or stale)
  with claimed as (
    select q.id as queue_id, q.task_id
      from public.automation_queue q
     where (
             q.claimed_at is null
             and q.scheduled_for <= now()
           )
        or (
             q.claimed_at is not null
             and q.claimed_at < now() - interval '10 minutes'
           )
     order by q.priority desc, q.scheduled_for
     limit max_tasks
       for update skip locked
  ),
  do_claim as (
    update public.automation_queue aq
       set claimed_at = now(),
           worker_id  = p_worker_id
      from claimed c
     where aq.id = c.queue_id
    returning aq.task_id
  )
  select array_agg(task_id) into v_task_ids from do_claim;

  -- Nada a processar
  if v_task_ids is null or array_length(v_task_ids, 1) is null then
    return;
  end if;

  -- 2. Atualiza status das tasks correspondentes
  return query
    update public.automation_tasks t
       set status     = 'processing',
           started_at = now(),
           attempts   = t.attempts + 1,
           updated_at = now()
     where t.id = any(v_task_ids)
       and t.status in ('pending', 'waiting_rate_limit')
       -- Respeita pausa da conta
       and not exists (
         select 1 from public.platform_accounts pa
          where pa.id = t.account_id and (pa.paused or not pa.is_active)
       )
    returning t.*;
end;
$$;


-- ---------------------------------------------------------------
-- check_idempotency(p_key)
-- Retorna true se já existe uma task com esse idempotency_key.
-- ---------------------------------------------------------------
create or replace function public.check_idempotency(p_key text)
returns boolean
language sql security invoker set search_path = '' as $$
  select exists (
    select 1 from public.automation_tasks
     where idempotency_key = p_key
  );
$$;


-- ===============================================================
-- SEGURANÇA — RLS + GRANT
-- ===============================================================

-- RLS habilitado em todas as novas tabelas
alter table public.platform_accounts enable row level security;
alter table public.bot_configs       enable row level security;
alter table public.automation_tasks  enable row level security;
alter table public.automation_queue  enable row level security;
alter table public.bot_actions_log   enable row level security;
alter table public.rate_limits       enable row level security;
alter table public.account_metrics   enable row level security;

-- Bloqueia acesso de anon/authenticated (todo acesso via service_role)
revoke all on
  public.platform_accounts, public.bot_configs, public.automation_tasks,
  public.automation_queue, public.bot_actions_log, public.rate_limits,
  public.account_metrics
  from anon, authenticated;

-- GRANT mínimo ao service_role
grant select, insert, update, delete on
  public.platform_accounts, public.bot_configs, public.automation_tasks,
  public.automation_queue, public.rate_limits
  to service_role;

grant select, insert on
  public.bot_actions_log, public.account_metrics
  to service_role;

-- account_metrics precisa de UPDATE para incrementar contadores via UPSERT
grant update on public.account_metrics to service_role;

-- Funções: fecha acesso e libera ao service_role
revoke execute on function public.claim_automation_tasks(int, text) from public, anon, authenticated;
grant  execute on function public.claim_automation_tasks(int, text) to service_role;

revoke execute on function public.check_idempotency(text) from public, anon, authenticated;
grant  execute on function public.check_idempotency(text) to service_role;


-- PostgREST recarrega o cache do schema
notify pgrst, 'reload schema';
