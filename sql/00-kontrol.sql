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


  -- 4) Firma kalemleri ve siparis/sevkiyat urun kontrolu
  r := r || format(' | products.id tipi=%s', (select data_type from information_schema.columns
        where table_schema = 'public' and table_name = 'products' and column_name = 'id'));
  for x in select p.id, p.allowed_bayi, p.name, p.catalog_id from products p order by p.id limit 10 loop
    begin
      perform _portal_check_items(jsonb_build_array(jsonb_build_object('product_id', x.id, 'qty', 1)), '__kontrol__', 'admin');
      r := r || format(' | kalem #%s %s (%s) TAMAM', x.id, x.name, x.allowed_bayi);
    exception when others then
      r := r || format(' | kalem #%s %s (%s) HATA: %s', x.id, x.name, x.allowed_bayi, sqlerrm);
    end;
  end loop;
  for x in select table_name, column_name from information_schema.columns
           where table_schema = 'public' and column_name like 'p\_%' loop
    r := r || format(' | FAZLA SUTUN: %s.%s', x.table_name, x.column_name);
  end loop;

  raise exception 'KONTROL RAPORU (degisiklik yok)%', r;
end $$;
