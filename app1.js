const ADMIN_FIRM = 'Yıldız Kumlama Boya';
function firmLogo(name, h = 20) {
const L = LOGOS[name];
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
const APP_TITLE = 'Yıldız Kumlama Boya - Alacak Takibi';
let me = null, myPass = null;
let catalog = [], products = [], shipments = [], personnel = [], users = [], backups = [], reportMoves = [], orders = [];
let orderFilter = 'open', editingOrder = null, convertingOrder = null, pendingSevk = null;
let shipFilter = 'all', editing = null, approving = null, signaturePad = null, sevkPad = null;
let bayiEditingNew = false, editingProduct = null, editingCat = null;
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
function notify(msg, type = 'success') {
$('appToast').className = `toast align-items-center border-0 text-bg-${type}`;
$('toastMsg').innerText = msg;
toast.show();
}
async function busy(btn, fn) {
if (btn.disabled) return;
btn.disabled = true;
try { await fn(); } finally { btn.disabled = false; }
}
async function rpc(fn, params = {}) {
const { data, error } = await sb.rpc(fn, { p_user: me.name, p_pass: myPass, ...params });
if (error) {
notify(error.message, 'danger');
if (/Oturum geçersiz/.test(error.message)) logout();
return null;
}
return { data };
}
function download(content, filename, type) {
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
? 'Bu firmaya tanımlı alacak kalemi yok. Önce Alacaklar ekranından ekleyin.'
: 'Size tanımlı ürün yok. Yıldız Kumlama Boya ile görüşün.'}</div>`;
return;
}
(items && items.length ? items : [{}]).forEach(it => addItemRow(id, it));
}
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
${ed.prods.map(p => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)} • Kalan ${num(p.qty)} L</option>`).join('')}
</select>
<button type="button" class="btn btn-sm btn-outline-danger" title="Satırı sil" onclick="removeItemRow(this, '${id}')"><i class="bi bi-x-lg"></i></button>
</div>
<div class="row g-2 mt-1">
<div class="col">
<div class="tiny text-secondary">${ed.withReceived ? 'Bildirilen (L)' : 'Miktar (L)'}</div>
<input type="number" inputmode="decimal" class="form-control form-control-sm it-qty" value="${it.qty ?? ''}" placeholder="0" oninput="updateTotals('${id}')">
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
if (id !== 'sevkItems') return;
const rows = [...$(id).querySelectorAll('.item-row')];
const total = rows.reduce((a, r) => a + (parseFloat(r.querySelector('.it-qty').value) || 0), 0);
$('sevkTotal').innerText = rows.length ? `${rows.length} kalem • Toplam ${num(total)} L` : '';
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
async function loadLogins() {
const { data, error } = await sb.rpc('portal_login_list');
if (error) {
$('loginRole').innerHTML = '<option value="">Bağlantı hatası</option>';
return notify('Hesaplar yüklenemedi: ' + error.message, 'danger');
}
$('loginRole').innerHTML = (data || []).map(u =>
`<option value="${esc(u.name)}">${esc(u.name)}${u.role === 'admin' ? ' (Yönetici)' : ''}</option>`).join('');
}
const SESSION_KEY = 'yks_alacak_oturum';
const sessionGet = () => { try { const v = localStorage.getItem(SESSION_KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
const sessionSet = v => { try { v ? localStorage.setItem(SESSION_KEY, JSON.stringify(v)) : localStorage.removeItem(SESSION_KEY); } catch (e) { /* yoksay */ } };
async function login(saved) {
const auto = !!(saved && saved.name);
const name = auto ? saved.name : $('loginRole').value, pass = auto ? saved.pass : $('loginPass').value;
if (!name || !pass) return notify('Hesap ve şifre giriniz.', 'warning');
const { data, error } = await sb.rpc('portal_login', { p_name: name, p_pass: pass });
if (error) { if (!auto) notify('Hata: ' + error.message, 'danger'); return; }
if (!data || !data.length) { if (auto) sessionSet(null); else notify('Hatalı şifre!', 'danger'); return; }
if (!auto) sessionSet($('loginRemember').checked ? { name, pass } : null);
me = data[0]; myPass = pass;
$('loginPass').value = '';
$('loginSection').classList.add('d-none');
$('bootLoading').classList.add('d-none');
$('appSection').classList.remove('d-none');
$('bottomNav').classList.remove('d-none');
$('logoutBtn').classList.remove('d-none');
$('liveDot').classList.remove('d-none');
$('userFirm').innerText = isAdmin() ? 'Yönetici' : me.name;
$('userRoleTitle').innerText = isAdmin() ? 'Alacak Takibi' : 'Alacak Takibi';
document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('d-none', !isAdmin()));
$('btn-tabSevkEt').classList.toggle('d-none', isAdmin());
$('btn-tabUrun').classList.toggle('d-none', !isAdmin());
$('navStokLabel').innerText = isAdmin() ? 'Alacak' : 'Kalan';
$('orderTitle').innerText = isAdmin() ? 'Verilen Siparişler' : 'Yıldız Kumlama Boya Siparişleri';
$('stockTitle').innerText = isAdmin() ? 'Kalan Alacaklar' : 'Teslim Edilecek Kalan';
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
}
function logout() {
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
$('bottomNav').classList.add('d-none');
$('logoutBtn').classList.add('d-none');
$('liveDot').classList.add('d-none');
$('userFirm').innerText = '';
$('userRoleTitle').innerText = 'Alacak Takibi';
loadLogins();
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
async function loadData() {
const r = await rpc('portal_data');
if (!r) return;
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
renderHome();
renderShipments();
renderStock();
renderCatalog();
renderPersonnel();
renderOrders();
fillSelects();
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
<div><div class="tiny text-secondary">Toplam kalan alacak</div><div class="big">${num(total)} L</div></div>
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
function goPage(key, n) {
pages[key] = n;
PAGER_RENDER[key]();
const el = $({ ship: 'shipmentList', order: 'orderList', moves: 'repMoves', audit: 'auditList' }[key]);
if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 140), behavior: 'smooth' });
}
function setShipFilter(f) {
shipFilter = f;
document.querySelectorAll('#shipFilterGroup .btn').forEach(b => b.classList.toggle('active', b.dataset.f === f));
pages.ship = 1;
renderShipments();
}
function toggleShipFilters(force) {
const card = $('shipFilterCard');
const show = force !== undefined ? force : card.classList.contains('d-none');
card.classList.toggle('d-none', !show);
$('shipFilterChev').className = 'bi ms-auto ' + (show ? 'bi-chevron-up' : 'bi-chevron-down');
}
function shipFiltersChanged() {
pages.ship = 1;
renderShipments();
}
function setShipRange(kind) {
const d = new Date(); let f = null, t = null;
if (kind === 'today') { f = new Date(d); t = new Date(d); }
else if (kind === 'week') { f = new Date(d); f.setDate(d.getDate() - ((d.getDay() + 6) % 7)); t = new Date(d); }
else if (kind === 'month') { f = new Date(d.getFullYear(), d.getMonth(), 1); t = new Date(d); }
else if (kind === 'lastmonth') { f = new Date(d.getFullYear(), d.getMonth() - 1, 1); t = new Date(d.getFullYear(), d.getMonth(), 0); }
else if (kind === 'year') { f = new Date(d.getFullYear(), 0, 1); t = new Date(d); }
$('shipFrom').value = f ? ymd(f) : '';
$('shipTo').value = t ? ymd(t) : '';
shipFiltersChanged();
}
function resetShipFilterInputs() {
['shipFrom', 'shipTo', 'shipFirm', 'shipProduct', 'shipSearch'].forEach(id => { $(id).value = ''; });
$('shipDateType').value = 'created';
}
function clearShipFilters() {
resetShipFilterInputs();
setShipFilter('all');
}
function fillShipSelects() {
const keep = (id, html) => { const el = $(id), cur = el.value; el.innerHTML = html; el.value = [...el.options].some(o => o.value === cur) ? cur : ''; };
if (isAdmin()) keep('shipFirm', '<option value="">Tüm Firmalar</option>' + bayiNames().map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join(''));
const firm = isAdmin() ? $('shipFirm').value : '';
const names = [...new Set([
...visibleProducts().filter(p => !firm || p.allowed_bayi === firm).map(p => p.name),
...shipments.filter(s => !firm || s.supplier === firm).flatMap(s => s.items.map(i => i.product_name))
].filter(Boolean))].sort(trCmp);
keep('shipProduct', '<option value="">Tüm Ürünler</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join(''));
}
function shipDateRange() {
const from = $('shipFrom').value, to = $('shipTo').value;
const f = from ? new Date(from + 'T00:00:00') : null;
let t = null;
if (to) { t = new Date(to + 'T00:00:00'); t.setDate(t.getDate() + 1); }
return { f, t, byApproved: $('shipDateType').value === 'approved' };
}
function baseFilteredShipments() {
let list = shipments;
const { f, t, byApproved } = shipDateRange();
if (f || t) list = list.filter(s => {
const v = byApproved ? s.approved_at : s.created_at;
if (!v) return false;
const d = new Date(v);
return (!f || d >= f) && (!t || d < t);
});
const firm = isAdmin() ? $('shipFirm').value : '';
if (firm) list = list.filter(s => s.supplier === firm);
const prod = $('shipProduct').value;
if (prod) list = list.filter(s => s.items.some(i => i.product_name === prod));
const q = $('shipSearch').value.trim().toLocaleLowerCase('tr');
if (q) list = list.filter(s => [s.irsaliye_no, s.supplier, s.prepared_by, s.received_by, s.order_id ? orderNoById(s.order_id) : '', ...s.items.map(i => i.product_name)]
.join(' ').toLocaleLowerCase('tr').includes(q));
return list;
}
function updateShipFilterSummary(approvedCount) {
const { f, t, byApproved } = shipDateRange();
const parts = [];
if (f || t) parts.push((byApproved ? 'Teslim ' : '') + (f ? dOnly(f) : '…') + ' – ' + ($('shipTo').value ? dOnly($('shipTo').value + 'T00:00:00') : '…'));
else parts.push('Tüm tarihler');
if (isAdmin() && $('shipFirm').value) parts.push($('shipFirm').value);
if ($('shipProduct').value) parts.push($('shipProduct').value);
const active = !!(f || t || (isAdmin() && $('shipFirm').value) || $('shipProduct').value);
$('shipFilterSummary').innerText = 'Filtre: ' + parts.join(' • ');
$('shipFilterToggle').classList.toggle('border-primary', active);
$('shipFilterToggle').classList.toggle('text-primary', active);
$('bulkDocBtn').innerHTML = `<i class="bi bi-files me-1"></i>Toplu Belge (${approvedCount})`;
$('bulkDocBtn').disabled = !approvedCount;
}
function statusBadge(s) {
if (isPending(s)) return `<span class="badge text-bg-warning bg-opacity-75">Onay Bekliyor</span>`;
const d = shipDiff(s);
return `<span class="badge text-bg-success bg-opacity-75">Teslim Alındı</span>` +
(d ? ` <span class="badge text-bg-${d === 'eksik' ? 'danger' : 'info'} bg-opacity-75">${d === 'eksik' ? 'Eksik' : 'Fazla'}</span>` : '');
}
function itemLines(s) {
return s.items.map(i => {
const diff = !isPending(s) && i.received_qty !== i.qty;
return `<div class="item-line">
<span>${esc(i.product_name)}</span>
<span class="text-nowrap ${diff ? 'diff fw-semibold' : 'fw-medium'}">${diff
? `${num(i.qty)} → ${num(i.received_qty)} L`
: `${num(i.qty)} L`}</span>
</div>`;
}).join('');
}
function renderShipments() {
const all = shipments;
const waiting = all.filter(isPending).length;
const openOrders = orders.filter(o => orderState(o) === 'open').length;
$('pendingAlert').innerHTML = isAdmin()
? (waiting ? `<div class="alert alert-warning small py-2 d-flex align-items-center gap-2 clickable" onclick="setShipFilter('pending')">
<i class="bi bi-bell"></i><span><b>${waiting}</b> sevkiyat teslim onayı bekliyor.</span></div>` : '')
: (openOrders ? `<div class="alert alert-primary small py-2 d-flex align-items-center gap-2 clickable" onclick="switchTab('tabSiparis')">
<i class="bi bi-clipboard-check"></i><span>Yıldız Kumlama Boya'dan <b>${openOrders}</b> açık sipariş var. Sevkiyata dönüştürmek için dokunun.</span></div>` : '');
fillShipSelects();
const base = baseFilteredShipments();
let list = base;
if (shipFilter === 'pending') list = list.filter(isPending);
if (shipFilter === 'approved') list = list.filter(s => !isPending(s));
updateShipFilterSummary(base.filter(s => !isPending(s)).length);
$('shipmentCount').innerText = `${list.length} kayıt`;
if (!list.length) {
$('shipmentList').innerHTML = `<div class="card p-4 text-center text-secondary small"><i class="bi bi-inbox fs-3 d-block mb-1"></i>Kayıt bulunamadı.</div>`;
$('shipPager').innerHTML = '';
return;
}
$('shipPager').innerHTML = pagerHtml(list.length, 'ship');
$('shipmentList').innerHTML = pageSlice(list, 'ship').map(s => {
const pending = isPending(s);
const canEdit = isAdmin() || (s.supplier === me.name && pending);
return `
<div class="card p-3 clickable" onclick="openDetail(${s.id})">
<div class="d-flex justify-content-between align-items-start gap-2 mb-2">
<div>
<div class="d-flex align-items-center gap-2 flex-wrap">
${isAdmin() ? firmLogo(s.supplier, 20) : ''}<span class="badge text-bg-light border fw-medium">${esc(s.supplier)}</span>
<span class="fw-semibold small">#${esc(s.irsaliye_no)}</span>
</div>
<div class="tiny text-secondary mt-1">${s.order_id ? `<i class="bi bi-clipboard-check"></i> ${orderNoById(s.order_id)} • ` : ''}Düzenleyen: ${esc(s.prepared_by || '-')}${s.received_by ? ` • Teslim alan: ${esc(s.received_by)}` : ''}</div>
</div>
<div class="text-end">${statusBadge(s)}</div>
</div>
<div class="border-top pt-1">${itemLines(s)}</div>
${s.items.length > 1 ? `<div class="item-line border-top mt-1 pt-1 text-secondary"><span>Toplam</span><span>${pending ? num(shipQty(s)) : num(shipRecv(s))} L</span></div>` : ''}
<div class="text-secondary tiny mt-2">
<i class="bi bi-clock"></i> ${dt(s.created_at)}
${s.approved_at ? ` • <i class="bi bi-check2-circle"></i> ${dt(s.approved_at)}` : ''}
${s.updated_at ? ` • <span class="text-primary"><i class="bi bi-pencil"></i> Düzenlendi</span>` : ''}
</div>
${pending && isAdmin() ? `
<button onclick="event.stopPropagation(); openApprove(${s.id})" class="btn btn-sm btn-dark w-100 mt-3">
<i class="bi bi-pen me-1"></i>Teslim Al & İmzala
</button>` : ''}
${!pending ? `
<button onclick="event.stopPropagation(); openDoc(${s.id})" class="btn btn-sm btn-outline-secondary w-100 mt-2">
<i class="bi bi-file-earmark-text me-1"></i>Teslimat Belgesi
</button>` : ''}
${canEdit ? `
<div class="d-flex gap-2 mt-2">
<button onclick="event.stopPropagation(); openEdit(${s.id})" class="btn btn-sm btn-light border flex-fill"><i class="bi bi-pencil me-1"></i>Düzenle</button>
<button onclick="event.stopPropagation(); busy(this, () => deleteShipment(${s.id}))" class="btn btn-sm btn-outline-danger flex-fill"><i class="bi bi-trash me-1"></i>Sil</button>
</div>` : ''}
</div>`;
}).join('');
}
function resetSevkForm() {
if (!me || isAdmin()) return;
convertingOrder = null; pendingSevk = null;
$('sevkOrderBanner').classList.add('d-none');
$('sevkNo').value = '';
personPicker('sevkPerson', me.name, '');
itemEditor('sevkItems', visibleProducts(), [], false);
if (sevkPad) sevkPad.clear();
}