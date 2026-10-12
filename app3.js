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
<td class="text-end text-nowrap">${num(i.qty)} L${tnkLineI(i, i.qty)}</td>
${pending ? '' : `<td class="text-end text-nowrap fw-semibold ${i.received_qty !== i.qty ? 'diff' : ''}">${num(i.received_qty)} L${tnkLineI(i, i.received_qty)}</td>`}
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
<div class="item-row" data-item="${i.id}" data-qty="${i.qty}" data-pid="${i.product_id}" data-nh="${i.no_hardener ? 1 : ''}" data-hq="${i.hardener_qty ?? ''}">
<div class="d-flex justify-content-between gap-2">
<span class="fw-semibold small">${esc(i.product_name)}</span>
<span class="small text-nowrap">Bildirilen: <b>${num(i.qty)} L</b>${tnkSpanI(i, i.qty)}</span>
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
(!isNaN(rec) && tnkI(apvItem(row), rec) ? `<div class="text-primary">Gelen: ${tnkI(apvItem(row), rec)}</div>` : '') +
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
function productOptions(list, withBayi) {
return sortProducts(list).map(p =>
`<option value="${p.id}">${esc((withBayi ? p.allowed_bayi + ' • ' : '') + p.name)} (Kalan: ${num(p.qty)} L)</option>`).join('');
}
function fillSelects() {
const keep = (id, html) => { const el = $(id), cur = el.value; el.innerHTML = html; if ([...el.options].some(o => o.value === cur)) el.value = cur; };
if (isAdmin()) {
keep('adjProduct', productOptions(products, true) || '<option value="">Önce emanet stok kalemi ekleyin</option>');
keep('repBayiSel', `<option value="">Tüm Firmalar</option>` + bayiNames().map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join(''));
const firms = [me.name, ...bayiNames()];
keep('audFirm', '<option value="">Tüm firmalar ve işlemler</option>' + bayiNames().map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join(''));
keep('perFirm', firms.map(f => `<option value="${esc(f)}">${esc(f)}${f === me.name ? ' (teslim alanlar)' : ''}</option>`).join(''));
const ob = $('ordBayi').value;
keep('ordBayi', bayiNames().map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('') || '<option value="">Önce firma ekleyin</option>');
if ($('ordBayi').value !== ob || !$('ordItems').querySelector('.it-rows, .alert')) resetOrderForm();
fillNewCatalog();
}
fillRepProducts();
}
function openProductEdit(id) {
editingProduct = prodById(id);
if (!editingProduct) return;
$('peName').innerText = `${editingProduct.name} (${editingProduct.code})`;
$('peBayi').innerText = `Firma: ${editingProduct.allowed_bayi} • Kalan: ${num(editingProduct.qty)} L`;
$('peCritical').value = editingProduct.critical || '';
productModal.show();
}
async function saveProductEdit() {
const r = await rpc('portal_update_product', { p_id: editingProduct.id, p_critical: parseFloat($('peCritical').value) || 0 });
if (!r) return;
productModal.hide();
notify('Kalem güncellendi.');
await loadData();
}
async function deleteProduct() {
const p = editingProduct;
if (!confirm(`${p.allowed_bayi} - ${p.name} emanet stok kalemi ve hareket geçmişi silinsin mi?\n\n(Sevkiyat kaydı olan kalem silinemez.)`)) return;
const r = await rpc('portal_delete_product', { p_id: p.id });
if (!r) return;
productModal.hide();
notify('Emanet stok kalemi silindi.');
await loadData();
}
async function processAdjust() {
const pid = Number($('adjProduct').value);
const qty = parseFloat($('adjQty').value);
const sign = document.querySelector('input[name="adjType"]:checked').value === '-1' ? -1 : 1;
if (!pid) return notify('Önce emanet stok kalemi tanımlayın.', 'warning');
if (!qty || qty <= 0) return notify('Miktar giriniz.', 'warning');
const p = prodById(pid);
if (sign < 0 && !confirm(`${p.allowed_bayi} - ${p.name}\nEmanet stoktan ${num(qty)} L düşülecek. Devam edilsin mi?`)) return;
const r = await rpc('portal_adjust_receivable', { p_product_id: pid, p_qty: sign * qty, p_note: $('adjNote').value });
if (!r) return;
$('adjQty').value = ''; $('adjNote').value = '';
notify(sign > 0 ? 'Emanet stok eklendi.' : 'Emanet stoktan düşüldü.');
await loadData();
}
async function addNewProduct() {
const bayi = $('newAllowedBayi').value;
const cid = Number($('newCatalog').value);
if (!bayi) return notify('Önce Ayarlar > Firma Hesapları bölümünden firma ekleyin.', 'warning');
if (!cid) return notify(catalog.length ? 'Bu firmaya eklenecek ürün kalmadı.' : 'Önce Ürünler ekranından ürün ekleyin.', 'warning');
const r = await rpc('portal_add_product', {
p_bayi: bayi, p_catalog_id: cid,
p_critical: parseFloat($('newCritical').value) || 0, p_opening: parseFloat($('newOpening').value) || 0
});
if (!r) return;
['newOpening', 'newCritical'].forEach(id => $(id).value = '');
notify('Emanet stok kalemi eklendi.');
await loadData();
}
function fillNewCatalog() {
const bayi = $('newAllowedBayi').value;
const used = new Set(products.filter(p => p.allowed_bayi === bayi).map(p => p.catalog_id));
const list = catalog.slice().sort((a, b) => trCmp(a.name, b.name)).filter(c => !used.has(c.id));
$('newCatalog').innerHTML = list.length
? list.map(c => `<option value="${c.id}">${esc(c.name)} (${esc(c.code)})</option>`).join('')
: `<option value="">${catalog.length ? 'Bu firmaya tüm ürünler eklenmiş' : 'Önce Ürünler ekranından ürün ekleyin'}</option>`;
}
function renderCatalog() {
if (!isAdmin()) return;
const q = $('catSearch').value.trim().toLocaleLowerCase('tr');
const list = catalog.slice().sort((a, b) => trCmp(a.name, b.name))
.filter(c => !q || `${c.code} ${c.name}`.toLocaleLowerCase('tr').includes(q));
$('catCount').innerText = `${catalog.length} ürün`;
$('catalogList').innerHTML = !list.length
? `<div class="card p-4 text-center text-secondary small">${catalog.length ? 'Aramaya uyan ürün yok.' : 'Henüz ürün yok. Yukarıdan ekleyin.'}</div>`
: list.map(c => {
const used = products.filter(p => p.catalog_id === c.id);
return `
<div class="card p-3 d-flex flex-row justify-content-between align-items-center">
<div class="me-2">
<div class="fw-semibold small">${esc(c.name)}</div>
<div class="tiny text-secondary">${esc(c.code)} • ${c.pack_size ? `<span class="text-primary">${packTxt(Number(c.pack_size), c.hardener_size == null ? null : Number(c.hardener_size))}</span>` : 'Litre'} • ${used.length
? used.map(p => `${esc(p.allowed_bayi)}: ${num(p.qty)} L`).join(', ')
: '<span class="fst-italic">firmaya atanmadı</span>'}</div>
</div>
<div class="d-flex gap-1 flex-shrink-0">
<button class="btn btn-sm btn-light border" title="Düzenle" onclick="openCatEdit(${c.id})"><i class="bi bi-pencil"></i></button>
<button class="btn btn-sm btn-outline-danger" title="Sil" onclick="busy(this, () => deleteCatalog(${c.id}))"><i class="bi bi-trash"></i></button>
</div>
</div>`;
}).join('');
}
function readHard(inputId, chkId, pack) {
if ($(chkId).checked) return 0;
const v = $(inputId).value;
if (v === '') return null;
const h = parseFloat(v);
if (!(h > 0)) { notify('Sertleştirici litresi geçersiz.', 'warning'); return undefined; }
if (!(pack > 0)) { notify('Sertleştirici için önce teneke litresini girin.', 'warning'); return undefined; }
return h;
}
function toggleNoHard(chk, inputId) {
$(inputId).disabled = chk.checked;
if (chk.checked) $(inputId).value = '';
}
function setHardFields(inputId, chkId, h) {
$(chkId).checked = h === 0;
$(inputId).disabled = h === 0;
$(inputId).value = h > 0 ? h : '';
}
async function addCatalog() {
const code = $('catCode').value.trim(), name = $('catName').value.trim();
if (!code || !name) return notify('Ürün kodu ve adını giriniz.', 'warning');
const pack = parseFloat($('catPack').value);
if ($('catPack').value !== '' && !(pack > 0)) return notify('Teneke litresi geçersiz.', 'warning');
const hard = readHard('catHard', 'catNoHard', pack);
if (hard === undefined) return;
const params = { p_code: code, p_name: name };
if (pack > 0) params.p_pack = pack;
if (hard !== null) params.p_hard = hard;
const r = await rpc('portal_catalog_add', params);
if (!r) return;
$('catCode').value = ''; $('catName').value = ''; $('catPack').value = ''; setHardFields('catHard', 'catNoHard', null);
notify('Ürün eklendi.');
await loadData();
}
function openCatEdit(id) {
editingCat = catalog.find(c => c.id === id);
if (!editingCat) return;
$('catEditCode').value = editingCat.code;
$('catEditName').value = editingCat.name;
$('catEditPack').value = editingCat.pack_size ?? '';
setHardFields('catEditHard', 'catEditNoHard', editingCat.hardener_size == null ? null : Number(editingCat.hardener_size));
const used = products.filter(p => p.catalog_id === id).map(p => p.allowed_bayi);
$('catEditUsage').innerText = used.length
? `Kullanan firmalar: ${used.join(', ')}. Yeni ad tüm emanet stok kalemlerine ve sevkiyatlara yansır.`
: 'Bu ürün henüz bir firmaya atanmadı.';
catModal.show();
}
async function saveCatEdit() {
const code = $('catEditCode').value.trim(), name = $('catEditName').value.trim();
if (!code || !name) return notify('Ürün kodu ve adı zorunlu.', 'warning');
const pack = parseFloat($('catEditPack').value);
if ($('catEditPack').value !== '' && !(pack > 0)) return notify('Teneke litresi geçersiz.', 'warning');
const hard = readHard('catEditHard', 'catEditNoHard', pack);
if (hard === undefined) return;
const params = { p_id: editingCat.id, p_code: code, p_name: name };
if (pack > 0 || editingCat.pack_size) params.p_pack = pack > 0 ? pack : null;
if (hard !== null || editingCat.hardener_size != null) params.p_hard = hard;
const r = await rpc('portal_catalog_update', params);
if (!r) return;
catModal.hide();
notify('Ürün güncellendi.');
await loadData();
}
async function deleteCatalog(id, fromModal) {
const c = catalog.find(x => x.id === id);
if (!c || !confirm(`"${c.name}" ürün listesinden silinsin mi?`)) return;
const r = await rpc('portal_catalog_delete', { p_id: id });
if (!r) return;
if (fromModal) catModal.hide();
notify('Ürün silindi.');
await loadData();
}
function renderPersonnel() {
if (!isAdmin()) return;
const firm = $('perFirm').value || me.name;
const list = personnel.filter(x => x.firm === firm).sort((a, b) => trCmp(a.name, b.name));
$('perList').innerHTML = !list.length
? `<div class="text-secondary small text-center py-2">Bu firma için kayıtlı personel yok.</div>`
: list.map(x => `
<div class="border rounded-3 px-3 py-2 d-flex justify-content-between align-items-center">
<span class="small">${esc(x.name)}</span>
<button class="btn btn-sm btn-outline-danger" title="Sil" onclick="busy(this, () => deletePersonnel(${x.id}))"><i class="bi bi-trash"></i></button>
</div>`).join('');
}
async function addPersonnel() {
const firm = $('perFirm').value, name = $('perName').value.trim();
if (!firm || !name) return notify('Firma ve ad soyad giriniz.', 'warning');
const r = await rpc('portal_personnel_add', { p_firm: firm, p_name: name });
if (!r) return;
$('perName').value = '';
notify('Personel eklendi.');
await loadData();
}
async function deletePersonnel(id) {
const x = personnel.find(p => p.id === id);
if (!x || !confirm(`${x.name} listeden silinsin mi? (Geçmiş kayıtlardaki isim değişmez.)`)) return;
const r = await rpc('portal_personnel_delete', { p_id: id });
if (!r) return;
notify('Personel silindi.');
await loadData();
}
function setRange(kind, reload = true) {
const now = new Date();
let from = new Date(now), to = new Date(now);
if (kind === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1);
if (kind === 'lastmonth') { from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 0); }
if (kind === 'year') from = new Date(now.getFullYear(), 0, 1);
$('repFrom').value = ymd(from);
$('repTo').value = ymd(to);
if (reload) loadReport();
}
const reportProducts = () => {
const b = isAdmin() ? $('repBayiSel').value : '';
return visibleProducts().filter(p => !b || p.allowed_bayi === b);
};
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
<div class="col-6"><div class="stat"><div class="tiny text-secondary">Eklenen Emanet Stok</div><div class="v text-primary">+${num(sumUp(reportMoves))} L</div></div></div>
<div class="col-6"><div class="stat"><div class="tiny text-secondary">Teslim Alınan</div><div class="v text-success">${num(delivered(reportMoves))} L</div></div></div>
<div class="col-6"><div class="stat"><div class="tiny text-secondary">Onay Bekleyen</div><div class="v text-warning-emphasis">${num(pendingQty(p.id))} L</div></div></div>
<div class="col-6"><div class="stat"><div class="tiny text-secondary">Kalan Emanet Stok (güncel)</div><div class="v ${st.txt}">${num(p.qty)} L</div></div></div>
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
<span class="badge ${typeBadge[m.movement_type] || 'text-bg-light'} bg-opacity-75" style="font-size:.6rem">${esc(emn(m.movement_type))}</span>
${isAdmin() && m.bayi ? `<span class="badge text-bg-light border" style="font-size:.6rem">${esc(m.bayi)}</span>` : ''}
</div>
<div class="tiny text-secondary mt-1">${dt(m.created_at)}${m.created_by ? ' • ' + esc(m.created_by) : ''}${m.note ? ' • ' + esc(emn(m.note)) : ''}</div>
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
const rows = [['Tarih', 'Firma', 'Ürün Kodu', 'Ürün', 'Hareket', 'Miktar (L)', 'Kalan Emanet Stok (L)', 'Açıklama', 'İşlemi Yapan']];
reportMoves.forEach(m => {
const p = prodById(m.product_id) || {};
rows.push([dt(m.created_at), m.bayi || p.allowed_bayi, p.code, p.name, emn(m.movement_type), dec(m.qty), dec(m.balance_after), emn(m.note), m.created_by]);
});
const csv = '\uFEFF' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
download(csv, `emanet-stok-hareketleri_${$('repFrom').value}_${$('repTo').value}.csv`, 'text/csv;charset=utf-8');
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
<div class="doc-lbl mt-1">Emanet Stok Takibi</div></div>
<div class="text-end"><div class="fw-bold" style="font-size:16px">${title}</div>${sub}</div>
</div>`;
const docFooter = () => `<div class="doc-lbl mt-4" style="font-size:10px">Bu belge Yıldız Kumlama Boya emanet stok takip sisteminden ${dt(new Date())} tarihinde oluşturulmuştur.</div>`;
const docNo = s => `TES-${new Date(s.approved_at || s.created_at).getFullYear()}-${String(s.id).padStart(5, '0')}`;