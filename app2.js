function logout() {
if (me) pushDetach(me.name, myPass);
$('pushAsk').classList.add('d-none');
$('ordFormCard').classList.add('d-none'); $('ordOpenBtn').classList.remove('d-none');
sessionSet(null);
me = null; myPass = null;
navStack = []; currentTab = 'tabAna'; clearTimeout(exitTimer);
['adj', 'kalem', 'urun'].forEach(k => fold(k, false));
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
$('settingsBtn').classList.add('d-none');
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
if (!prev && currentTab !== 'tabAna') prev = 'tabAna';
if (!prev) return false;
if (!TABS.includes(prev) || (prev === 'tabSevkEt' && isAdmin()) || (prev === 'tabUrun' && !isAdmin())) prev = 'tabAna';
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
function reportError(where, e) {
const msg = `${where}: ${e && e.message || e}`;
if (!renderErrors.includes(msg)) renderErrors.push(msg);
console.error(where, e);
showLoadError();
}
window.addEventListener('error', ev => { if (me) reportError('Hata', ev.error || ev.message); });
window.addEventListener('unhandledrejection', ev => { if (me) reportError('Hata', ev.reason); });
async function loadData() {
const [res, m] = await Promise.all([Promise.resolve(sb.rpc('portal_data', { p_user: me.name, p_pass: myPass })).catch(e => ({ error: { message: String(e && e.message || e) } })),
Promise.resolve(sb.rpc('portal_meta', { p_user: me.name, p_pass: myPass })).catch(() => ({ error: true }))]);
renderErrors.length = 0;
if (res.error) {
renderErrors.push('Veriler yüklenemedi (portal_data): ' + res.error.message);
showLoadError();
if (/Oturum geçersiz/.test(res.error.message)) logout();
return;
}
if (m && m.error && m.error.message) renderErrors.push('portal_meta: ' + m.error.message);
const dd = res.data || {}, anyItem = [...(dd.orders || []), ...(dd.shipments || [])].map(x => (x.items || [])[0]).find(Boolean);
if (isAdmin() && anyItem && !('hardener_qty' in anyItem))
renderErrors.push("Sertleştirici litresi kaydedilemiyor: Supabase'de 11-sertlestirici-litre.sql dosyasını çalıştırın.");
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
const navId = TAB_PARENT[tabId] || tabId;
TABS.forEach(id => {
$(id).classList.toggle('d-none', id !== tabId);
const b = $('btn-' + id);
if (b) b.classList.toggle('active', id === navId);
});
$('settingsBtn').classList.toggle('active', tabId === 'tabAyarlar');
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
$('navShipBadge').textContent = waiting;
$('navShipBadge').classList.toggle('d-none', !(isAdmin() && waiting));
renderHomeCards();
const openOrders = orders.filter(isOrderOpen).length;
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
function renderHomeCards() {
const today = ymd(new Date()), soon = ymd(new Date(Date.now() + 3 * 864e5));
const pend = shipments.filter(isPending);
const open = orders.filter(isOrderOpen);
const dueList = open.filter(o => o.due_date && o.due_date <= soon).sort((a, b) => a.due_date.localeCompare(b.due_date));
const crit = products.filter(p => p.critical > 0 && p.qty <= p.critical);
const card = (icon, cls, title, count, body, onclick) => `
<div class="card p-3 ${onclick ? 'clickable' : ''}" ${onclick ? `onclick="${onclick}"` : ''}>
<div class="d-flex justify-content-between align-items-center">
<span class="fw-semibold small"><i class="bi ${icon} ${cls} me-1"></i>${title}</span>
<span class="badge ${count ? 'text-bg-dark' : 'text-bg-light border'}">${count}</span>
</div>${body ? `<div class="mt-2">${body}</div>` : ''}</div>`;
const line = (l, r, extra = '') => `<div class="item-line small"><span>${l}</span><span class="text-nowrap ${extra}">${r}</span></div>`;
const quick = isAdmin() ? `
<button class="btn btn-dark w-100" onclick="switchTab('tabSiparis'); toggleOrderForm(true)"><i class="bi bi-plus-lg me-1"></i>Yeni Sipariş</button>` : `
<button class="btn btn-dark w-100" onclick="switchTab('tabSevkEt')"><i class="bi bi-send me-1"></i>Sevkiyat Bildir</button>`;
const parts = [quick];
parts.push(card('bi-hourglass-split', 'text-warning', isAdmin() ? 'Onay bekleyen sevkiyatlar' : 'Onay bekleyen sevkiyatlarım', pend.length,
pend.slice(0, 5).map(s => line(`${isAdmin() ? esc(s.supplier) + ' • ' : ''}#${esc(s.irsaliye_no)}`, `${num(shipQty(s))} L`)).join('') + (pend.length > 5 ? `<div class="tiny text-secondary">+${pend.length - 5} daha</div>` : ''),
"switchTab('tabOnay'); setShipFilter('pending')"));
parts.push(card('bi-clipboard-check', 'text-primary', 'Açık siparişler', open.length,
open.slice(0, 5).map(o => { const pr = orderProgress(o); return line(`${isAdmin() ? esc(o.bayi) + ' • ' : ''}${orderNo(o)}`, `${num(pr.rem)} L kalan`); }).join('') + (open.length > 5 ? `<div class="tiny text-secondary">+${open.length - 5} daha</div>` : ''),
"switchTab('tabSiparis'); setOrderFilter('open')"));
if (dueList.length) parts.push(card('bi-calendar-event', 'text-danger', 'Termini geçen / yaklaşan', dueList.length,
dueList.slice(0, 5).map(o => line(`${isAdmin() ? esc(o.bayi) + ' • ' : ''}${orderNo(o)}`, dOnly(o.due_date + 'T00:00:00') + (o.due_date < today ? ' (gecikti)' : ''), o.due_date < today ? 'text-danger fw-semibold' : '')).join(''),
"switchTab('tabSiparis'); setOrderFilter('open')"));
if (isAdmin()) parts.push(card('bi-exclamation-triangle', 'text-danger', 'Kritik seviyedeki emanet stoklar', crit.length,
crit.length ? crit.slice(0, 6).map(p => line(`${esc(p.allowed_bayi)} • ${esc(p.name)}`, `${num(p.qty)} L`, 'text-danger fw-semibold')).join('') : '<div class="tiny text-secondary">Kritik seviyede kalem yok.</div>',
"switchTab('tabStok')"));
$('homeCards').innerHTML = parts.join('');
}
const PAGE_SIZE = 20;
const pages = { ship: 1, order: 1, moves: 1, audit: 1, stock: 1, cat: 1, per: 1, backup: 1 };
const PAGER_RENDER = { ship: () => renderShipments(), order: () => renderOrders(), moves: () => renderMovesList(), audit: () => renderAudit(),
stock: () => renderStock(), cat: () => renderCatalog(), per: () => renderPersonnel(), backup: () => renderBackups() };
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
const el = $({ ship: 'shipmentList', order: 'orderList', moves: 'repMoves', audit: 'auditList', stock: 'stockList', cat: 'catalogList', per: 'perList', backup: 'backupList' }[key]);
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
: qL(i, i.qty)}${tnkSpanI(i, isPending(s) ? i.qty : i.received_qty)}</span>
</div>`;
}).join('');
}
function renderShipments() {
const all = shipments;
const waiting = all.filter(isPending).length;
const openOrders = orders.filter(isOrderOpen).length;
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
async function createShipment() {
const no = $('sevkNo').value.trim();
if (!no) return notify('İrsaliye numarasını giriniz.', 'warning');
const person = readPerson('sevkPerson');
if (!person) return notify('İrsaliyeyi düzenleyen kişiyi seçin veya yazın.', 'warning');
const items = readItems('sevkItems');
if (!items) return;
if (!sevkPad || sevkPad.isEmpty()) return notify('Lütfen teslim eden olarak imzalayınız.', 'warning');
pendingSevk = { no, person, items, signature: sevkPad.toDataURL('image/png'), orderId: convertingOrder ? convertingOrder.id : null };
const o = convertingOrder;
const total = r2(items.reduce((a, i) => a + i.qty, 0));
const row = (k, v) => `<div class="d-flex justify-content-between border-bottom py-2 small"><span class="text-secondary">${k}</span><span class="fw-semibold text-end ms-3">${v}</span></div>`;
$('sevkConfirmBody').innerHTML = `
${row('Gönderen', esc(me.name))}
${row('İrsaliye No', '#' + esc(no))}
${o ? row('Sipariş', orderNo(o)) : ''}
${row('İrsaliyeyi Düzenleyen', esc(person))}
<table class="table table-sm align-middle mt-2 mb-1">
<thead><tr><th>Ürün</th>${o ? '<th class="text-end">Sipariş</th>' : ''}<th class="text-end">Gönderilen</th></tr></thead>
<tbody>${items.map(i => {
const p = prodById(i.product_id) || {};
const oi = o ? o.items.find(x => x.product_id === i.product_id) : null;
const diff = o && (!oi || oi.qty !== i.qty);
return `<tr><td>${esc(p.name)}</td>${o ? `<td class="text-end text-secondary">${oi ? num(oi.qty) + ' L' : '-'}</td>` : ''}
<td class="text-end fw-bold ${diff ? 'diff' : ''}">${qL(i, i.qty)}${tnkLineI(i, i.qty)}</td></tr>`;
}).join('')}
${o ? o.items.filter(oi => !items.some(i => i.product_id === oi.product_id)).map(oi =>
`<tr><td>${esc(oi.product_name)}</td><td class="text-end text-secondary">${num(oi.qty)} L</td><td class="text-end diff">gönderilmiyor</td></tr>`).join('') : ''}
</tbody>
<tfoot><tr><td class="fw-semibold">Toplam</td>${o ? `<td class="text-end text-secondary">${num(o.items.reduce((a, i) => a + i.qty, 0))} L</td>` : ''}<td class="text-end fw-bold">${num(total)} L</td></tr></tfoot>
</table>
<div class="small-label mt-2">Teslim Eden İmzası</div>
<img src="${pendingSevk.signature}" class="w-100 border rounded-3 bg-white" style="height:110px;object-fit:contain">
<div class="tiny text-secondary mt-2"><i class="bi bi-info-circle"></i> "Onayla & Gönder" dediğinizde sevkiyat Yıldız Kumlama Boya'ya iletilir. Teslim alınana kadar düzenleyebilir veya silebilirsiniz.</div>`;
sevkConfirmModal.show();
}
async function submitShipment() {
if (!pendingSevk) return;
const p = pendingSevk;
const r = await shipRpc('portal_create_shipment', { p_irsaliye: p.no, p_prepared_by: p.person, p_items: p.items,
p_signature: p.signature, p_order_id: p.orderId });
if (!r) return;
sevkConfirmModal.hide();
notify(p.orderId ? 'Sipariş sevkiyata dönüştürüldü, teslim onayı bekleniyor.' : 'Sevkiyat bildirildi, teslim onayı bekleniyor.');
await loadData();
resetSevkForm();
navStack = [];
switchTab('tabOnay', true);
}
let shareData = null;
function loadImg(src) {
return new Promise(res => { if (!src) return res(null); const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
}
function wrapLines(ctx, text, maxW) {
const words = String(text || '').split(/\s+/), out = [];
let line = '';
words.forEach(w => {
const t = line ? line + ' ' + w : w;
if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
});
if (line) out.push(line);
return out.length ? out : [''];
}