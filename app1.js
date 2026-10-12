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
let currentTab = 'tabOnay', navStack = [], exitTimer = null;
const TABS = ['tabOnay', 'tabSiparis', 'tabStok', 'tabSevkEt', 'tabUrun', 'tabRapor', 'tabAyarlar'];
const approveModal = new bootstrap.Modal('#approveModal');
const editModal = new bootstrap.Modal('#editModal');
const detailModal = new bootstrap.Modal('#detailModal');
const productModal = new bootstrap.Modal('#productModal');
const catModal = new bootstrap.Modal('#catModal');
const bayiModal = new bootstrap.Modal('#bayiModal');
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
if (r.error && /Could not find the function/.test(r.error.message)) return rpc(fn, params);
if (r.error) { notify(r.error.message, 'danger'); return null; }
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
function tnk(pid, qty, nh) {
const pk = packOf(pid), q = Number(qty), h = hardOf(pid);
if (!pk || !(q > 0)) return '';
if (nh && h > 0) return `${num(r2(q / pk))} teneke (sertleştiricisiz)`;
const n = num(r2(q / setOf(pid)));
return h > 0 ? `${n} teneke + ${n} sertleştirici` : h === 0 ? `${n} teneke (sertleştiricisiz)` : `${n} teneke`;
}
const tnkSpan = (pid, qty, nh) => { const t = tnk(pid, qty, nh); return t ? ` <span class="tiny text-secondary fw-normal">(${t})</span>` : ''; };
const tnkLine = (pid, qty, nh) => { const t = tnk(pid, qty, nh); return t ? `<div class="doc-lbl">${t}</div>` : ''; };
const SHIP_EDITORS = ['sevkItems', 'editItems'];
function addItemRow(id, it = {}) {
const ed = editors[id], rows = $(id).querySelector('.it-rows');
const used = new Set([...rows.querySelectorAll('.it-prod')].map(s => Number(s.value)));
let pid = it.product_id;
if (pid == null) {
const free = ed.prods.find(p => !used.has(p.id));
if (!free) return notify('Tanımlı tüm ürünler zaten eklendi.', 'warning');
pid = free.id;
}
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
<div class="tiny text-secondary">${ed.withReceived ? 'Bildirilen (L)' : 'Miktar (L)'}</div>
<input type="number" inputmode="decimal" class="form-control form-control-sm it-qty" value="${it.qty ?? ''}" placeholder="0" oninput="updateTotals('${id}')">
<div class="tiny text-primary it-pack mt-1"></div>
${SHIP_EDITORS.includes(id) ? `<div class="form-check mt-1 it-nh-wrap d-none">
<input class="form-check-input it-nh" type="checkbox" ${it.no_hardener ? 'checked' : ''} onchange="updateTotals('${id}')">
<label class="form-check-label tiny">Sertleştiricisiz</label></div>` : ''}
</div>
${ed.withReceived ? `
<div class="col">
<div class="tiny text-secondary">Teslim alınan (L)</div>
<input type="number" inputmode="decimal" class="form-control form-control-sm it-rec" value="${it.received_qty ?? it.qty ?? ''}" placeholder="0">
</div>` : ''}
</div>
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
let tk = 0, hk = 0, anyPack = false;
rows.forEach(r => {
const pid = Number(r.querySelector('.it-prod').value), q = parseFloat(r.querySelector('.it-qty').value) || 0;
const h = r.querySelector('.it-pack'), w = r.querySelector('.it-nh-wrap');
const hasHard = packOf(pid) > 0 && hardOf(pid) > 0;
if (w) w.classList.toggle('d-none', !hasHard);
const nh = hasHard && !!(w && r.querySelector('.it-nh').checked);
if (h) h.textContent = packOf(pid) ? (q > 0 ? `= ${tnk(pid, q, nh)}` : (nh ? `${num(packOf(pid))} L teneke, sertleştiricisiz` : packTxt(packOf(pid), hardOf(pid)))) : '';
if (packOf(pid)) {
anyPack = true;
if (nh) tk += q / packOf(pid);
else { tk += q / setOf(pid); if (hasHard) hk += q / setOf(pid); }
}
});
if (id !== 'sevkItems') return;
const total = rows.reduce((a, r) => a + (parseFloat(r.querySelector('.it-qty').value) || 0), 0);
$('sevkTotal').innerText = rows.length ? `${rows.length} kalem • Toplam ${num(total)} L${anyPack && tk ? ` • ${num(r2(tk))} teneke${hk ? ` + ${num(r2(hk))} sertleştirici` : ''}` : ''}` : '';
}
function readItems(id) {
const ed = editors[id];
if (!ed || !$(id).querySelector('.it-rows')) { notify('Tanımlı ürün yok.', 'warning'); return null; }
const out = [], seen = new Set();
for (const row of $(id).querySelectorAll('.item-row')) {
const pid = Number(row.querySelector('.it-prod').value);
const p = ed.prods.find(x => x.id === pid);
const qty = parseFloat(row.querySelector('.it-qty').value);
if (!(qty > 0)) { notify(`${p ? p.name : 'Ürün'}: miktar giriniz.`, 'warning'); return null; }
if (seen.has(pid)) { notify(`${p.name} iki kez eklenmiş, tek satırda toplayın.`, 'warning'); return null; }
seen.add(pid);
const it = { product_id: pid, qty };
const nhBox = row.querySelector('.it-nh');
if (nhBox && hardOf(pid) > 0) it.no_hardener = nhBox.checked;
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
$('liveDot').classList.remove('d-none');
$('userFirm').innerText = isAdmin() ? 'Yönetici' : me.name;
$('userRoleTitle').innerText = isAdmin() ? 'Emanet Stok Takibi' : 'Emanet Stok Takibi';
document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('d-none', !isAdmin()));
$('btn-tabSevkEt').classList.toggle('d-none', isAdmin());
$('btn-tabUrun').classList.toggle('d-none', !isAdmin());
$('navStokLabel').innerText = isAdmin() ? 'Emanet' : 'Kalan';
$('orderTitle').innerText = isAdmin() ? 'Verilen Siparişler' : 'Yıldız Kumlama Boya Siparişleri';
$('stockTitle').innerText = isAdmin() ? 'Kalan Emanet Stoklar' : 'Teslim Edilecek Kalan';
setRange('month', false);
resetShipFilterInputs();
shipFilter = 'all'; pages.ship = pages.order = pages.moves = 1;
document.querySelectorAll('#shipFilterGroup .btn').forEach(b => b.classList.toggle('active', b.dataset.f === 'all'));
toggleShipFilters(false);
initRealtime();
if (isAdmin()) await loadUsers();
await loadData();
resetSevkForm();
navStack = []; currentTab = 'tabOnay';
switchTab('tabOnay', true);
armBackGuard();
pushOn = false; updatePushUi();
pushEnable(false);
}
function logout() {
if (me) pushDetach(me.name, myPass);
$('pushAsk').classList.add('d-none');
sessionSet(null);
me = null; myPass = null;
navStack = []; currentTab = 'tabOnay'; clearTimeout(exitTimer);
catalog = []; products = []; shipments = []; personnel = []; users = []; backups = []; reportMoves = []; orders = [];
convertingOrder = null; pendingSevk = null;
closeDoc();
[approveModal, editModal, detailModal, productModal, catModal, bayiModal].forEach(m => m.hide());
if (channel) { sb.removeChannel(channel); channel = null; }
$('loginSection').classList.remove('d-none');
$('bootLoading').classList.add('d-none');
$('appSection').classList.add('d-none');
setTimeout(fillLastUser, 0);
$('bottomNav').classList.add('d-none');
$('logoutBtn').classList.add('d-none');
$('liveDot').classList.add('d-none');
$('userFirm').innerText = '';
$('userRoleTitle').innerText = 'Emanet Stok Takibi';
}
const VAPID_PUBLIC = 'BOGosaNnUI8PNLOw5X7T1XxXJBt70flv9tJdTGq76RkNOr9AzNOy9oDyXOdw5Xhxz8dE8ty55x_mH-JHUNBtmMI';
const PUSH_ASK_KEY = 'yks_bildirim_sorma', PUSH_OFF_KEY = 'yks_bildirim_kapali';
let pushOn = false;
const pushSupported = () => !DEMO && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
const pushWhatText = () => isAdmin()
? 'Firmalar yeni sevkiyat bildirdiğinde telefonunuza bildirim gelir (uygulama kapalıyken de).'
: 'Yeni sipariş geldiğinde ve sevkiyatınız teslim alındığında telefonunuza bildirim gelir (uygulama kapalıyken de).';
function b64ToBytes(s) {
const b = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
return Uint8Array.from(b, c => c.charCodeAt(0));
}
async function pushSubscription(create) {
const reg = await navigator.serviceWorker.ready;
let sub = await reg.pushManager.getSubscription();
if (sub && create) {
const k = sub.options && sub.options.applicationServerKey;
if (k && btoa(String.fromCharCode(...new Uint8Array(k))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== VAPID_PUBLIC) {
await sub.unsubscribe(); sub = null;
}
}
if (!sub && create) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC) });
return sub;
}
async function pushEnable(ask) {
if (!me || !pushSupported()) return updatePushUi();
if (!ask && lsGet(PUSH_OFF_KEY) === '1') return updatePushUi();
try {
if (Notification.permission !== 'granted') {
if (!ask) return updatePushUi();
const perm = await Notification.requestPermission();
if (perm !== 'granted') { lsSet(PUSH_ASK_KEY, '1'); notify('Bildirim izni verilmedi.', 'warning'); return updatePushUi(); }
}
const sub = await pushSubscription(true), j = sub.toJSON();
const { error } = await sb.rpc('portal_push_subscribe', { p_user: me.name, p_pass: myPass, p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
if (error) {
pushOn = false;
if (ask) notify(/portal_push_subscribe|function|schema cache/i.test(error.message)
? "Bildirimler için Supabase'de bildirim.sql kurulumunun çalıştırılması gerekiyor." : error.message, 'danger');
return updatePushUi();
}
pushOn = true;
lsSet(PUSH_OFF_KEY, '0');
if (ask) notify('Bildirimler açıldı.');
} catch (e) {
pushOn = false;
if (ask) notify('Bildirim açılamadı: ' + (e && e.message || e), 'danger');
}
updatePushUi();
}
async function pushDisable() {
try {
const sub = await pushSubscription(false);
if (sub) {
await sb.rpc('portal_push_unsubscribe', { p_user: me.name, p_pass: myPass, p_endpoint: sub.endpoint });
await sub.unsubscribe();
}
} catch (e) { /* yoksay */ }
pushOn = false; lsSet(PUSH_ASK_KEY, '1'); lsSet(PUSH_OFF_KEY, '1');
notify('Bu cihazda bildirimler kapatıldı.', 'secondary');
updatePushUi();
}
async function pushTest() {
const r = await rpc('portal_push_test');
if (!r) return;
notify(r.data ? 'Test bildirimi gönderildi, birkaç saniye içinde gelir.' : 'Bu hesapta bildirime açık cihaz yok.', r.data ? 'success' : 'warning');
}
function pushAskLater() { lsSet(PUSH_ASK_KEY, '1'); $('pushAsk').classList.add('d-none'); }
function pushDetach(name, pass) {
if (!pushSupported() || !name) return;
navigator.serviceWorker.ready.then(r => r.pushManager.getSubscription()).then(sub => {
if (sub) sb.rpc('portal_push_unsubscribe', { p_user: name, p_pass: pass, p_endpoint: sub.endpoint });
}).catch(() => {});
}
function updatePushUi() {
if (!me) return;
const sup = pushSupported(), perm = sup ? Notification.permission : 'unsupported';
$('pushWhat').innerText = pushWhatText();
$('pushAskText').innerText = pushWhatText();
$('pushAsk').classList.toggle('d-none', !(sup && perm === 'default' && lsGet(PUSH_ASK_KEY) !== '1'));
$('pushState').innerHTML = !sup
? (DEMO ? '<span class="text-secondary">Yerel modda bildirim yok.</span>'
: '<span class="text-warning-emphasis"><i class="bi bi-exclamation-triangle me-1"></i>Bu tarayıcı bildirimi desteklemiyor. Android\'de Chrome ile açın; iPhone\'da önce Paylaş → Ana Ekrana Ekle yapın ve oradan açın.</span>')
: perm === 'denied'
? '<span class="text-danger"><i class="bi bi-x-circle me-1"></i>Bildirim izni kapalı. Telefon Ayarlar → Uygulamalar (veya tarayıcı site ayarları) → Bildirimler kısmından izin verin.</span>'
: pushOn ? '<span class="text-success"><i class="bi bi-check-circle me-1"></i>Bu cihazda bildirimler açık.</span>'
: '<span class="text-secondary">Bu cihazda bildirimler kapalı.</span>';
$('pushOnBtn').classList.toggle('d-none', !sup || perm === 'denied' || pushOn);
$('pushTestBtn').classList.toggle('d-none', !pushOn);
$('pushOffBtn').classList.toggle('d-none', !pushOn);
}
function armBackGuard() {
try { history.pushState({ yks: Date.now() }, ''); } catch (e) { /* yoksay */ }
}
function handleBack() {
const open = document.querySelector('.modal.show');
if (open) { const m = bootstrap.Modal.getInstance(open); if (m) m.hide(); return true; }
if (!$('docView').classList.contains('d-none')) { closeDoc(); return true; }
let prev = navStack.pop();
while (prev && prev === currentTab) prev = navStack.pop();
if (!prev && currentTab !== 'tabOnay') prev = 'tabOnay';
if (!prev) return false;
if ($('btn-' + prev).classList.contains('d-none')) prev = 'tabOnay';
switchTab(prev, true);
return true;
}
window.addEventListener('popstate', () => {
if (!me) return;
clearTimeout(exitTimer);
if (handleBack()) { armBackGuard(); return; }
notify('Çıkmak için tekrar geri tuşuna basın.', 'secondary');
exitTimer = setTimeout(armBackGuard, 2000);
});
function initRealtime() {
if (channel) sb.removeChannel(channel);
channel = sb.channel('portal-pulse')
.on('postgres_changes', { event: '*', schema: 'public', table: 'portal_pulse' }, scheduleReload)
.subscribe(status => $('liveDot').classList.toggle('on', status === 'SUBSCRIBED'));
}
function scheduleReload() {
clearTimeout(reloadTimer);
reloadTimer = setTimeout(async () => {
if (!me) return;
await loadData();
if (!$('tabRapor').classList.contains('d-none')) loadReport();
}, 500);
}
const renderErrors = [];
function showLoadError() {
const box = $('loadErr');
if (!box) return;
box.classList.toggle('d-none', !renderErrors.length);
box.innerHTML = renderErrors.length ? `<i class="bi bi-exclamation-octagon me-1"></i><b>Bir sorun oluştu, bu metni Claude'a iletin:</b><div class="tiny mt-1" style="word-break:break-word">${renderErrors.map(esc).join('<br>')}</div>` : '';
}
async function loadData() {
const [res, m] = await Promise.all([sb.rpc('portal_data', { p_user: me.name, p_pass: myPass }).catch(e => ({ error: { message: String(e && e.message || e) } })),
sb.rpc('portal_meta', { p_user: me.name, p_pass: myPass }).catch(() => ({ error: true }))]);
renderErrors.length = 0;
if (res.error) {
renderErrors.push('Veriler yüklenemedi (portal_data): ' + res.error.message);
showLoadError();
if (/Oturum geçersiz/.test(res.error.message)) logout();
return;
}
if (m && m.error && m.error.message) renderErrors.push('portal_meta: ' + m.error.message);
const r = res;
META = m && !m.error && m.data ? { packs: m.data.packs || {}, hards: m.data.hards || {}, logos: m.data.logos || {} } : { packs: {}, hards: {}, logos: {} };
const d = r.data || {};
catalog = d.catalog || [];
products = (d.products || []).map(p => ({ ...p, qty: Number(p.qty), critical: Number(p.critical) }));
shipments = (d.shipments || []).map(s => ({ ...s, items: (s.items || []).map(i => ({
...i, qty: Number(i.qty), received_qty: i.received_qty == null ? null : Number(i.received_qty) })) }));
personnel = d.personnel || [];
orders = (d.orders || []).map(o => ({ ...o, items: (o.items || []).map(i => ({ ...i, qty: Number(i.qty) })) }));
render();
}
function switchTab(tabId, fromBack = false) {
if (!fromBack && tabId !== currentTab) {
navStack.push(currentTab);
if (navStack.length > 20) navStack.shift();
}
currentTab = tabId;
TABS.forEach(id => {
$(id).classList.toggle('d-none', id !== tabId);
$('btn-' + id).classList.toggle('active', id === tabId);
});
if (tabId === 'tabRapor') loadReport();
if (tabId === 'tabSevkEt' && !isAdmin()) sevkPad = preparePad($('sevkSigCanvas'), sevkPad);
if (tabId === 'tabAyarlar' && isAdmin()) { loadUsers(); loadBackups(); loadAudit(); }
window.scrollTo(0, 0);
}
function render() {
if (!me) return;
[renderHome, renderShipments, renderStock, renderCatalog, renderPersonnel, renderOrders, fillSelects].forEach(fn => {
try { fn(); } catch (e) {
const msg = `${fn.name}: ${e && e.message || e}`;
if (!renderErrors.includes(msg)) renderErrors.push(msg);
console.error(fn.name, e);
}
});
showLoadError();
}
function renderHome() {
const waiting = shipments.filter(isPending).length;
const openOrders = orders.filter(o => orderState(o) === 'open').length;
$('navOrderBadge').textContent = openOrders;
$('navOrderBadge').classList.toggle('d-none', !openOrders);
const orderLine = openOrders ? `<div class="tiny mt-1 clickable text-primary" onclick="switchTab('tabSiparis')"><i class="bi bi-clipboard-check"></i> ${openOrders} açık sipariş</div>` : '';
if (!isAdmin()) {
const left = r2(products.reduce((a, p) => a + Math.max(0, p.qty), 0));
$('homeHero').innerHTML = `
<div class="card hero p-3 mb-3 d-flex flex-row align-items-center gap-3">
<div class="flex-shrink-0">${firmLogo(me.name, 56)}</div>
<div class="flex-grow-1">
<div class="fw-semibold">${esc(me.name)}</div>
<div class="tiny text-secondary mb-1">Yıldız Kumlama Boya'ya teslim edilecek kalan</div>
<div class="big">${num(left)} L</div>
<div class="tiny text-secondary mt-1">${waiting ? `<span class="text-warning-emphasis"><i class="bi bi-hourglass-split"></i> ${waiting} sevkiyat onay bekliyor</span>` : 'Onay bekleyen sevkiyat yok'}</div>
${orderLine}
</div>
</div>`;
return;
}
const byBayi = {};
products.forEach(p => { byBayi[p.allowed_bayi] = r2((byBayi[p.allowed_bayi] || 0) + Math.max(0, p.qty)); });
const names = Object.keys(byBayi).sort(trCmp);
const total = r2(names.reduce((a, n) => a + byBayi[n], 0));
$('homeHero').innerHTML = !names.length ? '' : `
<div class="card hero p-3 mb-3">
<div class="d-flex justify-content-between align-items-end mb-2">
<div><div class="tiny text-secondary">Toplam kalan emanet stok</div><div class="big">${num(total)} L</div></div>
<div class="tiny text-secondary text-end">${waiting ? `<span class="text-warning-emphasis fw-semibold">${waiting} sevkiyat<br>onay bekliyor</span>` : 'Bekleyen sevkiyat yok'}${orderLine}</div>
</div>
<div class="d-flex flex-wrap gap-2">
${names.map(n => `<div class="border rounded-3 bg-white px-2 py-1 d-flex align-items-center gap-2 clickable" onclick="switchTab('tabStok')">
${firmLogo(n, 22)}<span class="small fw-semibold">${num(byBayi[n])} L</span></div>`).join('')}
</div>
</div>`;
}
const PAGE_SIZE = 20;
const pages = { ship: 1, order: 1, moves: 1, audit: 1 };
const PAGER_RENDER = { ship: () => renderShipments(), order: () => renderOrders(), moves: () => renderMovesList(), audit: () => renderAudit() };
function pageSlice(list, key) {
const total = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
pages[key] = Math.min(Math.max(1, pages[key]), total);
const start = (pages[key] - 1) * PAGE_SIZE;
return list.slice(start, start + PAGE_SIZE);
}
function pagerHtml(count, key) {
const total = Math.ceil(count / PAGE_SIZE);
if (total <= 1) return '';
const cur = Math.min(Math.max(1, pages[key]), total);
const nums = [...new Set([1, cur - 1, cur, cur + 1, total])].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
let html = '', prev = 0;
nums.forEach(n => {
if (n - prev > 1) html += '<span class="text-secondary small">…</span>';
html += `<button class="btn btn-sm ${n === cur ? 'btn-dark' : 'btn-light border'}" onclick="goPage('${key}', ${n})">${n}</button>`;
prev = n;
});
const from = (cur - 1) * PAGE_SIZE + 1, to = Math.min(cur * PAGE_SIZE, count);
return `<div class="pager">
<button class="btn btn-sm btn-light border" ${cur <= 1 ? 'disabled' : ''} onclick="goPage('${key}', ${cur - 1})"><i class="bi bi-chevron-left"></i></button>
${html}
<button class="btn btn-sm btn-light border" ${cur >= total ? 'disabled' : ''} onclick="goPage('${key}', ${cur + 1})"><i class="bi bi-chevron-right"></i></button>
</div><div class="tiny text-secondary text-center mt-1">${from}–${to} / ${count} kayıt</div>`;
}