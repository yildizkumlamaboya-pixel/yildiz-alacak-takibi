/* Yıldız Emanet Takip – tek kullanıcılı emanet stok takibi (Supabase et_* fonksiyonları) */
'use strict';
const $ = id => document.getElementById(id);
const CFG = window.ET_CONFIG || {};
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
const PASS_KEY = 'et_oturum', FIRM_KEY = 'et_firma';
let pass = '';
let firms = [], products = [], shipments = [], moves = [];
let firmSel = lsGet(FIRM_KEY) || '';          // '' = tüm firmalar
let current = 'ana';
let editShipId = null;
let photos = new Set(), aiOn = false, shipPhoto = null, aiKeyCache = null;
const pages = { ship: 1, har: 1 };
const PER = 20;

// ---------- yardımcılar ----------
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* yoksay */ } }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const num = n => (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fmtD = s => s ? String(s).slice(0, 10).split('-').reverse().join('.') : '';
const dlab = d => d ? fmtD(d) : 'Açılış';
const pnum = v => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
function notify(msg, type = 'success') {
  const t = $('toast');
  t.className = `alert alert-${type} shadow-sm mb-0 py-2 small`;
  t.textContent = msg;
  clearTimeout(notify.t);
  notify.t = setTimeout(() => t.classList.add('d-none'), type === 'danger' ? 6000 : 3000);
}
async function rpc(fn, params = {}) {
  const { data, error } = await sb.rpc(fn, { p_pass: pass, ...params });
  if (error) {
    const m = /Could not find the function|schema cache/i.test(error.message)
      ? "Supabase'de 20 ve 21 numaralı SQL dosyaları çalıştırılmalı." : error.message;
    notify(m, 'danger');
    return undefined;
  }
  return data === null ? true : data;
}
const firmById = id => firms.find(f => f.id === id) || {};
const prodById = id => products.find(p => p.id === id) || {};
const pack = p => Number(p.pack) || 0;
const hard = p => Number(p.hard) || 0;
const setL = p => pack(p) + hard(p);
const tnkTxt = (p, l) => {
  if (!pack(p) || !(l > 0)) return '';
  const n = r2(l / setL(p));
  return hard(p) > 0 ? `${num(n)} teneke + ${num(n)} sertleştirici` : `${num(n)} teneke`;
};
// Firma logosu: yüklenen logo, yoksa bilinen firmalar için hazır logo, yoksa baş harfler
function firmLogoSrc(f) {
  if (!f) return '';
  if (f.logo) return f.logo;
  const n = String(f.name || '').toLocaleLowerCase('tr');
  if (n.includes('delta')) return '../logo-delta.webp';
  if (n.includes('minimar')) return '../logo-minimar.webp';
  return '';
}
function firmLogo(f, h = 22) {
  const src = firmLogoSrc(f);
  if (src) return `<img src="${src}" alt="" class="flogo" style="height:${h}px">`;
  const ini = String((f && f.name) || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toLocaleUpperCase('tr');
  return `<span class="fini" style="width:${h}px;height:${h}px">${esc(ini)}</span>`;
}
const firmTitle = (f, h) => `<span class="d-inline-flex align-items-center gap-2">${firmLogo(f, h)}<span>${esc((f && f.name) || '')}</span></span>`;
const prodLabel = p => `${p.code ? p.code + ' • ' : ''}${p.name}`;
const inFirm = fid => !firmSel || String(fid) === String(firmSel);

// ---------- hesaplar ----------
function stockOf(p) {
  let out = 0, add = 0;
  shipments.forEach(s => s.items.forEach(i => { if (i.product_id === p.id) out += Number(i.boya) + Number(i.sert); }));
  moves.forEach(m => { if (m.product_id === p.id) add += Number(m.qty); });
  return { out: r2(out), add: r2(add), kalan: r2(Number(p.opening) + add - out) };
}
const shipTotal = s => r2(s.items.reduce((a, i) => a + Number(i.boya) + Number(i.sert), 0));

// ---------- giriş ----------
async function login(saved) {
  const p = saved || $('loginPass').value;
  if (!p) return notify('Şifre giriniz.', 'warning');
  $('loginBtn').disabled = true;
  const { error } = await sb.rpc('et_login', { p_pass: p });
  $('loginBtn').disabled = false;
  if (error) {
    if (saved) { lsSet(PASS_KEY, null); return; }
    return notify(/Could not find|schema cache/i.test(error.message) ? "Supabase'de 20 ve 21 numaralı SQL dosyaları çalıştırılmalı." : error.message, 'danger');
  }
  pass = p; lsSet(PASS_KEY, p); $('loginPass').value = '';
  $('login').classList.add('d-none');
  $('nav').classList.remove('d-none'); $('headBtns').classList.replace('d-none', 'd-flex');
  document.body.classList.add('in');
  await loadData();
  go(location.hash.slice(1) || 'ana', true);
}
function logout() {
  pass = ''; lsSet(PASS_KEY, null);
  location.hash = ''; location.reload();
}

async function loadData(showMsg) {
  const d = await rpc('et_data');
  if (!d) return;
  firms = d.firms || []; products = d.products || []; shipments = d.shipments || []; moves = d.moves || [];
  photos = new Set(d.photos || []); aiOn = !!d.ai;
  if (firmSel && !firms.some(f => String(f.id) === String(firmSel))) firmSel = '';
  render();
  if (showMsg) notify('Güncellendi.');
}

// ---------- gezinme ----------
function go(tab, replace) {
  if (!document.getElementById('tab-' + tab)) tab = 'ana';
  current = tab;
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('d-none', s.id !== 'tab-' + tab));
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (replace) history.replaceState(null, '', '#' + tab); else if (location.hash !== '#' + tab) history.pushState(null, '', '#' + tab);
  render();
  window.scrollTo(0, 0);
}
window.addEventListener('popstate', () => {
  const v = $('docView'); if (v && !v.classList.contains('d-none') && location.hash !== '#ekstre') { v.classList.add('d-none'); document.title = 'Yıldız Emanet Takip'; return; }
  if (pass) go(location.hash.slice(1) || 'ana', true);
});

function render() {
  renderChips();
  const map = { ana: renderHome, sevk: renderShips, depo: () => { renderStock(); renderProducts(); }, har: () => { fillMoveProducts(); renderMoves(); }, rapor: renderReport, ayar: renderFirms };
  try { (map[current] || renderHome)(); } catch (e) { console.error(e); notify('Görüntüleme hatası: ' + e.message, 'danger'); }
}
function renderChips() {
  const html = [`<button class="btn ${!firmSel ? 'btn-dark' : 'btn-outline-dark'}" onclick="setFirm('')">Tüm firmalar</button>`]
    .concat(firms.map(f => `<button class="btn ${String(firmSel) === String(f.id) ? 'btn-dark' : 'btn-outline-dark'}" onclick="setFirm(${f.id})">${firmLogoSrc(f) ? `<img src="${firmLogoSrc(f)}" alt="" class="flogo" style="${String(firmSel) === String(f.id) ? 'filter:brightness(0) invert(1)' : ''}">` : ''}${esc(f.name)}</button>`)).join('');
  document.querySelectorAll('[data-chips]').forEach(el => { el.innerHTML = firms.length > 1 ? html : ''; });
}
function setFirm(id) { firmSel = id ? String(id) : ''; lsSet(FIRM_KEY, firmSel || null); pages.ship = pages.har = 1; render(); }

// ---------- ana sayfa ----------
function renderHome() {
  const ps = products.filter(p => inFirm(p.firm_id));
  let total = 0, tnk = 0; const low = [];
  ps.forEach(p => { const s = stockOf(p); total += s.kalan; if (pack(p)) tnk += s.kalan / setL(p); if (Number(p.warn) > 0 && s.kalan < Number(p.warn)) low.push([p, s]); });
  $('homeTotal').textContent = num(r2(total));
  $('homeTotalSub').textContent = `${ps.length} ürün${tnk ? ' • ≈ ' + num(r2(tnk)) + ' teneke' : ''}${firmSel ? ' • ' + firmById(Number(firmSel)).name : ''}`;
  const m = today().slice(0, 7);
  const ss = shipments.filter(s => inFirm(s.firm_id));
  const monthL = ss.filter(s => String(s.ship_date).slice(0, 7) === m).reduce((a, s) => a + shipTotal(s), 0);
  const monthN = ss.filter(s => String(s.ship_date).slice(0, 7) === m).length;
  $('homeStats').innerHTML = `
    <div class="col-6"><div class="stat clickable" onclick="go('rapor')"><div class="tiny text-secondary">Bu ay teslim alınan</div><div class="v">${num(r2(monthL))} L</div><div class="tiny text-secondary">${monthN} sevkiyat</div></div></div>
    <div class="col-6"><div class="stat clickable" onclick="go('depo')"><div class="tiny text-secondary">Uyarıdaki ürün</div><div class="v ${low.length ? 'text-danger' : ''}">${low.length}</div><div class="tiny text-secondary">uyarı seviyesinin altında</div></div></div>`;
  $('homeWarn').innerHTML = low.length ? `<div class="alert alert-danger py-2 small mb-3"><b>Az kalanlar:</b> ${low.map(([p, s]) => `${esc(p.name)} (${num(s.kalan)} L)`).join(', ')}</div>` : '';
  $('homeShips').innerHTML = ss.slice(0, 5).map(shipCard).join('') || emptyCard('Henüz sevkiyat yok. "Sevkiyat Gir" ile ilk kaydı ekleyin.');
}
const emptyCard = t => `<div class="card p-3 text-center text-secondary small">${t}</div>`;

// ---------- sevkiyat listesi ----------
function shipCard(s) {
  const f = firmById(s.firm_id);
  const lines = s.items.map(i => {
    const p = prodById(i.product_id), l = r2(Number(i.boya) + Number(i.sert));
    const tn = i.teneke != null ? num(i.teneke) + ' tnk • ' : (pack(p) ? '≈ ' + num(r2(i.boya / pack(p))) + ' tnk • ' : '');
    return `<div class="ln"><span>${esc(p.name || '?')}</span><span class="text-nowrap fw-semibold">${tn}${num(l)} L</span></div>`;
  }).join('');
  return `<div class="card p-3 clickable" onclick="showShipment(${s.id})">
    <div class="d-flex justify-content-between align-items-start gap-2">
      <div class="min-w-0">
        <div class="fw-semibold">${firmTitle(f, 22)}</div>
        <div class="tiny text-secondary text-break"><i class="bi bi-receipt"></i> ${esc(s.irsaliye || '-')} &nbsp;•&nbsp; ${fmtD(s.ship_date)}${photos.has(s.id) ? ' &nbsp;<i class="bi bi-image"></i>' : ''}</div>
      </div>
      <span class="tot-badge">${num(shipTotal(s))} L</span>
    </div>
    <div class="ship-items">${lines}</div>
  </div>`;
}
function filteredShips() {
  const q = $('shipSearch').value.trim().toLocaleLowerCase('tr'), m = $('shipMonth').value;
  return shipments.filter(s => inFirm(s.firm_id) && (!m || String(s.ship_date).slice(0, 7) === m) && (!q ||
    [s.irsaliye, s.note, firmById(s.firm_id).name, ...s.items.map(i => prodLabel(prodById(i.product_id)))].join(' ').toLocaleLowerCase('tr').includes(q)));
}
function renderShips() {
  const list = filteredShips();
  const pg = paginate(list, 'ship');
  $('shipList').innerHTML = pg.items.map(shipCard).join('') || emptyCard('Kayıt yok.');
  $('shipPager').innerHTML = pg.html;
}
function paginate(list, key) {
  const n = Math.max(1, Math.ceil(list.length / PER));
  pages[key] = Math.min(Math.max(1, pages[key]), n);
  const p = pages[key];
  const html = n > 1 ? `<button class="btn btn-sm btn-light border" ${p <= 1 ? 'disabled' : ''} onclick="pages.${key}--;render()">‹</button>
    <span class="tiny text-secondary">${p} / ${n} • ${list.length} kayıt</span>
    <button class="btn btn-sm btn-light border" ${p >= n ? 'disabled' : ''} onclick="pages.${key}++;render()">›</button>` : '';
  return { items: list.slice((p - 1) * PER, p * PER), html };
}
function showShipment(id) {
  const s = shipments.find(x => x.id === id); if (!s) return;
  const rows = s.items.map(i => {
    const p = prodById(i.product_id);
    return `<tr><td>${esc(prodLabel(p))}<div class="tiny text-secondary">${i.teneke ? num(i.teneke) + ' teneke' : (pack(p) ? '≈ ' + num(r2(i.boya / pack(p))) + ' teneke' : '')}</div></td>
      <td class="text-end">${num(i.boya)}</td><td class="text-end">${num(i.sert)}</td><td class="text-end fw-semibold">${num(r2(Number(i.boya) + Number(i.sert)))}</td></tr>`;
  }).join('');
  dialog(`${firmTitle(firmById(s.firm_id), 24)} <span class="tiny text-secondary ms-1">İrsaliye ${esc(s.irsaliye || '-')}</span>`,
    `<div class="tiny text-secondary mb-2">${fmtD(s.ship_date)}${s.note ? ' • ' + esc(s.note) : ''}</div>
     <div class="table-responsive"><table class="table table-sm"><thead><tr><th>Ürün</th><th class="text-end">Boya L</th><th class="text-end">Sert. L</th><th class="text-end">Toplam</th></tr></thead>
     <tbody>${rows}</tbody><tfoot><tr><td colspan="3" class="fw-semibold">Toplam</td><td class="text-end fw-bold">${num(shipTotal(s))} L</td></tr></tfoot></table></div>`,
    `<button class="btn btn-outline-danger btn-sm me-auto" onclick="deleteShipment(${s.id})"><i class="bi bi-trash"></i> Sil</button>
     ${photos.has(s.id) ? `<button class="btn btn-outline-primary btn-sm" onclick="showPhoto(${s.id})"><i class="bi bi-image"></i> İrsaliye</button>` : ''}
     <button class="btn btn-outline-success btn-sm" onclick="shareShipment(${s.id})"><i class="bi bi-whatsapp"></i> Paylaş</button>
     <button class="btn btn-dark btn-sm" onclick="editShipment(${s.id})"><i class="bi bi-pencil"></i> Düzenle</button>`);
}
function shareShipment(id) {
  const s = shipments.find(x => x.id === id); if (!s) return;
  const lines = s.items.map(i => { const p = prodById(i.product_id); return `• ${prodLabel(p)}: ${num(i.boya)} L boya${Number(i.sert) ? ' + ' + num(i.sert) + ' L sertleştirici' : ''}`; });
  const txt = `*Yıldız Kumlama Boya – Teslim alınan sevkiyat*\n${firmById(s.firm_id).name} • İrsaliye ${s.irsaliye || '-'} • ${fmtD(s.ship_date)}\n${lines.join('\n')}\n*Toplam: ${num(shipTotal(s))} L*`;
  window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
}
async function deleteShipment(id) {
  if (!confirm('Bu sevkiyat silinsin mi? Litreler emanete geri eklenir.')) return;
  if (await rpc('et_delete_shipment', { p_id: id }) === undefined) return;
  closeDialog(); notify('Sevkiyat silindi.'); await loadData();
}

// ---------- sevkiyat formu ----------
function firmOptions(sel, withEmpty) {
  return (withEmpty ? '<option value="">Firma seçin</option>' : '') + firms.map(f => `<option value="${f.id}" ${String(sel) === String(f.id) ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
}
function newShipment() {
  if (!firms.length) { go('ayar'); return notify('Önce Ayarlar\'dan firma ekleyin.', 'warning'); }
  if (!products.length) { go('depo'); depoSeg('urun'); return notify('Önce ürün ekleyin.', 'warning'); }
  if (current !== 'sevk') go('sevk');
  editShipId = null;
  $('shipFormTitle').textContent = 'Yeni sevkiyat';
  $('shFirm').innerHTML = firmOptions(firmSel || (firms.length === 1 ? firms[0].id : ''), true);
  $('shDate').value = today(); $('shIrs').value = ''; $('shNote').value = '';
  shipPhoto = null; irsBox('');
  resetShipRows();
  $('shipFormCard').classList.remove('d-none'); $('shipOpenBtn').classList.add('d-none');
  $('shIrs').focus();
}
function editShipment(id) {
  const s = shipments.find(x => x.id === id); if (!s) return;
  closeDialog(); if (current !== 'sevk') go('sevk');
  editShipId = id;
  $('shipFormTitle').textContent = 'Sevkiyatı düzenle';
  $('shFirm').innerHTML = firmOptions(s.firm_id, true);
  $('shDate').value = String(s.ship_date).slice(0, 10); $('shIrs').value = s.irsaliye || ''; $('shNote').value = s.note || '';
  $('shRows').innerHTML = '';
  shipPhoto = null; irsBox(photos.has(id) ? '<div class="tiny text-secondary"><i class="bi bi-image"></i> Kayıtlı irsaliye belgesi var. Yeni fotoğraf/PDF seçerseniz değiştirilir.</div>' : '');
  s.items.forEach(i => addShipRow(i));
  $('shipFormCard').classList.remove('d-none'); $('shipOpenBtn').classList.add('d-none');
  window.scrollTo(0, 0);
}
function closeShipForm() { $('shipFormCard').classList.add('d-none'); $('shipOpenBtn').classList.remove('d-none'); editShipId = null; }
function resetShipRows() { $('shRows').innerHTML = ''; addShipRow(); }
function addShipRow(it = {}) {
  const fid = Number($('shFirm').value);
  const ps = products.filter(p => p.firm_id === fid);
  const row = document.createElement('div');
  row.className = 'item-row';
  if (!fid) { row.innerHTML = '<div class="tiny text-secondary">Önce firma seçin.</div>'; $('shRows').appendChild(row); return; }
  if (!ps.length) { row.innerHTML = '<div class="tiny text-danger">Bu firmaya tanımlı ürün yok. Depo › Ürünler bölümünden ekleyin.</div>'; $('shRows').appendChild(row); return; }
  // Düzenlemede: teneke adedinden hesaplanmış litreler boş bırakılır (otomatik), elle girilmiş olanlar yazılır
  let boyaVal = '', sertVal = '';
  if (it.product_id) {
    const p0 = prodById(it.product_id), t0 = it.teneke == null ? null : Number(it.teneke);
    const autoB = t0 != null && pack(p0) ? r2(t0 * pack(p0)) : null;
    const autoS = hard(p0) > 0 ? (t0 != null ? r2(t0 * hard(p0)) : (pack(p0) ? r2(Number(it.boya) / pack(p0) * hard(p0)) : 0)) : 0;
    if (autoB == null || r2(it.boya) !== autoB) boyaVal = Number(it.boya);
    if (r2(it.sert) !== autoS) sertVal = Number(it.sert);
  }
  row.innerHTML = `
    <div class="d-flex gap-2 mb-2">
      <select class="form-select form-select-sm req-input r-prod" onchange="rowCalc(this)">
        <option value="">Ürün seçin</option>${ps.map(p => `<option value="${p.id}" ${p.id === it.product_id ? 'selected' : ''}>${esc(prodLabel(p))}</option>`).join('')}
      </select>
      <button class="btn btn-sm btn-outline-danger" onclick="this.closest('.item-row').remove();shipTotalCalc()" title="Satırı sil"><i class="bi bi-x-lg"></i></button>
    </div>
    <div class="row g-2">
      <div class="col-4"><div class="tiny text-secondary">Teneke</div><input type="number" inputmode="decimal" class="form-control form-control-sm req-input r-tnk" value="${it.teneke ?? ''}" oninput="rowCalc(this)"></div>
      <div class="col-4"><div class="tiny text-secondary">veya Boya (L)</div><input type="number" inputmode="decimal" class="form-control form-control-sm req-input r-boya" value="${boyaVal ?? ''}" oninput="rowCalc(this)"></div>
      <div class="col-4 r-sert-wrap"><div class="tiny text-secondary">Sertleştirici (L)</div><input type="number" inputmode="decimal" class="form-control form-control-sm r-sert" value="${sertVal}" oninput="rowCalc(this)"></div>
    </div>
    <div class="r-calc"></div>`;
  $('shRows').appendChild(row);
  rowCalc(row.querySelector('.r-prod'));
}
// Satırın litrelerini hesaplar: teneke → boya = adet × teneke L, sertleştirici = adet × sert. L
function rowVals(row) {
  const p = prodById(Number(row.querySelector('.r-prod').value));
  const t = pnum(row.querySelector('.r-tnk').value), b = pnum(row.querySelector('.r-boya').value), s = pnum(row.querySelector('.r-sert').value);
  let boya = b != null ? b : (t != null && pack(p) ? t * pack(p) : null);
  let sert = s != null ? s : (hard(p) > 0 ? (t != null ? t * hard(p) : (b != null && pack(p) ? b / pack(p) * hard(p) : 0)) : 0);
  return { p, t, boya: boya == null ? null : r2(boya), sert: r2(sert || 0) };
}
function rowCalc(el) {
  const row = el.closest('.item-row'); if (!row || !row.querySelector('.r-prod')) return;
  const v = rowVals(row);
  row.querySelector('.r-sert-wrap').classList.toggle('d-none', !(hard(v.p) > 0) && !pnum(row.querySelector('.r-sert').value));
  row.querySelector('.r-boya').placeholder = v.t != null && pack(v.p) ? num(r2(v.t * pack(v.p))) : '';
  row.querySelector('.r-sert').placeholder = hard(v.p) > 0 ? num(v.sert) : '0';
  const c = row.querySelector('.r-calc');
  if (!v.p.id) c.innerHTML = '';
  else if (v.boya == null) c.innerHTML = `<div class="tiny text-secondary mt-1">${pack(v.p) ? `Teneke: ${num(pack(v.p))} L${hard(v.p) ? ' + ' + num(hard(v.p)) + ' L sertleştirici' : ''}` : 'Teneke litresi tanımlı değil, litre girin.'} • Kalan ${num(stockOf(v.p).kalan)} L</div>`;
  else {
    const tn = v.t != null ? v.t : (pack(v.p) ? r2(v.boya / pack(v.p)) : null);
    c.innerHTML = `<span class="calc">${tn != null ? num(tn) + ' teneke = ' : ''}${num(v.boya)} L boya${v.sert ? ' + ' + num(v.sert) + ' L sertleştirici' : ''} = <b>${num(r2(v.boya + v.sert))} L</b></span>
      <span class="tiny text-secondary ms-1">Sonra kalan: ${num(r2(stockOf(v.p).kalan - v.boya - v.sert + oldQty(v.p.id)))} L</span>`;
  }
  shipTotalCalc();
}
function oldQty(pid) {  // düzenlemede eski sevkiyattaki miktar (kalan hesabına geri eklenir)
  const s = editShipId && shipments.find(x => x.id === editShipId);
  return s ? s.items.filter(i => i.product_id === pid).reduce((a, i) => a + Number(i.boya) + Number(i.sert), 0) : 0;
}
function shipTotalCalc() {
  let tot = 0, n = 0;
  $('shRows').querySelectorAll('.item-row').forEach(r => { if (!r.querySelector('.r-prod')) return; const v = rowVals(r); if (v.boya != null) { tot += v.boya + v.sert; n++; } });
  $('shTotal').textContent = n ? `${n} kalem • Toplam ${num(r2(tot))} L` : '';
}
async function saveShipment() {
  const firm_id = Number($('shFirm').value), irs = $('shIrs').value.trim();
  if (!firm_id) return notify('Firma seçin.', 'warning');
  if (!irs) { $('shIrs').focus(); return notify('İrsaliye No yazın.', 'warning'); }
  const items = [], seen = new Set();
  for (const r of $('shRows').querySelectorAll('.item-row')) {
    if (!r.querySelector('.r-prod')) continue;
    const v = rowVals(r);
    if (!v.p.id) continue;
    if (v.boya == null || v.boya < 0 || v.boya + v.sert <= 0) return notify(`${v.p.name}: teneke adedi veya litre girin.`, 'warning');
    if (seen.has(v.p.id)) return notify(`${v.p.name} iki kez eklenmiş.`, 'warning');
    seen.add(v.p.id);
    items.push({ product_id: v.p.id, teneke: v.t, boya: v.boya, sert: v.sert });
  }
  if (!items.length) return notify('En az bir ürün seçin.', 'warning');
  $('shSave').disabled = true;
  const res = await rpc('et_save_shipment', { p: { id: editShipId, firm_id, ship_date: $('shDate').value || today(), irsaliye: irs, note: $('shNote').value.trim(), items } });
  $('shSave').disabled = false;
  if (res === undefined) return;
  if (shipPhoto && shipPhoto.length > 2900000) notify('Sevkiyat kaydedildi; belge 2 MB\'tan büyük olduğu için saklanmadı.', 'warning');
  else if (shipPhoto) {
    let ok; try { ok = await rpc('et_save_photo', { p_id: Number(res), p_data: shipPhoto }); } catch (e) { ok = undefined; }
    if (ok === undefined) notify('Sevkiyat kaydedildi ama fotoğraf kaydedilemedi.', 'warning');
  }
  notify(editShipId ? 'Sevkiyat güncellendi.' : `Sevkiyat kaydedildi, ${num(r2(items.reduce((a, i) => a + i.boya + i.sert, 0)))} L emanetten düşüldü.`);
  closeShipForm();
  await loadData();
}

// ---------- irsaliye fotoğrafı (Gemini ile okuma) ----------
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
function irsBox(html) { const b = $('irsBox'); b.innerHTML = html; b.classList.toggle('d-none', !html); }
function shrinkImage(file, max = 1600, q = 0.75) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => rej(new Error('Fotoğraf açılamadı'));
    img.src = URL.createObjectURL(file);
  });
}
const isPdf = d => String(d || '').startsWith('data:application/pdf');
function readAsDataUrl(file) {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(new Error('Dosya okunamadı')); fr.readAsDataURL(file); });
}
function irsThumb(d) {
  return isPdf(d) ? `<span class="d-inline-flex flex-column align-items-center justify-content-center me-2 border rounded-3 bg-light text-danger" style="width:56px;height:64px;flex:none"><i class="bi bi-file-earmark-pdf fs-3"></i><span class="tiny">PDF</span></span>`
    : `<img src="${d}" alt="İrsaliye" style="height:64px;border-radius:8px;border:1px solid #e5e7eb" class="me-2">`;
}
async function irsaliyeSecildi(inp) {
  const file = inp.files && inp.files[0]; inp.value = '';
  if (!file) return;
  let data;
  try {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      if (file.size > 15 * 1024 * 1024) return notify('PDF çok büyük (en fazla 15 MB).', 'warning');
      data = await readAsDataUrl(file);
      if (!isPdf(data)) data = 'data:application/pdf;base64,' + String(data).split(',')[1];
    } else data = await shrinkImage(file);
  } catch (e) { return notify(e.message, 'danger'); }
  shipPhoto = data;
  if (!aiOn) {
    irsBox(`<div class="d-flex align-items-center p-2 border rounded-3 bg-white">${irsThumb(data)}<div class="tiny">${isPdf(data) ? 'PDF' : 'Fotoğraf'} sevkiyata eklenecek. Otomatik okuma için Ayarlar'dan Gemini anahtarı girin.</div></div>`);
    return;
  }
  await irsOku();
}
async function irsOku() {
  if (!shipPhoto) return;
  const thumb = irsThumb(shipPhoto);
  const busy = t => irsBox(`<div class="d-flex align-items-center p-2 border rounded-3 bg-white">${thumb}<div class="tiny"><span class="spinner-border spinner-border-sm me-1"></span>${t}</div></div>`);
  busy('İrsaliye okunuyor…');
  try {
    const r = await readIrsaliye(shipPhoto, busy);
    applyIrsaliye(r, thumb);
  } catch (e) {
    const yogun = /high demand|overloaded|unavailable|try again|quota|rate|exhausted|429|503/i.test(e.message);
    irsBox(`<div class="d-flex align-items-center p-2 border rounded-3 bg-white">${thumb}<div class="tiny">
      <div class="text-danger">${yogun ? 'Google şu an yoğun, irsaliye okunamadı.' : 'Okunamadı: ' + esc(e.message)}</div>
      <button class="btn btn-sm btn-primary mt-1" onclick="irsOku()"><i class="bi bi-arrow-repeat"></i> Tekrar Dene</button>
      <div class="text-secondary mt-1">İsterseniz bilgileri elle girin; fotoğraf yine de kaydedilir.</div></div></div>`);
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function readIrsaliye(dataUrl, busy = () => {}) {
  if (!aiKeyCache) aiKeyCache = await rpc('et_get_ai_key');
  if (!aiKeyCache || aiKeyCache === true) throw new Error('Gemini anahtarı yok');
  const firmList = firms.map(f => ({ firma_id: f.id, ad: f.name }));
  const prodList = products.map(p => ({ urun_id: p.id, firma_id: p.firm_id, kod: p.code, ad: p.name, teneke_litre: pack(p) || null, sertlestirici_litre: hard(p) || null }));
  const prompt = `Bu belge (fotoğraf veya PDF) Türkiye'de düzenlenmiş bir sevk irsaliyesi (e-irsaliye olabilir); birden çok sayfa varsa hepsini oku. Malı gönderen (irsaliyeyi düzenleyen) firma, alıcı ise Yıldız Kumlama Boya'dır.
Görevin:
1) Düzenleyen firmayı aşağıdaki FİRMALAR listesinden eşleştir (firma_id). Eşleşmezse null.
2) İrsaliye numarasını (seri ve sıra no birlikte) oku. Tarihleri oku: "Fiili Sevk Tarihi"/"Sevk Tarihi" alanını sevk_tarihi olarak, "Düzenleme Tarihi"/"İrsaliye Tarihi" alanını duzenleme_tarihi olarak YYYY-MM-DD biçiminde yaz (gün.ay.yıl biçimini doğru çevir). Okunamayanı null bırak.
3) İrsaliyedeki ürün satırlarından YALNIZCA aşağıdaki EMANET ÜRÜNLERİ listesindeki bir ürünle eşleşenleri al. Eşleştirirken ürün kodu, renk kodu (RAL vb.) ve ürün adını kullan; emin değilsen alma. Eşleşmeyen satırları "atlananlar" listesine yaz.
4) Her alınan satır için miktarı ve birimini oku. Birim: litre ise "L", kilogram ise "KG", teneke/kova/adet/ambalaj ise "ADET". Satır o ürünün sertleştiricisi (hardener, sertleştirici, kür) ise "sertlestirici": true yaz.
Sayılarda Türkçe biçimi dikkate al (1.250,5 = 1250.5).
YALNIZCA şu JSON'u döndür:
{"firma_id": number|null, "firma_adi": string, "irsaliye_no": string, "sevk_tarihi": "YYYY-MM-DD"|null, "duzenleme_tarihi": "YYYY-MM-DD"|null,
 "kalemler": [{"urun_id": number, "satir": string, "miktar": number, "birim": "L"|"KG"|"ADET", "sertlestirici": boolean}],
 "atlananlar": [string]}
FİRMALAR: ${JSON.stringify(firmList)}
EMANET ÜRÜNLERİ: ${JSON.stringify(prodList)}`;
  const body = { contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: isPdf(dataUrl) ? 'application/pdf' : 'image/jpeg', data: dataUrl.split(',')[1] } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' } };
  // Yoğunluk/kota hatasında sıradaki modele geçer; hepsi yoğunsa biraz bekleyip bir tur daha dener
  let lastErr = 'Model bulunamadı';
  for (let tur = 0; tur < 2; tur++) {
   if (tur) { busy('Google yoğun, birkaç saniye içinde tekrar deneniyor…'); await sleep(4000); }
   for (const m of GEMINI_MODELS) {
    let res, j;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': aiKeyCache }, body: JSON.stringify(body) });
      j = await res.json().catch(() => ({}));
    } catch (e) { lastErr = 'Bağlantı kurulamadı'; continue; }
    if ([404, 429, 500, 502, 503, 504].includes(res.status)) { lastErr = (j.error && j.error.message) || ('HTTP ' + res.status); continue; }
    if (!res.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + res.status));
    const txt = (((j.candidates || [])[0] || {}).content || {}).parts?.map(x => x.text || '').join('') || '';
    const clean = txt.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    try { return JSON.parse(clean); } catch (e) { lastErr = 'Yanıt çözülemedi'; continue; }
   }
  }
  throw new Error(lastErr);
}
// Okunan irsaliyeyi forma uygular: teneke/adet → teneke, L → boya litresi, sertleştirici satırı → sertleştirici litresi
function applyIrsaliye(r, thumb) {
  const warn = [];
  const firm = firms.find(f => f.id === Number(r.firma_id));
  const items = (r.kalemler || []).filter(k => products.some(p => p.id === Number(k.urun_id)));
  const fid = firm ? firm.id : (items.length ? prodById(Number(items[0].urun_id)).firm_id : null);
  if (fid) { $('shFirm').value = String(fid); } else warn.push('Firma tanınamadı, elle seçin.');
  if (r.irsaliye_no) $('shIrs').value = String(r.irsaliye_no).trim();
  const tarih = isoDate(r.sevk_tarihi) || isoDate(r.duzenleme_tarihi) || isoDate(r.tarih);
  if (tarih) $('shDate').value = tarih; else warn.push('Sevk tarihi okunamadı, elle kontrol edin.');
  const by = new Map();
  items.forEach(k => {
    const p = prodById(Number(k.urun_id));
    if (fid && p.firm_id !== fid) { warn.push(`${p.name} başka firmaya ait, alınmadı.`); return; }
    const q = Number(k.miktar) || 0; if (!(q > 0)) return;
    const o = by.get(p.id) || { product_id: p.id, teneke: null, boya: null, sert: null };
    const unit = String(k.birim || 'L').toUpperCase();
    if (k.sertlestirici) {
      const l = unit === 'ADET' ? (hard(p) ? q * hard(p) : null) : q;
      if (l == null) warn.push(`${p.name}: sertleştirici adedi okundu ama sertleştirici litresi tanımlı değil.`);
      else o.sert = r2((o.sert || 0) + l);
    } else if (unit === 'ADET') {
      if (pack(p)) o.teneke = r2((o.teneke || 0) + q); else { o.boya = r2((o.boya || 0) + q); warn.push(`${p.name}: adet okundu, teneke litresi tanımlı değil; miktarı kontrol edin.`); }
    } else {
      if (unit === 'KG') warn.push(`${p.name}: miktar KG olarak okundu, litre olarak alındı; kontrol edin.`);
      o.boya = r2((o.boya || 0) + q);
    }
    by.set(p.id, o);
  });
  $('shRows').innerHTML = '';
  if (by.size) by.forEach(o => addShipRow({ product_id: o.product_id, teneke: o.teneke, boya: o.boya ?? (o.teneke != null ? r2(o.teneke * pack(prodById(o.product_id))) : 0),
    sert: o.sert ?? autoSert(o) }));
  else addShipRow();
  const skipped = (r.atlananlar || []).filter(Boolean);
  irsBox(`<div class="d-flex align-items-start p-2 border rounded-3 bg-white">${thumb}<div class="tiny">
    <div class="text-success fw-semibold"><i class="bi bi-check-circle"></i> İrsaliye okundu: ${by.size} emanet ürünü bulundu.</div>
    <div>${firm ? esc(firm.name) + ' • ' : ''}${esc(r.irsaliye_no || '')}${tarih ? ' • Sevk tarihi ' + fmtD(tarih) : ''}</div>
    ${skipped.length ? `<div class="text-secondary">Emanet dışı atlanan: ${skipped.map(esc).join(', ')}</div>` : ''}
    ${warn.length ? `<div class="text-danger">${warn.map(esc).join('<br>')}</div>` : ''}
    <div class="text-secondary">Kaydetmeden önce bilgileri kontrol edin.</div></div></div>`);
}
function isoDate(v) {   // 2026-10-13, 13.10.2026, 13/10/2026 → 2026-10-13
  const t = String(v || '').trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return '';
}
function autoSert(o) {  // irsaliyede sertleştirici satırı yoksa formun kendi hesabı kullanılsın
  const p = prodById(o.product_id);
  if (!(hard(p) > 0)) return 0;
  if (o.teneke != null) return r2(o.teneke * hard(p));
  return pack(p) && o.boya != null ? r2(o.boya / pack(p) * hard(p)) : 0;
}
async function showPhoto(id) {
  const d = await rpc('et_get_photo', { p_id: id });
  if (!d || d === true) return notify('Belge bulunamadı.', 'warning');
  const s = shipments.find(x => x.id === id) || {};
  const name = `irsaliye-${String(s.irsaliye || id).replace(/[^\w.-]+/g, '_')}`;
  if (isPdf(d)) {
    const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(d.split(',')[1]), c => c.charCodeAt(0))], { type: 'application/pdf' }));
    dialog(`İrsaliye ${esc(s.irsaliye || '')}`, `<div class="text-center py-3"><i class="bi bi-file-earmark-pdf text-danger" style="font-size:3rem"></i><div class="small mt-2">İrsaliye PDF olarak kayıtlı.</div></div>`,
      `<a class="btn btn-dark btn-sm" href="${url}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i> PDF'i Aç</a>
       <a class="btn btn-outline-dark btn-sm" href="${url}" download="${name}.pdf"><i class="bi bi-download"></i> İndir</a>`);
    return;
  }
  dialog(`İrsaliye ${esc(s.irsaliye || '')}`, `<a href="${d}" target="_blank" rel="noopener"><img src="${d}" alt="İrsaliye" class="img-fluid rounded-3 border"></a>`,
    `<a class="btn btn-outline-dark btn-sm" href="${d}" download="${name}.jpg"><i class="bi bi-download"></i> İndir</a>`);
}

