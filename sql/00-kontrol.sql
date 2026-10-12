-- 00 KONTROL - Hicbir seyi degistirmez (en sonda her sey geri alinir).
-- Calistirinca kirmizi bir "ERROR" mesaji cikar: o mesajin TAMAMI rapordur, Claude'a iletin.
do $$
declare
  r text := '';
  v jsonb;
  x record;
begin
  -- 1) Ayni isimde birden fazla surumu olan fonksiyonlar (Supabase hangisini cagiracagini secemez)
  for x in select p.proname, count(*) n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and p.proname like 'portal\_%' group by 1 having count(*) > 1 loop
    r := r || format(' | CIFT FONKSIYON: %s (%s)', x.proname, x.n);
  end loop;

  -- 2) Tablo sayilari
  r := r || format(' | urun listesi=%s, firma kalemi=%s, sevkiyat=%s, siparis=%s, kullanici=%s',
    (select count(*) from catalog), (select count(*) from products), (select count(*) from shipments),
    (select count(*) from orders), (select count(*) from portal_users));

  -- 3) Gecici bir yonetici ile uygulamanin veri isteklerini dene
  insert into portal_users (name, role, pass_hash)
  values ('__kontrol__', 'admin', extensions.crypt('kontrol', extensions.gen_salt('bf')));
  begin
    v := portal_data('__kontrol__', 'kontrol');
    r := r || format(' | portal_data TAMAM (katalog %s, kalem %s, sevkiyat %s)',
      jsonb_array_length(coalesce(v->'catalog', '[]')), jsonb_array_length(coalesce(v->'products', '[]')),
      jsonb_array_length(coalesce(v->'shipments', '[]')));
  exception when others then
    r := r || ' | portal_data HATA: ' || sqlerrm;
  end;
  begin
    v := portal_meta('__kontrol__', 'kontrol');
    r := r || ' | portal_meta TAMAM';
  exception when others then
    r := r || ' | portal_meta HATA: ' || sqlerrm;
  end;

  raise exception 'KONTROL RAPORU (degisiklik yok)%', r;
end $$;
