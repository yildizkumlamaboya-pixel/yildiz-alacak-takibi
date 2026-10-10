-- =====================================================================
-- YILDIZ KUMLAMA BOYA - BAYİ ALACAK TAKİP PORTALI  (v11)
-- Supabase > SQL Editor'e yapıştırıp "Run" deyin.
--
-- Mantık: Yıldız Kumlama Boya'nın bayilerden (Delta Boya, Minimar...)
-- Litre bazında STOKLU ALACAĞI vardır. Bayi tek irsaliyede bir veya birden
-- fazla ürün bildirir; Yıldız Kumlama gelen miktarı (eksik/hasarlı ise
-- gerçekte gelen miktarı) girip imzalayınca kalan alacak düşer.
--
-- Önceki sürümlerin üzerine de çalıştırılabilir; veriler korunur.
-- Tüm okuma ve yazmalar şifre kontrollü fonksiyonlarla yapılır;
-- bayiler sadece kendi kayıtlarına erişebilir.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- Önceki sürümlerin fonksiyonlarını temizle (aşağıda yeniden oluşturulur)
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'portal\_%' or p.proname like '\_portal\_%')
  loop
    execute 'drop function ' || f.sig || ' cascade';
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 1) TABLOLAR
-- ---------------------------------------------------------------------

