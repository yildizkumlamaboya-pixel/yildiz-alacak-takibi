-- 04 SEVKIYATTA SERTLESTIRICISIZ ISARETI - 2. PARCA (once 1. parcayi calistirin)
-- Sevkiyat kaleminde "Sertlestiricisiz" isareti (teneke sayisi sadece teneke litresine bolunur)
alter table public.shipment_items add column if not exists no_hardener boolean not null default false;

create or replace function public._portal_item_flags(p_sid bigint, p_items jsonb)
returns void
language sql security definer set search_path = public
as $$
  update shipment_items si set no_hardener = coalesce(x.no_hardener, false)
  from jsonb_to_recordset(p_items) as x(product_id bigint, no_hardener boolean)
  where si.shipment_id = p_sid and si.product_id = x.product_id;
$$;

create or replace function public.portal_create_shipment_v2(
  p_user text, p_pass text, p_irsaliye text, p_prepared_by text, p_items jsonb, p_signature text, p_order_id bigint default null)
returns bigint
language plpgsql security definer set search_path = public, extensions
as $$
declare v_id bigint;
begin
  v_id := portal_create_shipment(p_user, p_pass, p_irsaliye, p_prepared_by, p_items, p_signature, p_order_id);
  perform _portal_item_flags(v_id, p_items);
  return v_id;
end $$;

create or replace function public.portal_update_shipment_v2(
  p_user text, p_pass text, p_id bigint, p_irsaliye text, p_prepared_by text, p_items jsonb)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform portal_update_shipment(p_user, p_pass, p_id, p_irsaliye, p_prepared_by, p_items);
  perform _portal_item_flags(p_id, p_items);
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('_portal_item_flags', 'portal_create_shipment_v2', 'portal_update_shipment_v2')
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

-- Supabase fonksiyon listesini hemen yenile
notify pgrst, 'reload schema';
