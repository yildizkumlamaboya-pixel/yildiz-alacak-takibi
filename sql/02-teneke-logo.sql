-- 02 TENEKE + FIRMA LOGOSU - tekrar calistirmak guvenlidir.
alter table public.catalog add column if not exists pack_size numeric;
alter table public.portal_users add column if not exists logo jsonb;

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
           where n.nspname = 'public' and p.proname in ('portal_admin_set_logo')
  loop
    execute format('revoke all on function %s from public', f.sig);
    begin
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    exception when undefined_object then null;
    end;
  end loop;
end $$;

-- Supabase fonksiyon listesini hemen yenile
notify pgrst, 'reload schema';
