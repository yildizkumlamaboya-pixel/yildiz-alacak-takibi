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
function orderShareText(o) {
const st = orderState(o);
const lines = [`*SİPARİŞ ${orderNo(o)}*`, `Yıldız Kumlama Boya → ${o.bayi}`, `Tarih: ${dt(o.created_at)}`];
if (o.due_date) lines.push(`Termin: ${dOnly(o.due_date + 'T00:00:00')}`);
if (st !== 'open') lines.push(`Durum: ${({ cancelled: 'İptal', converted: 'Tamamlandı', partial: `Kısmi sevk (kalan ${num(orderProgress(o).rem)} L)` })[st]}`);
lines.push('');
o.items.forEach(i => { const t = tnkI(i, i.qty); lines.push(`• ${i.product_name}: *${qL(i, i.qty)}*${t ? ` — ${t}` : ''}`); });
const total = r2(o.items.reduce((a, i) => a + i.qty, 0));
if (o.items.length > 1) lines.push(`Toplam: ${totL(o.items)}`);
if (o.note) lines.push('', `Not: ${o.note}`);
return lines.join('\n');
}
async function drawOrderImage(o, opt) {
const W = 1080, P = 64, c = document.createElement('canvas'), ctx = c.getContext('2d');
const F = (w, s) => `${w} ${s}px Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
const st0 = opt ? null : orderState(o);
opt = opt || {
title: 'SİPARİŞ', no: orderNo(o), d1: ['SİPARİŞ TARİHİ', dt(o.created_at)],
d2: o.due_date ? ['TERMİN', dOnly(o.due_date + 'T00:00:00')] : null,
status: st0 === 'open' ? null : { cancelled: ['İPTAL', '#dc3545'], converted: ['TAMAMLANDI', '#198754'], partial: ['KISMİ SEVK', '#b45309'] }[st0]
};
const total = r2(o.items.reduce((a, i) => a + i.qty, 0));
ctx.font = F(600, 34);
const rows = o.items.map(i => {
ctx.font = F(600, 34); const name = wrapLines(ctx, i.product_name, W - 2 * P - 300);
ctx.font = F(400, 26);
const hqv = Number(i.hardener_qty) > 0 && hardOf(i.product_id) > 0 ? Math.min(Number(i.hardener_qty), i.qty) : 0;
const t = [hqv ? `+ ${num(hqv)} L sertleştirici` : '', tnkI(i, i.qty)].filter(Boolean).join(' • '), sub = t ? wrapLines(ctx, t, W - 2 * P - 40) : [];
return { i, name, sub, h: 34 + name.length * 44 + sub.length * 34 + 22 };
});
ctx.font = F(600, 30);
const noteL = o.note ? wrapLines(ctx, 'Not: ' + o.note, W - 2 * P - 48) : [];
const H = 230 + 250 + 70 + rows.reduce((a, r) => a + r.h, 0) + (o.items.length > 1 ? 130 : 0) + (noteL.length ? 70 + noteL.length * 40 : 0) + 120;
c.width = W; c.height = H;
ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
ctx.fillStyle = '#111111'; ctx.fillRect(0, 0, W, 200);
ctx.fillStyle = '#FFD41F'; ctx.fillRect(0, 200, W, 10);
const myL = (META.logos && META.logos['Yıldız Kumlama Boya']) || LOGOS['Yıldız Kumlama Boya'];
const logo = await loadImg(myL && myL.src);
ctx.fillStyle = '#ffffff';
if (logo) {
const lh = 120, lw = Math.min(460, lh * (logo.width / logo.height));
ctx.fillRect(P - 16, 40, lw + 32, lh + 0);
ctx.drawImage(logo, P, 40, lw, lh);
} else { ctx.font = F(800, 52); ctx.fillText('YILDIZ KUMLAMA BOYA', P, 120); }
ctx.textAlign = 'right'; ctx.fillStyle = '#FFD41F'; ctx.font = F(800, 46); ctx.fillText(opt.title, W - P, 98);
ctx.fillStyle = '#ffffff'; ctx.font = F(600, 32); ctx.fillText(opt.no, W - P, 146);
ctx.textAlign = 'left';
let y = 250;
const firmL = (META.logos && META.logos[o.bayi]) || LOGOS[o.bayi], fl = await loadImg(firmL && firmL.src);
ctx.fillStyle = '#f4f5f7'; ctx.fillRect(P, y, W - 2 * P, 210);
ctx.fillStyle = '#6b7280'; ctx.font = F(500, 24); ctx.fillText('FİRMA', P + 28, y + 44);
ctx.fillStyle = '#111111'; ctx.font = F(700, 40); ctx.fillText(o.bayi, P + 28, y + 92);
if (fl) { const h2 = 90, w2 = Math.min(240, h2 * fl.width / fl.height); ctx.drawImage(fl, W - P - 28 - w2, y + 24, w2, h2); }
ctx.fillStyle = '#6b7280'; ctx.font = F(500, 24);
ctx.fillText(opt.d1[0], P + 28, y + 146); if (opt.d2) ctx.fillText(opt.d2[0], P + 420, y + 146);
ctx.fillStyle = '#111111'; ctx.font = F(600, 30);
ctx.fillText(opt.d1[1], P + 28, y + 186); if (opt.d2) ctx.fillText(opt.d2[1], P + 420, y + 186);
if (opt.status) {
ctx.textAlign = 'right'; ctx.fillStyle = opt.status[1]; ctx.font = F(800, 30);
ctx.fillText(opt.status[0], W - P - 28, y + 186); ctx.textAlign = 'left';
}
y += 250;
ctx.fillStyle = '#6b7280'; ctx.font = F(600, 24); ctx.fillText('ÜRÜN', P, y); ctx.textAlign = 'right'; ctx.fillText('MİKTAR', W - P, y); ctx.textAlign = 'left';
y += 18; ctx.fillStyle = '#111111'; ctx.fillRect(P, y, W - 2 * P, 3); y += 22;
rows.forEach(r => {
let yy = y + 34;
ctx.fillStyle = '#111111'; ctx.font = F(600, 34);
r.name.forEach((l, k) => ctx.fillText(l, P, yy + k * 44));
ctx.textAlign = 'right'; ctx.font = F(800, 40); ctx.fillText(`${num(r.i.qty - (Number(r.i.hardener_qty) > 0 && hardOf(r.i.product_id) > 0 ? Math.min(Number(r.i.hardener_qty), r.i.qty) : 0))} L`, W - P, yy + 4); ctx.textAlign = 'left';
yy += r.name.length * 44 - 6;
ctx.fillStyle = '#b45309'; ctx.font = F(500, 26); r.sub.forEach((l, k) => ctx.fillText(l, P, yy + k * 34));
y += r.h;
ctx.fillStyle = '#e5e7eb'; ctx.fillRect(P, y - 8, W - 2 * P, 2);
});
if (o.items.length > 1) {
y += 50; ctx.fillStyle = '#111111'; ctx.font = F(800, 36); ctx.fillText('TOPLAM', P, y);
const tt = totL(o.items), tp = tt.split(' + ');
ctx.textAlign = 'right'; ctx.fillText(tp[0], W - P, y);
if (tp[1]) { ctx.font = F(600, 28); ctx.fillStyle = '#b45309'; ctx.fillText('+ ' + tp[1], W - P, y + 40); ctx.fillStyle = '#111111'; y += 40; }
ctx.textAlign = 'left'; y += 30;
}
if (noteL.length) {
y += 40; ctx.fillStyle = '#fff7d6'; ctx.fillRect(P, y, W - 2 * P, 40 + noteL.length * 40);
ctx.fillStyle = '#111111'; ctx.font = F(600, 30); noteL.forEach((l, k) => ctx.fillText(l, P + 24, y + 48 + k * 40));
y += 40 + noteL.length * 40;
}
ctx.fillStyle = '#9ca3af'; ctx.font = F(400, 22);
ctx.fillText(`Yıldız Kumlama Boya • Emanet Stok Takibi • ${dt(new Date())}`, P, H - 40);
return new Promise(res => c.toBlob(b => res(b), 'image/png'));
}
function waNumber(ph) {
let d = String(ph || '').replace(/\D/g, '');
if (!d) return '';
if (d.startsWith('00')) d = d.slice(2);
if (d.length === 11 && d.startsWith('0')) d = '90' + d.slice(1);
else if (d.length === 10 && d.startsWith('5')) d = '90' + d;
return d.length >= 11 ? d : '';
}
const firmPhone = name => { const u = users.find(x => x.name === name); return u && waNumber(u.phone); };
function shareToFirm() {
if (!shareData || !shareData.phone) return;
window.open(`https://wa.me/${shareData.phone}?text=${encodeURIComponent(shareData.text)}`, '_blank');
}
async function openOrderShare(id) {
const o = orders.find(x => x.id === id);
if (!o) return;
const blob = await drawOrderImage(o);
if (!blob) return notify('Görsel oluşturulamadı.', 'danger');
const name = `${orderNo(o)}_${o.bayi}.png`.replace(/[^\wçğıöşüÇĞİÖŞÜ.-]+/g, '_');
shareData = { blob, name, text: orderShareText(o), file: new File([blob], name, { type: 'image/png' }), phone: isAdmin() ? firmPhone(o.bayi) : '' };
$('shareFirmBtn').classList.toggle('d-none', !shareData.phone);
$('shareFirmTxt').innerText = `WhatsApp'tan Gönder: ${o.bayi}`;
const img = $('shareImg');
if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
img.dataset.url = URL.createObjectURL(blob); img.src = img.dataset.url;
$('shareTitle').innerText = `Sipariş Özeti • ${orderNo(o)}`;
shareModal.show();
}
function shipShareObj(s) {
const pending = isPending(s);
return { bayi: s.supplier, note: s.approve_note || '',
items: s.items.map(i => ({ ...i, qty: pending ? i.qty : (i.received_qty ?? i.qty) })) };
}
function shipShareText(s) {
const o = shipShareObj(s), pending = isPending(s);
const lines = [`*SEVKİYAT #${s.irsaliye_no}*`, `${s.supplier} → Yıldız Kumlama Boya`, `Sevk tarihi: ${dt(s.created_at)}`];
if (s.order_id) lines.push(`Sipariş: ${orderNoById(s.order_id)}`);
lines.push(`Durum: ${pending ? 'Teslim onayı bekliyor' : `Teslim alındı (${dt(s.approved_at)})`}`, '');
o.items.forEach(i => { const t = tnkI(i, i.qty); lines.push(`• ${i.product_name}: *${qL(i, i.qty)}*${t ? ` — ${t}` : ''}`); });
if (o.items.length > 1) lines.push(`Toplam: ${totL(o.items)}`);
if (o.note) lines.push('', `Not: ${o.note}`);
return lines.join('\n');
}
async function openShipShare(id) {
const s = shipments.find(x => x.id === id);
if (!s) return;
const pending = isPending(s);
const blob = await drawOrderImage(shipShareObj(s), {
title: 'SEVKİYAT', no: '#' + s.irsaliye_no, d1: ['SEVK TARİHİ', dt(s.created_at)],
d2: s.order_id ? ['SİPARİŞ NO', orderNoById(s.order_id)] : null,
status: pending ? ['ONAY BEKLİYOR', '#b45309'] : ['TESLİM ALINDI', '#198754'] });
if (!blob) return notify('Görsel oluşturulamadı.', 'danger');
const name = `Sevkiyat_${s.irsaliye_no}_${s.supplier}.png`.replace(/[^\wçğıöşüÇĞİÖŞÜ.-]+/g, '_');
shareData = { blob, name, text: shipShareText(s), file: new File([blob], name, { type: 'image/png' }), phone: isAdmin() ? firmPhone(s.supplier) : '' };
$('shareFirmBtn').classList.toggle('d-none', !shareData.phone);
$('shareFirmTxt').innerText = `WhatsApp'tan Gönder: ${s.supplier}`;
const img = $('shareImg');
if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
img.dataset.url = URL.createObjectURL(blob); img.src = img.dataset.url;
$('shareTitle').innerText = `Sevkiyat Özeti • #${s.irsaliye_no}`;
shareModal.show();
}
async function shareNow() {
if (!shareData) return;
const files = [shareData.file];
try {
if (navigator.canShare && navigator.canShare({ files })) {
await navigator.share({ files, title: shareData.name, text: shareData.text });
return;
}
} catch (e) { if (e && e.name === 'AbortError') return; }
shareDownload();
notify('Görsel indirildi; WhatsApp açılıyor, görseli oradan ekleyebilirsiniz.', 'secondary');
setTimeout(shareText, 600);
}
function shareDownload() {
if (!shareData) return;
if (ANDROID()) {
const fr = new FileReader();
fr.onload = () => { try { window.AndroidBridge.saveFile(shareData.name, String(fr.result).split(',')[1], 'image/png'); } catch (e) { /* yoksay */ } };
fr.readAsDataURL(shareData.blob);
return;
}
const a = document.createElement('a'); a.href = URL.createObjectURL(shareData.blob); a.download = shareData.name;
document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function shareText() {
if (!shareData) return;
window.open('https://wa.me/?text=' + encodeURIComponent(shareData.text), '_blank');
}
const orderNo = o => `SIP-${new Date(o.created_at).getFullYear()}-${String(o.id).padStart(4, '0')}`;
const orderNoById = id => { const o = orders.find(x => x.id === id); return o ? orderNo(o) : `SIP-${String(id).padStart(4, '0')}`; };
const orderShips = o => shipments.filter(s => s.order_id === o.id);