async function toggleBayi(i) {
const u = users[i];
if (u.active && !confirm(`${u.name} pasif yapılsın mı? Bu firma giriş yapamayacak (kayıtları silinmez).`)) return;
const r = await rpc('portal_admin_set_active', { p_name: u.name, p_active: !u.active });
if (!r) return;
notify(u.active ? 'Firma pasif yapıldı.' : 'Firma aktif yapıldı.');
await loadUsers();
}
let auditRows = [];
async function loadAudit() {
if (!isAdmin()) return;
if (!$('audFrom').value) { const d = new Date(); d.setDate(d.getDate() - 30); $('audFrom').value = ymd(d); }
if (!$('audTo').value) $('audTo').value = ymd(new Date());
const f = new Date($('audFrom').value + 'T00:00:00');
const t = new Date($('audTo').value + 'T00:00:00'); t.setDate(t.getDate() + 1);
$('auditList').innerHTML = `<div class="text-center text-secondary small py-3"><div class="spinner-border spinner-border-sm"></div></div>`;
const { data, error } = await sb.rpc('portal_audit_list', { p_user: me.name, p_pass: myPass,
p_from: f.toISOString(), p_to: t.toISOString(), p_firm: $('audFirm').value || null, p_limit: 1000 });
if (error) {
auditRows = [];
$('auditList').innerHTML = /portal_audit_list|function|schema cache/i.test(error.message)
? `<div class="alert alert-warning small mb-0">İşlem geçmişi için Supabase'de <b>islem-gecmisi.sql</b> kurulumunun çalıştırılması gerekiyor.</div>`
: `<div class="alert alert-danger small mb-0">${esc(error.message)}</div>`;
$('auditPager').innerHTML = ''; $('auditCount').innerText = '';
return;
}
auditRows = data || [];
pages.audit = 1;
renderAudit();
}
const AUD_TR = { pack_size: 'Teneke (L)', hardener_size: 'Sertleştirici (L)', irsaliye_no: 'İrsaliye', prepared_by: 'Düzenleyen', received_by: 'Teslim alan', note: 'Not', due_date: 'Termin',
code: 'Kod', name: 'Ad', approve_note: 'Not', critical: 'Uyarı sınırı' };
function auditText(a) {
if (a.text) return { icon: 'bi-dot', cls: 'text-secondary', text: a.text };
const r = (a.info && a.info.row) || {}, c = (a.info && a.info.changes) || {};
const irs = r.irsaliye_no ? '#' + r.irsaliye_no : '';
const fieldList = () => Object.keys(c).filter(k => AUD_TR[k]).map(k => `${AUD_TR[k]}: ${c[k][0] ?? '-'} → ${c[k][1] ?? '-'}`).join(', ');
switch (a.tbl) {
case 'shipments':
if (a.op === 'INSERT') return { icon: 'bi-truck', cls: 'text-primary', text: `Sevkiyat bildirdi ${irs}` };
if (a.op === 'DELETE') return { icon: 'bi-trash', cls: 'text-danger', text: `Sevkiyatı sildi ${irs}` };
if (c.status && c.status[1] === 'Bekliyor') return { icon: 'bi-arrow-counterclockwise', cls: 'text-warning-emphasis', text: `Onayı geri aldı ${irs}` };
if (c.status) return { icon: 'bi-check2-circle', cls: 'text-success', text: `Teslim aldı ${irs}${r.received_by ? ' (teslim alan: ' + r.received_by + ')' : ''}` };
return { icon: 'bi-pencil', cls: 'text-primary', text: `Sevkiyatı düzenledi ${irs}${fieldList() ? ' — ' + fieldList() : ''}` };
case 'orders': {
const no = r.id ? orderNo(r) : 'Sipariş';
if (a.op === 'INSERT') return { icon: 'bi-clipboard-plus', cls: 'text-primary', text: `Sipariş verdi ${no}` };
if (a.op === 'DELETE') return { icon: 'bi-trash', cls: 'text-danger', text: `Siparişi sildi ${no}` };
if (c.cancelled) return c.cancelled[1]
? { icon: 'bi-x-circle', cls: 'text-danger', text: `Siparişi iptal etti ${no}` }
: { icon: 'bi-arrow-counterclockwise', cls: 'text-warning-emphasis', text: `Sipariş iptalini geri aldı ${no}` };
return { icon: 'bi-pencil', cls: 'text-primary', text: `Siparişi düzenledi ${no}${fieldList() ? ' — ' + fieldList() : ''}` };
}
case 'stock_movements': {
const up = Number(r.qty) > 0;
return { icon: up ? 'bi-plus-circle' : 'bi-dash-circle', cls: up ? 'text-primary' : 'text-danger',
text: `${up ? 'Emanet stok ekledi' : 'Emanet stoktan düştü'}: ${up ? '+' : ''}${num(r.qty)} L ${r.product_name || ''}${r.note ? ' — ' + r.note : ''}` };
}
case 'products':
return a.op === 'INSERT'
? { icon: 'bi-plus-square', cls: 'text-primary', text: `Emanet stok kalemi açtı: ${r.name || ''}` }
: { icon: 'bi-trash', cls: 'text-danger', text: `Emanet stok kalemini sildi: ${r.name || ''}` };
case 'catalog':
if (a.op === 'INSERT') return { icon: 'bi-box-seam', cls: 'text-primary', text: `Ürün ekledi: ${r.code} ${r.name}` };
if (a.op === 'DELETE') return { icon: 'bi-trash', cls: 'text-danger', text: `Ürünü sildi: ${r.code} ${r.name}` };
return { icon: 'bi-pencil', cls: 'text-primary', text: `Ürünü düzenledi: ${fieldList() || r.name}` };
case 'personnel':
return a.op === 'INSERT'
? { icon: 'bi-person-plus', cls: 'text-primary', text: `Personel ekledi: ${r.name} (${r.firm})` }
: { icon: 'bi-person-dash', cls: 'text-danger', text: `Personeli sildi: ${r.name} (${r.firm})` };
case 'portal_users':
if (a.op === 'INSERT') return { icon: 'bi-building-add', cls: 'text-primary', text: `Firma hesabı oluşturdu: ${r.name}` };
if (c.username) return { icon: 'bi-person-badge', cls: 'text-primary', text: `Kullanıcı adı değişti: ${r.name} → ${c.username[1]}` };
if (c.pass_changed) return { icon: 'bi-key', cls: 'text-warning-emphasis', text: a.actor === r.name ? 'Kendi şifresini değiştirdi' : `Şifre belirledi: ${r.name}` };
return c.active && c.active[1]
? { icon: 'bi-person-check', cls: 'text-success', text: `Firmayı aktif yaptı: ${r.name}` }
: { icon: 'bi-person-slash', cls: 'text-danger', text: `Firmayı pasif yaptı: ${r.name}` };
case 'backups':
return a.op === 'RESTORE'
? { icon: 'bi-arrow-counterclockwise', cls: 'text-danger', text: 'Yedekten geri yükleme yaptı' }
: { icon: 'bi-cloud-plus', cls: 'text-secondary', text: `Manuel yedek aldı${r.note ? ': ' + r.note : ''}` };
}
return { icon: 'bi-dot', cls: 'text-secondary', text: `${a.tbl} ${a.op}` };
}
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
renderBackups();
}
function renderBackups() {
const kindLabel = { 'manuel': ['Manuel', 'text-bg-dark'], 'otomatik': ['Otomatik', 'text-bg-info'], 'geri-yukleme-oncesi': ['Geri yükleme öncesi', 'text-bg-warning'] };
$('backupPager').innerHTML = pagerHtml(backups.length, 'backup');
$('backupList').innerHTML = !backups.length
? `<div class="text-secondary small text-center py-2">Henüz yedek yok.</div>`
: pageSlice(backups, 'backup').map(b => {
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
fillLastUser();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');
