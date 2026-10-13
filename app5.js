async function createBackup() {
const r = await rpc('portal_admin_backup_create', { p_note: $('backupNote').value });
if (!r) return;
$('backupNote').value = '';
notify('Yedek alındı.');
await loadBackups();
}
async function downloadBackup(id) {
const r = await rpc('portal_admin_backup_get', { p_id: id });
if (!r) return;
const b = backups.find(x => x.id === id);
const stamp = b ? new Date(b.created_at).toISOString().slice(0, 16).replace(/[:T]/g, '-') : id;
download(JSON.stringify(r.data, null, 2), `yildiz-emanet-stok-yedek_${stamp}.json`, 'application/json');
}
const RESTORE_WARN = 'Mevcut tüm emanet stok kalemleri, sevkiyatlar ve hareketler bu yedekteki verilerle DEĞİŞTİRİLECEK.\n\nİşlemden önce mevcut durumun otomatik yedeği alınır.\nDevam edilsin mi?';
async function restoreBackup(id) {
if (!confirm(RESTORE_WARN)) return;
const r = await rpc('portal_admin_backup_restore', { p_id: id });
if (!r) return;
notify('Yedek geri yüklendi.');
await Promise.all([loadData(), loadBackups(), loadUsers()]);
}
async function restoreFromFile(input) {
const file = input.files[0];
input.value = '';
if (!file) return;
let data;
try { data = JSON.parse(await file.text()); }
catch { return notify('Dosya okunamadı, geçerli bir yedek değil.', 'danger'); }
if (!Array.isArray(data.products) || !Array.isArray(data.shipments)) return notify('Geçersiz yedek dosyası.', 'danger');
if (!confirm(`${file.name}\n${data.products.length} kalem, ${data.shipments.length} sevkiyat\n\n` + RESTORE_WARN)) return;
const r = await rpc('portal_admin_backup_restore_json', { p_data: data });
if (!r) return;
notify('Yedek dosyası geri yüklendi.');
await Promise.all([loadData(), loadBackups(), loadUsers()]);
}
async function deleteBackup(id) {
if (!confirm('Bu yedek kalıcı olarak silinsin mi?')) return;
const r = await rpc('portal_admin_backup_delete', { p_id: id });
if (!r) return;
notify('Yedek silindi.');
await loadBackups();
}
if (LOGOS[ADMIN_FIRM]) { $('brandLogo').src = LOGOS[ADMIN_FIRM].src; $('loginLogo').src = LOGOS[ADMIN_FIRM].src; }
if (DEMO) sb.ready.then(() => {
if (!sb.persistent) $('loginSection').insertAdjacentHTML('afterbegin', `
<div class="alert alert-danger small mb-3"><i class="bi bi-exclamation-triangle me-1"></i>
Bu açılış şeklinde telefon hafızasına kayıt yapılamıyor; girdiğiniz bilgiler sayfa kapanınca silinir.
Portalı internet adresinden (ör. Netlify) açın.</div>`);
});
if (DEMO && !location.protocol.startsWith('http')) $('loginSection').insertAdjacentHTML('afterbegin', `
<div class="alert alert-warning small mb-3"><i class="bi bi-exclamation-triangle me-1"></i>
Portal dosyadan açıldı. Bazı telefonlarda dosya her açılışta farklı adresle açılır ve önceki kayıtlar görünmez.
Kayıtların kalıcı olması için portalı internet adresinden açıp "Ana ekrana ekle" yapın (KURULUM.txt).
Bu arada Ayarlar &gt; Yedekleme'den düzenli yedek indirin.</div>`);
const savedSession = sessionGet();
if (savedSession) {
$('loginSection').classList.add('d-none');
$('bootLoading').classList.remove('d-none');
login(savedSession).catch(() => {}).finally(() => {
$('bootLoading').classList.add('d-none');
if (!me) $('loginSection').classList.remove('d-none');
});
}
fillLastUser();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');