-- Ürün listesi (birim Litre)
create table if not exists public.catalog (
  id         bigint generated always as identity primary key,
  code       text not null,
  name       text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists catalog_code_uq on public.catalog (lower(code));
create unique index if not exists catalog_name_uq on public.catalog (lower(name));

-- Alacak kalemleri (bayi + ürün); qty = kalan alacak (eksi = fazla teslim)
create table if not exists public.products (
  id           bigint generated always as identity primary key,
  catalog_id   bigint references public.catalog(id) on delete restrict,
  code         text not null,
  name         text not null,
  unit         text not null default 'Litre',
  qty          numeric(12,2) not null default 0,
  critical     numeric(12,2) not null default 0,
  allowed_bayi text not null,
  created_at   timestamptz not null default now()
);
alter table public.products add column if not exists catalog_id bigint references public.catalog(id) on delete restrict;
alter table public.products drop constraint if exists products_allowed_bayi_check;
alter table public.products drop constraint if exists products_qty_check;
alter table public.products drop constraint if exists products_code_key;
alter table public.products drop constraint if exists products_name_key;
alter table public.products drop constraint if exists products_unit_check;
alter table public.products alter column allowed_bayi drop default;
alter table public.products alter column unit set default 'Litre';
alter table public.products alter column critical set default 0;
update public.products set unit = 'Litre' where unit is distinct from 'Litre';
create unique index if not exists products_bayi_code_uq    on public.products (allowed_bayi, lower(code));
create unique index if not exists products_bayi_name_uq    on public.products (allowed_bayi, lower(name));
create unique index if not exists products_bayi_catalog_uq on public.products (allowed_bayi, catalog_id);

-- Sevkiyat başlığı (irsaliye)
create table if not exists public.shipments (
  id             bigint generated always as identity primary key,
  irsaliye_no    text not null,
  supplier       text not null,
  status         text not null default 'Bekliyor',
  prepared_by    text,          -- irsaliyeyi düzenleyen (bayi personeli)
  received_by    text,          -- teslim alan (Yıldız Kumlama personeli)
  approve_note   text,
  supplier_signature text,      -- teslim eden (bayi) imzası, sevk bildirirken
  signature_data text,          -- teslim alan (Yıldız Kumlama) imzası
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,
  updated_by     text,
  approved_at    timestamptz,
  approved_by    text
);
alter table public.shipments add column if not exists prepared_by    text;
alter table public.shipments add column if not exists received_by    text;
alter table public.shipments add column if not exists approve_note   text;
alter table public.shipments add column if not exists signature_data text;
alter table public.shipments add column if not exists supplier_signature text;
alter table public.shipments add column if not exists updated_at     timestamptz;
alter table public.shipments add column if not exists updated_by     text;
alter table public.shipments add column if not exists approved_at    timestamptz;
alter table public.shipments add column if not exists approved_by    text;
-- Eski sürümün tek ürünlü sevkiyat sütunları (eski kayıt/yedekleri taşımak için tutulur)
alter table public.shipments add column if not exists product_id   bigint;
alter table public.shipments add column if not exists product_name text;
alter table public.shipments add column if not exists qty          numeric(12,2);
alter table public.shipments add column if not exists unit         text;
alter table public.shipments alter column product_name drop not null;
alter table public.shipments alter column qty          drop not null;
alter table public.shipments alter column unit         drop not null;
alter table public.shipments alter column unit         drop default;
create index if not exists shipments_supplier_idx   on public.shipments (supplier);
create index if not exists shipments_created_at_idx on public.shipments (created_at desc);

-- Sevkiyat kalemleri: bildirilen (qty) ve teslim alınan (received_qty)
create table if not exists public.shipment_items (
  id           bigint generated always as identity primary key,
  shipment_id  bigint not null references public.shipments(id) on delete cascade,
  product_id   bigint references public.products(id) on delete restrict,
  product_name text not null,
  code         text,
  unit         text not null default 'Litre',
  qty          numeric(12,2) not null check (qty > 0),
  received_qty numeric(12,2) check (received_qty >= 0),
  note         text
);
create index if not exists shipment_items_shipment_idx on public.shipment_items (shipment_id);
create index if not exists shipment_items_product_idx  on public.shipment_items (product_id);

-- Siparişler (Yıldız Kumlama Boya'nın bayiye verdiği sipariş)
create table if not exists public.orders (
  id         bigint generated always as identity primary key,
  bayi       text not null,
  note       text,
  due_date   date,
  cancelled  boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create index if not exists orders_bayi_idx on public.orders (bayi);

create table if not exists public.order_items (
  id           bigint generated always as identity primary key,
  order_id     bigint not null references public.orders(id) on delete cascade,
  product_id   bigint references public.products(id) on delete restrict,
  product_name text not null,
  code         text,
  unit         text not null default 'Litre',
  qty          numeric(12,2) not null check (qty > 0)
);
create index if not exists order_items_order_idx on public.order_items (order_id);

-- Bir sipariş tek bir sevkiyata dönüşür
alter table public.shipments add column if not exists order_id bigint references public.orders(id) on delete set null;
create unique index if not exists shipments_order_uq on public.shipments (order_id) where order_id is not null;

-- Alacak hareketleri
create table if not exists public.stock_movements (
  id            bigint generated always as identity primary key,
  product_id    bigint not null references public.products(id) on delete cascade,
  movement_type text not null,
  -- Açılış Alacağı / Alacak Girişi / Alacak Düşümü / Sevkiyat Teslimi /
  -- Düzeltme / Onay İptali / Sevkiyat İptali
  qty           numeric(12,2) not null,   -- alacak artışı (+), azalışı (-)
  balance_after numeric(12,2) not null,   -- hareket sonrası kalan alacak
  shipment_id   bigint,
  bayi          text,
  note          text,
  created_by    text,
  created_at    timestamptz not null default now()
);
create index if not exists stock_movements_product_idx  on public.stock_movements (product_id, created_at desc);
create index if not exists stock_movements_created_idx  on public.stock_movements (created_at desc);
create index if not exists stock_movements_shipment_idx on public.stock_movements (shipment_id);
update public.stock_movements set movement_type = 'Açılış Alacağı' where movement_type = 'Açılış Stoku';

-- Hesaplar
create table if not exists public.portal_users (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  role       text not null default 'bayi' check (role in ('admin','bayi')),
  pass_hash  text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.portal_users (name, role, pass_hash)
values ('Yıldız Kumlama Boya', 'admin', extensions.crypt('159753', extensions.gen_salt('bf')))
on conflict (name) do nothing;
insert into public.portal_users (name, role, pass_hash) values
  ('Delta Boya', 'bayi', null),
  ('Minimar',    'bayi', null)
on conflict (name) do nothing;

-- Personel isimleri (firma = hesap adı: Yıldız Kumlama Boya veya bayi)
create table if not exists public.personnel (
  id         bigint generated always as identity primary key,
  firm       text not null,
  name       text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists personnel_firm_name_uq on public.personnel (firm, lower(name));

-- Yedekler
create table if not exists public.backups (
  id         bigint generated always as identity primary key,
  kind       text not null default 'manuel',
  note       text,
  created_by text,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

-- Canlı güncelleme sinyali (veri içermez; sadece "bir şey değişti" bilgisi)
create table if not exists public.portal_pulse (
  id         int primary key default 1 check (id = 1),
  changed_at timestamptz not null default now()
);
insert into public.portal_pulse (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2) ÖNCEKİ SÜRÜMLERDEN GEÇİŞ
-- ---------------------------------------------------------------------
-- Ürün listesine bağlı olmayan alacak kalemlerini bağla
create or replace function public._portal_link_catalog()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into catalog (code, name)
    select distinct on (lower(p.name)) p.code, p.name from products p
    where p.catalog_id is null
      and not exists (select 1 from catalog c where lower(c.name) = lower(p.name))
    order by lower(p.name), p.id
  on conflict do nothing;
  update products p set catalog_id = c.id
  from catalog c
  where p.catalog_id is null and lower(c.name) = lower(p.name);
end $$;

-- Eski tek ürünlü sevkiyatları kalemlere dönüştür
create or replace function public._portal_migrate_items()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into shipment_items (shipment_id, product_id, product_name, code, unit, qty, received_qty)
    select s.id, p.id, s.product_name, p.code, 'Litre', s.qty,
           case when s.status <> 'Bekliyor' then s.qty end
    from shipments s
    left join products p on p.id = s.product_id
    where s.product_name is not null and s.qty is not null and s.qty > 0
      and not exists (select 1 from shipment_items i where i.shipment_id = s.id)
    order by s.id;
end $$;

select public._portal_link_catalog();
select public._portal_migrate_items();

-- (İSTEĞE BAĞLI) Test verisi girdiyseniz ve sıfırdan başlamak istiyorsanız
-- aşağıdaki satırın başındaki -- işaretini silip yeniden çalıştırın.
-- Hesaplar ve şifreler silinmez.
-- truncate public.stock_movements, public.shipment_items, public.shipments, public.products, public.catalog, public.personnel restart identity cascade;

-- ---------------------------------------------------------------------
-- 3) GÜVENLİK: tablolara doğrudan erişim tamamen kapalı
-- ---------------------------------------------------------------------
alter table public.catalog         enable row level security;
alter table public.products        enable row level security;
alter table public.shipments       enable row level security;
alter table public.shipment_items  enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.stock_movements enable row level security;
alter table public.portal_users    enable row level security;
alter table public.personnel       enable row level security;
alter table public.backups         enable row level security;
alter table public.portal_pulse    enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in
      ('catalog','products','shipments','shipment_items','orders','order_items','stock_movements','portal_users','personnel','backups','portal_pulse')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

do $$
begin
  execute 'revoke all on table public.catalog, public.products, public.shipments, public.shipment_items,
           public.stock_movements, public.portal_users, public.personnel, public.backups, public.portal_pulse,
           public.orders, public.order_items
           from anon, authenticated';
  execute 'grant select on table public.portal_pulse to anon, authenticated';
exception when undefined_object then null;   -- anon/authenticated rolleri yoksa (Supabase dışı)
end $$;
create policy "pulse_select" on public.portal_pulse for select using (true);

-- Canlı güncelleme: sadece sinyal tablosu yayınlanır
do $$
declare t text;
begin
  foreach t in array array['shipments','products','catalog','stock_movements','shipment_items'] loop
    begin execute format('alter publication supabase_realtime drop table public.%I', t); exception when others then null; end;
  end loop;
  begin alter publication supabase_realtime add table public.portal_pulse; exception when others then null; end;
end $$;

create or replace function public._portal_touch()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update portal_pulse set changed_at = now() where id = 1;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['catalog','products','shipments','shipment_items','orders','order_items','stock_movements','personnel'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_pulse', t);
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each statement execute function public._portal_touch()', t || '_pulse', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4) YARDIMCI FONKSİYONLAR (dışarıdan çağrılamaz)
-- ---------------------------------------------------------------------
create or replace function public._portal_auth(p_name text, p_pass text)
returns text
language sql stable security definer set search_path = public, extensions
as $$
  select u.role from portal_users u
  where u.name = p_name and u.active and u.pass_hash is not null
    and u.pass_hash = crypt(p_pass, u.pass_hash);
$$;

create or replace function public._portal_require(p_name text, p_pass text, p_admin boolean default false)
returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare v_role text;
begin
  v_role := _portal_auth(p_name, p_pass);
  if v_role is null then raise exception 'Oturum geçersiz, lütfen yeniden giriş yapın'; end if;
  if p_admin and v_role <> 'admin' then raise exception 'Bu işlem için yönetici yetkisi gerekir'; end if;
  return v_role;
end $$;

-- Kalan alacağı değiştirir ve hareket kaydı atar
create or replace function public._portal_move(
  p_product_id bigint, p_type text, p_qty numeric,
  p_shipment_id bigint, p_bayi text, p_note text, p_user text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_cur numeric; v_bayi text; v_new numeric;
begin
  select qty, allowed_bayi into v_cur, v_bayi from products where id = p_product_id for update;
  if not found then raise exception 'Alacak kalemi bulunamadı'; end if;
  v_new := v_cur + p_qty;
  update products set qty = v_new where id = p_product_id;
  insert into stock_movements (product_id, movement_type, qty, balance_after, shipment_id, bayi, note, created_by)
  values (p_product_id, p_type, p_qty, v_new, p_shipment_id, coalesce(p_bayi, v_bayi), nullif(trim(p_note), ''), p_user);
end $$;

-- Sevkiyat kalemlerini doğrular, bayiyi döndürür
create or replace function public._portal_check_items(p_items jsonb, p_user text, p_role text)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_sup text; v_dup int; r record;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'En az bir ürün ekleyin';
  end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'Bir sevkiyatta en fazla 50 ürün olabilir'; end if;
  for r in
    select x.product_id, x.qty, x.received_qty, p.id as pid, p.allowed_bayi
    from jsonb_to_recordset(p_items) as x(product_id bigint, qty numeric, received_qty numeric)
    left join products p on p.id = x.product_id
  loop
    if r.pid is null then raise exception 'Ürün bulunamadı, listeyi yenileyin'; end if;
    if coalesce(r.qty, 0) <= 0 then raise exception 'Miktar sıfırdan büyük olmalı'; end if;
    if r.received_qty < 0 then raise exception 'Teslim alınan miktar eksi olamaz'; end if;
    if p_role <> 'admin' and r.allowed_bayi <> p_user then raise exception 'Bu ürün size ait değil'; end if;
    if v_sup is null then v_sup := r.allowed_bayi;
    elsif v_sup <> r.allowed_bayi then raise exception 'Bir sevkiyattaki ürünler aynı firmaya ait olmalı';
    end if;
  end loop;
  select count(*) - count(distinct x.product_id) into v_dup
  from jsonb_to_recordset(p_items) as x(product_id bigint);
  if v_dup > 0 then raise exception 'Aynı ürün birden fazla satırda var, tek satırda toplayın'; end if;
  return v_sup;
end $$;

-- Aynı bayide aynı irsaliye numarası tekrar girilemez
create or replace function public._portal_check_irsaliye(p_supplier text, p_no text, p_except bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_at timestamptz;
begin
  select created_at into v_at from shipments
  where supplier = p_supplier and lower(trim(irsaliye_no)) = lower(trim(p_no)) and id <> coalesce(p_except, -1)
  order by created_at limit 1;
  if found then
    raise exception 'Bu irsaliye numarası (%) % tarihinde zaten girilmiş', trim(p_no),
      to_char(v_at at time zone 'Europe/Istanbul', 'DD.MM.YYYY');
  end if;
end $$;

create or replace function public._portal_backup(p_kind text, p_note text, p_user text)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_id bigint;
begin
  insert into backups (kind, note, created_by, data)
  values (p_kind, p_note, p_user, jsonb_build_object(
    'version', 4,
    'created_at', now(),
    'catalog',         coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from catalog t), '[]'::jsonb),
    'products',        coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from products t), '[]'::jsonb),
    'shipments',       coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from shipments t), '[]'::jsonb),
    'shipment_items',  coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from shipment_items t), '[]'::jsonb),
    'orders',          coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from orders t), '[]'::jsonb),
    'order_items',     coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from order_items t), '[]'::jsonb),
    'stock_movements', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from stock_movements t), '[]'::jsonb),
    'personnel',       coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from personnel t), '[]'::jsonb),
    'portal_users',    coalesce((select jsonb_agg(jsonb_build_object(
                          'name', t.name, 'role', t.role, 'pass_hash', t.pass_hash, 'active', t.active) order by t.id)
                        from portal_users t), '[]'::jsonb)
  ))
  returning id into v_id;
  -- otomatik yedeklerden son 30 tanesi tutulur (manuel yedekler silinmez)
  delete from backups
  where kind <> 'manuel'
    and id not in (select b.id from backups b where b.kind <> 'manuel' order by b.id desc limit 30);
  return v_id;
