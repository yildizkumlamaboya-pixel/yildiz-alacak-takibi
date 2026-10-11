# Yıldız Kumlama Boya – Emanet Stok Takibi

Canlı adres: **https://yildiz-alacak-takibi.vercel.app**

Delta Boya, Minimar gibi firmalardan emanet stoğu (Litre) takip eden PWA.
Veriler Supabase'te tutulur; bu depoya yapılan her değişiklik Vercel'de otomatik yayına çıkar.

## Kullanım
- Telefonda adresi Chrome ile açın → menü (⋮) → **Ana ekrana ekle**.
- İlk giriş: **Yıldız Kumlama Boya / 159753** → Ayarlar'dan şifrenizi hemen değiştirin.
- Ayarlar → Firma Hesapları: firmalara şifre verin. Ayarlar → Personel Listesi: personel adları.
- Ürünler → ürün listesi; Emanet Stoklar → firmaya emanet stok kalemi ve başlangıç emanet stoğu.
- "Oturumu açık tut" işaretliyse yenilemede şifre sorulmaz; Çıkış yapınca unutulur.

## Özellikler
- Firmalar sevkiyat bildirir (çok kalemli, imzalı); yönetici teslim alır, eksik/hasarlı miktarı girer, imzalar.
- Sipariş → firma sevkiyata dönüştürür, gönderilmeden önce kontrol ekranı.
- Teslimat belgesi, toplu teslimat belgesi (tek PDF), mutabakat ekstresi, Excel dışa aktarma.
- Ana ekranda tarih / firma / ürün filtreleri; listeler 20'şer kayıtlık sayfalı.
- Günlük otomatik yedek, manuel yedek, dosyadan geri yükleme.

## Dosyalar
| Dosya | Görev |
|---|---|
| index.html, app1-3.js, logos.js | Uygulama |
| config.js | Supabase adresi ve publishable anahtar |
| sw.js, manifest.json, icon-*.png | PWA (ana ekrana ekleme, önbellek) |
| supabase.sql | Veritabanı kurulumu (SQL Editor'de çalıştırılır; tekrar çalıştırmak güvenlidir) |

Güncelleme yaparken `sw.js` içindeki `CACHE` sürümünü artırın.
