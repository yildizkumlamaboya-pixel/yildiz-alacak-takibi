-- 12 FIRMA TELEFONU (WhatsApp'tan gonderim icin). 05'ten sonra calistirin. Tekrar calistirmak guvenlidir.
alter table public.portal_users add column if not exists phone text;

drop function if exists public.portal_admin_users(text, text);
create or replace function public.portal_admin_users(p_user text, p_pass text)
returns table(name text, role text, active boolean, has_password boolean, username text, phone text)
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform _portal_require(p_user, p_pass, true);
  return query
    select u.name, u.role, u.active, (u.pass_hash is not null), u.username, u.phone
    from portal_users u
    order by (u.role = 'admin') desc, u.name;
end $$;

create or replace function public.portal_admin_set_phone(p_user text, p_pass text, p_name text, p_phone text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
#variable_conflict use_variable
declare v text;
begin
  perform _portal_require(p_user, p_pass, true);
  v := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  if v is not null and length(regexp_replace(v, '[^0-9]', '', 'g')) not between 10 and 15 then
    raise exception 'Telefon numarası geçersiz (ör. 0532 123 45 67)';
  end if;
  update portal_users set phone = v where name = p_name;
  if not found then raise exception 'Hesap bulunamadı'; end if;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('portal_admin_users', 'portal_admin_set_phone')
  loop
    execute format('revoke all on function %s from public', f.sig);
    begin
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    exception when undefined_object then null;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';
