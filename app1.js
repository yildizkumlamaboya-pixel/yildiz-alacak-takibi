const ADMIN_FIRM = 'Yıldız Kumlama Boya';
function firmLogo(name, h = 20) {
const L = (META.logos && META.logos[name]) || LOGOS[name];
if (L) {
if (L.r < 1.6) h = Math.round(h * 1.4);
return `<img src="${L.src}" alt="${esc(name)}" class="firm-logo" style="height:${h}px;max-width:${Math.round(h * 3.6)}px">`;
}
const ini = String(name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toLocaleUpperCase('tr');
return `<span class="firm-ini" style="width:${h}px;height:${h}px;font-size:${Math.round(h * .42)}px">${esc(ini)}</span>`;
}
const CFG = window.PORTAL_CONFIG || {};
const CONFIGURED = CFG.SUPABASE_URL && !CFG.SUPABASE_URL.includes('YOUR_SUPABASE') && CFG.SUPABASE_KEY && !CFG.SUPABASE_KEY.includes('YOUR_SUPABASE');
const DEMO = CFG.DEMO === true || !CONFIGURED;
const sb = DEMO ? window.createLocalClient() : window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
const APP_TITLE = 'Yıldız Kumlama Boya - Emanet Stok Takibi';
let me = null, myPass = null;
let catalog = [], products = [], shipments = [], personnel = [], users = [], backups = [], reportMoves = [], orders = [];
let orderFilter = 'open', editingOrder = null, convertingOrder = null, pendingSevk = null;
let shipFilter = 'all', editing = null, approving = null, signaturePad = null, sevkPad = null;
let bayiEditingNew = false, editingProduct = null, editingCat = null;
let META = { packs: {}, hards: {}, logos: {} };
let channel = null, reloadTimer = null;
let currentTab = 'tabAna', navStack = [], exitTimer = null;
const TABS = ['tabAna', 'tabOnay', 'tabSiparis', 'tabStok', 'tabSevkEt', 'tabUrun', 'tabRapor', 'tabAyarlar'];
const TAB_PARENT = { tabSevkEt: 'tabOnay', tabUrun: 'tabStok' };
const approveModal = new bootstrap.Modal('#approveModal');
const editModal = new bootstrap.Modal('#editModal');
const detailModal = new bootstrap.Modal('#detailModal');
const productModal = new bootstrap.Modal('#productModal');
const catModal = new bootstrap.Modal('#catModal');
const bayiModal = new bootstrap.Modal('#bayiModal');
const shareModal = new bootstrap.Modal('#shareModal');
const orderModal = new bootstrap.Modal('#orderModal');
const sevkConfirmModal = new bootstrap.Modal('#sevkConfirmModal');
const toast = new bootstrap.Toast('#appToast', { delay: 3200 });
const $ = id => document.getElementById(id);
const isAdmin = () => !!me && me.role === 'admin';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const r2 = n => Math.round(Number(n) * 100) / 100 || 0;
const num = n => r2(n).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
const dt = d => d ? new Date(d).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '';
const dOnly = d => d ? new Date(d).toLocaleDateString('tr-TR') : '';
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const trCmp = (a, b) => String(a).localeCompare(String(b), 'tr');
const prodById = id => products.find(p => p.id === id);
const sortProducts = arr => arr.slice().sort((a, b) => trCmp(a.allowed_bayi, b.allowed_bayi) || trCmp(a.name, b.name));
const isPending = s => s.status === 'Bekliyor';
const pendingQty = pid => r2(shipments.filter(isPending).flatMap(s => s.items).filter(i => i.product_id === pid).reduce((a, i) => a + i.qty, 0));
const shipQty = s => r2(s.items.reduce((a, i) => a + i.qty, 0));
const shipRecv = s => r2(s.items.reduce((a, i) => a + (i.received_qty ?? 0), 0));
function shipDiff(s) {
if (isPending(s)) return null;
const less = s.items.some(i => i.received_qty < i.qty), more = s.items.some(i => i.received_qty > i.qty);
return less ? 'eksik' : more ? 'fazla' : null;
}
const lsGet = k => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); } catch (e) { /* yoksay */ } };
const emn = t => String(t ?? '').replace(/Alacağı/g, 'Emanet Stoğu').replace(/alacağı/g, 'emanet stoğu')
.replace(/Alacaktan/g, 'Emanet stoktan').replace(/alacaktan/g, 'emanet stoktan')
.replace(/Alacak (?=[a-zçğıöşü])/g, 'Emanet stok ').replace(/Alacak/g, 'Emanet Stok').replace(/alacak/g, 'emanet stok');
function notify(msg, type = 'success') {
msg = emn(msg);
$('appToast').className = `toast align-items-center border-0 text-bg-${type}`;
$('toastMsg').innerText = msg;
toast.show();
}
async function busy(btn, fn) {
if (btn.disabled) return;
btn.disabled = true;
try { await fn(); } finally { btn.disabled = false; }
}
async function shipRpc(fn, params) {
const r = await sb.rpc(fn + '_v2', { p_user: me.name, p_pass: myPass, ...params });
if (r.error && /Could not find the function/.test(r.error.message)) {
const res = await rpc(fn, params);
if (res && (params.p_items || []).some(i => i.hardener_qty > 0))
notify("Kaydedildi, ancak sertleştirici ayrımı saklanamadı: Supabase'de 11-sertlestirici-litre.sql çalıştırılmalı.", 'warning');
return res;
}
if (r.error) { notify(r.error.message, 'danger'); if (/listeyi yenileyin/.test(r.error.message)) loadData(); return null; }
return r;
}
async function rpc(fn, params = {}) {
const { data, error } = await sb.rpc(fn, { p_user: me.name, p_pass: myPass, ...params });
if (error) {
const miss = /Could not find the function public\.(\w+)/.exec(error.message);
notify(miss ? `Supabase kurulumu eksik (${miss[1]}). Size gönderilen son SQL dosyalarını SQL Editor'de çalıştırın.` : error.message, 'danger');
if (/Oturum geçersiz/.test(error.message)) logout();
return null;
}
return { data };
}
const ANDROID = () => typeof window.AndroidBridge === 'object' && window.AndroidBridge;
function printDoc() {
if (ANDROID()) { try { window.AndroidBridge.print(document.title); return; } catch (e) { /* tarayıcı yazdırmasına düş */ } }
window.print();
}
function download(content, filename, type) {
if (ANDROID()) {
try {
const b64 = btoa(unescape(encodeURIComponent(content)));
if (window.AndroidBridge.saveFile(filename, b64, (type || 'application/octet-stream').split(';')[0])) return;
} catch (e) { /* normal indirmeye düş */ }
}
const blob = new Blob([content], { type });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob); a.download = filename;
document.body.appendChild(a); a.click(); a.remove();
setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
function downloadBlob(blob, filename) {
if (ANDROID()) {
const fr = new FileReader();
fr.onload = () => { try { window.AndroidBridge.saveFile(filename, String(fr.result).split(',')[1], blob.type || 'application/octet-stream'); } catch (e) { /* yoksay */ } };
fr.readAsDataURL(blob);
return;
}
const a = document.createElement('a');
a.href = URL.createObjectURL(blob); a.download = filename;
document.body.appendChild(a); a.click(); a.remove();
setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
function loadScript(src) {
return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
async function wipeAll() {
const code = $('wipeCode').value.trim(), withCat = $('wipeCatalog').checked;
if (!code) return notify('Silme şifresini giriniz.', 'warning');
if (!confirm(`TÜM VERİLER SİLİNECEK:\n\n• ${shipments.length} sevkiyat, ${orders.length} sipariş\n• ${products.length} emanet kalemi ve tüm hareketler\n• İşlem geçmişi ve tüm yedekler${withCat ? `\n• Ürün listesi (${catalog.length} ürün)` : ''}\n\nBu işlem GERİ ALINAMAZ. Devam edilsin mi?`)) return;
const { data, error } = await sb.rpc('portal_admin_wipe', { p_user: me.name, p_pass: myPass, p_code: code, p_catalog: withCat });
if (error) {
return notify(/portal_admin_wipe|function|schema cache/i.test(error.message)
? "Bu özellik için Supabase'de 14-tum-verileri-sil.sql çalıştırılmalı." : error.message, 'danger');
}
$('wipeCode').value = ''; $('wipeCatalog').checked = false;
const c = data || {};
notify(`Tüm veriler silindi: ${c.sevkiyat || 0} sevkiyat, ${c.siparis || 0} sipariş, ${c.hareket || 0} hareket, ${c.yedek || 0} yedek.`);
await loadData();
try { await loadUsers(); await loadBackups(); await loadAudit(); } catch (e) { /* yoksay */ }
}
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipStore(files) {
const enc = new TextEncoder(), parts = [], cen = [];
let off = 0;
const u16 = v => [v & 255, (v >>> 8) & 255], u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
files.forEach(f => {
const nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
const hdr = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nm.length), ...u16(0)]);
parts.push(hdr, nm, f.data);
cen.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(sz), ...u32(sz),
...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nm);
off += hdr.length + nm.length + sz;
});
const cenLen = cen.reduce((a, b) => a + b.length, 0);
const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cenLen), ...u32(off), ...u16(0)]);
return new Blob([...parts, ...cen, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function xlsxBuild(sheets) {
const enc = new TextEncoder();
const x = v => String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const col = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const files = [];
const add = (name, s) => files.push({ name, data: enc.encode(s) });
add('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, k) => `<Override PartName="/xl/worksheets/sheet${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
add('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
add('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ${NS}><sheets>${sheets.map((s, k) => `<sheet name="${x(s.name.slice(0, 31))}" sheetId="${k + 1}" r:id="rId${k + 1}"/>`).join('')}</sheets></workbook>`);
add('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, k) => `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${k + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
add('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.##"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFD41F"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
sheets.forEach((s, k) => {
const ncol = Math.max(1, ...s.rows.map(r => r.length));
const rows = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
const ref = col(ci) + (ri + 1);
if (v === '' || v == null) return '';
if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${ri ? ' s="2"' : ' s="1"'}><v>${v}</v></c>`;
return `<c r="${ref}" t="inlineStr"${ri ? '' : ' s="1"'}><is><t xml:space="preserve">${x(v)}</t></is></c>`;
}).join('')}</row>`).join('');
add(`xl/worksheets/sheet${k + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet ${NS}><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${(s.widths || []).map((w, ci) => `<col min="${ci + 1}" max="${ci + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData>${s.rows.length > 1 ? `<autoFilter ref="A1:${col(ncol - 1)}${s.rows.length}"/>` : ''}</worksheet>`);
});
return zipStore(files);
}
async function exportExcel() {
const mv = await rpc('portal_movements', { p_from: null, p_to: null, p_bayi: null, p_product_id: null, p_type: null, p_shipment_id: null });
if (!mv) return;
const n = v => v == null || v === '' ? '' : Number(v);
const d = v => v ? new Date(v).toLocaleString('tr-TR') : '';
const prodOf = id => prodById(id) || {};
const sheets = [];
const sheet = (rows, widths) => ({ rows, widths });
const stock = [['Firma', 'Ürün Kodu', 'Ürün', 'Kalan (L)', 'Teneke / Set (≈)', 'Teneke L', 'Sertleştirici L', 'Uyarı Seviyesi (L)']];
sortProducts(visibleProducts()).forEach(p => stock.push([p.allowed_bayi, p.code, p.name, n(p.qty), tnkN(p.id, p.qty) || '', packOf(p.id) || '', hardOf(p.id) ?? '', n(p.critical) || '']));
sheets.push({ name: 'Emanet Stok', ...sheet(stock, [20, 12, 36, 12, 11, 10, 14, 16]) });
const sh = [['Bildirim Tarihi', 'Firma', 'İrsaliye No', 'Sipariş No', 'Durum', 'Düzenleyen', 'Teslim Alan', 'Teslim Tarihi', 'Ürün Kodu', 'Ürün',
'Bildirilen Toplam (L)', 'Boya (L)', 'Sertleştirici (L)', 'Gelen (L)', 'Teneke', 'Not']];
shipments.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).forEach(s => s.items.forEach(i => {
const hq = Number(i.hardener_qty) > 0 ? Math.min(Number(i.hardener_qty), i.qty) : 0;
sh.push([d(s.created_at), s.supplier, s.irsaliye_no, s.order_id ? orderNoById(s.order_id) : '', isPending(s) ? 'Onay bekliyor' : 'Teslim alındı',
s.prepared_by || '', s.received_by || s.approved_by || '', d(s.approved_at), i.code || '', i.product_name,
n(i.qty), n(r2(i.qty - hq)), hq || '', isPending(s) ? '' : n(i.received_qty), tnkN(i.product_id, r2(i.qty - hq)), i.note || s.approve_note || '']);
}));
sheets.push({ name: 'Sevkiyatlar', ...sheet(sh, [18, 18, 14, 15, 14, 16, 16, 18, 11, 34, 12, 10, 12, 10, 9, 24]) });
const st = { open: 'Açık', partial: 'Kısmi sevk', converted: 'Tamamlandı', cancelled: 'İptal' };
const od = [['Sipariş No', 'Tarih', 'Firma', 'Termin', 'Durum', 'Ürün Kodu', 'Ürün', 'Sipariş Toplam (L)', 'Boya (L)', 'Sertleştirici (L)', 'Sevk Edilen (L)', 'Kalan (L)', 'Not']];
orders.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).forEach(o => {
const pr = orderProgress(o), state = st[orderState(o)];
pr.items.forEach(({ i, sent, rem }) => {
const hq = Number(i.hardener_qty) > 0 ? Math.min(Number(i.hardener_qty), i.qty) : 0;
od.push([orderNo(o), d(o.created_at), o.bayi, o.due_date ? dOnly(o.due_date + 'T00:00:00') : '', state, i.code || '', i.product_name,
n(i.qty), n(r2(i.qty - hq)), hq || '', n(Math.min(sent, i.qty)), n(rem), o.note || '']);
});
});
sheets.push({ name: 'Siparişler', ...sheet(od, [15, 18, 18, 11, 12, 11, 34, 14, 10, 12, 13, 10, 24]) });
const hv = [['Tarih', 'Firma', 'Ürün Kodu', 'Ürün', 'Hareket', 'Miktar (L)', 'Kalan (L)', 'Açıklama', 'İşlemi Yapan']];
(mv.data || []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).forEach(m => {
const p = prodOf(m.product_id);
hv.push([d(m.created_at), m.bayi || p.allowed_bayi || '', p.code || '', p.name || '(silinmiş kalem)', emn(m.movement_type), n(m.qty), n(m.balance_after), emn(m.note || ''), m.created_by || '']);
});
sheets.push({ name: 'Hareketler', ...sheet(hv, [18, 18, 11, 34, 20, 11, 11, 30, 18]) });
if (isAdmin()) {
const ur = [['Ürün Kodu', 'Ürün', 'Teneke (L)', 'Sertleştirici (L)', 'Atandığı Firmalar']];
catalog.slice().sort((a, b) => trCmp(a.name, b.name)).forEach(c => ur.push([c.code, c.name, n(c.pack_size), c.hardener_size == null ? '' : (Number(c.hardener_size) === 0 ? 'sertleştiricisiz' : n(c.hardener_size)),
products.filter(p => p.catalog_id === c.id).map(p => p.allowed_bayi).join(', ')]));
sheets.push({ name: 'Ürünler', ...sheet(ur, [12, 36, 11, 15, 30]) });
}
const who = isAdmin() ? 'Tum-Firmalar' : me.name.replace(/\s+/g, '-');
const fname = `Emanet-Stok-Yedek_${who}_${ymd(new Date())}.xlsx`;
const blob = xlsxBuild(sheets);
window._lastXlsx = blob;
downloadBlob(blob, fname);
notify(`Excel yedeği indirildi (${shipments.length} sevkiyat, ${orders.length} sipariş, ${(mv.data || []).length} hareket).`);
}
const visibleProducts = () => isAdmin() ? products : products.filter(p => p.allowed_bayi === me.name);
const bayiNames = () => [...new Set([...users.filter(u => u.role === 'bayi').map(u => u.name), ...products.map(p => p.allowed_bayi),
...shipments.map(s => s.supplier)])].sort(trCmp);
function balanceState(p) {
const q = Number(p.qty);
if (q < 0) return { cls: 'over-card', badge: `<span class="badge text-bg-danger" style="font-size:.6rem">Fazla teslim</span>`, txt: 'text-danger' };
if (q === 0) return { cls: 'done-card', badge: `<span class="badge text-bg-secondary" style="font-size:.6rem">Tamamlandı</span>`, txt: 'text-secondary' };
if (Number(p.critical) > 0 && q <= Number(p.critical))
return { cls: 'low-card', badge: `<span class="badge text-bg-warning" style="font-size:.6rem">Az kaldı</span>`, txt: '' };
return { cls: '', badge: '', txt: '' };
}
function preparePad(canvas, pad) {
const ratio = Math.max(window.devicePixelRatio || 1, 1);
canvas.width = canvas.offsetWidth * ratio;
canvas.height = canvas.offsetHeight * ratio;
canvas.getContext('2d').scale(ratio, ratio);
if (!pad) pad = new SignaturePad(canvas, { backgroundColor: 'rgb(255,255,255)', penColor: 'rgb(17,24,39)' });
pad.clear();
return pad;
}
const namesOf = firm => personnel.filter(x => x.firm === firm).map(x => x.name).sort(trCmp);
function personPicker(id, firm, current) {
const names = namesOf(firm);
const box = $(id);
box.dataset.firm = firm;
if (!names.length) {
box.innerHTML = `<input class="form-control pp-txt" placeholder="Ad Soyad" value="${esc(current || '')}">`;
return;
}
let sel = current || '';
if (!current) { const last = lsGet('yks_pp_' + firm); if (last && names.includes(last)) sel = last; }
const other = !!current && !names.includes(current);
box.innerHTML = `
<select class="form-select pp-sel" onchange="this.nextElementSibling.classList.toggle('d-none', this.value !== '__other'); if(this.value==='__other') this.nextElementSibling.focus()">
<option value="">Seçiniz...</option>
${names.map(n => `<option ${n === sel ? 'selected' : ''}>${esc(n)}</option>`).join('')}
<option value="__other" ${other ? 'selected' : ''}>Listede yok, elle yaz...</option>
</select>
<input class="form-control mt-2 pp-txt ${other ? '' : 'd-none'}" placeholder="Ad Soyad" value="${other ? esc(current) : ''}">`;
}
function readPerson(id) {
const box = $(id), s = box.querySelector('.pp-sel'), t = box.querySelector('.pp-txt');
const v = (!s || s.value === '__other' ? t.value : s.value).trim();
if (v && s && s.value !== '__other') lsSet('yks_pp_' + box.dataset.firm, v);
return v;
}
const editors = {};
function itemEditor(id, prods, items, withReceived) {
editors[id] = { prods: prods.slice().sort((a, b) => trCmp(a.name, b.name)), withReceived };
$(id).innerHTML = `<div class="it-rows"></div>
<button type="button" class="btn btn-sm btn-outline-dark w-100" onclick="addItemRow('${id}')"><i class="bi bi-plus-lg me-1"></i>Ürün Ekle</button>`;
if (!editors[id].prods.length) {
$(id).innerHTML = `<div class="alert alert-light border small mb-0">${isAdmin()
? 'Bu firmaya tanımlı emanet stok kalemi yok. Önce Emanet Stoklar ekranından ekleyin.'
: 'Size tanımlı ürün yok. Yıldız Kumlama Boya ile görüşün.'}</div>`;
return;
}
(items && items.length ? items : [{}]).forEach(it => addItemRow(id, it));
}
const packOf = pid => Number(META.packs[pid]) || 0;
const hardOf = pid => { const v = META.hards && META.hards[pid]; return v == null ? null : Number(v); };
const setOf = pid => packOf(pid) + (hardOf(pid) || 0);
function packTxt(pk, h) {
if (!(pk > 0)) return '';
return h > 0 ? `${num(pk)} L teneke + ${num(h)} L sertleştirici` : h === 0 ? `${num(pk)} L teneke, sertleştiricisiz` : `${num(pk)} L teneke`;
}
const tnkN = (pid, qty) => { const st = setOf(pid), q = Number(qty); return packOf(pid) && q > 0 ? r2(q / st) : 0; };
function tnk(pid, qty) {
const n = tnkN(pid, qty);
if (!n) return '';
return hardOf(pid) > 0 ? `${num(n)} teneke + ${num(n)} sertleştirici` : `${num(n)} teneke`;
}
const tnkSpan = (pid, qty, nh) => { const t = tnk(pid, qty, nh); return t ? ` <span class="tiny text-secondary fw-normal">(${t})</span>` : ''; };
const tnkLine = (pid, qty, nh) => { const t = tnk(pid, qty, nh); return t ? `<div class="doc-lbl">${t}</div>` : ''; };
const SHIP_EDITORS = ['sevkItems', 'editItems'];
function tnkI(i, q) {
const pid = i.product_id, pk = packOf(pid), h = hardOf(pid), hq = i.hardener_qty == null ? null : Number(i.hardener_qty);
q = Number(q);
if (!pk || !(q > 0)) return '';
if (h > 0 && hq > 0) {
const boya = Math.max(0, r2(q - Math.min(hq, q)));
return `${num(r2(boya / pk))} teneke + ${num(r2(Math.min(hq, q) / h))} sertleştirici`;
}
return `${num(r2(q / pk))} teneke${h > 0 && hq === 0 ? ' (sertleştiricisiz)' : ''}`;
}
function qL(i, q) {
q = Number(q);
const hq = Number(i.hardener_qty) || 0;
if (hq > 0 && hardOf(i.product_id) > 0 && q > 0) {
const h = Math.min(hq, q);
return `${num(r2(q - h))} L boya + ${num(h)} L sertleştirici`;
}
return `${num(q)} L`;
}
function totL(items) {
let hq = 0, all = 0;
items.forEach(i => { all += i.qty; if (Number(i.hardener_qty) > 0 && hardOf(i.product_id) > 0) hq += Math.min(Number(i.hardener_qty), i.qty); });
return hq > 0 ? `${num(r2(all - hq))} L boya + ${num(r2(hq))} L sertleştirici` : `${num(r2(all))} L`;
}
const tnkSpanI = (i, q) => { const t = tnkI(i, q); return t ? ` <span class="tiny text-secondary fw-normal">(${t})</span>` : ''; };
const tnkLineI = (i, q) => { const t = tnkI(i, q); return t ? `<div class="doc-lbl">${t}</div>` : ''; };
function addItemRow(id, it = {}) {
const ed = editors[id], rows = $(id).querySelector('.it-rows');
const used = new Set([...rows.querySelectorAll('.it-prod')].map(s => Number(s.value)));
let pid = it.product_id;
if (pid == null) {
const free = ed.prods.find(p => !used.has(p.id));
if (!free) return notify('Tanımlı tüm ürünler zaten eklendi.', 'warning');
pid = free.id;
}
const hqInit = it.hardener_qty > 0 ? Number(it.hardener_qty) : '';
const boyaInit = it.qty == null ? '' : (it.hardener_qty != null ? r2(Number(it.qty) - Number(it.hardener_qty)) : it.qty);
const row = document.createElement('div');
row.className = 'item-row';
row.innerHTML = `
<div class="d-flex gap-2 align-items-center">
<select class="form-select form-select-sm it-prod" onchange="updateTotals('${id}')">
${ed.prods.map(p => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)} • Kalan ${num(p.qty)} L${packOf(p.id) ? ` • ${packTxt(packOf(p.id), hardOf(p.id))}` : ''}</option>`).join('')}
</select>
<button type="button" class="btn btn-sm btn-outline-danger" title="Satırı sil" onclick="removeItemRow(this, '${id}')"><i class="bi bi-x-lg"></i></button>
</div>
<div class="row g-2 mt-1">
<div class="col">
<div class="tiny text-secondary it-qlbl">${ed.withReceived ? 'Bildirilen (L)' : 'Miktar (L)'}</div>
<input type="number" inputmode="decimal" class="form-control form-control-sm it-qty" value="${boyaInit}" placeholder="0" oninput="updateTotals('${id}')">
</div>
<div class="col it-hq-wrap d-none">
<div class="tiny text-secondary">Sertleştirici (L)</div>
<input type="number" inputmode="decimal" class="form-control form-control-sm it-hq" value="${hqInit}" placeholder="0" oninput="updateTotals('${id}')">
</div>
${ed.withReceived ? `
<div class="col">
<div class="tiny text-secondary">Teslim alınan toplam (L)</div>
<input type="number" inputmode="decimal" class="form-control form-control-sm it-rec" value="${it.received_qty ?? it.qty ?? ''}" placeholder="0">
</div>` : ''}
</div>
<div class="tiny text-primary it-pack mt-1"></div>
${ed.withReceived ? `<input class="form-control form-control-sm mt-2 it-note" placeholder="Not (eksik / hasarlı)" value="${esc(it.note || '')}">` : ''}`;
rows.appendChild(row);
updateTotals(id);
}
function removeItemRow(btn, id) {
const rows = btn.closest('.it-rows');
if (rows.children.length <= 1) return notify('En az bir ürün olmalı.', 'warning');
btn.closest('.item-row').remove();
updateTotals(id);
}
function updateTotals(id) {
const rows = [...$(id).querySelectorAll('.item-row')];
const ed = editors[id] || {};
let tk = 0, hk = 0, anyPack = false, total = 0;
rows.forEach(r => {
const pid = Number(r.querySelector('.it-prod').value), pk = packOf(pid), hl = hardOf(pid);
const hasHard = pk > 0 && hl > 0;
r.querySelector('.it-hq-wrap').classList.toggle('d-none', !hasHard);
r.querySelector('.it-qlbl').textContent = (ed.withReceived ? 'Bildirilen ' : '') + (hasHard ? 'boya (L)' : 'miktar (L)').replace(/^./, c => ed.withReceived ? c : c.toUpperCase());
const b = parseFloat(r.querySelector('.it-qty').value) || 0;
const hq = hasHard ? (parseFloat(r.querySelector('.it-hq').value) || 0) : 0;
r.querySelector('.it-hq').placeholder = hasHard && b > 0 ? `öneri ${num(r2(b / pk * hl))}` : '0';
total += b + hq;
const h = r.querySelector('.it-pack');
if (h) h.textContent = !pk ? '' : (b > 0 || hq > 0)
? `= ${num(r2(b / pk))} teneke${hasHard ? (hq > 0 ? ` + ${num(r2(hq / hl))} sertleştirici` : ' (sertleştiricisiz)') : ''}`
: packTxt(pk, hl);
if (pk) { anyPack = true; tk += b / pk; if (hasHard) hk += hq / hl; }
});
if (id !== 'sevkItems') return;
$('sevkTotal').innerText = rows.length ? `${rows.length} kalem • Toplam ${num(total)} L${anyPack && tk ? ` • ${num(r2(tk))} teneke${hk ? ` + ${num(r2(hk))} sertleştirici` : ''}` : ''}` : '';
}
function readItems(id) {
const ed = editors[id];
if (!ed || !$(id).querySelector('.it-rows')) { notify('Tanımlı ürün yok.', 'warning'); return null; }
const out = [], seen = new Set();
for (const row of $(id).querySelectorAll('.item-row')) {
const pid = Number(row.querySelector('.it-prod').value);
const p = ed.prods.find(x => x.id === pid);
const hasHard = packOf(pid) > 0 && hardOf(pid) > 0;
const bv = row.querySelector('.it-qty').value, hv = hasHard ? row.querySelector('.it-hq').value : '';
const b = bv === '' ? 0 : parseFloat(bv), hq = hv === '' ? 0 : parseFloat(hv);
if (!(b >= 0) || !(hq >= 0)) { notify(`${p ? p.name : 'Ürün'}: miktar geçersiz.`, 'warning'); return null; }
const qty = r2(b + hq);
if (!(qty > 0)) { notify(`${p ? p.name : 'Ürün'}: miktar giriniz.`, 'warning'); return null; }
if (seen.has(pid)) { notify(`${p.name} iki kez eklenmiş, tek satırda toplayın.`, 'warning'); return null; }
seen.add(pid);
const it = { product_id: pid, qty };
if (hasHard) { it.hardener_qty = r2(hq); it.no_hardener = hq === 0; }
if (ed.withReceived) {
const rv = row.querySelector('.it-rec').value;
const rec = rv === '' ? qty : parseFloat(rv);
if (!(rec >= 0)) { notify(`${p.name}: teslim alınan miktar geçersiz.`, 'warning'); return null; }
it.received_qty = rec;
it.note = row.querySelector('.it-note').value.trim();
}
out.push(it);
}
if (!out.length) { notify('En az bir ürün ekleyin.', 'warning'); return null; }
return out;
}
const LAST_USER_KEY = 'yks_son_kullanici';
function fillLastUser() {
const u = lsGet(LAST_USER_KEY) || '';
$('loginUser').value = u;
if (!me && !$('loginSection').classList.contains('d-none')) (u ? $('loginPass') : $('loginUser')).focus();
}
const SESSION_KEY = 'yks_alacak_oturum';
const sessionGet = () => { try { const v = localStorage.getItem(SESSION_KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
const sessionSet = v => { try { v ? localStorage.setItem(SESSION_KEY, JSON.stringify(v)) : localStorage.removeItem(SESSION_KEY); } catch (e) { /* yoksay */ } };
async function login(saved) {
const auto = !!(saved && saved.name);
const typed = auto ? saved.name : $('loginUser').value.trim(), pass = auto ? saved.pass : $('loginPass').value;
if (!typed || !pass) return notify('Kullanıcı adı ve şifre giriniz.', 'warning');
const { data, error } = await sb.rpc('portal_login', { p_name: typed, p_pass: pass });
if (error) { if (!auto) notify('Hata: ' + error.message, 'danger'); return; }
if (!data || !data.length) { if (auto) sessionSet(null); else notify('Kullanıcı adı veya şifre hatalı!', 'danger'); return; }
if (!auto) {
lsSet(LAST_USER_KEY, typed);
sessionSet($('loginRemember').checked ? { name: data[0].name, pass } : null);
}
me = data[0]; myPass = pass;
$('loginPass').value = '';
$('loginSection').classList.add('d-none');
$('bootLoading').classList.add('d-none');
$('appSection').classList.remove('d-none');
$('bottomNav').classList.remove('d-none');
$('logoutBtn').classList.remove('d-none');
$('settingsBtn').classList.remove('d-none');
$('liveDot').classList.remove('d-none');
$('userFirm').innerText = isAdmin() ? 'Yönetici' : me.name;
$('userRoleTitle').innerText = isAdmin() ? 'Emanet Stok Takibi' : 'Emanet Stok Takibi';
document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('d-none', !isAdmin()));
$('sevkNewBtn').classList.toggle('d-none', isAdmin());
$('navStokLabel').innerText = 'Depo';
$('orderTitle').innerText = isAdmin() ? 'Verilen Siparişler' : 'Yıldız Kumlama Boya Siparişleri';
$('stockTitle').innerText = isAdmin() ? 'Kalan Emanet Stoklar' : 'Teslim Edilecek Kalan';
setRange('month', false);
resetShipFilterInputs();
shipFilter = 'all'; pages.ship = pages.order = pages.moves = 1;
document.querySelectorAll('#shipFilterGroup .btn').forEach(b => b.classList.toggle('active', b.dataset.f === 'all'));
toggleShipFilters(false);
initRealtime();
try { await loadData(); } catch (e) { reportError('loadData', e); }
if (isAdmin()) { try { await loadUsers(); } catch (e) { reportError('loadUsers', e); } }
resetSevkForm();
navStack = []; currentTab = 'tabAna';
switchTab('tabAna', true);
armBackGuard();
pushOn = false; updatePushUi();
pushEnable(false);
}