function fillRepProducts() {
const el = $('repProduct'), cur = el.value;
const withBayi = isAdmin() && !$('repBayiSel').value;
el.innerHTML = `<option value="">Tüm Kalemler</option>` +
sortProducts(reportProducts()).map(p => `<option value="${p.id}">${esc((withBayi ? p.allowed_bayi + ' • ' : '') + p.name)}</option>`).join('');
if ([...el.options].some(o => o.value === cur)) el.value = cur;
}
function openProductReport(id) {
if (isAdmin()) $('repBayiSel').value = '';
fillRepProducts();
$('repProduct').value = String(id);
switchTab('tabRapor');
}
function rangeIso() {
const from = $('repFrom').value, to = $('repTo').value;
const f = from ? new Date(from + 'T00:00:00') : null;
let t = null;
if (to) { t = new Date(to + 'T00:00:00'); t.setDate(t.getDate() + 1); }
return { f, t };
}
async function loadReport() {
if (!me) return;
if (!reportProducts().length) { reportMoves = []; pages.moves = 1; return renderReport(); }
const { f, t } = rangeIso();
$('repMoves').innerHTML = `<div class="text-center text-secondary small py-3"><div class="spinner-border spinner-border-sm"></div></div>`;
const r = await rpc('portal_movements', {
p_from: f ? f.toISOString() : null, p_to: t ? t.toISOString() : null,
p_bayi: isAdmin() ? ($('repBayiSel').value || null) : null,
p_product_id: $('repProduct').value ? Number($('repProduct').value) : null,
p_type: $('repType').value || null, p_shipment_id: null
});
reportMoves = r ? (r.data || []).map(m => ({ ...m, qty: Number(m.qty), balance_after: Number(m.balance_after) })) : [];
pages.moves = 1;
renderReport();
}
function renderReport() {
const pid = $('repProduct').value;
const sumUp = arr => r2(arr.filter(m => ['Açılış Alacağı', 'Alacak Girişi'].includes(m.movement_type)).reduce((a, m) => a + m.qty, 0));
const delivered = arr => r2(arr.filter(m => m.movement_type === 'Sevkiyat Teslimi').reduce((a, m) => a - m.qty, 0));
if (pid) {
const p = prodById(Number(pid)) || {};
const st = balanceState(p);
$('repSummary').innerHTML = `
<div class="small fw-semibold mb-2 px-1">${esc(p.allowed_bayi)} • ${esc(p.name)}</div>
<div class="row g-2">
<div class="col-6"><div class="stat"><div class="tiny text-secondary">Eklenen Alacak</div><div class="v text-primary">+${num(sumUp(reportMoves))} L</div></div></div>
<div class="col-6"><div class="stat"><div class="tiny text-secondary">Teslim Alınan</div><div class="v text-success">${num(delivered(reportMoves))} L</div></div></div>
<div class="col-6"><div class="stat"><div class="tiny text-secondary">Onay Bekleyen</div><div class="v text-warning-emphasis">${num(pendingQty(p.id))} L</div></div></div>
<div class="col-6"><div class="stat"><div class="tiny text-secondary">Kalan Alacak (güncel)</div><div class="v ${st.txt}">${num(p.qty)} L</div></div></div>
</div>`;
} else {
const rows = sortProducts(reportProducts()).map(p => {
const ms = reportMoves.filter(m => m.product_id === p.id);
return { p, up: sumUp(ms), del: delivered(ms) };
});
$('repSummary').innerHTML = !rows.length ? '' : `
<div class="card p-3">
<div class="section-title mb-2">Kalem Bazlı Özet <span class="text-secondary text-lowercase">(seçili tarih aralığı)</span></div>
<div class="table-responsive">
<table class="table table-sm align-middle mb-0">
<thead><tr><th>Kalem</th><th class="text-end">Eklenen</th><th class="text-end">Teslim</th><th class="text-end">Kalan</th></tr></thead>
<tbody>${rows.map(r => {
const st = balanceState(r.p);
return `<tr class="clickable" onclick="openProductReport(${r.p.id})">
<td>${esc(r.p.name)}<div class="tiny text-secondary">${isAdmin() ? esc(r.p.allowed_bayi) + ' • ' : ''}${esc(r.p.code)}</div></td>
<td class="text-end text-primary">${r.up ? '+' + num(r.up) : '-'}</td>
<td class="text-end text-success">${r.del ? num(r.del) : '-'}</td>
<td class="text-end fw-semibold ${st.txt}">${num(r.p.qty)} <span class="tiny text-secondary">L</span></td>
</tr>`;
}).join('')}</tbody>
</table>
</div>
</div>`;
}
renderMovesList();
const { f, t } = rangeIso();
const ids = new Set(reportProducts().map(p => p.id));
const groups = {};
shipments.filter(s => { const d = new Date(s.created_at); return (!f || d >= f) && (!t || d < t); }).forEach(s => {
s.items.filter(i => ids.has(i.product_id) && (!pid || i.product_id === Number(pid))).forEach(i => {
const k = s.supplier + '||' + i.product_name;
const g = groups[k] = groups[k] || { bayi: s.supplier, urun: i.product_name, ok: 0, wait: 0, short: 0, n: 0 };
g.n++;
if (isPending(s)) g.wait += i.qty;
else { g.ok += i.received_qty; g.short += Math.max(0, i.qty - i.received_qty); }
});
});
const g = Object.values(groups).sort((a, b) => trCmp(a.bayi, b.bayi) || trCmp(a.urun, b.urun));
$('repBayi').innerHTML = !g.length
? `<div class="text-center text-secondary small py-2">Bu aralıkta sevkiyat yok.</div>`
: `<div class="table-responsive"><table class="table table-sm align-middle mb-0">
<thead><tr><th>Firma / Ürün</th><th class="text-end">Teslim</th><th class="text-end">Eksik</th><th class="text-end">Bekleyen</th></tr></thead>
<tbody>${g.map(r => `
<tr>
<td><span class="fw-semibold">${esc(r.bayi)}</span><div class="tiny text-secondary">${esc(r.urun)} • ${r.n} sevkiyat</div></td>
<td class="text-end text-success">${num(r.ok)}</td>
<td class="text-end ${r.short ? 'diff' : 'text-secondary'}">${r.short ? num(r.short) : '-'}</td>
<td class="text-end text-warning-emphasis">${r.wait ? num(r.wait) : '-'}</td>
</tr>`).join('')}
</tbody></table></div>
<div class="tiny text-secondary mt-1">Miktarlar Litre. "Eksik": bildirilip gelmeyen / hasarlı miktar.</div>`;
}
const MOVE_BADGE = {
'Sevkiyat Teslimi': 'text-bg-success', 'Alacak Girişi': 'text-bg-primary', 'Açılış Alacağı': 'text-bg-info',
'Alacak Düşümü': 'text-bg-danger', 'Düzeltme': 'text-bg-secondary', 'Onay İptali': 'text-bg-warning', 'Sevkiyat İptali': 'text-bg-warning'
};
function renderMovesList() {
const typeBadge = MOVE_BADGE;
$('repCount').innerText = `(${reportMoves.length})`;
$('repMoves').innerHTML = !reportMoves.length
? `<div class="text-center text-secondary small py-3">Bu aralıkta hareket yok.</div>`
: pageSlice(reportMoves, 'moves').map(m => {
const p = prodById(m.product_id) || { name: '(silinmiş kalem)' };
const up = m.qty > 0;
return `
<div class="border-bottom py-2 d-flex justify-content-between gap-2">
<div>
<div class="small fw-semibold">${esc(p.name)}</div>
<div class="d-flex flex-wrap align-items-center gap-1 mt-1">
<span class="badge ${typeBadge[m.movement_type] || 'text-bg-light'} bg-opacity-75" style="font-size:.6rem">${esc(m.movement_type)}</span>
${isAdmin() && m.bayi ? `<span class="badge text-bg-light border" style="font-size:.6rem">${esc(m.bayi)}</span>` : ''}
</div>
<div class="tiny text-secondary mt-1">${dt(m.created_at)}${m.created_by ? ' • ' + esc(m.created_by) : ''}${m.note ? ' • ' + esc(m.note) : ''}</div>
</div>
<div class="text-end text-nowrap">
<div class="fw-bold small ${up ? 'text-primary' : 'text-success'}">${up ? '+' : ''}${num(m.qty)} L</div>
<div class="tiny text-secondary">Kalan: ${num(m.balance_after)}</div>
</div>
</div>`;
}).join('');
$('movesPager').innerHTML = pagerHtml(reportMoves.length, 'moves');
}
function exportCsv() {
if (!reportMoves.length) return notify('Dışa aktarılacak hareket yok.', 'warning');
const dec = v => String(v ?? '').replace('.', ',');
const rows = [['Tarih', 'Firma', 'Ürün Kodu', 'Ürün', 'Hareket', 'Miktar (L)', 'Kalan Alacak (L)', 'Açıklama', 'İşlemi Yapan']];
reportMoves.forEach(m => {
const p = prodById(m.product_id) || {};
rows.push([dt(m.created_at), m.bayi || p.allowed_bayi, p.code, p.name, m.movement_type, dec(m.qty), dec(m.balance_after), m.note, m.created_by]);
});
const csv = '\uFEFF' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
download(csv, `alacak-hareketleri_${$('repFrom').value}_${$('repTo').value}.csv`, 'text/csv;charset=utf-8');
}
function showDoc(html, title) {
$('docPage').innerHTML = html;
$('docView').classList.remove('d-none');
$('docView').scrollTop = 0;
document.title = title;
}
function closeDoc() {
$('docView').classList.add('d-none');
document.title = APP_TITLE;
}
const docHeader = (title, sub) => `
<div class="d-flex justify-content-between align-items-start border-bottom border-2 border-dark pb-2 mb-3">
<div>${LOGOS[ADMIN_FIRM] ? `<img src="${LOGOS[ADMIN_FIRM].src}" class="doc-logo" alt="Yıldız Kumlama &amp; Boya">` : '<h1>YILDIZ KUMLAMA BOYA</h1>'}
<div class="doc-lbl mt-1">Stoklu Alacak Takibi</div></div>
<div class="text-end"><div class="fw-bold" style="font-size:16px">${title}</div>${sub}</div>
</div>`;
const docFooter = () => `<div class="doc-lbl mt-4" style="font-size:10px">Bu belge Yıldız Kumlama Boya alacak takip sisteminden ${dt(new Date())} tarihinde oluşturulmuştur.</div>`;
const docNo = s => `TES-${new Date(s.approved_at || s.created_at).getFullYear()}-${String(s.id).padStart(5, '0')}`;
async function fetchDocData(ids) {
const out = {};
for (let i = 0; i < ids.length; i += 40) {
const r = await rpc('portal_doc_data', { p_ids: ids.slice(i, i + 40) });
if (!r) return null;
(r.data || []).forEach(d => { out[d.id] = d; });
}
return out;
}
function deliveryDocHtml(s, dd, footer = true) {
dd = dd || {};
const after = {};
Object.entries(dd.after || {}).forEach(([k, v]) => { after[Number(k)] = Number(v); });
const no = docNo(s);
const anyNote = s.items.some(i => i.note || i.received_qty !== i.qty);
return `
${docHeader('TESLİMAT BELGESİ', `<div>Belge No: <b>${no}</b></div>`)}
<table class="doc-meta mb-3">
<tr>
<td><div class="doc-lbl">Teslim Eden</div><div class="fw-bold d-flex align-items-center gap-2">${firmLogo(s.supplier, 26)}${esc(s.supplier)}</div>
<div>İrsaliyeyi düzenleyen: ${esc(s.prepared_by || '-')}</div></td>
<td><div class="doc-lbl">Teslim Alan</div><div class="fw-bold">Yıldız Kumlama Boya</div>
<div>Teslim alan: ${esc(s.received_by || s.approved_by || '-')}</div></td>
</tr>
<tr>
<td><div class="doc-lbl">İrsaliye / Sevkiyat No</div><div class="fw-bold">${esc(s.irsaliye_no)}</div>
${s.order_id ? `<div>Sipariş No: ${orderNoById(s.order_id)}</div>` : ''}</td>
<td><div class="doc-lbl">Teslim Tarihi</div><div class="fw-bold">${dt(s.approved_at)}</div></td>
</tr>
<tr>
<td><div class="doc-lbl">Bildirim Tarihi</div><div>${dt(s.created_at)}</div></td>
<td>${s.approve_note ? `<div class="doc-lbl">Not</div><div>${esc(s.approve_note)}</div>` : ''}</td>
</tr>
</table>
<table class="doc-items mb-3">
<thead><tr>
<th style="width:28px">#</th><th style="width:16%">Kod</th><th>Ürün</th>
<th class="text-end text-nowrap" style="width:1%">Bildirilen</th><th class="text-end text-nowrap" style="width:1%">Teslim Alınan</th>
${anyNote ? '<th style="width:22%">Açıklama</th>' : ''}
</tr></thead>
<tbody>${s.items.map((i, k) => `
<tr>
<td>${k + 1}</td><td>${esc(i.code || '')}</td><td>${esc(i.product_name)}</td>
<td class="text-end text-nowrap">${num(i.qty)} L</td>
<td class="text-end text-nowrap fw-bold">${num(i.received_qty)} L</td>
${anyNote ? `<td>${esc(i.note || (i.received_qty !== i.qty ? (i.received_qty < i.qty ? `${num(i.qty - i.received_qty)} L eksik` : `${num(i.received_qty - i.qty)} L fazla`) : ''))}</td>` : ''}
</tr>`).join('')}
</tbody>
${s.items.length > 1 ? `<tfoot><tr><td colspan="3" class="text-end">Toplam</td>
<td class="text-end text-nowrap">${num(shipQty(s))} L</td><td class="text-end text-nowrap">${num(shipRecv(s))} L</td>${anyNote ? '<td></td>' : ''}</tr></tfoot>` : ''}
</table>
${after && Object.keys(after).length ? `
<div class="border rounded p-2 mb-2" style="background:#f9fafb">
<div class="doc-lbl mb-1">Bu teslimat sonrası ${esc(s.supplier)} kalan alacak:</div>
${s.items.filter(i => i.product_id in after).map(i => `<div>${esc(i.product_name)}: <b>${num(after[i.product_id])} L</b>${after[i.product_id] < 0 ? ' <span class="text-danger">(fazla teslim)</span>' : ''}</div>`).join('')}
</div>` : ''}
<div class="doc-sign">
<div><div class="doc-lbl">Teslim Eden: ${esc(s.supplier)}<br>${esc(s.prepared_by || '')} — İmza</div>
${dd.supplier_sig ? `<img src="${dd.supplier_sig}" alt="Teslim eden imzası">` : ''}</div>
<div><div class="doc-lbl">Teslim Alan: Yıldız Kumlama Boya<br>${esc(s.received_by || '')} — Dijital İmza</div>
${dd.receiver_sig ? `<img src="${dd.receiver_sig}" alt="Teslim alan imzası">` : '<div class="doc-lbl text-center mt-4">(dijital imza yok)</div>'}</div>
</div>
${footer ? docFooter() : ''}`;
}
async function openDoc(id) {
const s = shipments.find(x => x.id === id);
if (!s || isPending(s)) return;
const dd = await fetchDocData([id]);
if (!dd) return;
showDoc(deliveryDocHtml(s, dd[id]), docNo(s));
}
const BULK_MAX = 200;
async function openBulkDocs() {
let list = baseFilteredShipments().filter(s => !isPending(s))
.sort((a, b) => new Date(a.approved_at) - new Date(b.approved_at) || a.id - b.id);
if (!list.length) return notify('Filtreye uyan teslim alınmış sevkiyat yok.', 'warning');
if (list.length > BULK_MAX) {
if (!confirm(`${list.length} belge var. Tek seferde en fazla ${BULK_MAX} belge hazırlanır.\nİlk ${BULK_MAX} belge (en eski tarihten) hazırlansın mı?\n\nDaha azı için tarih filtresini daraltın.`)) return;
list = list.slice(0, BULK_MAX);
}
const dd = await fetchDocData(list.map(s => s.id));
if (!dd) return;
const { f, t, byApproved } = shipDateRange();
const toTxt = $('shipTo').value ? dOnly($('shipTo').value + 'T00:00:00') : dOnly(new Date());
const period = (f || t) ? `${f ? dOnly(f) : 'Başlangıç'} – ${toTxt}` : 'Tüm tarihler';
const firms = [...new Set(list.map(s => s.supplier))].sort(trCmp);
const prodFilter = $('shipProduct').value;
const tot = {};
list.forEach(s => s.items.forEach(i => {
const k = (firms.length > 1 ? s.supplier + '||' : '') + i.product_name;
const g = tot[k] = tot[k] || { firm: s.supplier, name: i.product_name, code: i.code || '', qty: 0, recv: 0 };
g.qty += i.qty; g.recv += i.received_qty;
}));
const totRows = Object.values(tot).sort((a, b) => trCmp(a.firm, b.firm) || trCmp(a.name, b.name));
const grand = r2(list.reduce((a, s) => a + shipRecv(s), 0));
const summary = `
${docHeader('TOPLU TESLİMAT BELGESİ', `<div>Dönem: <b>${period}</b></div><div class="doc-lbl">${byApproved ? 'Teslim tarihine göre' : 'Bildirim tarihine göre'}</div>`)}
<table class="doc-meta mb-2">
<tr>
<td><div class="doc-lbl">Teslim Eden</div><div class="fw-bold d-flex align-items-center gap-2 flex-wrap">${firms.length === 1 ? firmLogo(firms[0], 26) : ''}${esc(firms.join(', '))}</div></td>
<td><div class="doc-lbl">Teslim Alan</div><div class="fw-bold">Yıldız Kumlama Boya</div></td>
</tr>
<tr>
<td><div class="doc-lbl">Belge Sayısı</div><div class="fw-bold">${list.length}</div></td>
<td><div class="doc-lbl">Toplam Teslim Alınan</div><div class="fw-bold">${num(grand)} L</div>${prodFilter ? `<div class="doc-lbl">Ürün filtresi: ${esc(prodFilter)}</div>` : ''}</td>
</tr>
</table>
<div class="doc-h2">Teslimat Listesi</div>
<table class="doc-items doc-sum">
<thead><tr><th style="width:28px">#</th><th>Belge No</th><th>Teslim Tarihi</th>${firms.length > 1 ? '<th>Firma</th>' : ''}<th>İrsaliye</th><th class="text-end">Teslim Alınan</th></tr></thead>
<tbody>${list.map((s, k) => `
<tr><td>${k + 1}</td><td>${docNo(s)}</td><td>${dt(s.approved_at)}</td>
${firms.length > 1 ? `<td>${esc(s.supplier)}</td>` : ''}<td>${esc(s.irsaliye_no)}</td>
<td class="text-end text-nowrap">${num(shipRecv(s))} L${shipRecv(s) !== shipQty(s) ? `<div class="doc-lbl">bildirilen ${num(shipQty(s))} L</div>` : ''}</td></tr>`).join('')}
</tbody>
<tfoot><tr><td colspan="${firms.length > 1 ? 5 : 4}" class="text-end">Toplam</td><td class="text-end text-nowrap">${num(grand)} L</td></tr></tfoot>
</table>
<div class="doc-h2">Ürün Bazında Toplam</div>
<table class="doc-items doc-sum">
<thead><tr>${firms.length > 1 ? '<th>Firma</th>' : ''}<th>Kod</th><th>Ürün</th><th class="text-end">Bildirilen</th><th class="text-end">Teslim Alınan</th></tr></thead>
<tbody>${totRows.map(g => `<tr>${firms.length > 1 ? `<td>${esc(g.firm)}</td>` : ''}<td>${esc(g.code)}</td><td>${esc(g.name)}</td>
<td class="text-end text-nowrap">${num(r2(g.qty))} L</td><td class="text-end text-nowrap fw-bold">${num(r2(g.recv))} L</td></tr>`).join('')}</tbody>
</table>
<div class="doc-lbl mt-2">Her teslimatın imzalı belgesi sonraki sayfalardadır.</div>
${docFooter()}`;
const pagesHtml = list.map(s => `<div class="doc-break"></div>${deliveryDocHtml(s, dd[s.id], false)}`).join('');
const fileName = `Toplu-Teslimat_${firms.length === 1 ? firms[0].replace(/\s+/g, '-') + '_' : ''}${$('shipFrom').value || 'baslangic'}_${$('shipTo').value || ymd(new Date())}`;
showDoc(summary + pagesHtml, fileName);
notify(`${list.length} teslimat belgesi hazır. Yazdır / PDF ile tek dosya olarak kaydedebilirsiniz.`);
}
async function openStatement() {
const bayi = isAdmin() ? $('repBayiSel').value : me.name;
if (!bayi) return notify('Mutabakat ekstresi için yukarıdan firma seçin.', 'warning');
const { f, t } = rangeIso();
const r = await rpc('portal_statement', { p_bayi: bayi, p_from: f ? f.toISOString() : null, p_to: t ? t.toISOString() : null });
if (!r) return;
const rows = (r.data || []).map(x => ({ ...x, start: Number(x.start), added: Number(x.added), delivered: Number(x.delivered), other: Number(x.other), end: Number(x.end) }));
if (!rows.length) return notify('Bu firmaya tanımlı alacak kalemi yok.', 'warning');
const sum = k => r2(rows.reduce((a, x) => a + x[k], 0));
const periodTxt = `${f ? dOnly(f) : 'Başlangıç'} – ${$('repTo').value ? dOnly($('repTo').value + 'T00:00:00') : dOnly(new Date())}`;
const endTxt = $('repTo').value ? dOnly($('repTo').value + 'T00:00:00') : dOnly(new Date());
const dels = shipments.filter(s => s.supplier === bayi && !isPending(s) && (!f || new Date(s.approved_at) >= f) && (!t || new Date(s.approved_at) < t))
.sort((a, b) => new Date(a.approved_at) - new Date(b.approved_at));
const cell = v => `<td class="text-end text-nowrap">${num(v)}</td>`;
const html = `
${docHeader('ALACAK MUTABAKAT EKSTRESİ', `<div>Dönem: <b>${periodTxt}</b></div>`)}
<table class="doc-meta mb-2">
<tr>
<td><div class="doc-lbl">Alacaklı</div><div class="fw-bold">Yıldız Kumlama Boya</div></td>
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
<div class="doc-lbl mt-1">* Diğer: düzeltmeler, onay iptalleri, silinen teslimatlar ve alacak düşümleri. Dönem Sonu = Dönem Başı + Eklenen − Teslim Alınan + Diğer.</div>
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
<div class="d-flex gap-1 mt-1">
${u.has_password ? `<span class="badge text-bg-success bg-opacity-75" style="font-size:.6rem">Şifre tanımlı</span>`
: `<span class="badge text-bg-warning" style="font-size:.6rem">Şifre yok - giriş yapamaz</span>`}
${u.active ? '' : `<span class="badge text-bg-secondary" style="font-size:.6rem">Pasif</span>`}
</div>
</div>
<div class="d-flex gap-1">
<button onclick="openBayiModal(${i})" class="btn btn-sm btn-outline-dark" title="Şifre belirle"><i class="bi bi-key"></i></button>
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
$('bayiModalTitle').innerText = bayiEditingNew ? 'Yeni Firma' : 'Şifre Belirle';
$('bayiName').value = u ? u.name : '';
$('bayiName').readOnly = !bayiEditingNew;
$('bayiName').classList.toggle('bg-light', !bayiEditingNew);
$('bayiNameHint').classList.toggle('d-none', !bayiEditingNew);
$('bayiPass').value = '';
bayiModal.show();
}
async function saveBayi() {
const name = $('bayiName').value.trim(), pass = $('bayiPass').value;
if (!name) return notify('Firma adı giriniz.', 'warning');
if (pass.length < 4) return notify('Şifre en az 4 karakter olmalı.', 'warning');
if (bayiEditingNew && users.some(u => u.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr')))
return notify('Bu isimde bir hesap zaten var.', 'warning');
const r = await rpc('portal_admin_save_bayi', { p_name: name, p_new_pass: pass });
if (!r) return;
bayiModal.hide();
notify(bayiEditingNew ? 'Firma hesabı oluşturuldu.' : 'Firma şifresi güncellendi.');
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
const AUD_TR = { irsaliye_no: 'İrsaliye', prepared_by: 'Düzenleyen', received_by: 'Teslim alan', note: 'Not', due_date: 'Termin',
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
text: `${up ? 'Alacak ekledi' : 'Alacaktan düştü'}: ${up ? '+' : ''}${num(r.qty)} L ${r.product_name || ''}${r.note ? ' — ' + r.note : ''}` };
}
case 'products':
return a.op === 'INSERT'
? { icon: 'bi-plus-square', cls: 'text-primary', text: `Alacak kalemi açtı: ${r.name || ''}` }
: { icon: 'bi-trash', cls: 'text-danger', text: `Alacak kalemini sildi: ${r.name || ''}` };
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
<div class="small">${esc(d.text)}</div>
<div class="tiny text-secondary">${dt(a.created_at)} • <b>${esc(a.actor || '-')}</b>${a.firm && a.firm !== a.actor ? ' • ' + esc(a.firm) : ''}</div>
</div>
</div>`;
}).join('');
}