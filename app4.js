function renderAudit() {
$('auditCount').innerText = `${auditRows.length} işlem`;
if (!auditRows.length) {
$('auditList').innerHTML = `<div class="text-secondary small text-center py-2">Bu aralıkta işlem yok.</div>`;
$('auditPager').innerHTML = '';
return;
}
$('auditPager').innerHTML = pagerHtml(auditRows.length, 'audit');
$('auditList').innerHTML = pageSlice(auditRows, 'audit').map(a => {
const d = auditText(a);
return `<div class="border-bottom py-2 d-flex gap-2">
<i class="bi ${d.icon} ${d.cls} mt-1"></i>
<div class="flex-grow-1">
<div class="small">${esc(emn(d.text))}</div>
<div class="tiny text-secondary">${dt(a.created_at)} • <b>${esc(a.actor || '-')}</b>${a.firm && a.firm !== a.actor ? ' • ' + esc(a.firm) : ''}</div>
</div>
</div>`;
}).join('');
}
async function loadBackups() {
const r = await rpc('portal_admin_backup_list');
if (!r) return;
backups = r.data || [];
const kindLabel = { 'manuel': ['Manuel', 'text-bg-dark'], 'otomatik': ['Otomatik', 'text-bg-info'], 'geri-yukleme-oncesi': ['Geri yükleme öncesi', 'text-bg-warning'] };
$('backupList').innerHTML = !backups.length
? `<div class="text-secondary small text-center py-2">Henüz yedek yok.</div>`
: backups.map(b => {
const [lbl, cls] = kindLabel[b.kind] || [b.kind, 'text-bg-light'];
return `
<div class="border rounded-3 p-2 ps-3">
<div class="d-flex justify-content-between align-items-start gap-2">
<div>
<div class="small fw-semibold">${dt(b.created_at)} <span class="badge ${cls}" style="font-size:.6rem">${lbl}</span></div>
${b.note ? `<div class="tiny">${esc(b.note)}</div>` : ''}
<div class="tiny text-secondary">${b.product_count} kalem • ${b.shipment_count} sevkiyat • ${b.movement_count} hareket • ${b.size_kb} KB</div>
</div>
<div class="d-flex gap-1 flex-shrink-0">
<button class="btn btn-sm btn-outline-dark" title="İndir" onclick="busy(this, () => downloadBackup(${b.id}))"><i class="bi bi-download"></i></button>
<button class="btn btn-sm btn-outline-warning" title="Geri yükle" onclick="busy(this, () => restoreBackup(${b.id}))"><i class="bi bi-arrow-counterclockwise"></i></button>
<button class="btn btn-sm btn-outline-danger" title="Sil" onclick="busy(this, () => deleteBackup(${b.id}))"><i class="bi bi-trash"></i></button>
</div>
</div>
</div>`;
}).join('');
}
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
loadLogins().then(() => {
const s = sessionGet();
if (s && !me && [...$('loginRole').options].some(o => o.value === s.name)) $('loginRole').value = s.name;
});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');