// ---------- depo ----------
function depoSeg(k) {
  document.querySelectorAll('#tab-depo [data-seg]').forEach(b => { b.classList.toggle('btn-dark', b.dataset.seg === k); b.classList.toggle('btn-outline-dark', b.dataset.seg !== k); });
  $('depoKalan').classList.toggle('d-none', k !== 'kalan'); $('depoUrun').classList.toggle('d-none', k !== 'urun');
}
function renderStock() {
  const q = $('stockSearch').value.trim().toLocaleLowerCase('tr');
  const groups = firms.filter(f => inFirm(f.id)).map(f => {
    const ps = products.filter(p => p.firm_id === f.id && (!q || prodLabel(p).toLocaleLowerCase('tr').includes(q)));
    if (!ps.length) return '';
    const tot = ps.reduce((a, p) => a + stockOf(p).kalan, 0);
    return `<div class="d-flex justify-content-between align-items-center mt-2"><div class="fw-semibold">${firmTitle(f, 24)}</div><span class="badge text-bg-light border">Toplam ${num(r2(tot))} L</span></div>` +
      ps.map(p => {
        const s = stockOf(p), low = Number(p.warn) > 0 && s.kalan < Number(p.warn);
        return `<div class="card p-3 clickable ${low ? 'low-card' : ''}" onclick="showProduct(${p.id})">
          <div class="d-flex justify-content-between gap-2">
            <div class="min-w-0"><div class="fw-semibold small text-break">${esc(p.name)}</div><div class="tiny text-secondary">${esc(p.code)}${pack(p) ? ' • ' + num(pack(p)) + ' L teneke' + (hard(p) ? ' + ' + num(hard(p)) + ' L sert.' : '') : ''}</div></div>
            <div class="text-end text-nowrap"><div class="tiny text-secondary">Kalan</div><div class="fw-bold ${low ? 'text-danger' : ''}">${num(s.kalan)} L</div>
              ${tnkTxt(p, s.kalan) ? `<div class="tiny text-secondary">≈ ${tnkTxt(p, s.kalan).replace(' + ', '<br>+ ')}</div>` : ''}</div>
          </div></div>`;
      }).join('');
  }).join('');
  $('stockList').innerHTML = groups || emptyCard('Ürün yok. "Ürünler" bölümünden ekleyin.');
}
function productHistory(p) {
  const rows = [];
  // Başlangıç emaneti her zaman en başta sayılır (geriye dönük girilen sevkiyatlar bakiyeyi eksiye düşürmesin)
  rows.push({ d: '', t: 'Başlangıç emaneti', q: Number(p.opening), k: 'acilis' });
  moves.filter(m => m.product_id === p.id).forEach(m => rows.push({ d: m.move_date, t: m.note || (m.qty > 0 ? 'Emanet eklendi' : 'Emanet düşüldü'), q: Number(m.qty), k: m.qty > 0 ? 'ekle' : 'dus', moveId: m.id }));
  shipments.forEach(s => s.items.filter(i => i.product_id === p.id).forEach(i => rows.push({ d: s.ship_date, t: `Sevkiyat • İrsaliye ${s.irsaliye || '-'}`, q: -(Number(i.boya) + Number(i.sert)), k: 'sevk', shipId: s.id })));
  return rows;
}
function showProduct(id) {
  const p = prodById(id), s = stockOf(p);
  const rows = productHistory(p).sort((a, b) => String(a.d).localeCompare(String(b.d)));
  let bal = 0;
  const body = rows.map(r => { bal = r2(bal + r.q); return `<tr><td class="text-nowrap">${dlab(r.d)}</td><td>${esc(r.t)}</td><td class="text-end ${r.q < 0 ? 'mv-out' : 'mv-in'}">${r.q > 0 ? '+' : ''}${num(r.q)}</td><td class="text-end">${num(bal)}</td></tr>`; }).reverse().join('');
  dialog(esc(p.name), `<div class="row g-2 mb-3">
      <div class="col-4"><div class="stat"><div class="tiny text-secondary">Kalan</div><div class="v">${num(s.kalan)} L</div></div></div>
      <div class="col-4"><div class="stat"><div class="tiny text-secondary">Teslim alınan</div><div class="v">${num(s.out)} L</div></div></div>
      <div class="col-4"><div class="stat"><div class="tiny text-secondary">Teneke ≈</div><div class="v">${pack(p) ? num(r2(s.kalan / setL(p))) : '-'}</div></div></div></div>
    <div class="table-responsive"><table class="table table-sm"><thead><tr><th>Tarih</th><th>İşlem</th><th class="text-end">L</th><th class="text-end">Bakiye</th></tr></thead><tbody>${body}</tbody></table></div>`,
    `<button class="btn btn-dark btn-sm" onclick="closeDialog();openProduct(${p.id})"><i class="bi bi-pencil"></i> Ürünü Düzenle</button>`);
}
function renderProducts() {
  const ps = products.filter(p => inFirm(p.firm_id));
  $('prodList').innerHTML = ps.map(p => `<div class="card p-3 clickable" onclick="openProduct(${p.id})">
    <div class="d-flex justify-content-between gap-2"><div class="min-w-0"><div class="fw-semibold small text-break">${esc(p.name)}</div>
      <div class="tiny text-secondary">${esc(firmById(p.firm_id).name)} • ${esc(p.code || 'kodsuz')} • ${pack(p) ? num(pack(p)) + ' L teneke' : 'teneke L yok'}${hard(p) ? ' + ' + num(hard(p)) + ' L sertleştirici' : ''}</div></div>
      <div class="text-end tiny text-secondary">Başlangıç<br><b class="text-dark">${num(p.opening)} L</b></div></div></div>`).join('') || emptyCard('Ürün yok.');
}
function openProduct(id) {
  const p = id ? prodById(id) : { firm_id: firmSel ? Number(firmSel) : (firms[0] || {}).id };
  if (!firms.length) { go('ayar'); return notify('Önce firma ekleyin.', 'warning'); }
  const v = x => x == null ? '' : x;
  dialog(id ? 'Ürünü düzenle' : 'Yeni ürün', `
    <label class="small-label req">Firma</label><select id="pFirm" class="form-select req-input mb-2">${firmOptions(p.firm_id)}</select>
    <div class="row g-2 mb-2">
      <div class="col-4"><label class="small-label">Kod</label><input id="pCode" class="form-control" value="${esc(v(p.code))}"></div>
      <div class="col-8"><label class="small-label req">Ürün adı</label><input id="pName" class="form-control req-input" value="${esc(v(p.name))}"></div>
      <div class="col-6"><label class="small-label">Teneke (L)</label><input id="pPack" type="number" inputmode="decimal" class="form-control" value="${v(p.pack)}" placeholder="ör. 18"></div>
      <div class="col-6"><label class="small-label">Sertleştirici (L)</label><input id="pHard" type="number" inputmode="decimal" class="form-control" value="${v(p.hard)}" placeholder="yoksa boş"></div>
      <div class="col-6"><label class="small-label">Başlangıç emanet (L)</label><input id="pOpen" type="number" inputmode="decimal" class="form-control" value="${v(p.opening)}" placeholder="0"></div>
      <div class="col-6"><label class="small-label">Uyarı seviyesi (L)</label><input id="pWarn" type="number" inputmode="decimal" class="form-control" value="${Number(p.warn) ? p.warn : ''}" placeholder="0 = uyarı yok"></div>
    </div>
    <div class="tiny text-secondary">Başlangıç emanet: firmada şu an duran toplam litre (boya + sertleştirici). Sonraki eklemeleri Hareketler'den yapın.</div>`,
    `${id ? `<button class="btn btn-outline-danger btn-sm me-auto" onclick="deleteProduct(${id})"><i class="bi bi-trash"></i> Sil</button>` : ''}
     <button class="btn btn-dark btn-sm" onclick="saveProduct(${id || 'null'})"><i class="bi bi-check2"></i> Kaydet</button>`);
}
async function saveProduct(id) {
  const p = { id, firm_id: Number($('pFirm').value), code: $('pCode').value.trim(), name: $('pName').value.trim(),
    pack: pnum($('pPack').value), hard: pnum($('pHard').value), opening: pnum($('pOpen').value) || 0, warn: pnum($('pWarn').value) || 0 };
  if (!p.name) return notify('Ürün adı yazın.', 'warning');
  if (await rpc('et_save_product', { p }) === undefined) return;
  closeDialog(); notify('Ürün kaydedildi.'); await loadData();
}
async function deleteProduct(id) {
  if (!confirm('Ürün silinsin mi? Ekle/düş hareketleri de silinir.')) return;
  if (await rpc('et_delete_product', { p_id: id }) === undefined) return;
  closeDialog(); notify('Ürün silindi.'); await loadData();
}

