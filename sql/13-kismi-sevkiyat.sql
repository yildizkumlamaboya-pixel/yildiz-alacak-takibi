-- 13 KISMI SEVKIYAT: bir siparis birden fazla sevkiyatla tamamlanabilir. Tekrar calistirmak guvenlidir.
drop index if exists public.shipments_order_uq;
create index if not exists shipments_order_idx on public.shipments (order_id);

-- Siparisin sevk edilmeyen kalani var mi? (gelen miktar, yoksa bildirilen miktar sayilir)
create or replace function public._portal_order_remaining(p_order_id bigint)
returns numeric
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(greatest(oi.qty - coalesce((
           select sum(coalesce(si.received_qty, si.qty)) from shipment_items si
           join shipments s on s.id = si.shipment_id
           where s.order_id = p_order_id and si.product_id = oi.product_id), 0), 0)), 0)
  from order_items oi where oi.order_id = p_order_id;
$$;

create or replace function public.portal_create_shipment(
  p_user text, p_pass text, p_irsaliye text, p_prepared_by text, p_items jsonb, p_signature text,
  p_order_id bigint default null)
returns bigint
language plpgsql security definer set search_path = public, extensions
as $$
#variable_conflict use_variable
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
    if _portal_order_remaining(p_order_id) <= 0 then
      raise exception 'Bu siparişin tamamı zaten sevk edilmiş';
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

-- Kismen sevk edilmis siparisin kalani iptal edilebilir (tamamlanmis siparis iptal edilemez)
create or replace function public.portal_order_cancel(p_user text, p_pass text, p_id bigint, p_cancel boolean)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
#variable_conflict use_variable
begin
  perform _portal_require(p_user, p_pass, true);
  if not exists (select 1 from orders where id = p_id) then raise exception 'Sipariş bulunamadı'; end if;
  if exists (select 1 from shipments where order_id = p_id) and _portal_order_remaining(p_id) <= 0 then
    raise exception 'Tamamı sevk edilmiş sipariş iptal edilemez';
  end if;
  update orders set cancelled = coalesce(p_cancel, true), updated_at = now(), updated_by = p_user where id = p_id;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('_portal_order_remaining', 'portal_create_shipment', 'portal_order_cancel')
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

notify pgrst, 'reload schema';
