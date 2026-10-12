-- 05 KULLANICI ADI ILE GIRIS - Supabase SQL Editor'de bir kez calistirin. Tekrar calistirmak guvenlidir.
alter table public.portal_users add column if not exists username text;
create unique index if not exists portal_users_username_uq on public.portal_users (lower(username));

-- Yonetici: admin, firmalar: adindan turetilen kullanici adi (yonetici sonradan degistirebilir)
do $$
declare u record; v text; n int;
begin
  update portal_users set username = 'admin'
  where id = (select id from portal_users where role = 'admin' order by id limit 1)
    and username is null and not exists (select 1 from portal_users where lower(username) = 'admin');
  for u in select id, name from portal_users where username is null order by id loop
    v := lower(regexp_replace(translate(u.name, 'ÇĞİIÖŞÜçğıöşü', 'CGIIOSUcgiosu'), '[^A-Za-z0-9]', '', 'g'));
    if length(v) < 3 then v := 'firma' || u.id; end if;
    n := 1;
    while exists (select 1 from portal_users where lower(username) = v) loop
      n := n + 1; v := regexp_replace(v, '[0-9]*$', '') || n;
    end loop;
    update portal_users set username = v where id = u.id;
  end loop;
end $$;

-- Giris: kullanici adi (veya eski kayitli oturumlar icin hesap adi) + sifre
create or replace function public.portal_login(p_name text, p_pass text)
returns table(name text, role text)
language plpgsql security definer set search_path = public, extensions
as $$
declare v_name text; v_role text;
begin
  select u.name into v_name from portal_users u where lower(u.username) = lower(trim(p_name)) limit 1;
  v_name := coalesce(v_name, p_name);
  v_role := _portal_auth(v_name, p_pass);
  if v_role is null then perform pg_sleep(0.7); return; end if;
  if v_role = 'admin' and not exists (
       select 1 from backups b where b.created_at > now() - interval '24 hours') then
    perform _portal_backup('otomatik', 'Günlük otomatik yedek', v_name);
  end if;
  return query select v_name, v_role;
end $$;

drop function if exists public.portal_admin_users(text, text);
create or replace function public.portal_admin_users(p_user text, p_pass text)
returns table(name text, role text, active boolean, has_password boolean, username text)
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform _portal_require(p_user, p_pass, true);
  return query
    select u.name, u.role, u.active, (u.pass_hash is not null), u.username
    from portal_users u
    order by (u.role = 'admin') desc, u.name;
end $$;

create or replace function public.portal_admin_set_username(p_user text, p_pass text, p_name text, p_username text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare v_old text;
begin
  perform _portal_require(p_user, p_pass, true);
  p_username := trim(p_username);
  if p_username !~ '^[A-Za-z0-9._-]{3,30}$' then
    raise exception 'Kullanıcı adı 3-30 karakter olmalı; sadece harf (Türkçe karakter olmadan), rakam, nokta, tire ve alt çizgi';
  end if;
  select username into v_old from portal_users where name = p_name;
  if not found then raise exception 'Hesap bulunamadı'; end if;
  if exists (select 1 from portal_users where name <> p_name
             and (lower(username) = lower(p_username) or lower(name) = lower(p_username))) then
    raise exception 'Bu kullanıcı adı başka bir hesapta kullanılıyor';
  end if;
  if v_old is not distinct from p_username then return; end if;
  update portal_users set username = p_username where name = p_name;
  insert into audit_log (actor, tbl, op, firm, info)
  values (p_user, 'portal_users', 'UPDATE', p_name,
          jsonb_build_object('row', jsonb_build_object('name', p_name),
                             'changes', jsonb_build_object('username', jsonb_build_array(v_old, p_username))));
end $$;

-- Giris ekranindaki hesap listesi artik disaridan okunamaz
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('portal_login', 'portal_admin_users', 'portal_admin_set_username', 'portal_login_list')
  loop
    execute format('revoke all on function %s from public', f.sig);
    begin
      execute format('revoke all on function %s from anon, authenticated', f.sig);
      if f.proname <> 'portal_login_list' then
        execute format('grant execute on function %s to anon, authenticated', f.sig);
      end if;
    exception when undefined_object then null;
    end;
  end loop;
end $$;

-- Supabase fonksiyon listesini hemen yenile
notify pgrst, 'reload schema';
