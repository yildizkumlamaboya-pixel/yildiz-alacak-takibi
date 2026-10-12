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
: `${num(i.qty)} L`}${tnkSpan(i.product_id, isPending(s) ? i.qty : i.received_qty, i.no_hardener)}</span>
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
<td class="text-end fw-bold ${diff ? 'diff' : ''}">${num(i.qty)} L${tnkLine(i.product_id, i.qty, i.no_hardener)}</td></tr>`;
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
const orderNo = o => `SIP-${new Date(o.created_at).getFullYear()}-${String(o.id).padStart(4, '0')}`;
const orderNoById = id => { const o = orders.find(x => x.id === id); return o ? orderNo(o) : `SIP-${String(id).padStart(4, '0')}`; };
const orderState = o => o.cancelled ? 'cancelled' : o.shipment ? 'converted' : 'open';
function setOrderFilter(f) {
orderFilter = f;
document.querySelectorAll('#orderFilterGroup .btn').forEach(b => b.classList.toggle('active', b.dataset.f === f));
pages.order = 1;
renderOrders();
}
function orderBadge(o) {
const st = orderState(o);
if (st === 'cancelled') return '<span class="badge text-bg-secondary">İptal</span>';
if (st === 'converted') return isPending(o.shipment)
? '<span class="badge text-bg-info bg-opacity-75">Sevkiyata Döndü</span>'
: '<span class="badge text-bg-success bg-opacity-75">Teslim Alındı</span>';
return '<span class="badge text-bg-primary">Açık</span>';
}
function renderOrders() {
const list = orders.filter(o => orderFilter === 'all' || orderState(o) === orderFilter);
$('orderCount').innerText = `${list.length} sipariş`;
if (!list.length) {
$('orderList').innerHTML = `<div class="card p-4 text-center text-secondary small"><i class="bi bi-clipboard fs-3 d-block mb-1"></i>${
orderFilter === 'open' ? 'Açık sipariş yok.' : 'Kayıt bulunamadı.'}</div>`;
$('orderPager').innerHTML = '';
return;
}
const today = ymd(new Date());
$('orderPager').innerHTML = pagerHtml(list.length, 'order');
$('orderList').innerHTML = pageSlice(list, 'order').map(o => {
const st = orderState(o);
const late = st === 'open' && o.due_date && o.due_date < today;
const total = r2(o.items.reduce((a, i) => a + i.qty, 0));
return `
<div class="card p-3">
<div class="d-flex justify-content-between align-items-start gap-2 mb-2">
<div>
<div class="d-flex align-items-center gap-2 flex-wrap">
${isAdmin() ? firmLogo(o.bayi, 20) + `<span class="badge text-bg-light border fw-medium">${esc(o.bayi)}</span>` : ''}
<span class="fw-semibold small">${orderNo(o)}</span>
</div>
<div class="tiny text-secondary mt-1"><i class="bi bi-clock"></i> ${dt(o.created_at)}${o.due_date
? ` • <span class="${late ? 'text-danger fw-semibold' : ''}">Termin: ${dOnly(o.due_date + 'T00:00:00')}${late ? ' (gecikti)' : ''}</span>` : ''}</div>
</div>
<div class="text-end">${orderBadge(o)}</div>
</div>
${o.note ? `<div class="small mb-1"><i class="bi bi-chat-left-text text-secondary"></i> ${esc(o.note)}</div>` : ''}
<div class="border-top pt-1">${o.items.map(i => `<div class="item-line"><span>${esc(i.product_name)}</span><span class="fw-medium text-nowrap">${num(i.qty)} L${tnkSpan(i.product_id, i.qty)}</span></div>`).join('')}</div>
${o.items.length > 1 ? `<div class="item-line border-top mt-1 pt-1 text-secondary"><span>Toplam</span><span>${num(total)} L</span></div>` : ''}
${st === 'converted' ? `<div class="tiny mt-2 clickable text-primary" onclick="openDetail(${o.shipment.id})"><i class="bi bi-truck"></i> Sevkiyat #${esc(o.shipment.irsaliye_no)} — detayı gör</div>` : ''}
${st === 'open' && !isAdmin() ? `
<button class="btn btn-dark w-100 mt-3" onclick="convertOrder(${o.id})"><i class="bi bi-arrow-right-circle me-1"></i>Sevkiyata Dönüştür</button>` : ''}
${isAdmin() && st !== 'converted' ? `
<div class="d-flex gap-2 mt-3">
${st === 'open' ? `<button class="btn btn-sm btn-light border flex-fill" onclick="openOrderEdit(${o.id})"><i class="bi bi-pencil me-1"></i>Düzenle</button>` : ''}
<button class="btn btn-sm btn-outline-secondary flex-fill" onclick="busy(this, () => cancelOrder(${o.id}, ${st === 'open'}))">${st === 'open'
? '<i class="bi bi-x-circle me-1"></i>İptal Et' : '<i class="bi bi-arrow-counterclockwise me-1"></i>İptali Geri Al'}</button>
<button class="btn btn-sm btn-outline-danger flex-fill" onclick="busy(this, () => deleteOrder(${o.id}))"><i class="bi bi-trash me-1"></i>Sil</button>
</div>` : ''}
</div>`;
}).join('');
}
function resetOrderForm() {
if (!isAdmin()) return;
const bayi = $('ordBayi').value;
itemEditor('ordItems', products.filter(p => p.allowed_bayi === bayi), [], false);
}
async function createOrder() {
const bayi = $('ordBayi').value;
if (!bayi) return notify('Firma seçiniz.', 'warning');
const items = readItems('ordItems');
if (!items) return;
const r = await rpc('portal_order_create', { p_bayi: bayi, p_note: $('ordNote').value.trim(), p_due_date: $('ordDue').value || null, p_items: items });
if (!r) return;
$('ordNote').value = ''; $('ordDue').value = '';
notify(`Sipariş ${bayi} firmasına gönderildi.`);
await loadData();
resetOrderForm();
setOrderFilter('open');
}
function openOrderEdit(id) {
editingOrder = orders.find(o => o.id === id);
if (!editingOrder) return;
$('ordEditTitle').innerText = `${orderNo(editingOrder)} Düzenle`;
$('ordEditBayi').innerText = `Firma: ${editingOrder.bayi}`;
$('ordEditDue').value = editingOrder.due_date || '';
$('ordEditNote').value = editingOrder.note || '';
itemEditor('ordEditItems', products.filter(p => p.allowed_bayi === editingOrder.bayi), editingOrder.items, false);
orderModal.show();
}
async function saveOrderEdit() {
const items = readItems('ordEditItems');
if (!items) return;
const r = await rpc('portal_order_update', { p_id: editingOrder.id, p_note: $('ordEditNote').value.trim(),
p_due_date: $('ordEditDue').value || null, p_items: items });
if (!r) return;
orderModal.hide();
notify('Sipariş güncellendi.');
await loadData();
}
async function cancelOrder(id, cancel) {
const o = orders.find(x => x.id === id);
if (!o || !confirm(cancel ? `${orderNo(o)} iptal edilsin mi? Firma bu siparişi sevkiyata dönüştüremez.` : `${orderNo(o)} tekrar açılsın mı?`)) return;
const r = await rpc('portal_order_cancel', { p_id: id, p_cancel: cancel });
if (!r) return;
notify(cancel ? 'Sipariş iptal edildi.' : 'Sipariş tekrar açıldı.');
await loadData();
}
async function deleteOrder(id) {
const o = orders.find(x => x.id === id);
if (!o || !confirm(`${orderNo(o)} kalıcı olarak silinsin mi?`)) return;
const r = await rpc('portal_order_delete', { p_id: id });
if (!r) return;
notify('Sipariş silindi.');
await loadData();
}
function clearOrderLink() {
if (!convertingOrder || !confirm(`${orderNo(convertingOrder)} bağlantısı kaldırılsın mı? Formdaki bilgiler korunur; sevkiyat siparişsiz bildirilir ve sipariş açık kalır.`)) return;
convertingOrder = null;
$('sevkOrderBanner').classList.add('d-none');
}
function convertOrder(id) {
const o = orders.find(x => x.id === id);
if (!o || orderState(o) !== 'open') return;
switchTab('tabSevkEt');
convertingOrder = o; pendingSevk = null;
$('sevkNo').value = '';
personPicker('sevkPerson', me.name, '');
itemEditor('sevkItems', visibleProducts(), o.items.filter(i => prodById(i.product_id)).map(i => ({ product_id: i.product_id, qty: i.qty })), false);
$('sevkOrderBanner').innerHTML = `
<div class="d-flex justify-content-between align-items-start gap-2">
<div><i class="bi bi-clipboard-check me-1"></i><b>${orderNo(o)}</b> siparişi sevkiyata dönüştürülüyor.
<div class="tiny text-secondary">Ürünler siparişten dolduruldu; gerçekte gönderdiğiniz miktarı yazın.</div></div>
<button class="btn btn-sm btn-link p-0 text-nowrap" onclick="clearOrderLink()">Bağlantıyı kaldır</button>
</div>`;
$('sevkOrderBanner').classList.remove('d-none');
if (sevkPad) sevkPad.clear();
window.scrollTo(0, 0);
}
function openEdit(id) {
editing = shipments.find(s => s.id === id);
if (!editing) return;
const approved = !isPending(editing);
$('editNo').value = editing.irsaliye_no;
$('editSupplier').innerText = `Gönderen: ${editing.supplier}`;
$('editWarn').classList.toggle('d-none', !approved);
personPicker('editPerson', editing.supplier, editing.prepared_by || '');
itemEditor('editItems', products.filter(p => p.allowed_bayi === editing.supplier), editing.items, approved && isAdmin());
editModal.show();
}
async function saveEdit() {
const no = $('editNo').value.trim();
if (!no) return notify('İrsaliye numarasını giriniz.', 'warning');
const person = readPerson('editPerson');
if (!person) return notify('İrsaliyeyi düzenleyen kişiyi seçin veya yazın.', 'warning');
const items = readItems('editItems');
if (!items) return;
const r = await shipRpc('portal_update_shipment', { p_id: editing.id, p_irsaliye: no, p_prepared_by: person, p_items: items });
if (!r) return;
editModal.hide();
notify('Sevkiyat güncellendi.');
await loadData();
}
async function deleteShipment(id) {
const s = shipments.find(x => x.id === id);
if (!s) return;
const msg = isPending(s)
? `#${s.irsaliye_no} numaralı sevkiyat silinsin mi?`
: `#${s.irsaliye_no} TESLİM ALINMIŞ bir kayıt.\nSilinirse teslim alınan miktarlar ${s.supplier} emanet stoğuna geri eklenecek:\n` +
s.items.filter(i => i.received_qty > 0).map(i => `• ${i.product_name}: ${num(i.received_qty)} L`).join('\n') + '\n\nDevam edilsin mi?';
if (!confirm(msg)) return;
const r = await rpc('portal_delete_shipment', { p_id: id });
if (!r) return;
detailModal.hide();
notify('Sevkiyat silindi.');
await loadData();
}
async function openDetail(id) {
const s = shipments.find(x => x.id === id);
if (!s) return;
const pending = isPending(s);
const canEdit = isAdmin() || (s.supplier === me.name && pending);
const row = (k, v) => v ? `<div class="d-flex justify-content-between border-bottom py-2 small"><span class="text-secondary">${k}</span><span class="fw-medium text-end ms-3">${v}</span></div>` : '';
$('detailBody').innerHTML = `
<div class="mb-2">${statusBadge(s)}</div>
${row('Gönderen', esc(s.supplier))}
${row('İrsaliye No', '#' + esc(s.irsaliye_no))}
${row('Sipariş No', s.order_id ? orderNoById(s.order_id) : '')}
${row('İrsaliyeyi Düzenleyen', esc(s.prepared_by))}
${row('Bildirilme', dt(s.created_at))}
${row('Teslim Alan', s.approved_at ? `${esc(s.received_by || s.approved_by)} • ${dt(s.approved_at)}` : '')}
${row('Not', esc(s.approve_note))}
${row('Son Düzenleme', s.updated_at ? `${esc(s.updated_by)} • ${dt(s.updated_at)}` : '')}
<div class="table-responsive mt-3">
<table class="table table-sm align-middle mb-0">
<thead><tr><th>Ürün</th><th class="text-end">Bildirilen</th>${pending ? '' : '<th class="text-end">Gelen</th>'}</tr></thead>
<tbody>${s.items.map(i => `
<tr>
<td>${esc(i.product_name)}${i.note ? `<div class="tiny diff">${esc(i.note)}</div>` : ''}</td>
<td class="text-end text-nowrap">${num(i.qty)} L${tnkLine(i.product_id, i.qty, i.no_hardener)}</td>
${pending ? '' : `<td class="text-end text-nowrap fw-semibold ${i.received_qty !== i.qty ? 'diff' : ''}">${num(i.received_qty)} L${tnkLine(i.product_id, i.received_qty, i.no_hardener)}</td>`}
</tr>`).join('')}
</tbody>
</table>
</div>
<div id="detailSig"></div>
${pending && !isAdmin() ? `<div class="text-secondary tiny mt-3"><i class="bi bi-info-circle"></i> Teslim alınana kadar düzenleyebilir veya silebilirsiniz.</div>` : ''}
${!pending && !isAdmin() ? `<div class="text-secondary tiny mt-3"><i class="bi bi-lock"></i> Teslim alınmış kayıt. Değişiklik için Yıldız Kumlama Boya'nın onayı geri alması gerekir.</div>` : ''}`;
const btns = [];
if (!pending)
btns.push(`<button class="btn btn-outline-dark" onclick="afterDetail(() => openDoc(${s.id}))"><i class="bi bi-printer me-1"></i>Teslimat Belgesi / Yazdır</button>`);
if (pending && isAdmin())
btns.push(`<button class="btn btn-dark" onclick="afterDetail(() => openApprove(${s.id}))"><i class="bi bi-pen me-1"></i>Teslim Al & İmzala</button>`);
if (!pending && isAdmin())
btns.push(`<button class="btn btn-warning" onclick="busy(this, () => unapproveShipment(${s.id}))"><i class="bi bi-arrow-counterclockwise me-1"></i>Onayı Geri Al</button>`);
if (canEdit)
btns.push(`<div class="d-flex gap-2">
<button class="btn btn-light border flex-fill" onclick="afterDetail(() => openEdit(${s.id}))"><i class="bi bi-pencil me-1"></i>Düzenle</button>
<button class="btn btn-outline-danger flex-fill" onclick="busy(this, () => deleteShipment(${s.id}))"><i class="bi bi-trash me-1"></i>Sil</button>
</div>`);
$('detailActions').innerHTML = btns.join('') || `<button class="btn btn-light border" data-bs-dismiss="modal">Kapat</button>`;
detailModal.show();
if (s.has_signature || s.has_supplier_signature) {
const r = await rpc('portal_signature', { p_id: s.id });
const g = (r && r.data) || {};
const box = (t, src) => src ? `<div class="col-6"><div class="small-label">${t}</div>
<img src="${src}" class="w-100 border rounded-3 bg-white" style="height:90px;object-fit:contain"></div>` : '';
if ($('detailSig') && (g.supplier || g.receiver))
$('detailSig').innerHTML = `<div class="row g-2 mt-2">${box('Teslim Eden (' + esc(s.supplier) + ')', g.supplier)}${box('Teslim Alan', g.receiver)}</div>`;
}
}
function afterDetail(fn) {
$('detailModal').addEventListener('hidden.bs.modal', fn, { once: true });
detailModal.hide();
}
async function unapproveShipment(id) {
const s = shipments.find(x => x.id === id);
if (!s) return;
const reason = prompt(
`#${s.irsaliye_no} numaralı sevkiyatın onayı geri alınacak.\n\n` +
`• Teslim alınan miktarlar ${s.supplier} emanet stoğuna geri eklenecek\n` +
`• İmza silinecek, kayıt "Onay Bekliyor" durumuna dönecek\n` +
`• ${s.supplier} kaydı tekrar düzenleyebilecek\n\nAçıklama (isteğe bağlı):`, '');
if (reason === null) return;
const r = await rpc('portal_unapprove_shipment', { p_id: id, p_reason: reason });
if (!r) return;
detailModal.hide();
notify('Onay geri alındı, emanet stok geri eklendi.');
await loadData();
}
$('approveModal').addEventListener('shown.bs.modal', () => { signaturePad = preparePad($('signatureCanvas'), signaturePad); });
function openApprove(id) {
approving = shipments.find(s => s.id === id);
if (!approving) return;
$('apvInfo').innerText = `${approving.supplier} • #${approving.irsaliye_no} • Düzenleyen: ${approving.prepared_by || '-'}`;
$('apvItems').innerHTML = approving.items.map(i => `
<div class="item-row" data-item="${i.id}" data-qty="${i.qty}" data-pid="${i.product_id}" data-nh="${i.no_hardener ? 1 : ''}">
<div class="d-flex justify-content-between gap-2">
<span class="fw-semibold small">${esc(i.product_name)}</span>
<span class="small text-nowrap">Bildirilen: <b>${num(i.qty)} L</b>${tnkSpan(i.product_id, i.qty, i.no_hardener)}</span>
</div>
<div class="row g-2 mt-1 align-items-end">
<div class="col-5">
<div class="tiny text-secondary">Gelen (L)</div>
<input type="number" inputmode="decimal" class="form-control form-control-sm apv-rec" value="${i.qty}" oninput="updateApproveRow(this)">
</div>
<div class="col-7 tiny text-secondary apv-after"></div>
</div>
<input class="form-control form-control-sm mt-2 apv-note d-none" placeholder="Fark açıklaması (eksik / hasarlı)">
</div>`).join('');
$('apvItems').querySelectorAll('.apv-rec').forEach(updateApproveRow);
personPicker('apvPerson', me.name, '');
$('apvNote').value = '';
approveModal.show();
}
function updateApproveRow(inp) {
const row = inp.closest('.item-row');
const qty = Number(row.dataset.qty), p = prodById(Number(row.dataset.pid));
const rec = inp.value === '' ? NaN : parseFloat(inp.value);
const diff = !isNaN(rec) && rec !== qty;
row.querySelector('.apv-note').classList.toggle('d-none', !diff);
inp.classList.toggle('border-warning', diff);
if (!p) return;
const after = r2(p.qty - (isNaN(rec) ? 0 : rec));
row.querySelector('.apv-after').innerHTML =
(!isNaN(rec) && tnk(p.id, rec, !!row.dataset.nh) ? `<div class="text-primary">Gelen: ${tnk(p.id, rec, !!row.dataset.nh)}</div>` : '') +
`Kalan emanet stok: ${num(p.qty)} → <b class="${after < 0 ? 'text-danger' : 'text-success'}">${num(after)} L</b>` +
(diff ? `<div class="diff">${rec < qty ? `${num(qty - rec)} L eksik` : `${num(rec - qty)} L fazla`}</div>` : '');
}
async function confirmApproval() {
const items = [];
for (const row of $('apvItems').querySelectorAll('.item-row')) {
const v = row.querySelector('.apv-rec').value;
const rec = parseFloat(v);
if (v === '' || !(rec >= 0)) return notify('Gelen miktarları kontrol edin (0 veya daha büyük olmalı).', 'warning');
items.push({ item_id: Number(row.dataset.item), received_qty: rec, note: row.querySelector('.apv-note').value.trim(), qty: Number(row.dataset.qty) });
}
const noNote = items.filter(i => i.received_qty !== i.qty && !i.note);
if (noNote.length && !confirm('Bildirilenden farklı gelen ürün(ler) için açıklama yazmadınız. Yine de devam edilsin mi?')) return;
const person = readPerson('apvPerson');
if (!person) return notify('Teslim alan kişiyi seçin veya yazın.', 'warning');
if (!signaturePad || signaturePad.isEmpty()) return notify('Lütfen ekrana imzalayınız.', 'warning');
const r = await rpc('portal_approve_shipment', {
p_id: approving.id, p_signature: signaturePad.toDataURL('image/png'), p_received_by: person,
p_note: $('apvNote').value.trim(), p_items: items.map(({ qty, ...x }) => x)
});
if (!r) return;
approveModal.hide();
notify('Teslim alındı, emanet stoktan düşüldü.');
await loadData();
}
function renderStock() {
const list = visibleProducts();
if (!list.length) {
$('stockList').innerHTML = `<div class="card p-4 text-center text-secondary small">${isAdmin()
? 'Henüz emanet stok kalemi yok. Önce Ürünler ekranından ürün ekleyin, sonra aşağıdan firmaya atayın.'
: 'Size tanımlı emanet stok kalemi yok.'}</div>`;
return;
}
const groups = {};
sortProducts(list).forEach(p => (groups[p.allowed_bayi] = groups[p.allowed_bayi] || []).push(p));
$('stockList').innerHTML = Object.keys(groups).map(b => {
const items = groups[b];
const total = r2(items.reduce((a, p) => a + p.qty, 0));
return `
<div class="mb-3">
${isAdmin() ? `<div class="d-flex align-items-center gap-2 mb-2 px-1">
${firmLogo(b, 22)}<span class="fw-semibold small">${esc(b)}</span>
<span class="badge text-bg-light border">Toplam kalan ${num(total)} L</span></div>` : ''}
<div class="vstack gap-2">${items.map(p => {
const st = balanceState(p);
const wait = pendingQty(p.id);
return `
<div class="card p-3 d-flex flex-row justify-content-between align-items-center clickable ${st.cls}" onclick="openProductReport(${p.id})">
<div class="me-2">
<div class="fw-semibold small">${esc(p.name)}</div>
<div class="tiny text-secondary">${esc(p.code)}${wait ? ` • <span class="text-warning-emphasis"><i class="bi bi-hourglass-split"></i> ${num(wait)} L onay bekliyor</span>` : ''}</div>
</div>
<div class="d-flex align-items-center gap-2 text-end">
<div>
<div class="tiny text-secondary">Kalan</div>
<div class="fw-bold ${st.txt}">${num(p.qty)} L</div>
${tnk(p.id, p.qty) ? `<div class="tiny text-secondary">≈ ${tnk(p.id, p.qty)}</div>` : ''}
${st.badge}
</div>
${isAdmin() ? `<button class="btn btn-sm btn-light border" title="Düzenle" onclick="event.stopPropagation(); openProductEdit(${p.id})"><i class="bi bi-pencil"></i></button>` : ''}
</div>
</div>`;
}).join('')}</div>
</div>`;
}).join('');
}