end $$;

create or replace function public._portal_restore(p_data jsonb, p_user text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_data is null
     or jsonb_typeof(p_data->'products')  is distinct from 'array'
     or jsonb_typeof(p_data->'shipments') is distinct from 'array' then
    raise exception 'Geçersiz yedek dosyası';
  end if;

  perform _portal_backup('geri-yukleme-oncesi', 'Geri yükleme öncesi otomatik yedek', p_user);

  delete from stock_movements where id is not null;
  delete from shipment_items  where id is not null;
  delete from shipments       where id is not null;
  delete from order_items     where id is not null;
  delete from orders          where id is not null;
  delete from products        where id is not null;
  delete from catalog         where id is not null;

  insert into catalog overriding system value
    select * from jsonb_populate_recordset(null::catalog, coalesce(p_data->'catalog', '[]'::jsonb));
  insert into products overriding system value
    select * from jsonb_populate_recordset(null::products, p_data->'products');
  insert into orders overriding system value
    select * from jsonb_populate_recordset(null::orders, coalesce(p_data->'orders', '[]'::jsonb));
  insert into order_items overriding system value
    select * from jsonb_populate_recordset(null::order_items, coalesce(p_data->'order_items', '[]'::jsonb));
  insert into shipments overriding system value
    select * from jsonb_populate_recordset(null::shipments, p_data->'shipments');
  insert into shipment_items overriding system value
    select * from jsonb_populate_recordset(null::shipment_items, coalesce(p_data->'shipment_items', '[]'::jsonb));
  insert into stock_movements overriding system value
    select * from jsonb_populate_recordset(null::stock_movements, coalesce(p_data->'stock_movements', '[]'::jsonb));

  if jsonb_typeof(p_data->'personnel') = 'array' then
    delete from personnel where id is not null;
    insert into personnel overriding system value
      select * from jsonb_populate_recordset(null::personnel, p_data->'personnel');
  end if;

  -- hesaplar: eksik olanlar eklenir; şifresi olmayan hesaba yedekteki şifre aktarılır,
  -- mevcut şifreler değişmez. Telefon hafızasından alınan yedeklerde şifre şifrelenerek kaydedilir.
  insert into portal_users (name, role, pass_hash, active)
    select x.name, coalesce(x.role, 'bayi'),
           case when x.pass_hash is null then null
                when x.pass_hash like '$2%' then x.pass_hash
                else extensions.crypt(x.pass_hash, extensions.gen_salt('bf')) end,
           coalesce(x.active, true)
    from jsonb_to_recordset(coalesce(p_data->'portal_users', '[]'::jsonb))
         as x(name text, role text, pass_hash text, active boolean)
    where x.name is not null
  on conflict (name) do update set pass_hash = coalesce(portal_users.pass_hash, excluded.pass_hash);

  perform _portal_link_catalog();
  perform _portal_migrate_items();
  update products set unit = 'Litre' where unit is distinct from 'Litre';

  perform setval(pg_get_serial_sequence('public.catalog', 'id'),         coalesce((select max(id) from catalog), 0) + 1, false);
  perform setval(pg_get_serial_sequence('public.products', 'id'),        coalesce((select max(id) from products), 0) + 1, false);
  perform setval(pg_get_serial_sequence('public.shipments', 'id'),       coalesce((select max(id) from shipments), 0) + 1, false);
  perform setval(pg_get_serial_sequence('public.shipment_items', 'id'),  coalesce((select max(id) from shipment_items), 0) + 1, false);
  perform setval(pg_get_serial_sequence('public.stock_movements', 'id'), coalesce((select max(id) from stock_movements), 0) + 1, false);
  perform setval(pg_get_serial_sequence('public.personnel', 'id'),       coalesce((select max(id) from personnel), 0) + 1, false);
  perform setval(pg_get_serial_sequence('public.orders', 'id'),          coalesce((select max(id) from orders), 0) + 1, false);
  perform setval(pg_get_serial_sequence('public.order_items', 'id'),     coalesce((select max(id) from order_items), 0) + 1, false);
end $$;

-- ---------------------------------------------------------------------
-- 5) GİRİŞ VE HESAPLAR
-- ---------------------------------------------------------------------
create or replace function public.portal_login_list()
returns table(name text, role text)
language sql security definer set search_path = public
as $$
  select u.name, u.role from portal_users u
  where u.active
  order by (u.role = 'admin') desc, u.name;
$$;

create or replace function public.portal_login(p_name text, p_pass text)
returns table(name text, role text)
language plpgsql security definer set search_path = public, extensions
as $$
declare v_role text;
begin
  v_role := _portal_auth(p_name, p_pass);
  if v_role is null then return; end if;
  if v_role = 'admin' and not exists (
       select 1 from backups b where b.created_at > now() - interval '24 hours') then
    perform _portal_backup('otomatik', 'Günlük otomatik yedek', p_name);
  end if;
  return query select p_name, v_role;
end $$;

