-- ISLEM GECMISI (v10) - Supabase SQL Editor'de bir kez calistirin. Tekrar calistirmak guvenlidir.
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

-- Supabase fonksiyon listesini hemen yenile
notify pgrst, 'reload schema';
