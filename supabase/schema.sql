-- ===============================================================
-- AXYSBOT - schema do banco (Supabase / Postgres 15+)
-- Rode inteiro no SQL Editor do Supabase. E idempotente: pode rodar
-- de novo sem perder dados.
--
-- Regras aplicadas (skill supabase-postgres-best-practices):
--   * toda FK tem indice                     (schema-foreign-key-indexes)
--   * fila do agendador com SKIP LOCKED      (lock-skip-locked)
--   * RLS ligado em todas as tabelas          (security-rls-basics)
--   * GRANT minimo e explicito ao service_role (security-privileges)
--     -> obrigatorio desde 30/10/2026: tabelas novas nao sao mais
--        expostas a Data API automaticamente.
-- ===============================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- Conta do X conectada. Tokens chegam aqui ja cifrados pela app
-- (AES-256-GCM); o banco nunca ve o token em claro.
-- ---------------------------------------------------------------
create table if not exists public.x_accounts (
  id               uuid primary key default gen_random_uuid(),
  x_user_id        text not null unique,
  username         text not null,
  display_name     text,
  avatar_url       text,
  access_token     text not null,
  refresh_token    text,
  token_expires_at timestamptz,
  scopes           text[]      not null default '{}',
  connected_at     timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Posts e threads.
--   post simples = 1 linha em posts + 1 em post_items
--   thread       = 1 linha em posts + N em post_items (position 0..N-1)
-- ---------------------------------------------------------------
do $$ begin
  create type public.post_status as enum
    ('rascunho','agendado','publicando','publicado','falhou','cancelado');
exception when duplicate_object then null; end $$;

create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.x_accounts(id) on delete cascade,
  status        public.post_status not null default 'rascunho',
  scheduled_for timestamptz,
  claimed_at    timestamptz,
  published_at  timestamptz,
  x_post_id     text,
  error         text,
  attempts      int  not null default 0,
  est_cost_usd  numeric(8,4) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint agendado_precisa_de_data
    check (status <> 'agendado' or scheduled_for is not null)
);

create table if not exists public.post_items (
  id        uuid primary key default gen_random_uuid(),
  post_id   uuid not null references public.posts(id) on delete cascade,
  position  int  not null check (position >= 0),
  body      text not null check (char_length(body) between 1 and 4000),
  x_post_id text,
  unique (post_id, position)          -- tambem serve de indice da FK
);

create index if not exists posts_account_id_idx on public.posts (account_id, created_at desc);
-- indice parcial: so as linhas que o agendador precisa varrer
create index if not exists posts_fila_idx
  on public.posts (scheduled_for) where status = 'agendado';
create index if not exists posts_travados_idx
  on public.posts (claimed_at) where status = 'publicando';

-- ---------------------------------------------------------------
-- Metricas do proprio perfil, uma linha por dia (fuso do painel)
-- ---------------------------------------------------------------
create table if not exists public.metrics_daily (
  account_id  uuid not null references public.x_accounts(id) on delete cascade,
  day         date not null,
  followers   int,
  following   int,
  posts_count int,
  impressions bigint,
  likes       bigint,
  replies     bigint,
  reposts     bigint,
  collected_at timestamptz not null default now(),
  primary key (account_id, day)       -- PK composta cobre a FK
);

create table if not exists public.post_metrics (
  x_post_id   text primary key,
  account_id  uuid not null references public.x_accounts(id) on delete cascade,
  impressions bigint not null default 0,
  likes       bigint not null default 0,
  replies     bigint not null default 0,
  reposts     bigint not null default 0,
  quotes      bigint not null default 0,
  bookmarks   bigint not null default 0,
  collected_at timestamptz not null default now()
);
create index if not exists post_metrics_account_id_idx on public.post_metrics (account_id);

-- ---------------------------------------------------------------
-- Inbox de mencoes
-- ---------------------------------------------------------------
create table if not exists public.mentions (
  x_post_id     text primary key,
  account_id    uuid not null references public.x_accounts(id) on delete cascade,
  author_id     text,
  author_handle text,
  author_name   text,
  body          text not null,
  created_at    timestamptz not null,
  replied       boolean not null default false,
  reply_post_id text,
  fetched_at    timestamptz not null default now()
);
create index if not exists mentions_account_id_idx on public.mentions (account_id, created_at desc);
create index if not exists mentions_abertas_idx
  on public.mentions (account_id, created_at desc) where replied = false;