create or replace function public.portal_change_password(p_name text, p_old text, p_new text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if length(coalesce(p_new, '')) < 4 then raise exception 'Yeni şifre en az 4 karakter olmalı'; end if;
  update portal_users set pass_hash = crypt(p_new, gen_salt('bf'))
  where name = p_name and active and pass_hash is not null
    and pass_hash = crypt(p_old, pass_hash);
  if not found then raise exception 'Mevcut şifre hatalı'; end if;
end $$;

create or replace function public.portal_admin_users(p_user text, p_pass text)
returns table(name text, role text, active boolean, has_password boolean)
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform _portal_require(p_user, p_pass, true);
  return query
    select u.name, u.role, u.active, (u.pass_hash is not null)
    from portal_users u
    order by (u.role = 'admin') desc, u.name;
end $$;

create or replace function public.portal_admin_save_bayi(p_user text, p_pass text, p_name text, p_new_pass text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform _portal_require(p_user, p_pass, true);
  p_name := trim(p_name);
  if coalesce(p_name, '') = '' then raise exception 'Firma adı boş olamaz'; end if;
  if length(coalesce(p_new_pass, '')) < 4 then raise exception 'Şifre en az 4 karakter olmalı'; end if;
  if exists (select 1 from portal_users where name = p_name and role = 'admin') then
    raise exception 'Bu ad yönetici hesabına ait';
  end if;
  insert into portal_users (name, role, pass_hash)
  values (p_name, 'bayi', crypt(p_new_pass, gen_salt('bf')))
  on conflict (name) do update set pass_hash = excluded.pass_hash;
end $$;

create or replace function public.portal_admin_set_active(p_user text, p_pass text, p_name text, p_active boolean)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform _portal_require(p_user, p_pass, true);
  update portal_users set active = p_active where name = p_name and role = 'bayi';
end $$;

-- ---------------------------------------------------------------------
-- 6) OKUMA (her kullanıcı sadece yetkili olduğu kayıtları alır)
-- ---------------------------------------------------------------------
create or replace function public.portal_data(p_user text, p_pass text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare v_admin boolean;
begin
  v_admin := _portal_require(p_user, p_pass) = 'admin';
  return jsonb_build_object(
    'catalog', case when v_admin
      then coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from catalog c), '[]'::jsonb)
      else '[]'::jsonb end,
    'products', coalesce((select jsonb_agg(to_jsonb(p) order by p.allowed_bayi, p.name)
      from products p where v_admin or p.allowed_bayi = p_user), '[]'::jsonb),
    'shipments', coalesce((select jsonb_agg(
        (to_jsonb(s) - 'signature_data' - 'supplier_signature' - 'product_id' - 'product_name' - 'qty' - 'unit')
        || jsonb_build_object(
             'has_signature', s.signature_data is not null,
             'has_supplier_signature', s.supplier_signature is not null,
             'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.id)
                                from shipment_items i where i.shipment_id = s.id), '[]'::jsonb))
        order by s.created_at desc, s.id desc)
      from shipments s where v_admin or s.supplier = p_user), '[]'::jsonb),
    'personnel', coalesce((select jsonb_agg(to_jsonb(x) order by x.firm, x.name)
      from personnel x where v_admin or x.firm = p_user), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(to_jsonb(o) || jsonb_build_object(
        'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from order_items i where i.order_id = o.id), '[]'::jsonb),
        'shipment', (select jsonb_build_object('id', s.id, 'status', s.status, 'irsaliye_no', s.irsaliye_no)
                     from shipments s where s.order_id = o.id))
        order by o.created_at desc, o.id desc)
      from orders o where v_admin or o.bayi = p_user), '[]'::jsonb)
  );
end $$;

-- İmzalar: {"supplier": teslim eden (bayi), "receiver": teslim alan}
create or replace function public.portal_signature(p_user text, p_pass text, p_id bigint)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare v_role text; v jsonb;
begin
  v_role := _portal_require(p_user, p_pass);
  select jsonb_build_object('supplier', supplier_signature, 'receiver', signature_data) into v
  from shipments where id = p_id and (v_role = 'admin' or supplier = p_user);
  return v;
end $$;

create or replace function public.portal_movements(
  p_user text, p_pass text,
  p_from timestamptz default null, p_to timestamptz default null,
  p_bayi text default null, p_product_id bigint default null,
  p_type text default null, p_shipment_id bigint default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare v_role text;
begin
  v_role := _portal_require(p_user, p_pass);
  return coalesce((
    select jsonb_agg(to_jsonb(m) order by m.created_at desc, m.id desc)
    from (
      select m.* from stock_movements m
      join products p on p.id = m.product_id
      where (v_role = 'admin' or p.allowed_bayi = p_user)
        and (p_bayi is null or p.allowed_bayi = p_bayi)
        and (p_product_id is null or m.product_id = p_product_id)
        and (p_type is null or m.movement_type = p_type)
        and (p_shipment_id is null or m.shipment_id = p_shipment_id)
        and (p_from is null or m.created_at >= p_from)
        and (p_to is null or m.created_at < p_to)
      order by m.created_at desc, m.id desc
      limit 3000
    ) m), '[]'::jsonb);
end $$;

-- Toplu teslimat belgesi: seçili sevkiyatların imzaları ve teslimat sonrası kalan alacak
create or replace function public.portal_doc_data(p_user text, p_pass text, p_ids bigint[])
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare v_role text;
begin
  v_role := _portal_require(p_user, p_pass);
  if coalesce(array_length(p_ids, 1), 0) > 300 then raise exception 'En fazla 300 belge birlikte alınabilir'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id,
      'supplier_sig', s.supplier_signature,
      'receiver_sig', s.signature_data,
      'after', coalesce((
        select jsonb_object_agg(x.product_id::text, x.balance_after)
        from (select distinct on (m.product_id) m.product_id, m.balance_after
              from stock_movements m where m.shipment_id = s.id
              order by m.product_id, m.created_at desc, m.id desc) x), '{}'::jsonb)))
    from shipments s
    where s.id = any(p_ids) and (v_role = 'admin' or s.supplier = p_user)), '[]'::jsonb);
end $$;

-- Mutabakat ekstresi: kalem bazında dönem başı / eklenen / teslim / diğer / dönem sonu
create or replace function public.portal_statement(
  p_user text, p_pass text, p_bayi text, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare v_role text; v_res jsonb;
begin
  v_role := _portal_require(p_user, p_pass);
  if v_role <> 'admin' then p_bayi := p_user; end if;
  if coalesce(p_bayi, '') = '' then raise exception 'Firma seçiniz'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', p.id, 'code', p.code, 'name', p.name, 'unit', p.unit,
      'start', x.st, 'added', x.ad, 'delivered', x.dl, 'end', x.en,
      'other', x.en - x.st - x.ad + x.dl) order by p.name), '[]'::jsonb)
  into v_res
  from products p
  cross join lateral (
    select
      coalesce((select m.balance_after from stock_movements m
                where m.product_id = p.id and p_from is not null and m.created_at < p_from
                order by m.created_at desc, m.id desc limit 1), 0) as st,
      coalesce((select m.balance_after from stock_movements m
                where m.product_id = p.id and (p_to is null or m.created_at < p_to)
                order by m.created_at desc, m.id desc limit 1), 0) as en,
      coalesce((select sum(m.qty) from stock_movements m
                where m.product_id = p.id and m.movement_type in ('Açılış Alacağı', 'Alacak Girişi')
                  and (p_from is null or m.created_at >= p_from) and (p_to is null or m.created_at < p_to)), 0) as ad,
      coalesce((select -sum(m.qty) from stock_movements m
                where m.product_id = p.id and m.movement_type = 'Sevkiyat Teslimi'
                  and (p_from is null or m.created_at >= p_from) and (p_to is null or m.created_at < p_to)), 0) as dl
  ) x
  where p.allowed_bayi = p_bayi;
  return v_res;
end $$;

