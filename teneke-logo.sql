-- TENEKE + FIRMA LOGOSU (v11) - Supabase SQL Editor'de bir kez calistirin. Tekrar calistirmak guvenlidir.
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