// ---------- hareketler ----------
function fillMoveProducts() {
  const sel = $('mvProd'), old = sel.value;
  sel.innerHTML = '<option value="">Ürün seçin</option>' + firms.filter(f => inFirm(f.id)).map(f => {
    const ps = products.filter(p => p.firm_id === f.id);
    return ps.length ? `<optgroup label="${esc(f.name)}">${ps.map(p => `<option value="${p.id}">${esc(prodLabel(p))}</option>`).join('')}</optgroup>` : '';
  }).join('');
  if ([...sel.options].some(o => o.value === old)) sel.value = old;
  if (!$('mvDate').value) $('mvDate').value = today();
  mvCalc();
}
function mvCalc() {
  const p = prodById(Number($('mvProd').value)), t = pnum($('mvTnk').value);
  $('mvQty').placeholder = t != null && pack(p) ? num(r2(t * setL(p))) : '';
  const q = pnum($('mvQty').value) ?? (t != null && pack(p) ? r2(t * setL(p)) : null);
  $('mvCalcTxt').innerHTML = p.id ? `<div class="tiny text-secondary">Şu an kalan: ${num(stockOf(p).kalan)} L${q ? ` • İşlemden sonra: <b>${num(r2(stockOf(p).kalan + q * Number(document.querySelector('[name=mvType]:checked').value)))} L</b>` : ''}${hard(p) && t != null ? ' • teneke + sertleştirici seti' : ''}</div>` : '';
}
document.addEventListener('change', e => { if (e.target.name === 'mvType') mvCalc(); });
async function saveMove() {
  const p = prodById(Number($('mvProd').value)), t = pnum($('mvTnk').value);
  if (!p.id) return notify('Ürün seçin.', 'warning');
  const q = pnum($('mvQty').value) ?? (t != null && pack(p) ? r2(t * setL(p)) : null);
  if (!(q > 0)) return notify('Litre veya teneke adedi girin.', 'warning');
  const sign = Number(document.querySelector('[name=mvType]:checked').value);
  const note = $('mvNote').value.trim() || (t != null ? `${num(t)} teneke ` : '') + (sign > 0 ? 'eklendi' : 'düşüldü');
  if (await rpc('et_save_move', { p: { product_id: p.id, move_date: $('mvDate').value || today(), qty: r2(q * sign), note } }) === undefined) return;
  $('mvTnk').value = ''; $('mvQty').value = ''; $('mvNote').value = '';
  notify(`${num(q)} L ${sign > 0 ? 'eklendi' : 'düşüldü'}.`);
  await loadData();
}
async function deleteMove(id) {
  if (!confirm('Bu hareket silinsin mi?')) return;
  if (await rpc('et_delete_move', { p_id: id }) === undefined) return;
  notify('Hareket silindi.'); await loadData();
}
function renderMoves() {
  const typ = $('hFilter').value, m = $('hMonth').value;
  let rows = [];
  products.filter(p => inFirm(p.firm_id)).forEach(p => productHistory(p).forEach(r => rows.push({ ...r, p })));
  rows = rows.filter(r => (!typ || r.k === typ) && (!m || String(r.d).slice(0, 7) === m))
    .sort((a, b) => String(b.d).localeCompare(String(a.d)) || (a.k === 'acilis') - (b.k === 'acilis'));
  const pg = paginate(rows, 'har');
  $('moveBody').innerHTML = pg.items.map(r => `<tr>
    <td class="text-nowrap">${dlab(r.d)}</td>
    <td>${esc(r.p.name)}<div class="tiny text-secondary">${esc(firmById(r.p.firm_id).name)}</div></td>
    <td class="small ${r.shipId ? 'clickable text-primary' : ''}" ${r.shipId ? `onclick="showShipment(${r.shipId})"` : ''}>${esc(r.t)}</td>
    <td class="text-end text-nowrap ${r.q < 0 ? 'mv-out' : 'mv-in'}">${r.q > 0 ? '+' : ''}${num(r.q)}</td>
    <td class="text-end">${r.moveId ? `<button class="btn btn-sm btn-link text-danger p-0" onclick="deleteMove(${r.moveId})" title="Sil"><i class="bi bi-trash"></i></button>` : ''}</td></tr>`).join('')
    || '<tr><td colspan="5" class="text-center text-secondary py-3">Kayıt yok.</td></tr>';
  $('movePager').innerHTML = pg.html;
}

