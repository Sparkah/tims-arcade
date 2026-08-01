-- Server-authoritative Megaton paid gacha ledger.
-- Apply after supabase/telegram-schema.sql. The Cloudflare endpoint calls the
-- service-role-only RPC; browsers receive neither table access nor RPC access.

begin;

create extension if not exists pgcrypto;

-- A blockchain/Telegram charge may back only one purchase payload. Null and
-- empty provider fields on pending or legacy rows are deliberately excluded.
create unique index if not exists telegram_purchases_telegram_charge_unique_idx
  on public.telegram_purchases (telegram_payment_charge_id)
  where telegram_payment_charge_id is not null
    and telegram_payment_charge_id <> '';

create unique index if not exists telegram_purchases_provider_charge_unique_idx
  on public.telegram_purchases (provider_payment_charge_id)
  where provider_payment_charge_id is not null
    and provider_payment_charge_id <> '';

create table if not exists public.telegram_megaton_paid_roll_receipts (
  receipt_id uuid primary key default gen_random_uuid(),
  purchase_payload text not null unique
    references public.telegram_purchases(payload) on delete restrict,
  telegram_user_id text not null
    references public.telegram_players(telegram_user_id) on delete restrict,
  product_id text not null check (product_id in (
    'starter',
    'arsenal_payload',
    'arsenal_payload_10',
    'arsenal_legendary_payload'
  )),
  purchase_currency text not null check (purchase_currency in ('XTR', 'TON', 'TON_CREDIT')),
  purchase_total_amount bigint not null check (purchase_total_amount > 0),
  purchase_paid_at timestamptz not null,
  catalog_version text not null check (length(catalog_version) between 1 and 96),
  rolls jsonb not null check (jsonb_typeof(rolls) = 'array'),
  roll_count integer not null check (roll_count in (1, 10)),
  created_at timestamptz not null default now(),
  check (jsonb_array_length(rolls) = roll_count)
);

create index if not exists telegram_megaton_paid_receipts_user_idx
  on public.telegram_megaton_paid_roll_receipts (telegram_user_id, created_at desc);

create table if not exists public.telegram_megaton_paid_inventory (
  telegram_user_id text not null
    references public.telegram_players(telegram_user_id) on delete restrict,
  item_id text not null check (item_id ~ '^[a-z0-9_]{1,96}$'),
  rarity text not null check (rarity in ('common', 'rare', 'epic', 'legendary', 'mythic')),
  paid_copies bigint not null default 1 check (paid_copies > 0),
  first_paid_at timestamptz not null default now(),
  last_paid_at timestamptz not null default now(),
  primary key (telegram_user_id, item_id)
);

create table if not exists public.telegram_megaton_paid_inventory_stats (
  telegram_user_id text primary key
    references public.telegram_players(telegram_user_id) on delete restrict,
  total_paid_rolls bigint not null default 0 check (total_paid_rolls >= 0),
  unique_paid_items bigint not null default 0 check (unique_paid_items >= 0),
  duplicate_paid_rolls bigint not null default 0 check (duplicate_paid_rolls >= 0),
  updated_at timestamptz not null default now(),
  check (unique_paid_items + duplicate_paid_rolls = total_paid_rolls)
);

alter table public.telegram_megaton_paid_roll_receipts enable row level security;
alter table public.telegram_megaton_paid_inventory enable row level security;
alter table public.telegram_megaton_paid_inventory_stats enable row level security;

revoke all on table public.telegram_megaton_paid_roll_receipts from public, anon, authenticated;
revoke all on table public.telegram_megaton_paid_inventory from public, anon, authenticated;
revoke all on table public.telegram_megaton_paid_inventory_stats from public, anon, authenticated;

grant select, insert on table public.telegram_megaton_paid_roll_receipts to service_role;
grant select, insert, update on table public.telegram_megaton_paid_inventory to service_role;
grant select, insert, update on table public.telegram_megaton_paid_inventory_stats to service_role;

create or replace function public.reject_megaton_paid_receipt_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Megaton paid roll receipts are immutable'
    using errcode = '55000';
end;
$$;

revoke all on function public.reject_megaton_paid_receipt_mutation() from public, anon, authenticated;

drop trigger if exists telegram_megaton_paid_receipt_immutable
  on public.telegram_megaton_paid_roll_receipts;
