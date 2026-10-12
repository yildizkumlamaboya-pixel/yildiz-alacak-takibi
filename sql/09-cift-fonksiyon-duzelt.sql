-- 09 CIFT FONKSIYON DUZELTME - urun ekleme/duzenleme fonksiyonlarinin eski surumlerini siler.
-- Sadece sertlestirici (p_hard) iceren guncel surum kalir. Tekrar calistirmak guvenlidir.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('portal_catalog_add', 'portal_catalog_update')
             and not ('p_hard' = any(coalesce(p.proargnames, '{}')))
  loop
    execute format('drop function %s', f.sig);
    raise notice 'silindi: %', f.sig::text;
  end loop;
end $$;

notify pgrst, 'reload schema';

select p.oid::regprocedure as kalan_fonksiyon from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('portal_catalog_add', 'portal_catalog_update');
