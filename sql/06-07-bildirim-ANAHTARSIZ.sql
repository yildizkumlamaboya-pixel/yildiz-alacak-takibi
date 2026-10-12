-- TELEFON BILDIRIMLERI (v13) - Supabase SQL Editor'de bir kez calistirin. Tekrar calistirmak guvenlidir.
create extension if not exists pg_net;

create table if not exists public.push_config (k text primary key, v text not null);
create table if not exists public.push_subs (
  id bigint generated always as identity primary key,
  user_name text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_config enable row level security;
alter table public.push_subs enable row level security;
do $$ begin
  execute 'revoke all on table public.push_config, public.push_subs from anon, authenticated';
exception when undefined_object then null; end $$;

insert into public.push_config (k, v) values
  ('vapid_pub', '@@VAPID_PUB@@'), ('vapid_priv', '@@VAPID_PRIV@@'), ('cleanup_key', '@@CLEANUP@@'),
  ('url', 'https://yildiz-emanet-stoktakibi.vercel.app/api/push')
on conflict (k) do update set v = excluded.v;

create or replace function public._portal_num(p numeric)
returns text language sql immutable as $$
  select replace(rtrim(rtrim(to_char(coalesce(p, 0), 'FM9999999990.00'), '0'), '.'), '.', ',');
$$;

-- Bildirim gonder (hata olursa asil islemi bozmaz)
create or replace function public._portal_push(p_users text[], p_title text, p_body text, p_tag text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare v_subs jsonb; c jsonb;
begin
  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
  into v_subs from push_subs s where s.user_name = any(p_users);
  if v_subs is null then return; end if;
  select jsonb_object_agg(k, v) into c from push_config;
  perform net.http_post(
    url := c->>'url',
    body := jsonb_build_object('vapid', jsonb_build_object('pub', c->>'vapid_pub', 'priv', c->>'vapid_priv'),
              'subs', v_subs, 'title', p_title, 'body', p_body, 'url', './', 'tag', p_tag, 'cleanup_key', c->>'cleanup_key'),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000);
exception when others then
  raise warning 'bildirim gonderilemedi: %', sqlerrm;
end $$;

create or replace function public._portal_push_event()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_actor text := nullif(current_setting('portal.user', true), '');
  v_admins text[]; v_n int; v_l numeric; s shipments; o orders;
begin
  if current_setting('portal.bulk', true) = '1' then return null; end if;
  select array_agg(name) into v_admins from portal_users where role = 'admin' and active and name is distinct from v_actor;

  if tg_table_name = 'shipments' then
    select * into s from shipments where id = new.id;
    if not found or s.created_at < now() - interval '10 minutes' and tg_op = 'INSERT' then return null; end if;
    if tg_op = 'INSERT' then
      select count(*), coalesce(sum(qty), 0) into v_n, v_l from shipment_items where shipment_id = s.id;
      perform _portal_push(v_admins, '📦 Yeni sevkiyat: ' || s.supplier,
        'İrsaliye #' || s.irsaliye_no || ' • ' || v_n || ' kalem, ' || _portal_num(v_l) || ' L • Onayınızı bekliyor',
        'sevk-' || s.id);
    elsif old.status = 'Bekliyor' and s.status <> 'Bekliyor' then
      select count(*), coalesce(sum(coalesce(received_qty, qty)), 0) into v_n, v_l from shipment_items where shipment_id = s.id;
      perform _portal_push(array[s.supplier], '✅ Sevkiyat teslim alındı',
        'İrsaliye #' || s.irsaliye_no || ' • ' || _portal_num(v_l) || ' L Yıldız Kumlama Boya tarafından teslim alındı',
        'onay-' || s.id);
    end if;
  elsif tg_table_name = 'orders' then
    select * into o from orders where id = new.id;
    if not found or o.cancelled then return null; end if;
    select count(*), coalesce(sum(qty), 0) into v_n, v_l from order_items where order_id = o.id;
    perform _portal_push(array[o.bayi], '🧾 Yeni sipariş: Yıldız Kumlama Boya',
      v_n || ' kalem, ' || _portal_num(v_l) || ' L'
        || coalesce(' • Termin: ' || to_char(o.due_date, 'DD.MM.YYYY'), '')
        || coalesce(' • ' || nullif(trim(o.note), ''), ''),
      'siparis-' || o.id);
  end if;
  return null;
end $$;

drop trigger if exists shipments_push_ins on public.shipments;
drop trigger if exists shipments_push_upd on public.shipments;
drop trigger if exists orders_push_ins on public.orders;
create constraint trigger shipments_push_ins after insert on public.shipments
  deferrable initially deferred for each row execute function public._portal_push_event();
create constraint trigger shipments_push_upd after update of status on public.shipments
  deferrable initially deferred for each row execute function public._portal_push_event();
create constraint trigger orders_push_ins after insert on public.orders
  deferrable initially deferred for each row execute function public._portal_push_event();

-- Uygulamadan cagrilanlar
create or replace function public.portal_push_subscribe(p_user text, p_pass text, p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform _portal_require(p_user, p_pass);
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Geçersiz bildirim aboneliği';
  end if;
  insert into push_subs (user_name, endpoint, p256dh, auth) values (p_user, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_name = excluded.user_name, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function public.portal_push_unsubscribe(p_user text, p_pass text, p_endpoint text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform _portal_require(p_user, p_pass);
  delete from push_subs where endpoint = p_endpoint and user_name = p_user;
end $$;

create or replace function public.portal_push_test(p_user text, p_pass text)
returns int
language plpgsql security definer set search_path = public, extensions
as $$
declare v_n int;
begin
  perform _portal_require(p_user, p_pass);
  select count(*) into v_n from push_subs where user_name = p_user;
  perform _portal_push(array[p_user], '🔔 Test bildirimi', 'Bildirimler bu cihazda çalışıyor.', 'test');
  return v_n;
end $$;

-- Gecersizlesen abonelikleri bildirim sunucusu siler
create or replace function public.portal_push_gone(p_key text, p_endpoints text[])
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if p_key is null or p_key is distinct from (select v from push_config where k = 'cleanup_key') then return; end if;
  delete from push_subs where endpoint = any(p_endpoints);
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('_portal_push', '_portal_push_event', 'portal_push_subscribe',
                 'portal_push_unsubscribe', 'portal_push_test', 'portal_push_gone', '_portal_num')
  loop
    execute format('revoke all on function %s from public', f.sig);
    begin
      execute format('revoke all on function %s from anon, authenticated', f.sig);
      if f.proname not like '\_%' then
        execute format('grant execute on function %s to anon, authenticated', f.sig);
      end if;
    exception when undefined_object then null;
    end;
  end loop;
end $$;