-- ---------------------------------------------------------------------
-- 7) ÜRÜN LİSTESİ, ALACAK KALEMLERİ, PERSONEL
-- ---------------------------------------------------------------------
create or replace function public.portal_catalog_add(p_user text, p_pass text, p_code text, p_name text)
returns bigint
language plpgsql security definer set search_path = public, extensions
as $$
declare v_id bigint;
begin
  perform _portal_require(p_user, p_pass, true);
  if coalesce(trim(p_code), '') = '' or coalesce(trim(p_name), '') = '' then raise exception 'Ürün kodu ve adı zorunlu'; end if;
  if exists (select 1 from catalog where lower(code) = lower(trim(p_code))) then raise exception 'Bu ürün kodu zaten var'; end if;
  if exists (select 1 from catalog where lower(name) = lower(trim(p_name))) then raise exception 'Bu ürün adı zaten var'; end if;
  insert into catalog (code, name) values (trim(p_code), trim(p_name)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.portal_catalog_update(p_user text, p_pass text, p_id bigint, p_code text, p_name text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform _portal_require(p_user, p_pass, true);
  if not exists (select 1 from catalog where id = p_id) then raise exception 'Ürün bulunamadı'; end if;
  if coalesce(trim(p_code), '') = '' or coalesce(trim(p_name), '') = '' then raise exception 'Ürün kodu ve adı zorunlu'; end if;
  if exists (select 1 from catalog where id <> p_id and lower(code) = lower(trim(p_code))) then raise exception 'Bu ürün kodu zaten var'; end if;
  if exists (select 1 from catalog where id <> p_id and lower(name) = lower(trim(p_name))) then raise exception 'Bu ürün adı zaten var'; end if;
  update catalog set code = trim(p_code), name = trim(p_name) where id = p_id;
  update products set code = trim(p_code), name = trim(p_name) where catalog_id = p_id;
  update order_items set code = trim(p_code), product_name = trim(p_name)
  where product_id in (select id from products where catalog_id = p_id);
  update shipment_items set code = trim(p_code), product_name = trim(p_name)
  where product_id in (select id from products where catalog_id = p_id);
end $$;

create or replace function public.portal_catalog_delete(p_user text, p_pass text, p_id bigint)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare v_list text;
begin
  perform _portal_require(p_user, p_pass, true);
  select string_agg(distinct allowed_bayi, ', ') into v_list from products where catalog_id = p_id;
  if v_list is not null then
    raise exception 'Bu ürün alacak listesinde kullanılıyor (%). Önce o alacak kalemlerini silin.', v_list;
  end if;
  delete from catalog where id = p_id;
end $$;

create or replace function public.portal_add_product(
  p_user text, p_pass text, p_bayi text, p_catalog_id bigint, p_critical numeric, p_opening numeric)
returns bigint
language plpgsql security definer set search_path = public, extensions
as $$
declare v_id bigint; c catalog;
begin
  perform _portal_require(p_user, p_pass, true);
  if not exists (select 1 from portal_users where name = p_bayi and role = 'bayi') then raise exception 'Firma bulunamadı'; end if;
  select * into c from catalog where id = p_catalog_id;
  if not found then raise exception 'Ürün bulunamadı'; end if;
  if coalesce(p_opening, 0) < 0 then raise exception 'Başlangıç alacağı eksi olamaz'; end if;
  if exists (select 1 from products where allowed_bayi = p_bayi and (catalog_id = c.id or lower(name) = lower(c.name))) then
    raise exception 'Bu ürün bu firmanın alacak listesinde zaten var';
  end if;
  insert into products (catalog_id, code, name, unit, qty, critical, allowed_bayi)
  values (c.id, c.code, c.name, 'Litre', 0, coalesce(p_critical, 0), p_bayi)
  returning id into v_id;
  if coalesce(p_opening, 0) > 0 then
    perform _portal_move(v_id, 'Açılış Alacağı', p_opening, null, null, 'Başlangıç alacağı', p_user);
  end if;
  return v_id;
end $$;

create or replace function public.portal_update_product(p_user text, p_pass text, p_id bigint, p_critical numeric)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform _portal_require(p_user, p_pass, true);
  update products set critical = coalesce(p_critical, 0) where id = p_id;
  if not found then raise exception 'Alacak kalemi bulunamadı'; end if;
end $$;

create or replace function public.portal_delete_product(p_user text, p_pass text, p_id bigint)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare v_n int;
begin
  perform _portal_require(p_user, p_pass, true);
  select count(distinct shipment_id) into v_n from shipment_items where product_id = p_id;
  if v_n = 0 and exists (select 1 from order_items where product_id = p_id) then
    raise exception 'Bu kalem bir siparişte kullanılıyor, önce siparişi silin';
  end if;
  if v_n > 0 then
    raise exception 'Bu kaleme ait % sevkiyat kaydı var, kalem silinemez. Kalan alacağı sıfırlamak için "Alacak Düş" kullanın.', v_n;
  end if;
  delete from products where id = p_id;   -- hareketleri de silinir
  if not found then raise exception 'Alacak kalemi bulunamadı'; end if;
end $$;

create or replace function public.portal_adjust_receivable(
  p_user text, p_pass text, p_product_id bigint, p_qty numeric, p_note text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform _portal_require(p_user, p_pass, true);
  if coalesce(p_qty, 0) = 0 then raise exception 'Miktar sıfır olamaz'; end if;
  perform _portal_move(p_product_id,
    case when p_qty > 0 then 'Alacak Girişi' else 'Alacak Düşümü' end,
    p_qty, null, null, p_note, p_user);
end $$;

create or replace function public.portal_personnel_add(p_user text, p_pass text, p_firm text, p_name text)
returns bigint
language plpgsql security definer set search_path = public, extensions
as $$
declare v_id bigint;
begin
  perform _portal_require(p_user, p_pass, true);
  if not exists (select 1 from portal_users where name = p_firm) then raise exception 'Firma bulunamadı'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Personel adı boş olamaz'; end if;
  if exists (select 1 from personnel where firm = p_firm and lower(name) = lower(trim(p_name))) then
    raise exception 'Bu isim zaten listede';
  end if;
  insert into personnel (firm, name) values (p_firm, trim(p_name)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.portal_personnel_delete(p_user text, p_pass text, p_id bigint)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform _portal_require(p_user, p_pass, true);
  delete from personnel where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- 8) SEVKİYATLAR
-- p_items: [{"product_id":1,"qty":100}, ...]
-- (onaylı kaydı düzenlerken ayrıca "received_qty" ve "note")
-- ---------------------------------------------------------------------
create or replace function public.portal_create_shipment(
  p_user text, p_pass text, p_irsaliye text, p_prepared_by text, p_items jsonb, p_signature text,
  p_order_id bigint default null)
returns bigint
language plpgsql security definer set search_path = public, extensions
as $$
declare v_role text; v_sup text; v_id bigint; o orders;
begin
  v_role := _portal_require(p_user, p_pass);
  if coalesce(trim(p_irsaliye), '') = '' then raise exception 'İrsaliye numarası zorunlu'; end if;
  if coalesce(trim(p_prepared_by), '') = '' then raise exception 'İrsaliyeyi düzenleyen kişiyi seçin veya yazın'; end if;
  if coalesce(p_signature, '') = '' then raise exception 'Teslim eden imzası gerekli'; end if;
  v_sup := _portal_check_items(p_items, p_user, v_role);
  perform _portal_check_irsaliye(v_sup, p_irsaliye, null);
  if p_order_id is not null then
    select * into o from orders where id = p_order_id for update;
    if not found then raise exception 'Sipariş bulunamadı'; end if;
    if o.bayi <> v_sup then raise exception 'Sipariş bu firmaya ait değil'; end if;
    if o.cancelled then raise exception 'Bu sipariş iptal edilmiş'; end if;
    if exists (select 1 from shipments where order_id = p_order_id) then
      raise exception 'Bu sipariş zaten sevkiyata dönüştürülmüş';
    end if;
  end if;
  insert into shipments (irsaliye_no, supplier, status, prepared_by, supplier_signature, order_id)
  values (trim(p_irsaliye), v_sup, 'Bekliyor', trim(p_prepared_by), p_signature, p_order_id)
  returning id into v_id;
  insert into shipment_items (shipment_id, product_id, product_name, code, unit, qty)
    select v_id, p.id, p.name, p.code, p.unit, x.qty
    from rows from (jsonb_to_recordset(p_items) as (product_id bigint, qty numeric)) with ordinality as x(product_id, qty, ord)
    join products p on p.id = x.product_id
    order by x.ord;
  return v_id;
end $$;

-- Düzenleme: bayi kendi bekleyen kaydını, yönetici her kaydı düzenler.
-- Teslim alınmış kayıtta gelen miktar farkı alacağa otomatik yansır.
create or replace function public.portal_update_shipment(
  p_user text, p_pass text, p_id bigint, p_irsaliye text, p_prepared_by text, p_items jsonb)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare v_role text; v_sup text; s shipments; v_approved boolean; r record;
begin
  v_role := _portal_require(p_user, p_pass);
  select * into s from shipments where id = p_id for update;
  if not found then raise exception 'Sevkiyat bulunamadı'; end if;
  v_approved := s.status <> 'Bekliyor';
  if v_role <> 'admin' then
    if s.supplier <> p_user then raise exception 'Bu sevkiyat size ait değil'; end if;
    if v_approved then raise exception 'Teslim alınmış sevkiyatı sadece Yıldız Kumlama Boya düzenleyebilir'; end if;
  end if;
  if coalesce(trim(p_irsaliye), '') = '' then raise exception 'İrsaliye numarası zorunlu'; end if;
  if coalesce(trim(p_prepared_by), '') = '' then raise exception 'İrsaliyeyi düzenleyen kişiyi seçin veya yazın'; end if;
  v_sup := _portal_check_items(p_items, p_user, v_role);
  if v_sup <> s.supplier then raise exception 'Ürünler bu sevkiyatın firmasına (%) ait olmalı', s.supplier; end if;
  if lower(trim(p_irsaliye)) <> lower(trim(s.irsaliye_no)) then
    perform _portal_check_irsaliye(s.supplier, p_irsaliye, p_id);
  end if;

  if v_approved then
    for r in
      with o as (select product_id, sum(coalesce(received_qty, 0)) as q
                 from shipment_items where shipment_id = p_id group by product_id),
           n as (select x.product_id, sum(coalesce(x.received_qty, x.qty)) as q
                 from jsonb_to_recordset(p_items) as x(product_id bigint, qty numeric, received_qty numeric)
                 group by x.product_id)
      select coalesce(o.product_id, n.product_id) as pid, coalesce(o.q, 0) - coalesce(n.q, 0) as d
      from o full join n on o.product_id = n.product_id
    loop
      if r.pid is not null and r.d <> 0 then
        perform _portal_move(r.pid, 'Düzeltme', r.d, p_id, null,
          format('İrsaliye %s düzenlendi', trim(p_irsaliye)), p_user);
      end if;
    end loop;
  end if;

  delete from shipment_items where shipment_id = p_id;
  insert into shipment_items (shipment_id, product_id, product_name, code, unit, qty, received_qty, note)
    select p_id, p.id, p.name, p.code, p.unit, x.qty,
           case when v_approved then coalesce(x.received_qty, x.qty) end,
           case when v_approved then nullif(trim(x.note), '') end
    from rows from (jsonb_to_recordset(p_items) as (product_id bigint, qty numeric, received_qty numeric, note text))
         with ordinality as x(product_id, qty, received_qty, note, ord)
    join products p on p.id = x.product_id
    order by x.ord;

  update shipments set irsaliye_no = trim(p_irsaliye), prepared_by = trim(p_prepared_by),
         updated_at = now(), updated_by = p_user
  where id = p_id;
end $$;

-- Silme: bayi kendi bekleyen kaydını, yönetici her kaydı siler.
create or replace function public.portal_delete_shipment(p_user text, p_pass text, p_id bigint)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare v_role text; s shipments; r record;
begin
  v_role := _portal_require(p_user, p_pass);
  select * into s from shipments where id = p_id for update;
  if not found then raise exception 'Sevkiyat bulunamadı'; end if;
  if v_role <> 'admin' then
    if s.supplier <> p_user then raise exception 'Bu sevkiyat size ait değil'; end if;
    if s.status <> 'Bekliyor' then raise exception 'Teslim alınmış sevkiyatı sadece Yıldız Kumlama Boya silebilir'; end if;
  end if;
  if s.status <> 'Bekliyor' then
    for r in select * from shipment_items where shipment_id = p_id and product_id is not null and received_qty > 0 order by id loop
      perform _portal_move(r.product_id, 'Sevkiyat İptali', r.received_qty, p_id, null,
        format('İrsaliye %s silindi', s.irsaliye_no), p_user);
    end loop;
  end if;
  delete from shipments where id = p_id;
end $$;

-- Teslim al: gelen miktar (varsayılan bildirilen) alacaktan düşer
-- p_items: [{"item_id":5,"received_qty":95,"note":"1 bidon hasarlı"}]
create or replace function public.portal_approve_shipment(
  p_user text, p_pass text, p_id bigint, p_signature text,
  p_received_by text, p_note text, p_items jsonb default '[]'::jsonb)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare s shipments; r record;
begin
  perform _portal_require(p_user, p_pass, true);
  select * into s from shipments where id = p_id for update;
  if not found then raise exception 'Sevkiyat bulunamadı'; end if;
  if s.status <> 'Bekliyor' then raise exception 'Bu sevkiyat zaten teslim alınmış'; end if;
  if coalesce(p_signature, '') = '' then raise exception 'İmza gerekli'; end if;
  if coalesce(trim(p_received_by), '') = '' then raise exception 'Teslim alan kişiyi seçin veya yazın'; end if;
  if exists (select 1 from shipment_items where shipment_id = p_id and product_id is null) then
    raise exception 'Sevkiyatta tanımsız ürün var, önce düzenleyin';
  end if;
  if exists (select 1 from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(received_qty numeric)
             where x.received_qty < 0) then
    raise exception 'Teslim alınan miktar eksi olamaz';
  end if;

  update shipment_items set received_qty = qty, note = null where shipment_id = p_id;
  update shipment_items i set received_qty = x.received_qty, note = nullif(trim(x.note), '')
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(item_id bigint, received_qty numeric, note text)
  where i.id = x.item_id and i.shipment_id = p_id and x.received_qty is not null;

  update shipments set status = 'Teslim Alındı (Onaylı)', signature_data = p_signature,
         received_by = trim(p_received_by), approve_note = nullif(trim(p_note), ''),
         approved_at = now(), approved_by = p_user
  where id = p_id;

  for r in select * from shipment_items where shipment_id = p_id and received_qty > 0 order by id loop
    perform _portal_move(r.product_id, 'Sevkiyat Teslimi', -r.received_qty, p_id, null,
      'İrsaliye ' || s.irsaliye_no
        || case when r.received_qty <> r.qty
                then format(' (bildirilen %s, gelen %s)', trim_scale(r.qty), trim_scale(r.received_qty)) else '' end
        || coalesce(' - ' || r.note, ''),
      p_user);
  end loop;
end $$;

-- Onayı geri al: teslim alınan miktar alacağa geri eklenir, bayi tekrar düzenleyebilir
create or replace function public.portal_unapprove_shipment(p_user text, p_pass text, p_id bigint, p_reason text default null)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare s shipments; r record;
begin
  perform _portal_require(p_user, p_pass, true);
  select * into s from shipments where id = p_id for update;
  if not found then raise exception 'Sevkiyat bulunamadı'; end if;
  if s.status = 'Bekliyor' then raise exception 'Bu sevkiyat zaten onay bekliyor'; end if;
  for r in select * from shipment_items where shipment_id = p_id and product_id is not null and received_qty > 0 order by id loop
    perform _portal_move(r.product_id, 'Onay İptali', r.received_qty, p_id, null,
      'İrsaliye ' || s.irsaliye_no || ' onayı geri alındı' || coalesce(' - ' || nullif(trim(p_reason), ''), ''), p_user);
  end loop;
  update shipment_items set received_qty = null, note = null where shipment_id = p_id;
  update shipments set status = 'Bekliyor', signature_data = null, received_by = null, approve_note = null,
         approved_at = null, approved_by = null, updated_at = now(), updated_by = p_user
  where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- 8b) SİPARİŞLER (Yıldız Kumlama Boya → bayi). Durum: iptal / sevkiyata
-- dönüştü (bağlı sevkiyat var) / açık. Bağlı sevkiyat silinirse sipariş
-- tekrar açık olur.
-- ---------------------------------------------------------------------
create or replace function public._portal_order_open(p_id bigint)
returns orders
language plpgsql security definer set search_path = public
as $$
declare o orders;
begin
  select * into o from orders where id = p_id for update;
  if not found then raise exception 'Sipariş bulunamadı'; end if;
  if exists (select 1 from shipments where order_id = p_id) then
    raise exception 'Sevkiyata dönüşmüş sipariş değiştirilemez';
  end if;
  return o;
end $$;

create or replace function public.portal_order_create(
  p_user text, p_pass text, p_bayi text, p_note text, p_due_date date, p_items jsonb)
returns bigint
language plpgsql security definer set search_path = public, extensions
as $$
declare v_id bigint;
begin
  perform _portal_require(p_user, p_pass, true);
  if _portal_check_items(p_items, p_user, 'admin') <> p_bayi then raise exception 'Ürünler seçilen firmaya ait olmalı'; end if;
  insert into orders (bayi, note, due_date, created_by)
  values (p_bayi, nullif(trim(p_note), ''), p_due_date, p_user)
  returning id into v_id;
  insert into order_items (order_id, product_id, product_name, code, unit, qty)
    select v_id, p.id, p.name, p.code, p.unit, x.qty
    from rows from (jsonb_to_recordset(p_items) as (product_id bigint, qty numeric)) with ordinality as x(product_id, qty, ord)
    join products p on p.id = x.product_id
    order by x.ord;
  return v_id;
end $$;

create or replace function public.portal_order_update(
  p_user text, p_pass text, p_id bigint, p_note text, p_due_date date, p_items jsonb)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare o orders;
begin
  perform _portal_require(p_user, p_pass, true);
  o := _portal_order_open(p_id);
  if _portal_check_items(p_items, p_user, 'admin') <> o.bayi then raise exception 'Ürünler siparişin firmasına (%) ait olmalı', o.bayi; end if;
  delete from order_items where order_id = p_id;
  insert into order_items (order_id, product_id, product_name, code, unit, qty)
    select p_id, p.id, p.name, p.code, p.unit, x.qty
    from rows from (jsonb_to_recordset(p_items) as (product_id bigint, qty numeric)) with ordinality as x(product_id, qty, ord)
    join products p on p.id = x.product_id
    order by x.ord;
  update orders set note = nullif(trim(p_note), ''), due_date = p_due_date, updated_at = now(), updated_by = p_user
  where id = p_id;
end $$;

create or replace function public.portal_order_cancel(p_user text, p_pass text, p_id bigint, p_cancel boolean)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform _portal_require(p_user, p_pass, true);
  perform _portal_order_open(p_id);
  update orders set cancelled = coalesce(p_cancel, true), updated_at = now(), updated_by = p_user where id = p_id;
end $$;

create or replace function public.portal_order_delete(p_user text, p_pass text, p_id bigint)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform _portal_require(p_user, p_pass, true);
  perform _portal_order_open(p_id);
  delete from orders where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- 9) YEDEKLEME
-- ---------------------------------------------------------------------
create or replace function public.portal_admin_backup_create(p_user text, p_pass text, p_note text)
returns bigint
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform _portal_require(p_user, p_pass, true);
  return _portal_backup('manuel', nullif(trim(p_note), ''), p_user);
end $$;

create or replace function public.portal_admin_backup_list(p_user text, p_pass text)
returns table(id bigint, kind text, note text, created_by text, created_at timestamptz,
              product_count int, shipment_count int, movement_count int, size_kb int)
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform _portal_require(p_user, p_pass, true);
  return query
    select b.id, b.kind, b.note, b.created_by, b.created_at,
           jsonb_array_length(coalesce(b.data->'products', '[]'::jsonb)),
           jsonb_array_length(coalesce(b.data->'shipments', '[]'::jsonb)),
           jsonb_array_length(coalesce(b.data->'stock_movements', '[]'::jsonb)),
           greatest(1, octet_length(b.data::text) / 1024)
    from backups b
    order by b.id desc;
end $$;

create or replace function public.portal_admin_backup_get(p_user text, p_pass text, p_id bigint)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare v jsonb;
begin
  perform _portal_require(p_user, p_pass, true);
  select data into v from backups where id = p_id;
  if v is null then raise exception 'Yedek bulunamadı'; end if;
  return v;
end $$;

create or replace function public.portal_admin_backup_restore(p_user text, p_pass text, p_id bigint)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare v jsonb;
begin
  perform _portal_require(p_user, p_pass, true);
  select data into v from backups where id = p_id;
  if v is null then raise exception 'Yedek bulunamadı'; end if;
  perform _portal_restore(v, p_user);
end $$;

create or replace function public.portal_admin_backup_restore_json(p_user text, p_pass text, p_data jsonb)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform _portal_require(p_user, p_pass, true);
  perform _portal_restore(p_data, p_user);
end $$;

create or replace function public.portal_admin_backup_delete(p_user text, p_pass text, p_id bigint)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform _portal_require(p_user, p_pass, true);
  delete from backups where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- 9b) İŞLEM GEÇMİŞİ
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor text,
  tbl text not null,
  op text not null,
  rec_id bigint,
  firm text,
  info jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
