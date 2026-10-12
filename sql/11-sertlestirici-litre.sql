-- 11 SEVKIYAT/SIPARISTE SERTLESTIRICI LITRESI AYRI (04'ten sonra calistirin). Tekrar calistirmak guvenlidir.
-- qty = boya + sertlestirici (emanetten bu toplam duser), hardener_qty = bunun sertlestirici kismi.
alter table public.shipment_items add column if not exists hardener_qty numeric check (hardener_qty >= 0);
alter table public.order_items add column if not exists hardener_qty numeric check (hardener_qty >= 0);
alter table public.shipment_items add column if not exists no_hardener boolean not null default false;

create or replace function public._portal_item_flags(p_sid bigint, p_items jsonb)
returns void
language sql security definer set search_path = public
as $$
  update shipment_items si
     set no_hardener = coalesce(x.no_hardener, false),
         hardener_qty = case when x.hardener_qty is null then null else least(greatest(x.hardener_qty, 0), si.qty) end
  from jsonb_to_recordset(p_items) as x(product_id bigint, no_hardener boolean, hardener_qty numeric)
  where si.shipment_id = p_sid and si.product_id = x.product_id;
$$;

create or replace function public._portal_order_item_hard(p_oid bigint, p_items jsonb)
returns void
language sql security definer set search_path = public
as $$
  update order_items oi
     set hardener_qty = case when x.hardener_qty is null then null else least(greatest(x.hardener_qty, 0), oi.qty) end
  from jsonb_to_recordset(p_items) as x(product_id bigint, hardener_qty numeric)
  where oi.order_id = p_oid and oi.product_id = x.product_id;
$$;

create or replace function public.portal_order_create_v2(
  p_user text, p_pass text, p_bayi text, p_note text, p_due_date date, p_items jsonb)
returns bigint
language plpgsql security definer set search_path = public, extensions
as $$
declare v_id bigint;
begin
  v_id := portal_order_create(p_user, p_pass, p_bayi, p_note, p_due_date, p_items);
  perform _portal_order_item_hard(v_id, p_items);
  return v_id;
end $$;

create or replace function public.portal_order_update_v2(
  p_user text, p_pass text, p_id bigint, p_note text, p_due_date date, p_items jsonb)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform portal_order_update(p_user, p_pass, p_id, p_note, p_due_date, p_items);
  perform _portal_order_item_hard(p_id, p_items);
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('_portal_item_flags', '_portal_order_item_hard', 'portal_order_create_v2', 'portal_order_update_v2')
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
