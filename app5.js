async function openStatement() {
const bayi = isAdmin() ? $('repBayiSel').value : me.name;
if (!bayi) return notify('Mutabakat ekstresi için yukarıdan firma seçin.', 'warning');
const { f, t } = rangeIso();
const r = await rpc('portal_statement', { p_bayi: bayi, p_from: f ? f.toISOString() : null, p_to: t ? t.toISOString() : null });
if (!r) return;
const rows = (r.data || []).map(x => ({ ...x, start: Number(x.start), added: Number(x.added), delivered: Number(x.delivered), other: Number(x.other), end: Number(x.end) }));
if (!rows.length) return notify('Bu firmaya tanımlı emanet stok kalemi yok.', 'warning');
const sum = k => r2(rows.reduce((a, x) => a + x[k], 0));
const periodTxt = `${f ? dOnly(f) : 'Başlangıç'} – ${$('repTo').value ? dOnly($('repTo').value + 'T00:00:00') : dOnly(new Date())}`;
const endTxt = $('repTo').value ? dOnly($('repTo').value + 'T00:00:00') : dOnly(new Date());
const dels = shipments.filter(s => s.supplier === bayi && !isPending(s) && (!f || new Date(s.approved_at) >= f) && (!t || new Date(s.approved_at) < t))
.sort((a, b) => new Date(a.approved_at) - new Date(b.approved_at));
const cell = v => `<td class="text-end text-nowrap">${num(v)}</td>`;
const html = `
${docHeader('EMANET STOK MUTABAKAT EKSTRESİ', `<div>Dönem: <b>${periodTxt}</b></div>`)}
<table class="doc-meta mb-2">
<tr>
<td><div class="doc-lbl">Emanet Sahibi</div><div class="fw-bold">Yıldız Kumlama Boya</div></td>
<td><div class="doc-lbl">Teslim Edecek Firma</div><div class="fw-bold d-flex align-items-center gap-2">${firmLogo(bayi, 26)}${esc(bayi)}</div></td>
</tr>
</table>
<div class="doc-h2">Kalem Bazında Durum (Litre)</div>
<table class="doc-items">
<thead><tr><th style="width:14%">Kod</th><th>Ürün</th><th class="text-end">Dönem Başı</th><th class="text-end">Eklenen</th>
<th class="text-end">Teslim Alınan</th><th class="text-end">Diğer*</th><th class="text-end">Dönem Sonu Kalan</th></tr></thead>
<tbody>${rows.map(x => `<tr><td>${esc(x.code)}</td><td>${esc(x.name)}</td>${cell(x.start)}${cell(x.added)}${cell(x.delivered)}${cell(x.other)}
<td class="text-end text-nowrap fw-bold">${num(x.end)}</td></tr>`).join('')}</tbody>
<tfoot><tr><td colspan="2" class="text-end">Toplam</td>${cell(sum('start'))}${cell(sum('added'))}${cell(sum('delivered'))}${cell(sum('other'))}
<td class="text-end text-nowrap">${num(sum('end'))}</td></tr></tfoot>
</table>
<div class="doc-lbl mt-1">* Diğer: düzeltmeler, onay iptalleri, silinen teslimatlar ve emanet stok düşümleri. Dönem Sonu = Dönem Başı + Eklenen − Teslim Alınan + Diğer.</div>
<div class="doc-h2">Dönem İçi Teslimatlar</div>
${dels.length ? `
<table class="doc-items">
<thead><tr><th style="width:1%" class="text-nowrap">Teslim Tarihi</th><th>İrsaliye</th><th>Ürün</th>
<th class="text-end text-nowrap" style="width:1%">Bildirilen</th><th class="text-end text-nowrap" style="width:1%">Teslim Alınan</th></tr></thead>
<tbody>${dels.flatMap(s => s.items.map(i => `<tr>
<td class="text-nowrap">${dOnly(s.approved_at)}</td><td>${esc(s.irsaliye_no)}</td>
<td>${esc(i.product_name)}${i.note ? `<div class="doc-lbl">${esc(i.note)}</div>` : ''}</td>
<td class="text-end text-nowrap">${num(i.qty)}</td><td class="text-end text-nowrap fw-bold">${num(i.received_qty)}</td></tr>`)).join('')}</tbody>
</table>` : '<div class="doc-lbl">Bu dönemde teslimat yok.</div>'}
<p class="mt-3 mb-0">${endTxt} tarihi itibarıyla <b>${esc(bayi)}</b> firmasının Yıldız Kumlama Boya'ya teslim etmesi gereken
kalan miktarlar yukarıdaki "Dönem Sonu Kalan" sütununda gösterilmiştir (toplam <b>${num(sum('end'))} Litre</b>).
Taraflar bu miktarlar üzerinde mutabıktır.</p>
<div class="doc-sign">
<div><div class="doc-lbl">Yıldız Kumlama Boya<br>Kaşe / İmza</div></div>
<div><div class="doc-lbl">${esc(bayi)}<br>Kaşe / İmza</div></div>
</div>
${docFooter()}`;
showDoc(html, `Mutabakat-${bayi}-${$('repTo').value || ymd(new Date())}`);
}
async function changeOwnPassword() {
const oldP = $('pwOld').value, newP = $('pwNew').value, newP2 = $('pwNew2').value;
if (!oldP || !newP) return notify('Tüm alanları doldurunuz.', 'warning');
if (newP.length < 4) return notify('Yeni şifre en az 4 karakter olmalı.', 'warning');
if (newP !== newP2) return notify('Yeni şifreler eşleşmiyor.', 'warning');
const { error } = await sb.rpc('portal_change_password', { p_name: me.name, p_old: oldP, p_new: newP });
if (error) return notify(error.message, 'danger');
myPass = newP;
$('pwOld').value = $('pwNew').value = $('pwNew2').value = '';
notify('Şifreniz güncellendi.');
}
async function loadUsers() {
const r = await rpc('portal_admin_users');
if (!r) return;
users = r.data || [];
const rows = users.map((u, i) => ({ u, i })).filter(x => x.u.role === 'bayi');
$('bayiList').innerHTML = !rows.length
? `<div class="text-secondary small text-center py-2">Henüz firma yok.</div>`
: rows.map(({ u, i }) => `
<div class="border rounded-3 p-2 ps-3 d-flex justify-content-between align-items-center ${u.active ? '' : 'bg-light'}">
<div>
<div class="fw-semibold small d-flex align-items-center gap-2 ${u.active ? '' : 'text-secondary'}">${firmLogo(u.name, 20)}${esc(u.name)}</div>
<div class="d-flex flex-wrap gap-1 mt-1">
${u.username ? `<span class="badge text-bg-light border" style="font-size:.6rem"><i class="bi bi-person"></i> ${esc(u.username)}</span>` : ''}
${u.phone ? `<span class="badge text-bg-light border text-success" style="font-size:.6rem"><i class="bi bi-whatsapp"></i> ${esc(u.phone)}</span>` : ''}
${u.has_password ? `<span class="badge text-bg-success bg-opacity-75" style="font-size:.6rem">Şifre tanımlı</span>`
: `<span class="badge text-bg-warning" style="font-size:.6rem">Şifre yok - giriş yapamaz</span>`}
${u.active ? '' : `<span class="badge text-bg-secondary" style="font-size:.6rem">Pasif</span>`}
</div>
</div>
<div class="d-flex gap-1">
<button onclick="openBayiModal(${i})" class="btn btn-sm btn-outline-dark" title="Şifre / logo"><i class="bi bi-pencil"></i></button>
<button onclick="busy(this, () => toggleBayi(${i}))" class="btn btn-sm ${u.active ? 'btn-outline-danger' : 'btn-outline-success'}" title="${u.active ? 'Pasif yap' : 'Aktif yap'}">
<i class="bi ${u.active ? 'bi-person-dash' : 'bi-person-check'}"></i>
</button>
</div>
</div>`).join('');
const act = users.filter(u => u.role === 'bayi' && u.active);
const cur = $('newAllowedBayi').value;
$('newAllowedBayi').innerHTML = act.length
? act.map(u => `<option value="${esc(u.name)}">${esc(u.name)}</option>`).join('')
: `<option value="">Önce firma ekleyin</option>`;
if (act.some(u => u.name === cur)) $('newAllowedBayi').value = cur;
if (me) { fillSelects(); renderPersonnel(); }
}
function openBayiModal(i) {
bayiEditingNew = (i === undefined);
const u = bayiEditingNew ? null : users[i];
$('bayiModalTitle').innerText = bayiEditingNew ? 'Yeni Firma' : 'Firmayı Düzenle';
$('bayiPass').placeholder = bayiEditingNew || !u.has_password ? 'En az 4 karakter' : 'Değiştirmeyecekseniz boş bırakın';
bayiLogoNew = undefined;
showBayiLogo(u ? ((META.logos && META.logos[u.name]) || LOGOS[u.name]) : null, !!(u && META.logos && META.logos[u.name]));
$('bayiName').value = u ? u.name : '';
$('bayiName').readOnly = !bayiEditingNew;
$('bayiName').classList.toggle('bg-light', !bayiEditingNew);
$('bayiNameHint').classList.toggle('d-none', !bayiEditingNew);
$('bayiPass').value = '';
$('bayiUser').value = u ? (u.username || '') : '';
$('bayiPhone').value = u ? (u.phone || '') : '';
bayiModal.show();
}
let bayiLogoNew;
function showBayiLogo(L, removable) {
$('bayiLogoPrev').innerHTML = L ? `<img src="${L.src}" alt="" style="max-width:120px;max-height:62px;object-fit:contain">`
: '<span class="tiny text-secondary">Logo yok</span>';
$('bayiLogoDel').classList.toggle('d-none', !removable);
}
function shrinkImage(file, max = 360) {
return new Promise((resolve, reject) => {
const url = URL.createObjectURL(file), img = new Image();
img.onload = () => {
const k = Math.min(1, max / Math.max(img.width, img.height));
const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
const c = document.createElement('canvas'); c.width = w; c.height = h;
c.getContext('2d').drawImage(img, 0, 0, w, h);
URL.revokeObjectURL(url);
let src = c.toDataURL('image/webp', 0.85);
if (!src.startsWith('data:image/webp')) src = c.toDataURL('image/png');
resolve({ src, r: Math.round(w / h * 1000) / 1000 });
};
img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('resim')); };
img.src = url;
});
}
async function pickBayiLogo(input) {
const f = input.files[0]; input.value = '';
if (!f) return;
try { bayiLogoNew = await shrinkImage(f); showBayiLogo(bayiLogoNew, true); }
catch (e) { notify('Resim okunamadı.', 'danger'); }
}
function clearBayiLogo() {
bayiLogoNew = null;
const name = $('bayiName').value.trim();
showBayiLogo(LOGOS[name] || null, false);
}
async function saveBayi() {
const name = $('bayiName').value.trim(), pass = $('bayiPass').value, uname = $('bayiUser').value.trim();
const cur = bayiEditingNew ? null : users.find(u => u.name === name);
const unameChanged = uname !== ((cur && cur.username) || '');
const phone = $('bayiPhone').value.trim();
const phoneChanged = phone.replace(/\D/g, '') !== String((cur && cur.phone) || '').replace(/\D/g, '');
if (phone && !waNumber(phone)) return notify('Telefon numarası geçersiz (ör. 0532 123 45 67).', 'warning');
if (!name) return notify('Firma adı giriniz.', 'warning');
if (!uname) return notify('Kullanıcı adı giriniz.', 'warning');
if (!/^[A-Za-z0-9._-]{3,30}$/.test(uname)) return notify('Kullanıcı adı 3-30 karakter olmalı; Türkçe karakter ve boşluk kullanmayın.', 'warning');
if (users.some(u => u.name !== name && ((u.username || '').toLowerCase() === uname.toLowerCase() || u.name.toLowerCase() === uname.toLowerCase())))
return notify('Bu kullanıcı adı başka bir hesapta kullanılıyor.', 'warning');
if ((bayiEditingNew || pass) && pass.length < 4) return notify('Şifre en az 4 karakter olmalı.', 'warning');
if (bayiEditingNew && users.some(u => u.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr')))
return notify('Bu isimde bir hesap zaten var.', 'warning');
if (!bayiEditingNew && !pass && !unameChanged && !phoneChanged && bayiLogoNew === undefined) return notify('Değişiklik yapılmadı.', 'secondary');
if (bayiEditingNew || pass) {
const r = await rpc('portal_admin_save_bayi', { p_name: name, p_new_pass: pass });
if (!r) return;
}
if (unameChanged) {
const { error } = await sb.rpc('portal_admin_set_username', { p_user: me.name, p_pass: myPass, p_name: name, p_username: uname });
if (error) {
if (bayiEditingNew) { bayiEditingNew = false; await loadUsers(); }
return notify(/portal_admin_set_username|function|schema cache/i.test(error.message)
? "Kullanıcı adı için Supabase'de kullanici-adi.sql kurulumunun çalıştırılması gerekiyor." : error.message, 'danger');
}
}
if (phoneChanged) {
const { error } = await sb.rpc('portal_admin_set_phone', { p_user: me.name, p_pass: myPass, p_name: name, p_phone: phone || null });
if (error) return notify(/portal_admin_set_phone|function|schema cache/i.test(error.message)
? "Telefon için Supabase'de 12-firma-telefon.sql çalıştırılmalı." : error.message, 'danger');
}
if (bayiLogoNew !== undefined) {
const { error } = await sb.rpc('portal_admin_set_logo', { p_user: me.name, p_pass: myPass, p_name: name, p_logo: bayiLogoNew });
if (error) return notify(/portal_admin_set_logo|function|schema cache/i.test(error.message)
? "Logo için Supabase'de teneke-logo.sql kurulumunun çalıştırılması gerekiyor." : error.message, 'danger');
}
bayiModal.hide();
notify(bayiEditingNew ? 'Firma hesabı oluşturuldu.' : 'Firma bilgileri güncellendi.');
await loadData();
await loadUsers();
}
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