-- ---------------------------------------------------------------
-- Preferencias do painel
-- ---------------------------------------------------------------
create table if not exists public.settings (
  account_id  uuid primary key references public.x_accounts(id) on delete cascade,
  theme       text not null default 'bege'     check (theme   in ('branco','bege','escuro')),
  density     text not null default 'compacto' check (density in ('compacto','amplo')),
  timezone    text not null default 'America/Sao_Paulo',
  monthly_budget_usd numeric(8,2) not null default 10,
  paused      boolean not null default false,   -- agendador pausado pelo painel
  updated_at  timestamptz not null default now()
);
alter table public.settings add column if not exists paused boolean not null default false;

-- ---------------------------------------------------------------
-- Uso da API do X (cobranca por uso desde fev/2026).
-- Cada chamada cobravel vira uma linha; o dashboard soma o mes.
-- ---------------------------------------------------------------
create table if not exists public.api_usage (
  id         bigint generated always as identity primary key,
  account_id uuid references public.x_accounts(id) on delete cascade,
  operation  text not null,          -- post_create | post_create_url | post_read | user_read
  units      int  not null default 1,
  cost_usd   numeric(10,4) not null,
  at         timestamptz not null default now()
);
create index if not exists api_usage_account_at_idx on public.api_usage (account_id, at desc);

-- ---------------------------------------------------------------
-- Trilha do agendador
-- ---------------------------------------------------------------
create table if not exists public.run_log (
  id          bigint generated always as identity primary key,
  account_id  uuid references public.x_accounts(id) on delete cascade,
  kind        text not null,         -- publicar | sync_metricas | sync_mencoes | oauth
  ok          boolean not null,
  detail      text,
  duration_ms int,
  at          timestamptz not null default now()
);
create index if not exists run_log_at_idx on public.run_log (at desc);
create index if not exists run_log_account_id_idx on public.run_log (account_id);

-- ---------------------------------------------------------------
-- updated_at automatico
-- ---------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists posts_touch on public.posts;
create trigger posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();
drop trigger if exists contas_touch on public.x_accounts;
create trigger contas_touch before update on public.x_accounts
  for each row execute function public.touch_updated_at();
drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- FILA DO AGENDADOR
-- Reserva atomicamente os posts vencidos. Com SKIP LOCKED, dois crons
-- que rodem ao mesmo tempo pegam posts DIFERENTES -> nunca publica 2x.
-- Tambem devolve a fila posts presos em 'publicando' ha mais de 10 min
-- (cron que morreu no meio), ate 3 tentativas.
-- ---------------------------------------------------------------
create or replace function public.claim_due_posts(max_posts int default 5)
returns setof public.posts
language sql security invoker set search_path = '' as $$
  update public.posts p
     set status = 'publicando', claimed_at = now(), attempts = p.attempts + 1
   where p.id in (
     select q.id from public.posts q
      where q.attempts < 3
        and not exists (                 -- respeita o botao de pausa do painel
          select 1 from public.settings s where s.account_id = q.account_id and s.paused
        )
        and (
          (q.status = 'agendado'   and q.scheduled_for <= now())
       or (q.status = 'publicando' and q.claimed_at < now() - interval '10 minutes')
        )
      order by q.scheduled_for
      limit max_posts
      for update skip locked
   )
  returning p.*;
$$;

-- ---------------------------------------------------------------
-- SEGURANCA
-- RLS ligado e nenhuma policy para anon/authenticated => negado.
-- Todo acesso passa pelas rotas de servidor com a service role.
-- ---------------------------------------------------------------
alter table public.x_accounts    enable row level security;
alter table public.posts         enable row level security;
alter table public.post_items    enable row level security;
alter table public.metrics_daily enable row level security;
alter table public.post_metrics  enable row level security;
alter table public.mentions      enable row level security;
alter table public.settings      enable row level security;
alter table public.api_usage     enable row level security;
alter table public.run_log       enable row level security;

revoke all on public.x_accounts, public.posts, public.post_items, public.metrics_daily,
              public.post_metrics, public.mentions, public.settings, public.api_usage,
              public.run_log
  from anon, authenticated;

-- GRANT minimo ao service_role (necessario para a Data API enxergar as tabelas)
grant usage on schema public to service_role;
grant select, insert, update, delete on
  public.x_accounts, public.posts, public.post_items, public.metrics_daily,
  public.post_metrics, public.mentions, public.settings
  to service_role;
grant select, insert on public.api_usage, public.run_log to service_role;

-- funcoes: o Postgres da EXECUTE a PUBLIC por padrao; fechamos
revoke execute on function public.claim_due_posts(int) from public, anon, authenticated;
grant  execute on function public.claim_due_posts(int) to service_role;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- PostgREST recarrega o cache do schema
notify pgrst, 'reload schema';