// ---------- rapor ----------
function setRange(k) {
  const d = new Date(), y = d.getFullYear(), mo = d.getMonth();
  const iso = x => { x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
  if (k === 'month') { $('rFrom').value = iso(new Date(y, mo, 1)); $('rTo').value = today(); }
  if (k === 'prev') { $('rFrom').value = iso(new Date(y, mo - 1, 1)); $('rTo').value = iso(new Date(y, mo, 0)); }
  if (k === 'year') { $('rFrom').value = `${y}-01-01`; $('rTo').value = today(); }
  if (k === 'all') { $('rFrom').value = ''; $('rTo').value = ''; }
  renderReport();
}
function reportRows() {
  const from = $('rFrom').value, to = $('rTo').value;
  const ok = d => (!from || String(d) >= from) && (!to || String(d).slice(0, 10) <= to);
  return products.filter(p => inFirm(p.firm_id)).map(p => {
    let boya = 0, sert = 0, n = 0;
    shipments.forEach(s => { if (!ok(s.ship_date)) return; s.items.forEach(i => { if (i.product_id === p.id) { boya += Number(i.boya); sert += Number(i.sert); n++; } }); });
    return { p, boya: r2(boya), sert: r2(sert), tot: r2(boya + sert), n, kalan: stockOf(p).kalan };
  });
}
function renderReport() {
  if (!$('rFrom').value && !$('rTo').value && !renderReport.init) { renderReport.init = 1; return setRange('month'); }
  const rows = reportRows();
  const tot = rows.reduce((a, r) => a + r.tot, 0), from = $('rFrom').value, to = $('rTo').value;
  const nShip = shipments.filter(s => inFirm(s.firm_id) && (!from || s.ship_date >= from) && (!to || String(s.ship_date).slice(0, 10) <= to)).length;
  $('repStats').innerHTML = `<div class="col-6"><div class="stat"><div class="tiny text-secondary">Teslim alınan</div><div class="v">${num(r2(tot))} L</div></div></div>
    <div class="col-6"><div class="stat"><div class="tiny text-secondary">Sevkiyat</div><div class="v">${nShip}</div></div></div>`;
  $('repBody').innerHTML = rows.filter(r => r.tot || r.kalan).map(r => `<tr class="clickable" onclick="showProduct(${r.p.id})">
    <td>${esc(r.p.name)}<div class="tiny text-secondary">${esc(firmById(r.p.firm_id).name)}</div></td>
    <td class="text-end">${num(r.tot)} L${r.sert ? `<div class="tiny text-secondary">${num(r.boya)} + ${num(r.sert)}</div>` : ''}</td>
    <td class="text-end">${pack(r.p) && r.boya ? num(r2(r.boya / pack(r.p))) : '-'}</td>
    <td class="text-end">${num(r.kalan)} L</td></tr>`).join('') || '<tr><td colspan="4" class="text-center text-secondary py-3">Kayıt yok.</td></tr>';
}

// ---------- ekstre (yazdırılabilir / PDF) ----------
function openEkstre() {
  const from = $('rFrom').value, to = $('rTo').value;
  const inRange = d => (!from || String(d).slice(0, 10) >= from) && (!to || String(d).slice(0, 10) <= to);
  const before = d => from && String(d).slice(0, 10) < from;
  const fl = firms.filter(f => inFirm(f.id) && products.some(p => p.firm_id === f.id));
  if (!fl.length) return notify('Ekstre için ürün yok.', 'warning');
  const period = from || to ? `${from ? fmtD(from) : 'Başlangıç'} – ${to ? fmtD(to) : fmtD(today())}` : 'Tüm zamanlar';
  const tL = v => num(r2(v));
  const tk = (p, l) => pack(p) && l ? `<div class="doc-muted">${num(r2(Math.abs(l) / setL(p)))} tnk</div>` : '';
  const shipTnk = s => r2(s.items.reduce((a, i) => { const p = prodById(i.product_id); return a + (i.teneke != null ? Number(i.teneke) : (pack(p) ? Number(i.boya) / pack(p) : 0)); }, 0));
  const sections = fl.map(f => {
    const ps = products.filter(p => p.firm_id === f.id);
    let T = { dev: 0, in: 0, out: 0, kal: 0, tdev: 0, tin: 0, tout: 0, tkal: 0 };
    const sum = [], det = [];
    const ships = shipments.filter(s => s.firm_id === f.id && inRange(s.ship_date));
    ps.forEach(p => {
      const rows = productHistory(p).sort((a, b) => String(a.d).localeCompare(String(b.d)) || (b.k === 'acilis') - (a.k === 'acilis'));
      const dev = r2(rows.filter(r => before(r.d)).reduce((a, r) => a + r.q, 0));
      const per = rows.filter(r => !before(r.d) && inRange(r.d));
      const inn = r2(per.filter(r => r.q > 0).reduce((a, r) => a + r.q, 0));
      const out = r2(-per.filter(r => r.q < 0).reduce((a, r) => a + r.q, 0));
      const kal = r2(dev + inn - out);
      // teslim alınan teneke: sevkiyattaki gerçek teneke adedi (yoksa boya ÷ teneke L)
      const itTnk = i => i.teneke != null ? Number(i.teneke) : (pack(p) ? Number(i.boya) / pack(p) : 0);
      const outT = r2(shipments.filter(x => !before(x.ship_date) && inRange(x.ship_date)).reduce((a, x) => a + x.items.filter(i => i.product_id === p.id).reduce((b2, i) => b2 + itTnk(i), 0), 0));
      T.dev += dev; T.in += inn; T.out += out; T.kal += kal;
      if (pack(p)) { T.tdev += dev / setL(p); T.tin += inn / setL(p); T.tout += outT; T.tkal += kal / setL(p); }
      sum.push(`<tr><td>${esc(p.code ? p.code + ' – ' : '')}${esc(p.name)}</td><td class="n">${tL(dev)}${tk(p, dev)}</td><td class="n doc-pos">${inn ? '+' + tL(inn) + tk(p, inn) : '–'}</td>
        <td class="n doc-neg">${out ? '−' + tL(out) + (pack(p) ? `<div class="doc-muted">${tL(outT)} tnk</div>` : '') : '–'}</td><td class="n"><b>${tL(kal)}</b></td><td class="n"><b>${pack(p) ? tL(kal / setL(p)) : '–'}</b></td></tr>`);
      if (!per.length && !dev) return;
      let bal = dev;
      const lines = per.map(r => {
        bal = r2(bal + r.q);
        const sh = r.shipId && shipments.find(x => x.id === r.shipId);
        const it = sh && sh.items.find(i => i.product_id === p.id);
        const det2 = it ? `${it.teneke != null ? num(it.teneke) + ' tnk • ' : ''}${num(it.boya)} L boya${Number(it.sert) ? ' + ' + num(it.sert) + ' L sert.' : ''}` : '';
        return `<tr><td>${dlab(r.d)}</td><td>${esc(r.t)}${det2 ? `<div class="doc-muted">${det2}</div>` : ''}</td>
          <td class="n doc-pos">${r.q > 0 ? tL(r.q) + tk(p, r.q) : ''}</td><td class="n doc-neg">${r.q < 0 ? tL(-r.q) + (it && pack(p) ? `<div class="doc-muted">${tL(itTnk(it))} tnk</div>` : tk(p, r.q)) : ''}</td><td class="n">${tL(bal)}</td><td class="n">${pack(p) ? tL(bal / setL(p)) : '–'}</td></tr>`;
      }).join('');
      det.push(`<div class="doc-prod"><div style="font-weight:700;margin-bottom:3px">${esc(p.code ? p.code + ' – ' : '')}${esc(p.name)}
        <span class="doc-muted">${pack(p) ? `(${num(pack(p))} L teneke${hard(p) ? ' + ' + num(hard(p)) + ' L sertleştirici' : ''})` : ''}</span></div>
        <table class="doc-t"><thead><tr><th style="width:78px">Tarih</th><th>Açıklama</th><th class="n">Giriş</th><th class="n">Çıkış</th><th class="n">Bakiye (L)</th><th class="n">Bakiye (tnk)</th></tr></thead>
        <tbody>${from ? `<tr><td>${fmtD(from)}</td><td><i>Devreden bakiye</i></td><td></td><td></td><td class="n">${tL(dev)}</td><td class="n">${pack(p) ? tL(dev / setL(p)) : '–'}</td></tr>` : ''}${lines}</tbody>
        <tfoot><tr><td colspan="2">Dönem sonu kalan</td><td class="n">${inn ? tL(inn) + tk(p, inn) : ''}</td><td class="n">${out ? tL(out) + (pack(p) ? `<div class="doc-muted">${tL(outT)} tnk</div>` : '') : ''}</td><td class="n">${tL(kal)}</td><td class="n">${pack(p) ? tL(kal / setL(p)) : '–'}</td></tr></tfoot></table></div>`);
    });
    const shipRows = ships.slice().sort((a, b) => String(a.ship_date).localeCompare(String(b.ship_date))).map(s => `<tr><td>${fmtD(s.ship_date)}</td><td>${esc(s.irsaliye || '-')}</td>
      <td>${s.items.map(i => esc(prodById(i.product_id).name)).join(', ')}</td><td class="n">${tL(shipTnk(s))}</td><td class="n">${tL(shipTotal(s))}</td></tr>`).join('');
    return `<div style="break-before:${f === fl[0] ? 'auto' : 'page'}">
      <div class="d-flex align-items-center gap-2 mt-2 mb-2" style="border-bottom:2px solid #111;padding-bottom:6px">${firmLogo(f, 30)}<div style="font-size:15px;font-weight:700">${esc(f.name)}</div></div>
      <div class="doc-h2">Ürün bazında özet</div>
      <table class="doc-t"><thead><tr><th>Ürün</th><th class="n">Devreden</th><th class="n">Eklenen</th><th class="n">Teslim alınan</th><th class="n">Kalan (L)</th><th class="n">Kalan teneke</th></tr></thead>
        <tbody>${sum.join('')}</tbody>
        <tfoot><tr><td>Toplam</td><td class="n">${tL(T.dev)}<div class="doc-muted">${tL(T.tdev)} tnk</div></td><td class="n">${T.in ? '+' + tL(T.in) + `<div class="doc-muted">${tL(T.tin)} tnk</div>` : '–'}</td><td class="n">${T.out ? '−' + tL(T.out) + `<div class="doc-muted">${tL(T.tout)} tnk</div>` : '–'}</td><td class="n">${tL(T.kal)}</td><td class="n">${tL(T.tkal)}</td></tr></tfoot></table>
      <div class="doc-h2">Dönem sevkiyatları (${ships.length} irsaliye)</div>
      ${ships.length ? `<table class="doc-t"><thead><tr><th style="width:78px">Tarih</th><th>İrsaliye No</th><th>Ürünler</th><th class="n">Teneke</th><th class="n">Toplam (L)</th></tr></thead><tbody>${shipRows}</tbody>
        <tfoot><tr><td colspan="3">Toplam teslim alınan</td><td class="n">${tL(ships.reduce((a, s) => a + shipTnk(s), 0))}</td><td class="n">${tL(ships.reduce((a, s) => a + shipTotal(s), 0))}</td></tr></tfoot></table>` : '<div class="doc-muted">Bu dönemde sevkiyat yok.</div>'}
      <div class="doc-h2">Hareket ekstresi</div>
      ${det.join('') || '<div class="doc-muted">Hareket yok.</div>'}
    </div>`;
  }).join('');
  const html = `<div class="doc-bar">
      <button class="btn btn-light border btn-sm" onclick="closeEkstre()"><i class="bi bi-arrow-left"></i> Kapat</button>
      <button class="btn btn-dark btn-sm" onclick="window.print()"><i class="bi bi-printer"></i> Yazdır / PDF Kaydet</button></div>
    <div class="doc-page">
      <div class="d-flex justify-content-between align-items-start gap-3">
        <img src="../logo-yildiz.webp" alt="Yıldız Kumlama Boya" style="height:46px">
        <div class="text-end"><h1>EMANET STOK EKSTRESİ</h1>
          <div class="doc-muted">Dönem: <b style="color:#111">${period}</b><br>Düzenleme: ${fmtD(today())} ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div></div>
      </div>
      <div class="doc-muted mt-2">Firmalarda emanet olarak bekleyen boya ve sertleştiricilerin dönem içindeki giriş, teslim alma ve kalan durumunu gösterir. Miktarlar litredir; "tnk" teneke adedidir (sertleştiricili ürünlerde teneke + sertleştirici seti).</div>
      ${sections}
      <div class="doc-sign"><div><b>Yıldız Kumlama Boya</b><div class="doc-muted">Ad Soyad / İmza</div></div><div><b>Firma Yetkilisi</b><div class="doc-muted">Ad Soyad / İmza / Kaşe</div></div></div>
    </div>`;
  let v = $('docView');
  if (!v) { v = document.createElement('div'); v.id = 'docView'; document.body.appendChild(v); }
  v.innerHTML = html; v.classList.remove('d-none');
  document.title = `Emanet Ekstresi ${fl.length === 1 ? fl[0].name + ' ' : ''}${today()}`;
  history.pushState({ doc: 1 }, '', '#ekstre');
}
function closeEkstre() {
  const v = $('docView'); if (v) v.classList.add('d-none');
  document.title = 'Yıldız Emanet Takip';
  if (location.hash === '#ekstre') history.back();
}

// ---------- ayarlar ----------
function renderAi() {
  $('aiState').innerHTML = aiOn ? '<span class="text-success"><i class="bi bi-check-circle"></i> Anahtar kayıtlı, irsaliye okuma açık.</span>'
    : '<span class="text-danger"><i class="bi bi-x-circle"></i> Anahtar yok, irsaliye okuma kapalı.</span>';
}
async function saveAiKey() {
  const k = $('aiKey').value.trim();
  if (k && !/^[A-Za-z0-9_.\-]{20,}$/.test(k)) return notify('Anahtar geçersiz görünüyor; tamamını kopyalayıp yapıştırın.', 'warning');
  if (await rpc('et_set_ai_key', { p_key: k }) === undefined) return;
  aiKeyCache = null; $('aiKey').value = '';
  await loadData();
  if (!k) return notify('Anahtar silindi.');
  // Anahtarı Google'a sorarak dene
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=50', { headers: { 'x-goog-api-key': k } });
    const j = await res.json().catch(() => ({}));
    if (res.ok) notify('Anahtar kaydedildi ve Google tarafından doğrulandı.');
    else notify('Anahtar kaydedildi ama Google kabul etmedi: ' + ((j.error && j.error.message) || res.status), 'danger');
  } catch (e) { notify('Anahtar kaydedildi; bağlantı denenemedi.', 'warning'); }
}
function renderFirms() {
  renderAi();
  $('firmList').innerHTML = firms.map(f => `<div class="border rounded-3 p-2">
    <div class="input-group input-group-sm mb-2">
      <span class="input-group-text bg-white">${firmLogo(f, 22)}</span>
      <input class="form-control" id="firm-${f.id}" value="${esc(f.name)}">
      <button class="btn btn-outline-dark" onclick="saveFirm(${f.id})" title="Kaydet"><i class="bi bi-check2"></i></button>
      <button class="btn btn-outline-danger" onclick="deleteFirm(${f.id})" title="Sil"><i class="bi bi-trash"></i></button>
    </div>
    <div class="d-flex gap-2">
      <button class="btn btn-sm btn-light border flex-fill" onclick="pickLogo(${f.id})"><i class="bi bi-image"></i> Logo ${f.logo ? 'değiştir' : 'yükle'}</button>
      ${f.logo ? `<button class="btn btn-sm btn-light border" onclick="setLogo(${f.id}, '')"><i class="bi bi-x-lg"></i> Logoyu kaldır</button>` : ''}
    </div></div>`).join('')
    || '<div class="tiny text-secondary">Henüz firma yok.</div>';
}
function pickLogo(id) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = async () => {
    const file = inp.files && inp.files[0]; if (!file) return;
    try { await setLogo(id, await logoData(file)); } catch (e) { notify(e.message, 'danger'); }
  };
  inp.click();
}
function logoData(file) {   // logoyu en fazla 360x120 piksele küçültür, şeffaflığı korur
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 360 / img.width, 120 / img.height);
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      let d = c.toDataURL('image/webp', 0.9);
      if (!d.startsWith('data:image/webp')) d = c.toDataURL('image/png');
      res(d);
    };
    img.onerror = () => rej(new Error('Logo açılamadı'));
    img.src = URL.createObjectURL(file);
  });
}
async function setLogo(id, data) {
  if (await rpc('et_save_firm_logo', { p_id: id, p_data: data }) === undefined) return;
  notify(data ? 'Logo kaydedildi.' : 'Logo kaldırıldı.'); await loadData();
}
async function saveFirm(id) {
  const name = (id ? $('firm-' + id) : $('newFirm')).value.trim();
  if (!name) return notify('Firma adı yazın.', 'warning');
  if (await rpc('et_save_firm', { p_id: id, p_name: name }) === undefined) return;
  if (!id) $('newFirm').value = '';
  notify('Firma kaydedildi.'); await loadData();
}
async function deleteFirm(id) {
  if (!confirm('Firma silinsin mi?')) return;
  if (await rpc('et_delete_firm', { p_id: id }) === undefined) return;
  notify('Firma silindi.'); await loadData();
}
async function changePass() {
  const a = $('newPass').value, b = $('newPass2').value;
  if (a.length < 4) return notify('Yeni şifre en az 4 karakter olmalı.', 'warning');
  if (a !== b) return notify('Şifreler aynı değil.', 'warning');
  if (await rpc('et_set_pass', { p_new: a }) === undefined) return;
  pass = a; lsSet(PASS_KEY, a); $('newPass').value = $('newPass2').value = '';
  notify('Şifre değiştirildi.');
}