alter table public.audit_log enable row level security;
do $$ begin
  execute 'revoke all on table public.audit_log from anon, authenticated';
exception when undefined_object then null; end $$;

-- Islemi yapan kullanici, oturum kontrolunde islem boyunca hatirlanir
create or replace function public._portal_require(p_name text, p_pass text, p_admin boolean default false)
returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare v_role text;
begin
  v_role := _portal_auth(p_name, p_pass);
  if v_role is null then raise exception 'Oturum geçersiz, lütfen yeniden giriş yapın'; end if;
  if p_admin and v_role <> 'admin' then raise exception 'Bu işlem için yönetici yetkisi gerekir'; end if;
  perform set_config('portal.user', p_name, true);
  return v_role;
end $$;

create or replace function public._portal_audit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_actor text := nullif(current_setting('portal.user', true), '');
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_row jsonb;
  v_chg jsonb := '{}'::jsonb;
  k text;
begin
  if current_setting('portal.bulk', true) = '1' then return null; end if;
  v_row := coalesce(v_new, v_old) - 'signature_data' - 'supplier_signature' - 'pass_hash' - 'data';

  if tg_table_name = 'backups' then
    if v_new->>'kind' = 'geri-yukleme-oncesi' then
      perform set_config('portal.bulk', '1', true);   -- geri yuklemenin toplu silme/eklemeleri tek kayit olsun
      insert into audit_log (actor, tbl, op, info) values (v_actor, 'backups', 'RESTORE', '{}'::jsonb);
      return null;
    elsif v_new->>'kind' <> 'manuel' then
      return null;
    end if;
  elsif tg_table_name = 'stock_movements' then
    if v_new->>'movement_type' not in ('Alacak Girişi', 'Alacak Düşümü') then return null; end if;
    v_row := v_row || jsonb_build_object('product_name', (select name from products where id = (v_new->>'product_id')::bigint));
  elsif tg_table_name = 'portal_users' and tg_op = 'UPDATE' then
    if old.pass_hash is not distinct from new.pass_hash and old.active = new.active then return null; end if;
    v_chg := jsonb_build_object('pass_changed', old.pass_hash is distinct from new.pass_hash,
                                'active', jsonb_build_array(old.active, new.active));
    v_actor := coalesce(v_actor, new.name);
  elsif tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if k in ('signature_data', 'supplier_signature', 'pass_hash', 'data', 'qty') then continue; end if;
      if v_new->k is distinct from v_old->k then
        v_chg := v_chg || jsonb_build_object(k, jsonb_build_array(v_old->k, v_new->k));
      end if;
    end loop;
    if v_chg = '{}'::jsonb then return null; end if;
  end if;

  insert into audit_log (actor, tbl, op, rec_id, firm, info)
  values (v_actor, tg_table_name, tg_op, (v_row->>'id')::bigint,
          coalesce(v_row->>'supplier', v_row->>'bayi', v_row->>'allowed_bayi', v_row->>'firm',
                   case when tg_table_name = 'portal_users' then v_row->>'name' end),
          jsonb_build_object('row', v_row, 'changes', v_chg));
  return null;
