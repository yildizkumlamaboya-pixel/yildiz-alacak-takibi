-- 10 URUN EKLE/DUZENLE DUZELTME ("column reference p_pack is ambiguous" hatasi)
-- Tekrar calistirmak guvenlidir.
create or replace function public.portal_catalog_add(p_user text, p_pass text, p_code text, p_name text, p_pack numeric default null, p_hard numeric default null)
returns bigint
language plpgsql security definer set search_path = public, extensions
as $$
#variable_conflict use_variable
declare v_id bigint;
begin
  perform _portal_require(p_user, p_pass, true);
  if coalesce(trim(p_code), '') = '' or coalesce(trim(p_name), '') = '' then raise exception 'Ürün kodu ve adı zorunlu'; end if;
  if p_pack is not null and p_pack < 0 then raise exception 'Teneke litresi geçersiz'; end if;
  if p_hard is not null and p_hard < 0 then raise exception 'Sertleştirici litresi geçersiz'; end if;
  if coalesce(p_hard, 0) > 0 and coalesce(p_pack, 0) = 0 then raise exception 'Sertleştirici için önce teneke litresini girin'; end if;
  if exists (select 1 from catalog where lower(code) = lower(trim(p_code))) then raise exception 'Bu ürün kodu zaten var'; end if;
  if exists (select 1 from catalog where lower(name) = lower(trim(p_name))) then raise exception 'Bu ürün adı zaten var'; end if;
  insert into catalog (code, name, pack_size, hardener_size) values (trim(p_code), trim(p_name), nullif(p_pack, 0), p_hard) returning id into v_id;
  return v_id;
end $$;

create or replace function public.portal_catalog_update(p_user text, p_pass text, p_id bigint, p_code text, p_name text, p_pack numeric default null, p_hard numeric default null)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
#variable_conflict use_variable
begin
  perform _portal_require(p_user, p_pass, true);
  if not exists (select 1 from catalog where id = p_id) then raise exception 'Ürün bulunamadı'; end if;
  if coalesce(trim(p_code), '') = '' or coalesce(trim(p_name), '') = '' then raise exception 'Ürün kodu ve adı zorunlu'; end if;
  if p_pack is not null and p_pack < 0 then raise exception 'Teneke litresi geçersiz'; end if;
  if p_hard is not null and p_hard < 0 then raise exception 'Sertleştirici litresi geçersiz'; end if;
  if coalesce(p_hard, 0) > 0 and coalesce(p_pack, 0) = 0 then raise exception 'Sertleştirici için önce teneke litresini girin'; end if;
  if exists (select 1 from catalog where id <> p_id and lower(code) = lower(trim(p_code))) then raise exception 'Bu ürün kodu zaten var'; end if;
  if exists (select 1 from catalog where id <> p_id and lower(name) = lower(trim(p_name))) then raise exception 'Bu ürün adı zaten var'; end if;
  update catalog set code = trim(p_code), name = trim(p_name), pack_size = nullif(p_pack, 0), hardener_size = p_hard where id = p_id;
  update products set code = trim(p_code), name = trim(p_name) where catalog_id = p_id;
  update order_items set code = trim(p_code), product_name = trim(p_name)
  where product_id in (select id from products where catalog_id = p_id);
  update shipment_items set code = trim(p_code), product_name = trim(p_name)
  where product_id in (select id from products where catalog_id = p_id);
end $$;


-- Bilgi: tablolarda 'p_' ile baslayan sutun var mi? (hatanin kaynagi)
select table_name, column_name from information_schema.columns
where table_schema = 'public' and column_name like 'p\_%';

notify pgrst, 'reload schema';