// ---------- pencere ----------
let dlgObj = null;
function dialog(title, body, foot) {
  $('dlgTitle').innerHTML = title; $('dlgBody').innerHTML = body; $('dlgFoot').innerHTML = foot || '';
  $('dlgFoot').classList.toggle('d-none', !foot);
  dlgObj = dlgObj || new bootstrap.Modal($('dlg'));
  dlgObj.show();
}
function closeDialog() { if (dlgObj) dlgObj.hide(); }

// ---------- Excel ----------
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
function exportExcel(onlyReport) {
  const sheets = [];
  if (onlyReport) {
    const rows = [['Firma', 'Ürün Kodu', 'Ürün', 'Teslim Alınan Boya (L)', 'Sertleştirici (L)', 'Toplam (L)', 'Teneke', 'Kalan (L)']];
    reportRows().forEach(r => rows.push([firmById(r.p.firm_id).name, r.p.code, r.p.name, r.boya, r.sert, r.tot, pack(r.p) ? r2(r.boya / pack(r.p)) : '', r.kalan]));
    sheets.push({ name: 'Rapor', rows, widths: [18, 12, 36, 14, 14, 12, 10, 12] });
  } else {
    const st = [['Firma', 'Ürün Kodu', 'Ürün', 'Kalan (L)', 'Teneke ≈', 'Teneke L', 'Sertleştirici L', 'Başlangıç (L)', 'Teslim Alınan (L)', 'Eklenen/Düşülen (L)', 'Uyarı (L)']];
    products.forEach(p => { const s = stockOf(p); st.push([firmById(p.firm_id).name, p.code, p.name, s.kalan, pack(p) ? r2(s.kalan / setL(p)) : '', pack(p) || '', hard(p) || '', Number(p.opening), s.out, s.add, Number(p.warn) || '']); });
    sheets.push({ name: 'Kalanlar', rows: st, widths: [18, 12, 36, 12, 10, 10, 13, 13, 15, 17, 10] });
    const sv = [['Tarih', 'Firma', 'İrsaliye No', 'Ürün Kodu', 'Ürün', 'Teneke', 'Boya (L)', 'Sertleştirici (L)', 'Toplam (L)', 'Not']];
    shipments.forEach(s => s.items.forEach(i => { const p = prodById(i.product_id); sv.push([fmtD(s.ship_date), firmById(s.firm_id).name, s.irsaliye, p.code, p.name, i.teneke ?? '', Number(i.boya), Number(i.sert), r2(Number(i.boya) + Number(i.sert)), s.note]); }));
    sheets.push({ name: 'Sevkiyatlar', rows: sv, widths: [11, 18, 13, 11, 34, 9, 10, 14, 11, 24] });
    const mv = [['Tarih', 'Firma', 'Ürün Kodu', 'Ürün', 'Miktar (L)', 'Açıklama']];
    moves.forEach(m => { const p = prodById(m.product_id); mv.push([fmtD(m.move_date), firmById(p.firm_id).name, p.code, p.name, Number(m.qty), m.note]); });
    sheets.push({ name: 'Ekle-Düş Hareketleri', rows: mv, widths: [11, 18, 11, 34, 11, 30] });
  }
  const blob = xlsxBuild(sheets);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `Emanet Takip ${onlyReport ? 'Rapor ' : ''}${today()}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  window._lastXlsx = blob;
  notify('Excel dosyası indirildi.');
}

// ---------- başlangıç ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
document.addEventListener('visibilitychange', () => { if (!document.hidden && pass) loadData(); });
(function start() {
  const saved = lsGet(PASS_KEY);
  if (saved) login(saved); else $('loginPass').focus();
})();
