-- Власна статистика відвідувань для rodionactive.com, projectx.vision, cyber-kyiv.online
-- Виконати один раз у Supabase → SQL Editor. Повторний запуск безпечний.

create table if not exists public.site_daily (
  site     text not null,
  day      date not null,
  views    integer not null default 0,
  visitors integer not null default 0,
  primary key (site, day)
);

create table if not exists public.site_visitors (
  site       text not null,
  vid        text not null,
  first_seen date not null default (now() at time zone 'Europe/Kyiv')::date,
  last_day   date not null default (now() at time zone 'Europe/Kyiv')::date,
  primary key (site, vid)
);

-- Прямого доступу до таблиць немає ні в кого, крім функцій нижче
alter table public.site_daily    enable row level security;
alter table public.site_visitors enable row level security;
revoke all on public.site_daily, public.site_visitors from anon, authenticated;

-- Запис одного перегляду сторінки
create or replace function public.track_visit(p_site text, p_vid text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d   date := (now() at time zone 'Europe/Kyiv')::date;
  new_today boolean := false;
  is_new    boolean := false;
begin
  if p_site not in ('rodionactive.com', 'projectx.vision', 'cyber-kyiv.online') then
    return;
  end if;
  if p_vid is null or p_vid !~ '^[a-z0-9]{8,40}$' then
    return;
  end if;

  insert into site_visitors (site, vid, first_seen, last_day)
  values (p_site, p_vid, d, d)
  on conflict (site, vid) do nothing;
  is_new := found;

  if not is_new then
    update site_visitors set last_day = d
     where site = p_site and vid = p_vid and last_day <> d;
    new_today := found;
  else
    new_today := true;
  end if;

  insert into site_daily (site, day, views, visitors)
  values (p_site, d, 1, case when new_today then 1 else 0 end)
  on conflict (site, day) do update
    set views    = site_daily.views + 1,
        visitors = site_daily.visitors + excluded.visitors;
end;
$$;

-- Зведення для дашборда
create or replace function public.site_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  with d as (select (now() at time zone 'Europe/Kyiv')::date as today),
  sites(site) as (values ('rodionactive.com'), ('projectx.vision'), ('cyber-kyiv.online'))
  select json_build_object(
    'generated_at', now(),
    'sites', json_agg(json_build_object(
      'site', s.site,
      'since', (select min(day) from site_daily x where x.site = s.site),
      'views', coalesce((select sum(views) from site_daily x where x.site = s.site), 0),
      'visitors', (select count(*) from site_visitors v where v.site = s.site),
      'today', coalesce((select sum(views) from site_daily x, d where x.site = s.site and x.day = d.today), 0),
      'today_visitors', coalesce((select sum(visitors) from site_daily x, d where x.site = s.site and x.day = d.today), 0),
      'd7', coalesce((select sum(views) from site_daily x, d where x.site = s.site and x.day > d.today - 7), 0),
      'd30', coalesce((select sum(views) from site_daily x, d where x.site = s.site and x.day > d.today - 30), 0),
      'last30', (select json_agg(coalesce(x.views, 0) order by g.day)
                   from d, generate_series(d.today - 29, d.today, interval '1 day') as g(day)
                   left join site_daily x on x.site = s.site and x.day = g.day::date)
    ) order by s.site)
  )
  from sites s;
$$;

revoke all on function public.track_visit(text, text) from public;
revoke all on function public.site_stats() from public;
grant execute on function public.track_visit(text, text) to anon, authenticated;
grant execute on function public.site_stats() to anon, authenticated;