end $$;

do $$
declare t text; ev text;
begin
  for t, ev in values
    ('shipments', 'insert or update or delete'), ('orders', 'insert or update or delete'),
    ('catalog', 'insert or update or delete'), ('personnel', 'insert or delete'),
    ('products', 'insert or delete'), ('stock_movements', 'insert'),
    ('portal_users', 'insert or update'), ('backups', 'insert')
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after %s on public.%I for each row execute function public._portal_audit()', t || '_audit', ev, t);
  end loop;
end $$;

create or replace function public.portal_audit_list(
  p_user text, p_pass text, p_from timestamptz default null, p_to timestamptz default null,
  p_firm text default null, p_limit int default 500)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform _portal_require(p_user, p_pass, true);
  return coalesce((
    select jsonb_agg(to_jsonb(a) order by a.created_at desc, a.id desc)
    from (select * from audit_log
          where (p_from is null or created_at >= p_from)
            and (p_to is null or created_at < p_to)
            and (p_firm is null or firm = p_firm)
          order by created_at desc, id desc
          limit least(greatest(coalesce(p_limit, 500), 1), 2000)) a), '[]'::jsonb);
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('_portal_require', '_portal_audit', 'portal_audit_list')
  loop
    execute format('revoke all on function %s from public', f.sig);
    begin
      execute format('revoke all on function %s from anon, authenticated', f.sig);
      if f.proname = 'portal_audit_list' then
        execute format('grant execute on function %s to anon, authenticated', f.sig);
      end if;
    exception when undefined_object then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 9c) TENEKE + FİRMA LOGOSU
