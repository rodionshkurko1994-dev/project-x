-- Project X: схема бази Supabase. Можна запускати повторно.

create table if not exists public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  nick text not null check (char_length(nick) between 1 and 16),
  state jsonb not null default '{}'::jsonb,
  score integer not null default 0,
  kills integer not null default 0,
  kd integer not null default 0,
  kc integer not null default 0,
  kb integer not null default 0,
  missed integer not null default 0,
  shots integer not null default 0,
  hits integer not null default 0,
  money integer not null default 0,
  units integer not null default 0,
  stab integer not null default 100,
  rev integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  t0 bigint not null,
  data jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.players(id) on delete cascade,
  amount integer not null,
  applied boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- Для баз, створених до серверної логіки гри.
alter table public.players add column if not exists rev integer not null default 0;
alter table public.grants add column if not exists applied boolean not null default false;

alter table public.players enable row level security;
alter table public.admins enable row level security;
alter table public.events enable row level security;
alter table public.grants enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admins where user_id = (select auth.uid())) $$;

-- Перший зареєстрований гравець стає адміністратором.
create or replace function public.first_player_is_admin() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins) then
    insert into public.admins (user_id) values (new.id);
  end if;
  return new;
end $$;
drop trigger if exists first_player_is_admin on public.players;
create trigger first_player_is_admin after insert on public.players
  for each row execute function public.first_player_is_admin();

drop policy if exists players_select on public.players;
drop policy if exists players_insert on public.players;
drop policy if exists players_update on public.players;
create policy players_select on public.players for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
-- Гравець лише читає свій рядок. Створює і змінює його серверна функція game (supabase/functions/game).

drop policy if exists admins_select on public.admins;
create policy admins_select on public.admins for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists events_select on public.events;
drop policy if exists events_insert on public.events;
drop policy if exists events_delete on public.events;
create policy events_select on public.events for select to anon, authenticated using (true);
create policy events_insert on public.events for insert to authenticated with check (public.is_admin());
create policy events_delete on public.events for delete to authenticated using (public.is_admin());

drop policy if exists grants_select on public.grants;
drop policy if exists grants_insert on public.grants;
create policy grants_select on public.grants for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy grants_insert on public.grants for insert to authenticated with check (public.is_admin());

-- Відкритий рейтинг: лише позивний, рахунок і кількість збитих.
create or replace view public.leaderboard as
  select id, nick, score, kills from public.players;

-- Запрошення: код гравця, хто кого запросив, чи нараховано бонус.
alter table public.players add column if not exists ref_code text generated always as (substr(replace(id::text, '-', ''), 1, 8)) stored;
alter table public.players add column if not exists referred_by uuid references public.players(id) on delete set null;
alter table public.players add column if not exists ref_rewarded boolean not null default false;
create index if not exists players_ref_code on public.players (ref_code);

create or replace function public.set_referrer() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare code text; inviter uuid;
begin
  select lower(raw_user_meta_data->>'ref') into code from auth.users where id = new.id;
  if code is not null and code <> '' then
    select id into inviter from public.players where ref_code = code and id <> new.id limit 1;
    new.referred_by := inviter;
  end if;
  return new;
end $$;
drop trigger if exists set_referrer on public.players;
create trigger set_referrer before insert on public.players
  for each row execute function public.set_referrer();


-- Список гравців з поштою, лише для адміністратора.
drop function if exists public.admin_users();
create function public.admin_users()
returns table (id uuid, email text, nick text, score integer, kills integer, kd integer, kc integer, kb integer,
  missed integer, shots integer, hits integer, money integer, units integer, stab integer,
  created_at timestamptz, updated_at timestamptz, referred_by uuid, ref_rewarded boolean)
language sql stable security definer set search_path = ''
as $$
  select p.id, u.email::text, p.nick, p.score, p.kills, p.kd, p.kc, p.kb, p.missed, p.shots, p.hits,
         p.money, p.units, p.stab, p.created_at, p.updated_at, p.referred_by, p.ref_rewarded
  from public.players p join auth.users u on u.id = p.id
  where public.is_admin()
$$;

create or replace function public.reward_referral(invited uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare inviter uuid;
begin
  if not public.is_admin() then return false; end if;
  update public.players set ref_rewarded = true
    where id = invited and referred_by is not null and not ref_rewarded
    returning referred_by into inviter;
  if inviter is null then return false; end if;
  insert into public.grants (user_id, amount, created_by) values (inviter, 1000, (select auth.uid()));
  return true;
end $$;

revoke all on public.players, public.admins, public.events, public.grants, public.leaderboard from anon, authenticated;
grant select on public.players to authenticated;
grant select on public.admins to authenticated;
grant select on public.events to anon, authenticated;
grant insert, delete on public.events to authenticated;
grant select, insert on public.grants to authenticated;
grant select on public.leaderboard to anon, authenticated;
revoke execute on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;
revoke execute on function public.first_player_is_admin() from public, anon, authenticated;
revoke execute on function public.reward_referral(uuid) from public, anon;
grant execute on function public.reward_referral(uuid) to authenticated;
revoke execute on function public.set_referrer() from public, anon, authenticated;
