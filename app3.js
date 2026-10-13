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
function orderProgress(o) {
const ships = orderShips(o), sent = {}, sentH = {};
ships.forEach(s => s.items.forEach(i => {
const q = isPending(s) ? i.qty : (i.received_qty ?? i.qty);
sent[i.product_id] = r2((sent[i.product_id] || 0) + q);
if (Number(i.hardener_qty) > 0) sentH[i.product_id] = r2((sentH[i.product_id] || 0) + Number(i.hardener_qty));
}));
const items = o.items.map(i => {
const s = sent[i.product_id] || 0, rem = Math.max(0, r2(i.qty - s));
const remH = i.hardener_qty > 0 ? Math.max(0, r2(Number(i.hardener_qty) - (sentH[i.product_id] || 0))) : null;
return { i, sent: s, rem, remH: remH == null ? null : Math.min(remH, rem) };
});
return { ships, items, rem: r2(items.reduce((a, x) => a + x.rem, 0)), sent: r2(items.reduce((a, x) => a + Math.min(x.sent, x.i.qty), 0)) };
}
function orderState(o) {
if (o.cancelled) return 'cancelled';
const p = orderProgress(o);
if (!p.ships.length) return 'open';
return p.rem > 0 ? 'partial' : 'converted';
}
const isOrderOpen = o => ['open', 'partial'].includes(orderState(o));
function setOrderFilter(f) {
orderFilter = f;
document.querySelectorAll('#orderFilterGroup .btn').forEach(b => b.classList.toggle('active', b.dataset.f === f));
pages.order = 1;
renderOrders();
}
function orderBadge(o) {
const st = orderState(o);
if (st === 'cancelled') return orderShips(o).length ? '<span class="badge text-bg-secondary">Kalanı İptal</span>' : '<span class="badge text-bg-secondary">İptal</span>';
if (st === 'converted') return orderShips(o).some(isPending)
? '<span class="badge text-bg-info bg-opacity-75">Sevk Edildi</span>'
: '<span class="badge text-bg-success bg-opacity-75">Tamamlandı</span>';
if (st === 'partial') return '<span class="badge text-bg-warning">Kısmi Sevk</span>';
return '<span class="badge text-bg-primary">Açık</span>';
}
function renderOrders() {
const oq = ($('orderSearch').value || '').trim().toLocaleLowerCase('tr');
const list = orders.filter(o => (orderFilter === 'all' || (orderFilter === 'open' ? isOrderOpen(o) : orderState(o) === orderFilter))
&& (!oq || [orderNo(o), o.bayi, o.note, ...o.items.map(i => i.product_name + ' ' + (i.code || ''))].join(' ').toLocaleLowerCase('tr').includes(oq)));
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
const late = isOrderOpen(o) && o.due_date && o.due_date < today;
const pr = orderProgress(o);
const total = r2(o.items.reduce((a, i) => a + i.qty, 0));
return `
<div class="card p-3">
<div class="clickable" onclick="openOrderShare(${o.id})" title="Sipariş özetini aç">
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
<div class="border-top pt-1">${pr.items.map(({ i, sent, rem }) => `<div class="item-line"><span>${esc(i.product_name)}</span><span class="fw-medium text-end">${qL(i, i.qty)}${tnkSpanI(i, i.qty)}${pr.ships.length
? `<div class="tiny ${rem > 0 ? 'text-warning-emphasis' : 'text-success'}">Sevk edilen ${num(Math.min(sent, i.qty))} L${rem > 0 ? ` • kalan <b>${num(rem)} L</b>` : ' • tamam'}</div>` : ''}</span></div>`).join('')}</div>
${o.items.length > 1 ? `<div class="item-line border-top mt-1 pt-1 text-secondary"><span>Toplam</span><span class="text-end">${totL(o.items)}</span></div>` : ''}
<div class="tiny text-primary mt-1"><i class="bi bi-eye"></i> Özeti görmek için dokunun</div>
</div>
${pr.ships.map(s => `<div class="tiny mt-1 clickable text-primary" onclick="openDetail(${s.id})"><i class="bi bi-truck"></i> Sevkiyat #${esc(s.irsaliye_no)} (${isPending(s) ? 'onay bekliyor' : 'teslim alındı'}) — detayı gör</div>`).join('')}
<button class="btn btn-sm btn-outline-success w-100 mt-3" onclick="busy(this, () => openOrderShare(${o.id}))"><i class="bi bi-whatsapp me-1"></i>Paylaş (WhatsApp)</button>
${(st === 'open' || st === 'partial') && !isAdmin() ? `
<button class="btn btn-dark w-100 mt-2" onclick="convertOrder(${o.id})"><i class="bi bi-arrow-right-circle me-1"></i>${st === 'partial' ? `Kalanı Sevk Et (${num(pr.rem)} L)` : 'Sevkiyata Dönüştür'}</button>` : ''}
${isAdmin() && st !== 'converted' ? `
<div class="d-flex gap-2 mt-3">
${st === 'open' ? `<button class="btn btn-sm btn-light border flex-fill" onclick="openOrderEdit(${o.id})"><i class="bi bi-pencil me-1"></i>Düzenle</button>` : ''}
<button class="btn btn-sm btn-outline-secondary flex-fill" onclick="busy(this, () => cancelOrder(${o.id}, ${st !== 'cancelled'}))">${st === 'cancelled'
? '<i class="bi bi-arrow-counterclockwise me-1"></i>İptali Geri Al' : st === 'partial' ? '<i class="bi bi-x-circle me-1"></i>Kalanı İptal Et' : '<i class="bi bi-x-circle me-1"></i>İptal Et'}</button>
${pr.ships.length ? '' : `<button class="btn btn-sm btn-outline-danger flex-fill" onclick="busy(this, () => deleteOrder(${o.id}))"><i class="bi bi-trash me-1"></i>Sil</button>`}
</div>` : ''}
</div>`;
}).join('');
}
function resetOrderForm() {
if (!isAdmin()) return;
const bayi = $('ordBayi').value;
itemEditor('ordItems', products.filter(p => p.allowed_bayi === bayi), [], false);
}
function stokAction(k) {
if (k === 'urun') { fold('adj', false); fold('kalem', false); switchTab('tabUrun'); return; }
if (currentTab !== 'tabStok') { switchTab('tabStok'); fold(k, true); return; }
fold(k, $('fold-' + k).classList.contains('d-none'));
}
function updateSeg() {
document.querySelectorAll('[data-seg]').forEach(b => {
const k = b.dataset.seg;
const on = k === 'urun' ? currentTab === 'tabUrun' : currentTab === 'tabStok' && !$('fold-' + k).classList.contains('d-none');
b.classList.toggle('btn-dark', on); b.classList.toggle('btn-outline-dark', !on);
});
}
function fold(key, open) {
const card = $('fold-' + key), btn = $('fold-' + key + '-btn');
if (!card) return;
if (open && (key === 'adj' || key === 'kalem')) fold(key === 'adj' ? 'kalem' : 'adj', false);
card.classList.toggle('d-none', !open);
if (btn) btn.classList.toggle('active', !!open);
updateSeg();
}
function toggleOrderForm(open) {
if (open && !isAdmin()) return;
$('ordFormCard').classList.toggle('d-none', !open);
$('ordOpenBtn').classList.toggle('d-none', !!open);
if (open) {
resetOrderForm();
$('ordFormCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
} else {
$('ordNote').value = ''; $('ordDue').value = '';
}
}
async function createOrder() {
const bayi = $('ordBayi').value;
if (!bayi) return notify('Firma seçiniz.', 'warning');
const items = readItems('ordItems');
if (!items) return;
const before = new Set(orders.map(o => o.id));
const r = await shipRpc('portal_order_create', { p_bayi: bayi, p_note: $('ordNote').value.trim(), p_due_date: $('ordDue').value || null, p_items: items });
if (!r) return;
$('ordNote').value = ''; $('ordDue').value = '';
notify(`Sipariş ${bayi} firmasına gönderildi.`);
await loadData();
toggleOrderForm(false);
setOrderFilter('open');
const yeni = orders.find(o => !before.has(o.id) && o.bayi === bayi);
if (yeni) openOrderShare(yeni.id);
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
const r = await shipRpc('portal_order_update', { p_id: editingOrder.id, p_note: $('ordEditNote').value.trim(),
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
if (!o || !isOrderOpen(o)) return;
const pr = orderProgress(o);
switchTab('tabSevkEt');
convertingOrder = o; pendingSevk = null;
$('sevkNo').value = '';
personPicker('sevkPerson', me.name, '');
itemEditor('sevkItems', visibleProducts(), pr.items.filter(x => x.rem > 0 && prodById(x.i.product_id))
.map(x => ({ product_id: x.i.product_id, qty: x.rem, hardener_qty: x.remH })), false);
$('sevkOrderBanner').innerHTML = `
<div class="d-flex justify-content-between align-items-start gap-2">
<div><i class="bi bi-clipboard-check me-1"></i><b>${orderNo(o)}</b> siparişi ${pr.ships.length ? '(kalan kısmı) ' : ''}sevkiyata dönüştürülüyor.
<div class="tiny text-secondary">Ürünler siparişin kalanından dolduruldu; gerçekte gönderdiğiniz miktarı yazın. Eksik gönderirseniz kalanı daha sonra ayrı sevkiyatla gönderebilirsiniz.</div></div>
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
<td class="text-end">${qL(i, i.qty)}${tnkLineI(i, i.qty)}</td>
${pending ? '' : `<td class="text-end fw-semibold ${i.received_qty !== i.qty ? 'diff' : ''}">${qL(i, i.received_qty)}${tnkLineI(i, i.received_qty)}</td>`}
</tr>`).join('')}
</tbody>
</table>
</div>
<div id="detailSig"></div>
${pending && !isAdmin() ? `<div class="text-secondary tiny mt-3"><i class="bi bi-info-circle"></i> Teslim alınana kadar düzenleyebilir veya silebilirsiniz.</div>` : ''}
${!pending && !isAdmin() ? `<div class="text-secondary tiny mt-3"><i class="bi bi-lock"></i> Teslim alınmış kayıt. Değişiklik için Yıldız Kumlama Boya'nın onayı geri alması gerekir.</div>` : ''}`;
const btns = [];
btns.push(`<button class="btn btn-outline-success" onclick="afterDetail(() => openShipShare(${s.id}))"><i class="bi bi-whatsapp me-1"></i>Paylaş (WhatsApp / görsel)</button>`);
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
<div class="item-row" data-item="${i.id}" data-qty="${i.qty}" data-pid="${i.product_id}" data-nh="${i.no_hardener ? 1 : ''}" data-hq="${i.hardener_qty ?? ''}">
<div class="d-flex justify-content-between gap-2">
<span class="fw-semibold small">${esc(i.product_name)}</span>
<span class="small text-nowrap">Bildirilen: <b>${qL(i, i.qty)}</b>${tnkSpanI(i, i.qty)}</span>
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
const apvItem = row => ({ product_id: Number(row.dataset.pid), no_hardener: !!row.dataset.nh,
hardener_qty: row.dataset.hq === '' ? null : Number(row.dataset.hq) });