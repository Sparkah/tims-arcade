create table if not exists public.telegram_players (
  telegram_user_id text primary key,
  username text,
  first_name text,
  last_name text,
  language_code text,
  is_premium boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.telegram_player_states (
  game text not null,
  telegram_user_id text not null references public.telegram_players(telegram_user_id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  state_rev bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game, telegram_user_id)
);

create table if not exists public.telegram_purchases (
  payload text primary key,
  game text not null,
  product_id text not null,
  telegram_user_id text not null references public.telegram_players(telegram_user_id) on delete cascade,
  currency text not null default 'XTR',
  total_amount bigint not null,
  telegram_payment_charge_id text,
  provider_payment_charge_id text,
  status text not null default 'paid',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

alter table public.telegram_purchases
  alter column total_amount type bigint;

create index if not exists telegram_player_states_user_idx
  on public.telegram_player_states (telegram_user_id);

create index if not exists telegram_purchases_user_game_idx
  on public.telegram_purchases (telegram_user_id, game, status);

alter table public.telegram_players enable row level security;
alter table public.telegram_player_states enable row level security;
alter table public.telegram_purchases enable row level security;
