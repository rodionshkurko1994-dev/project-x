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

revoke execute on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;
revoke execute on function public.reward_referral(uuid) from public, anon;
grant execute on function public.reward_referral(uuid) to authenticated;
revoke execute on function public.set_referrer() from public, anon, authenticated;