-- ---------------------------------------------------------------------
alter table public.catalog add column if not exists pack_size numeric;
alter table public.portal_users add column if not exists logo jsonb;

drop function if exists public.portal_catalog_add(text, text, text, text);
drop function if exists public.portal_catalog_update(text, text, bigint, text, text);

create or replace function public.portal_catalog_add(p_user text, p_pass text, p_code text, p_name text, p_pack numeric default null)
returns bigint
language plpgsql security definer set search_path = public, extensions
as $$
declare v_id bigint;
begin
  perform _portal_require(p_user, p_pass, true);
  if coalesce(trim(p_code), '') = '' or coalesce(trim(p_name), '') = '' then raise exception 'Ürün kodu ve adı zorunlu'; end if;
  if p_pack is not null and p_pack < 0 then raise exception 'Teneke litresi geçersiz'; end if;
  if exists (select 1 from catalog where lower(code) = lower(trim(p_code))) then raise exception 'Bu ürün kodu zaten var'; end if;
  if exists (select 1 from catalog where lower(name) = lower(trim(p_name))) then raise exception 'Bu ürün adı zaten var'; end if;
  insert into catalog (code, name, pack_size) values (trim(p_code), trim(p_name), nullif(p_pack, 0)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.portal_catalog_update(p_user text, p_pass text, p_id bigint, p_code text, p_name text, p_pack numeric default null)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform _portal_require(p_user, p_pass, true);
  if not exists (select 1 from catalog where id = p_id) then raise exception 'Ürün bulunamadı'; end if;
  if coalesce(trim(p_code), '') = '' or coalesce(trim(p_name), '') = '' then raise exception 'Ürün kodu ve adı zorunlu'; end if;
  if p_pack is not null and p_pack < 0 then raise exception 'Teneke litresi geçersiz'; end if;
  if exists (select 1 from catalog where id <> p_id and lower(code) = lower(trim(p_code))) then raise exception 'Bu ürün kodu zaten var'; end if;
  if exists (select 1 from catalog where id <> p_id and lower(name) = lower(trim(p_name))) then raise exception 'Bu ürün adı zaten var'; end if;
  update catalog set code = trim(p_code), name = trim(p_name), pack_size = nullif(p_pack, 0) where id = p_id;
  update products set code = trim(p_code), name = trim(p_name) where catalog_id = p_id;
  update order_items set code = trim(p_code), product_name = trim(p_name)
  where product_id in (select id from products where catalog_id = p_id);
  update shipment_items set code = trim(p_code), product_name = trim(p_name)
  where product_id in (select id from products where catalog_id = p_id);
end $$;

-- Teneke litreleri (kalem bazinda) ve firma logolari
create or replace function public.portal_meta(p_user text, p_pass text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare v_admin boolean;
begin
  v_admin := _portal_require(p_user, p_pass) = 'admin';
  return jsonb_build_object(
    'packs', coalesce((select jsonb_object_agg(p.id::text, c.pack_size)
      from products p join catalog c on c.id = p.catalog_id
      where c.pack_size is not null and (v_admin or p.allowed_bayi = p_user)), '{}'::jsonb),
    'logos', coalesce((select jsonb_object_agg(u.name, u.logo) from portal_users u
      where u.logo is not null and (v_admin or u.name = p_user or u.role = 'admin')), '{}'::jsonb));
end $$;

create or replace function public.portal_admin_set_logo(p_user text, p_pass text, p_name text, p_logo jsonb)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform _portal_require(p_user, p_pass, true);
  if p_logo is not null and (jsonb_typeof(p_logo) <> 'object' or coalesce(p_logo->>'src', '') not like 'data:image/%') then
    raise exception 'Geçersiz logo';
  end if;
  if p_logo is not null and length(p_logo->>'src') > 400000 then raise exception 'Logo çok büyük'; end if;
  update portal_users set logo = p_logo where name = p_name;
  if not found then raise exception 'Firma bulunamadı'; end if;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('portal_catalog_add', 'portal_catalog_update', 'portal_meta', 'portal_admin_set_logo')
  loop
    execute format('revoke all on function %s from public', f.sig);
    begin
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    exception when undefined_object then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 10) YETKİLER: yardımcı fonksiyonlar kapalı, portal_* açık
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like '\_portal\_%' or p.proname like 'portal\_%')
  loop
    execute format('revoke all on function %s from public', f.sig);
    begin
      execute format('revoke all on function %s from anon, authenticated', f.sig);
      if f.proname like 'portal\_%' then
        execute format('grant execute on function %s to anon, authenticated', f.sig);
      end if;
    exception when undefined_object then null;
    end;
  end loop;
end $$;