create trigger telegram_megaton_paid_receipt_immutable
before update or delete on public.telegram_megaton_paid_roll_receipts
for each row execute function public.reject_megaton_paid_receipt_mutation();

-- Only return purchases that can still create a receipt. The deployment
-- cutover excludes legacy purchases whose collectibles were fulfilled by the
-- old client-side roller, while the anti-join lets repeated batches progress
-- beyond the first 100 purchases.
create or replace function public.list_unredeemed_megaton_paid_gacha(
  p_telegram_user_id text,
  p_cutover_at timestamptz,
  p_limit integer default 100
)
returns table (
  payload text,
  game text,
  product_id text,
  telegram_user_id text,
  currency text,
  total_amount bigint,
  telegram_payment_charge_id text,
  provider_payment_charge_id text,
  status text,
  raw jsonb,
  paid_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    purchase.payload,
    purchase.game,
    purchase.product_id,
    purchase.telegram_user_id,
    purchase.currency,
    purchase.total_amount,
    purchase.telegram_payment_charge_id,
    purchase.provider_payment_charge_id,
    purchase.status,
    purchase.raw,
    purchase.paid_at,
    purchase.created_at
  from public.telegram_purchases as purchase
  left join public.telegram_megaton_paid_roll_receipts as receipt
    on receipt.purchase_payload = purchase.payload
  where coalesce(length(p_telegram_user_id), 0) > 0
    and p_cutover_at is not null
    and purchase.game = 'megaton'
    and purchase.telegram_user_id = p_telegram_user_id
    and purchase.status = 'paid'
    and purchase.paid_at is not null
    and purchase.paid_at >= p_cutover_at
    and purchase.product_id in (
      'starter',
      'arsenal_payload',
      'arsenal_payload_10',
      'arsenal_legendary_payload'
    )
    and (
      (
        upper(purchase.currency) = 'XTR'
        and purchase.payload ~ (
          '^megaton:mgp1:' || purchase.product_id || ':'
          || purchase.telegram_user_id || ':[0-9]{10,16}:[A-Za-z0-9_-]{8,128}$'
        )
      )
      or (
        upper(purchase.currency) = 'TON'
        and purchase.payload ~ (
          '^ton:megaton:mgp1:' || purchase.product_id || ':[A-Za-z0-9_-]{8,128}$'
        )
      )
      or (
        upper(purchase.currency) = 'TON_CREDIT'
        and purchase.payload ~ (
          '^megaton:ton_credit:mgp1:' || purchase.telegram_user_id
          || ':[A-Za-z0-9_-]{8,96}$'
        )
      )
    )
    and receipt.purchase_payload is null
  order by purchase.paid_at asc, purchase.created_at asc, purchase.payload asc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
$$;

revoke all on function public.list_unredeemed_megaton_paid_gacha(text, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.list_unredeemed_megaton_paid_gacha(text, timestamptz, integer)
  to service_role;

-- Debit non-withdrawable TON credit and materialize the debit as a verified
-- purchase in one transaction. The payload is derived from the user's durable
-- request id, so an HTTP retry resumes the same spend instead of charging twice.
drop function if exists public.spend_megaton_ton_credit(text, text, text);

create or replace function public.spend_megaton_ton_credit(
  p_telegram_user_id text,
  p_product_id text,
  p_request_id text,
  p_checkout_protocol text,
  p_cutover_at timestamptz
)
returns table (
  payload text,
  game text,
  product_id text,
  telegram_user_id text,
  currency text,
  total_amount bigint,
  telegram_payment_charge_id text,
  provider_payment_charge_id text,
  status text,
  raw jsonb,
  paid_at timestamptz,
  created_at timestamptz,
  player_state jsonb,
  state_rev bigint,
  credit_nanotons bigint,
  idempotent boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_state public.telegram_player_states%rowtype;
  v_purchase public.telegram_purchases%rowtype;
  v_server jsonb;
  v_balance bigint := 0;
  v_price bigint;
  v_next_balance bigint;
  v_payload text;
  v_charge_id text;
  v_now timestamptz := clock_timestamp();
  v_next_rev bigint;
  v_paid_gacha boolean := p_product_id in (
    'starter',
    'arsenal_payload',
    'arsenal_payload_10',
    'arsenal_legendary_payload'
  );
begin
  if coalesce(p_telegram_user_id, '') !~ '^[0-9]{2,32}$'
     or coalesce(p_request_id, '') !~ '^[A-Za-z0-9_-]{8,96}$' then
    raise exception 'invalid_ton_credit_spend_identity'
      using errcode = '22023';
  end if;

  if v_paid_gacha and (
    coalesce(p_checkout_protocol, '') <> 'megaton-paid-gacha-v1'
    or p_cutover_at is null
    or v_now < p_cutover_at
  ) then
    raise exception 'megaton_paid_gacha_checkout_not_live'
      using errcode = '55000';
  end if;

  case p_product_id
    when 'starter' then v_price := 200000000;
    when 'caps_pack' then v_price := 400000000;
    when 'warhead_tuning' then v_price := 600000000;
    when 'mirv_kit' then v_price := 800000000;
    when 'arsenal_payload' then v_price := 200000000;
    when 'arsenal_payload_10' then v_price := 1600000000;
    when 'arsenal_legendary_payload' then v_price := 1600000000;
    when 'god_power' then v_price := 20000000000;
    else
      raise exception 'invalid_ton_credit_product'
        using errcode = '22023';
  end case;

  if v_paid_gacha then
    v_payload := 'megaton:ton_credit:mgp1:' || p_telegram_user_id || ':' || p_request_id;
    v_charge_id := 'ton-credit:mgp1:' || p_telegram_user_id || ':' || p_request_id;
  else
    v_payload := 'megaton:ton_credit:' || p_telegram_user_id || ':' || p_request_id;
    v_charge_id := 'ton-credit:' || p_telegram_user_id || ':' || p_request_id;
  end if;

  -- All spends for a player serialize on the authoritative state row. This
  -- also closes the concurrent same-request race before the purchase lookup.
  select state_row.*
    into v_state
    from public.telegram_player_states as state_row
   where state_row.game = 'megaton'
     and state_row.telegram_user_id = p_telegram_user_id
   for update;

  if not found then
    raise exception 'insufficient_ton_credit:0:%', v_price
      using errcode = 'P0001';
  end if;

  select purchase.*
    into v_purchase
    from public.telegram_purchases as purchase
   where purchase.payload = v_payload;

  if found then
    if v_purchase.game <> 'megaton'
       or v_purchase.product_id <> p_product_id
       or v_purchase.telegram_user_id <> p_telegram_user_id
       or upper(v_purchase.currency) <> 'TON_CREDIT'
       or v_purchase.total_amount <> v_price
       or v_purchase.status <> 'paid'
       or v_purchase.paid_at is null
       or coalesce(v_purchase.provider_payment_charge_id, '') <> v_charge_id then
      raise exception 'ton_credit_request_conflict'
        using errcode = '23505';
    end if;

    begin
      v_balance := greatest(
        coalesce((v_state.state -> '__server' ->> 'tonCreditNanotons')::bigint, 0),
        0
      );
    exception when others then
      v_balance := 0;
    end;

    return query select
      v_purchase.payload,
      v_purchase.game,
      v_purchase.product_id,
      v_purchase.telegram_user_id,
      v_purchase.currency,
      v_purchase.total_amount,
      v_purchase.telegram_payment_charge_id,
      v_purchase.provider_payment_charge_id,
      v_purchase.status,
      v_purchase.raw,
      v_purchase.paid_at,
      v_purchase.created_at,
      v_state.state,
      v_state.state_rev,
      v_balance,
      true;
    return;
  end if;

  begin
    v_balance := greatest(
      coalesce((v_state.state -> '__server' ->> 'tonCreditNanotons')::bigint, 0),
      0
    );
  exception when others then
    v_balance := 0;
  end;
  if v_balance < v_price then
    raise exception 'insufficient_ton_credit:%:%', v_balance, v_price
      using errcode = 'P0001';
  end if;

  v_next_balance := v_balance - v_price;
  v_server := case
    when jsonb_typeof(v_state.state -> '__server') = 'object'
      then v_state.state -> '__server'
    else '{}'::jsonb
  end;
  v_server := v_server || jsonb_build_object(
    'tonCreditNanotons', v_next_balance::text,
    'tonCreditUpdatedAt', v_now
  );
  v_state.state := jsonb_set(
    case when jsonb_typeof(v_state.state) = 'object' then v_state.state else '{}'::jsonb end,
    '{__server}',
    v_server,
    true
  );
  v_next_rev := greatest(
    v_state.state_rev + 1,
    floor(extract(epoch from v_now) * 1000)::bigint
  );

  update public.telegram_player_states as state_row set
    state = v_state.state,
    state_rev = v_next_rev,
    updated_at = v_now
  where state_row.game = 'megaton'
    and state_row.telegram_user_id = p_telegram_user_id;
  v_state.state_rev := v_next_rev;
  v_state.updated_at := v_now;

  insert into public.telegram_purchases (
    payload,
    game,
    product_id,
    telegram_user_id,
    currency,
    total_amount,
    telegram_payment_charge_id,
    provider_payment_charge_id,
    status,
    raw,
    created_at,
    paid_at
  ) values (
    v_payload,
    'megaton',
    p_product_id,
    p_telegram_user_id,
    'TON_CREDIT',
    v_price,
    null,
    v_charge_id,
    'paid',
    jsonb_build_object(
      'source', 'ton_credit_spend',
      'requestId', p_request_id,
      'priceNanotons', v_price::text,
      'checkoutProtocol', case when v_paid_gacha then 'megaton-paid-gacha-v1' else null end,
      'checkoutLineage', case when v_paid_gacha then 'mgp1' else null end,
      'cutoverAt', case when v_paid_gacha then p_cutover_at else null end
    ),
    v_now,
    v_now
  )
  returning * into v_purchase;

  return query select
    v_purchase.payload,
    v_purchase.game,
    v_purchase.product_id,
    v_purchase.telegram_user_id,
    v_purchase.currency,
    v_purchase.total_amount,
    v_purchase.telegram_payment_charge_id,
    v_purchase.provider_payment_charge_id,
    v_purchase.status,
    v_purchase.raw,
    v_purchase.paid_at,
    v_purchase.created_at,
    v_state.state,
    v_state.state_rev,
    v_next_balance,
    false;
end;
$$;

revoke all on function public.spend_megaton_ton_credit(text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.spend_megaton_ton_credit(text, text, text, text, timestamptz)
  to service_role;

drop function if exists public.redeem_megaton_paid_gacha(text, text, text, text, jsonb);

create or replace function public.redeem_megaton_paid_gacha(
  p_purchase_payload text,
  p_telegram_user_id text,
  p_product_id text,
  p_catalog_version text,
  p_cutover_at timestamptz,
  p_rolls jsonb
)
returns table (
  receipt_id uuid,
  product_id text,
  purchase_currency text,
  purchase_total_amount bigint,
  purchase_paid_at timestamptz,
  catalog_version text,
  rolls jsonb,
  roll_count integer,
  created_at timestamptz,
  idempotent boolean,
  total_paid_rolls bigint,
  unique_paid_items bigint,
  duplicate_paid_rolls bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_purchase public.telegram_purchases%rowtype;
  v_receipt public.telegram_megaton_paid_roll_receipts%rowtype;
  v_expected_rolls integer;
  v_expected_xtr bigint;
  v_expected_ton bigint;
  v_roll jsonb;
  v_ordinal bigint;
  v_item_id text;
  v_name text;
  v_rarity text;
  v_boost jsonb;
  v_copies_after bigint;
  v_existing_rarity text;
  v_final_rolls jsonb := '[]'::jsonb;
  v_new_unique bigint := 0;
  v_new_duplicates bigint := 0;
  v_total bigint := 0;
  v_unique bigint := 0;
  v_duplicates bigint := 0;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(length(p_purchase_payload), 0) = 0
     or length(p_purchase_payload) > 512
     or coalesce(length(p_telegram_user_id), 0) = 0
     or coalesce(length(p_product_id), 0) = 0
     or coalesce(length(p_catalog_version), 0) = 0
     or length(p_catalog_version) > 96
     or p_cutover_at is null then
    raise exception 'Invalid Megaton paid gacha redemption input'
      using errcode = '22023';
  end if;

  case p_product_id
    when 'starter' then
      v_expected_rolls := 1;
      v_expected_xtr := 25;
      v_expected_ton := 200000000;
    when 'arsenal_payload' then
      v_expected_rolls := 1;
      v_expected_xtr := 25;
      v_expected_ton := 200000000;
    when 'arsenal_payload_10' then
      v_expected_rolls := 10;
      v_expected_xtr := 199;
      v_expected_ton := 1600000000;
    when 'arsenal_legendary_payload' then
      v_expected_rolls := 1;
      v_expected_xtr := 199;
      v_expected_ton := 1600000000;
    else
      raise exception 'Purchase product is not a Megaton paid gacha product'
        using errcode = '22023';
  end case;

  -- Serializing on the verified purchase row makes concurrent retries safe:
  -- only the first transaction mutates inventory; later callers return its receipt.
  select purchase.*
    into v_purchase
    from public.telegram_purchases as purchase
   where purchase.payload = p_purchase_payload
     and purchase.game = 'megaton'
     and purchase.telegram_user_id = p_telegram_user_id
     and purchase.product_id = p_product_id
   for update;

  if not found then
    raise exception 'Verified Megaton purchase was not found'
      using errcode = 'P0002';
  end if;
  if v_purchase.status <> 'paid' or v_purchase.paid_at is null then
    raise exception 'Megaton purchase is not paid'
      using errcode = '55000';
  end if;
  if v_purchase.paid_at < p_cutover_at then
    raise exception 'Megaton purchase predates the paid-gacha cutover'
      using errcode = '55000';
  end if;
  if not (
    (
      upper(v_purchase.currency) = 'XTR'
      and v_purchase.payload ~ (
        '^megaton:mgp1:' || p_product_id || ':' || p_telegram_user_id
        || ':[0-9]{10,16}:[A-Za-z0-9_-]{8,128}$'
      )
    )
    or (
      upper(v_purchase.currency) = 'TON'
      and v_purchase.payload ~ (
        '^ton:megaton:mgp1:' || p_product_id || ':[A-Za-z0-9_-]{8,128}$'
      )
    )
    or (
      upper(v_purchase.currency) = 'TON_CREDIT'
      and v_purchase.payload ~ (
        '^megaton:ton_credit:mgp1:' || p_telegram_user_id
        || ':[A-Za-z0-9_-]{8,96}$'
      )
    )
  ) then
    raise exception 'Megaton purchase has no server checkout lineage'
      using errcode = '55000';
  end if;
  if not (
    (upper(v_purchase.currency) = 'XTR' and v_purchase.total_amount = v_expected_xtr)
    or
    (upper(v_purchase.currency) in ('TON', 'TON_CREDIT') and v_purchase.total_amount = v_expected_ton)
  ) then
    raise exception 'Megaton purchase amount does not match product'
      using errcode = '22023';
  end if;
  if (upper(v_purchase.currency) = 'XTR'
      and coalesce(v_purchase.telegram_payment_charge_id, '') = '')
     or (upper(v_purchase.currency) in ('TON', 'TON_CREDIT')
      and coalesce(v_purchase.provider_payment_charge_id, '') = '') then
    raise exception 'Megaton purchase charge evidence is missing'
      using errcode = '22023';
  end if;

  select existing.*
    into v_receipt
    from public.telegram_megaton_paid_roll_receipts as existing
   where existing.purchase_payload = p_purchase_payload;

  if found then
    select stats.total_paid_rolls, stats.unique_paid_items, stats.duplicate_paid_rolls
      into v_total, v_unique, v_duplicates
      from public.telegram_megaton_paid_inventory_stats as stats
     where stats.telegram_user_id = p_telegram_user_id;

    return query select
      v_receipt.receipt_id,
      v_receipt.product_id,
      v_receipt.purchase_currency,
      v_receipt.purchase_total_amount,
      v_receipt.purchase_paid_at,
      v_receipt.catalog_version,
      v_receipt.rolls,
      v_receipt.roll_count,
      v_receipt.created_at,
      true,
      coalesce(v_total, 0),
      coalesce(v_unique, 0),
      coalesce(v_duplicates, 0);
    return;
  end if;

  if coalesce(jsonb_typeof(p_rolls), '') <> 'array'
     or jsonb_array_length(p_rolls) <> v_expected_rolls then
    raise exception 'Megaton paid roll count does not match product'
      using errcode = '22023';
  end if;

  for v_roll, v_ordinal in
    select entry.value, entry.ordinality
      from jsonb_array_elements(p_rolls) with ordinality as entry(value, ordinality)
  loop
    if jsonb_typeof(v_roll) <> 'object' then
      raise exception 'Invalid Megaton paid roll entry'
        using errcode = '22023';
    end if;

    v_item_id := v_roll ->> 'itemId';
    v_name := v_roll ->> 'name';
    v_rarity := v_roll ->> 'rarity';
    v_boost := v_roll -> 'boost';

    if v_item_id is null or v_item_id !~ '^[a-z0-9_]{1,96}$'
       or coalesce(length(v_name), 0) = 0 or length(v_name) > 128
       or coalesce(v_rarity, '') not in ('common', 'rare', 'epic', 'legendary', 'mythic')
       or coalesce(jsonb_typeof(v_boost), '') <> 'object'
       or coalesce(v_boost ->> 'kind', '') !~ '^[a-z_]{1,48}$'
       or coalesce(length(v_boost ->> 'label'), 0) = 0
       or length(v_boost ->> 'label') > 96
       or coalesce(jsonb_typeof(v_boost -> 'value'), '') <> 'number'
       or coalesce((v_boost ->> 'value')::numeric, 0) <= 0
       or coalesce((v_boost ->> 'value')::numeric, 0) > 1 then
      raise exception 'Invalid Megaton paid collectible'
        using errcode = '22023';
    end if;

    insert into public.telegram_megaton_paid_inventory as inventory (
      telegram_user_id,
      item_id,
      rarity,
      paid_copies,
      first_paid_at,
      last_paid_at
    ) values (
      p_telegram_user_id,
      v_item_id,
      v_rarity,
      1,
      v_now,
      v_now
    )
    on conflict (telegram_user_id, item_id) do update set
      paid_copies = inventory.paid_copies + 1,
      last_paid_at = excluded.last_paid_at
    returning inventory.paid_copies, inventory.rarity
      into v_copies_after, v_existing_rarity;

    if v_existing_rarity <> v_rarity then
      raise exception 'Megaton collectible rarity changed across catalog versions'
        using errcode = '22023';
    end if;

    if v_copies_after = 1 then
      v_new_unique := v_new_unique + 1;
    else
      v_new_duplicates := v_new_duplicates + 1;
    end if;

    v_final_rolls := v_final_rolls || jsonb_build_array(jsonb_build_object(
      'index', v_ordinal - 1,
      'itemId', v_item_id,
      'name', v_name,
      'rarity', v_rarity,
      'boost', jsonb_build_object(
        'kind', v_boost ->> 'kind',
        'label', v_boost ->> 'label',
        'value', (v_boost ->> 'value')::numeric
      ),
      'paidDuplicate', v_copies_after > 1,
      'paidCopiesAfter', v_copies_after
    ));
  end loop;

  insert into public.telegram_megaton_paid_roll_receipts (
    purchase_payload,
    telegram_user_id,
    product_id,
    purchase_currency,
    purchase_total_amount,
    purchase_paid_at,
    catalog_version,
    rolls,
    roll_count,
    created_at
  ) values (
    p_purchase_payload,
    p_telegram_user_id,
    p_product_id,
    upper(v_purchase.currency),
    v_purchase.total_amount,
    v_purchase.paid_at,
    p_catalog_version,
    v_final_rolls,
    v_expected_rolls,
    v_now
  )
  returning * into v_receipt;

  insert into public.telegram_megaton_paid_inventory_stats as stats (
    telegram_user_id,
    total_paid_rolls,
    unique_paid_items,
    duplicate_paid_rolls,
    updated_at
  ) values (
    p_telegram_user_id,
    v_expected_rolls,
    v_new_unique,
    v_new_duplicates,
    v_now
  )
  on conflict (telegram_user_id) do update set
    total_paid_rolls = stats.total_paid_rolls + excluded.total_paid_rolls,
    unique_paid_items = stats.unique_paid_items + excluded.unique_paid_items,
    duplicate_paid_rolls = stats.duplicate_paid_rolls + excluded.duplicate_paid_rolls,
    updated_at = excluded.updated_at
  returning stats.total_paid_rolls, stats.unique_paid_items, stats.duplicate_paid_rolls
    into v_total, v_unique, v_duplicates;

  return query select
    v_receipt.receipt_id,
    v_receipt.product_id,
    v_receipt.purchase_currency,
    v_receipt.purchase_total_amount,
    v_receipt.purchase_paid_at,
    v_receipt.catalog_version,
    v_receipt.rolls,
    v_receipt.roll_count,
    v_receipt.created_at,
    false,
    v_total,
    v_unique,
    v_duplicates;
end;
$$;

revoke all on function public.redeem_megaton_paid_gacha(text, text, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.redeem_megaton_paid_gacha(text, text, text, text, timestamptz, jsonb)
  to service_role;

notify pgrst, 'reload schema';

commit;
