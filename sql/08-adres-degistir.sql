-- 08 SITE ADRESI: yildiz-emanet-stoktakibi.vercel.app
-- Vercel'de adres ayari yapildiktan SONRA calistirin.
update public.push_config set v = 'https://yildiz-emanet-stoktakibi.vercel.app/api/push' where k = 'url';
-- Eski adresin bildirim abonelikleri silinir; uygulama yeni adreste giriste yeniden abone olur.
delete from public.push_subs;
select v as bildirim_adresi from public.push_config where k = 'url';

-- Supabase fonksiyon listesini hemen yenile
notify pgrst, 'reload schema';
