const statusEmoji = { kutilmoqda:'⏳', jarayonda:'🔄', bajarildi:'✅', rad_etildi:'❌' };
const statusUz    = { kutilmoqda:'Kutilmoqda', jarayonda:'Jarayonda', bajarildi:'Bajarildi', rad_etildi:'Rad etildi' };
const turEmoji    = { vozvrat:'♻', kafe:'☕', ovqatlanish:'🍽', spisaniya:'🗑' };
const turBg       = { vozvrat:'#EFF6FF', kafe:'#FFFBEB', ovqatlanish:'#F0FDF4', spisaniya:'#FFF1F2' };

let modalYozuvId = null;
let PANEL_PATH   = 'panel';
let joriyBolim   = 'dashboard';

// ── Init ───────────────────────────────────────────────────────────
(async () => {
  const [meRes, filialRes, pathRes] = await Promise.all([
    fetch('/api/me').then(r => r.json()).catch(() => ({ ism: 'Admin' })),
    fetch('/api/filialar').then(r => r.json()).catch(() => []),
    fetch('/api/panel-path').then(r => r.json()).catch(() => ({ path: 'panel' }))
  ]);

  PANEL_PATH = pathRes.path || 'panel';
  document.getElementById('admin-ism').textContent = meRes.ism || 'Admin';

  // Populate custom filial dropdowns
  ['d','k','o','s'].forEach(pref => {
    const dropdown = document.getElementById(`${pref}-filial-dropdown`);
    if (!dropdown) return;
    filialRes.forEach(f => {
      const div = document.createElement('div');
      div.className = 'filtr-select-opt';
      div.dataset.val = f;
      div.textContent = f;
      div.onclick = () => filtrSelectPick(`${pref}-filial-wrap`, f);
      dropdown.appendChild(div);
    });
  });

  // Close dropdowns on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.filtr-select-wrap')) {
      document.querySelectorAll('.filtr-select-wrap.open').forEach(w => w.classList.remove('open'));
    }
  });

  bolimOch('dashboard');
})();

// ── Navigation ─────────────────────────────────────────────────────
const BOLIM_NOMLAR = {
  dashboard:   'Dashboard',
  vozvrat:     '♻ Qayta ishlash',
  kafe:        '☕ Kafe',
  ovqatlanish: '🍽 Ovqatlanish',
  spisaniya:   '🗑 Spisaniya',
  sozlamalar:  '⚙ Sozlamalar',
};

function bolimOch(bolim) {
  joriyBolim = bolim;
  document.querySelectorAll('.bolim').forEach(el => el.classList.add('gizli'));
  document.getElementById('bolim-' + bolim)?.classList.remove('gizli');
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('faol', el.dataset.bolim === bolim)
  );
  document.getElementById('mob-bolim-nom').textContent = BOLIM_NOMLAR[bolim] || bolim;
  document.getElementById('sidebar')?.classList.remove('ochiq');
  document.getElementById('sidebar-overlay')?.classList.remove('faol');
  if (bolim === 'sozlamalar') sozlamalarYukla();
  else yuklash();
}

function sidebarToggle() {
  document.getElementById('sidebar')?.classList.toggle('ochiq');
  document.getElementById('sidebar-overlay')?.classList.toggle('faol');
}

// ── Filters ────────────────────────────────────────────────────────
const BOLIM_PREF = { dashboard:'d', vozvrat:'v', kafe:'k', ovqatlanish:'o', spisaniya:'s' };

function filtrSelectToggle(wrapId) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  const wasOpen = wrap.classList.contains('open');
  document.querySelectorAll('.filtr-select-wrap.open').forEach(w => w.classList.remove('open'));
  if (!wasOpen) wrap.classList.add('open');
}

function filtrSelectPick(wrapId, val) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  const pref = wrapId.split('-')[0]; // e.g. "d" from "d-filial-wrap"
  // Update hidden input
  const hidden = document.getElementById(`${pref}-filial`);
  if (hidden) hidden.value = val;
  // Update button label
  const valEl = document.getElementById(`${pref}-filial-val`);
  if (valEl) valEl.textContent = val || 'Barcha filiallar';
  // Update active option
  wrap.querySelectorAll('.filtr-select-opt').forEach(opt => {
    opt.classList.toggle('filtr-opt-active', opt.dataset.val === val);
  });
  wrap.classList.remove('open');
  filtrClearUpdate();
  yuklash();
}

function filtrClearUpdate() {
  const p = BOLIM_PREF[joriyBolim] || 'd';
  const filial = document.getElementById(`${p}-filial`)?.value;
  const dan    = document.getElementById(`${p}-sana-dan`)?.value;
  const gacha  = document.getElementById(`${p}-sana-gacha`)?.value;
  const clearBtn = document.getElementById(`${p}-clear`);
  if (clearBtn) clearBtn.style.display = (filial || dan || gacha) ? '' : 'none';
}

function filtrParams() {
  const p   = BOLIM_PREF[joriyBolim] || 'd';
  const par = new URLSearchParams();
  if (joriyBolim !== 'dashboard') par.set('tur', joriyBolim);
  const filial = document.getElementById(`${p}-filial`)?.value;
  const dan    = document.getElementById(`${p}-sana-dan`)?.value;
  const gacha  = document.getElementById(`${p}-sana-gacha`)?.value;
  if (filial) par.set('filial',     filial);
  if (dan)    par.set('sana_dan',   dan);
  if (gacha)  par.set('sana_gacha', gacha);
  return par;
}

function filtrTozala() {
  const p = BOLIM_PREF[joriyBolim] || 'd';
  // Reset date inputs
  ['sana-dan','sana-gacha'].forEach(id => {
    const el = document.getElementById(`${p}-${id}`);
    if (el) el.value = '';
  });
  // Reset filial custom select
  filtrSelectPick(`${p}-filial-wrap`, '');
}

// Called from date inputs onchange
function filtrSanaOzgardi() {
  filtrClearUpdate();
  yuklash();
}

// ── Data loading ───────────────────────────────────────────────────
async function yuklash() {
  const par     = filtrParams();
  const statPar = new URLSearchParams();
  if (par.get('filial'))     statPar.set('filial',     par.get('filial'));
  if (par.get('sana_dan'))   statPar.set('sana_dan',   par.get('sana_dan'));
  if (par.get('sana_gacha')) statPar.set('sana_gacha', par.get('sana_gacha'));

  const [yozuvlar, stat, dashboard] = await Promise.all([
    fetch('/api/yozuvlar?' + par).then(r => r.json()).catch(() => []),
    joriyBolim === 'dashboard'
      ? fetch('/api/statistika?' + statPar).then(r => r.json()).catch(() => ({}))
      : Promise.resolve(null),
    joriyBolim === 'dashboard'
      ? fetch('/api/dashboard?' + statPar).then(r => r.json()).catch(() => null)
      : Promise.resolve(null)
  ]);

  _yozuvlarCache = yozuvlar;
  if (joriyBolim === 'dashboard') {
    statistikaKor(stat);
    kesimKor(dashboard);
  }
  jadvalKor(yozuvlar);
  kartalarKor(yozuvlar);
}

// ── Kategoriya / Filial kesimi ─────────────────────────────────────
function kesimKor(d) {
  const fmt = n => Number(n ?? 0).toLocaleString('uz-UZ');

  const qator = (nom, r) => `
    <tr>
      <td><b>${escHtml(nom)}</b></td>
      <td class="td-num">${r.soni}</td>
      <td class="td-num">${fmt(r.spisaniya_summa)}</td>
      <td class="td-num">${fmt(r.vozvrat_summa)}</td>
      <td class="td-num">${fmt(r.kafe_summa)}</td>
      <td class="td-num">${fmt(r.ovqatlanish_summa)}</td>
      <td class="td-num"><b>${fmt(r.summa)}</b></td>
    </tr>`;

  const katBody = document.getElementById('kat-tbody');
  const filBody = document.getElementById('fil-tbody');
  const kats = d?.kategoriyalar || [];
  const fils = d?.filiallar || [];

  document.getElementById('kat-count').textContent = kats.length ? kats.length + ' ta' : '';
  document.getElementById('fil-count').textContent = fils.length ? fils.length + ' ta' : '';

  if (katBody) katBody.innerHTML = kats.length
    ? kats.map(r => qator(r.kategoriya, r)).join('')
    : `<tr><td colspan="7" class="bosh-jadval">Ma'lumot yo'q</td></tr>`;
  if (filBody) filBody.innerHTML = fils.length
    ? fils.map(r => qator(r.filial, r)).join('')
    : `<tr><td colspan="7" class="bosh-jadval">Ma'lumot yo'q</td></tr>`;
}

// ── Statistics ─────────────────────────────────────────────────────
function statistikaKor(s) {
  if (!s) return;
  const fmt = n => Number(n ?? 0).toLocaleString('uz-UZ');

  const cards = [
    { label:'Qayta ishlash', soni: s.vozvrat_soni,   summa: s.vozvrat_summa,     icon:'♻', cls:'icon-blue'   },
    { label:'Kafe',        soni: s.kafe_soni,         summa: s.kafe_summa,         icon:'☕', cls:'icon-amber'  },
    { label:'Ovqatlanish', soni: s.ovqatlanish_soni,  summa: s.ovqatlanish_summa,  icon:'🍽', cls:'icon-green'  },
    { label:'Spisaniya',   soni: s.spisaniya_soni,    summa: s.spisaniya_summa,    icon:'🗑', cls:'icon-red'    },
  ];

  let html = cards.map(c => `
    <div class="stat-karta">
      <div class="stat-karta-top">
        <span class="stat-karta-label">${c.label}</span>
        <div class="stat-karta-icon ${c.cls}">${c.icon}</div>
      </div>
      <div class="stat-raqam">${c.soni ?? 0}</div>
      <div class="stat-summa"><b>${fmt(c.summa)}</b> so'm</div>
    </div>
  `).join('');

  if ((s.kutilayotgan_vozvratlar ?? 0) > 0) {
    html += `
      <div class="stat-karta" style="grid-column:1/-1">
        <div class="stat-karta-top">
          <span class="stat-karta-label">Kutilayotgan qayta ishlash</span>
          <div class="stat-karta-icon icon-orange">⏳</div>
        </div>
        <div class="stat-raqam">${s.kutilayotgan_vozvratlar}</div>
        ${(s.muddati_ogoh ?? 0) > 0
          ? `<div class="stat-summa" style="color:#C2410C">⚠ ${s.muddati_ogoh} ta kechikkan</div>`
          : ''}
      </div>`;
  }

  document.getElementById('stat-grid').innerHTML = html;
}

// ── Table rendering ────────────────────────────────────────────────
const PREF_ID = { dashboard:'d', vozvrat:'v', kafe:'k', ovqatlanish:'o', spisaniya:'s' };

function jadvalKor(yozuvlar) {
  const p     = PREF_ID[joriyBolim];
  const tbody = document.getElementById(`${p}-tbody`);
  const countEl = document.getElementById(`${p}-count`);
  if (!tbody) return;

  if (countEl) countEl.textContent = yozuvlar.length ? yozuvlar.length + ' ta' : '';

  if (!yozuvlar.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="bosh-jadval">Yozuvlar topilmadi</td></tr>`;
    return;
  }

  tbody.innerHTML = yozuvlar.map(y => {
    const vaqt    = new Date(y.vaqt).toLocaleDateString('uz-UZ', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
    const rasmHtml = y.rasm_file_id
      ? `<button class="rasm-thumb-btn" onclick="rasmOch('${y.rasm_file_id}')">
           <img src="/api/rasm-preview/${y.rasm_file_id}" class="rasm-thumb" loading="lazy" onerror="this.closest('button').innerHTML='📷'">
         </button>`
      : `<div style="width:36px;height:36px;border-radius:8px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--text3)">—</div>`;

    const tovarCell = `
      <div class="td-tovar">
        <div class="td-tovar-icon" style="background:${turBg[y.tur]||'#F4F5F7'}">${turEmoji[y.tur]||'📦'}</div>
        <div>
          <div class="td-tovar-nom">${escHtml(y.tovar)}</div>
          <div class="td-tovar-sub">${escHtml(y.filial)}</div>
        </div>
      </div>`;

    const tahrirBtn = `<button class="status-btn" onclick="tahrirOch(${y.id})">✏ Tahrir</button>`;

    if (joriyBolim === 'dashboard') {
      const tur2 = { spisaniya:'Spisaniya', vozvrat:'Qayta ishlash', kafe:'Kafe', ovqatlanish:'Ovqat' };
      const statusHtml = y.tur === 'vozvrat'
        ? `<span class="holat holat-${y.vozvrat_status||'kutilmoqda'}">${statusUz[y.vozvrat_status||'kutilmoqda']}</span>`
        : `<span class="holat holat-yangi">${tur2[y.tur]||y.tur}</span>`;
      const vozvratBtn = y.tur === 'vozvrat'
        ? `<button class="status-btn" onclick="modalOch(${y.id},'${y.vozvrat_status||'kutilmoqda'}','${escHtml(y.tovar)}')">Holat</button>`
        : '';
      return `<tr>
        <td class="td-img">${rasmHtml}</td>
        <td class="td-id">${y.id}</td>
        <td class="td-time">${vaqt}</td>
        <td><span style="font-size:14px">${turEmoji[y.tur]||''}</span></td>
        <td>${tovarCell}</td>
        <td class="td-num">${y.miqdor} <span style="color:var(--text3);font-size:11px">${y.birlik}</span></td>
        <td class="td-num">${Number(y.summa).toLocaleString('uz-UZ')} <span style="color:var(--text3);font-size:11px">so'm</span></td>
        <td class="td-muted">${escHtml(y.xodim_ism)}</td>
        <td>${statusHtml}</td>
        <td style="white-space:nowrap">${vozvratBtn} ${tahrirBtn}</td>
      </tr>`;
    }

    // kafe, ovqatlanish, spisaniya
    return `<tr>
      <td class="td-img">${rasmHtml}</td>
      <td class="td-id">${y.id}</td>
      <td class="td-time">${vaqt}</td>
      <td>${tovarCell}</td>
      <td class="td-muted">${escHtml(y.sabab||'—')}</td>
      <td class="td-num">${y.miqdor} <span style="color:var(--text3);font-size:11px">${y.birlik}</span></td>
      <td class="td-num">${Number(y.summa).toLocaleString('uz-UZ')} <span style="color:var(--text3);font-size:11px">so'm</span></td>
      <td class="td-muted">${escHtml(y.xodim_ism)}</td>
      <td>${tahrirBtn}</td>
    </tr>`;
  }).join('');
}

// ── Mobile cards ───────────────────────────────────────────────────
function kartalarKor(yozuvlar) {
  const p    = PREF_ID[joriyBolim];
  const wrap = document.getElementById(`${p}-kartalar`);
  if (!wrap) return;

  if (!yozuvlar.length) {
    wrap.innerHTML = '<div class="bosh-karta">Yozuvlar topilmadi</div>';
    return;
  }

  wrap.innerHTML = yozuvlar.map(y => {
    const vaqt     = new Date(y.vaqt).toLocaleString('uz-UZ');
    const rasmHtml = y.rasm_file_id
      ? `<button class="karta-rasm-btn" onclick="rasmOch('${y.rasm_file_id}')">
           <img src="/api/rasm-preview/${y.rasm_file_id}" class="karta-rasm" loading="lazy" onerror="this.style.display='none'">
         </button>` : '';
    const statusHtml = y.tur === 'vozvrat'
      ? `<span class="holat holat-${y.vozvrat_status||'kutilmoqda'}">${statusUz[y.vozvrat_status||'kutilmoqda']}</span>` : '';
    const vozvratBtn = y.tur === 'vozvrat'
      ? `<button class="status-btn" onclick="modalOch(${y.id},'${y.vozvrat_status||'kutilmoqda'}','${escHtml(y.tovar)}')">Holat</button>` : '';

    return `<div class="yozuv-karta">
      ${rasmHtml}
      <div class="karta-kontent">
        <span class="karta-id">#${y.id} · ${vaqt}</span>
        <div class="karta-tovar">${escHtml(y.tovar)}</div>
        <div class="karta-qator">
          <span>${y.miqdor} ${y.birlik}</span>
          <span class="karta-summa">${Number(y.summa).toLocaleString('uz-UZ')} so'm</span>
        </div>
        <div class="karta-qator">
          <span style="color:var(--text3)">📍 ${escHtml(y.filial)}</span>
          <span style="color:var(--text3)">👤 ${escHtml(y.xodim_ism)}</span>
        </div>
        <div class="karta-footer">
          ${statusHtml}${vozvratBtn}
          <button class="status-btn" onclick="tahrirOch(${y.id})">✏ Tahrir</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── Helpers ────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function rasmOch(fileId) {
  document.getElementById('rasm-modal-img').src = `/api/rasm-preview/${fileId}`;
  document.getElementById('rasm-modal-overlay').classList.add('faol');
}
function rasmModalYop() {
  document.getElementById('rasm-modal-overlay').classList.remove('faol');
}

// ── Status modal ───────────────────────────────────────────────────
function modalOch(id, joriyStatus, tovarNom) {
  modalYozuvId = id;
  document.getElementById('modal-sarlavha').textContent = tovarNom;
  document.getElementById('modal-firma-javob').value    = '';
  document.getElementById('modal-xato').textContent     = '';
  document.querySelectorAll('.status-tanlov-btn').forEach(btn =>
    btn.classList.toggle('faol', btn.dataset.status === joriyStatus)
  );
  document.getElementById('modal-overlay').classList.add('faol');
}
function statusTanla(btn) {
  document.querySelectorAll('.status-tanlov-btn').forEach(b => b.classList.remove('faol'));
  btn.classList.add('faol');
}
function modalYop(e) {
  if (e.target === document.getElementById('modal-overlay')) modalYoptugma();
}
function modalYoptugma() {
  document.getElementById('modal-overlay').classList.remove('faol');
  modalYozuvId = null;
}
async function statusSaqlash() {
  const btn = document.querySelector('.status-tanlov-btn.faol');
  if (!btn) { document.getElementById('modal-xato').textContent = 'Holatni tanlang'; return; }
  const saqlashBtn = document.getElementById('modal-saqlash-btn');
  saqlashBtn.disabled = true;
  saqlashBtn.textContent = 'Saqlanmoqda...';
  document.getElementById('modal-xato').textContent = '';
  try {
    const res = await fetch(`/api/vozvrat/${modalYozuvId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: btn.dataset.status,
        firma_javob: document.getElementById('modal-firma-javob').value.trim() || null
      })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.xato);
    modalYoptugma();
    yuklash();
  } catch (err) {
    document.getElementById('modal-xato').textContent = err.message;
  } finally {
    saqlashBtn.disabled = false;
    saqlashBtn.textContent = 'Saqlash';
  }
}

// ── Yozuv tahrirlash ───────────────────────────────────────────────
let tahrirYozuvId = null;
let _yozuvlarCache = [];

// jadvalKor chaqirilganda cache yangilansin
const _asliJadvalKor = jadvalKor;

async function tahrirOch(id) {
  // Cached yozuvlardan qidirish
  let y = _yozuvlarCache.find(r => r.id === id);
  if (!y) {
    // Agar cache da yo'q bo'lsa — serverdan olish
    try {
      const rows = await fetch(`/api/yozuvlar?id=${id}`).then(r => r.json());
      y = Array.isArray(rows) ? rows.find(r => r.id === id) : null;
    } catch {}
  }
  if (!y) return;

  tahrirYozuvId = id;
  document.getElementById('tahrir-id').textContent = `#${id}`;
  document.getElementById('tahrir-tovar').value  = y.tovar || '';
  document.getElementById('tahrir-miqdor').value = y.miqdor || '';
  document.getElementById('tahrir-birlik').value = y.birlik || 'dona';
  document.getElementById('tahrir-summa').value  = y.summa || '';
  document.getElementById('tahrir-sabab').value  = y.sabab || '';
  document.getElementById('tahrir-firma').value  = y.firma || '';
  document.getElementById('tahrir-xato').textContent = '';

  // Filial select to'ldirish
  const filialSel = document.getElementById('tahrir-filial');
  if (filialSel.options.length <= 1) {
    const filialar = await fetch('/api/filialar').then(r => r.json()).catch(() => []);
    filialSel.innerHTML = filialar.map(f =>
      `<option value="${escHtml(f)}" ${f === y.filial ? 'selected' : ''}>${escHtml(f)}</option>`
    ).join('');
  } else {
    filialSel.value = y.filial;
  }

  // Tur tugmalar
  document.querySelectorAll('.tahrir-tur-btn').forEach(btn =>
    btn.classList.toggle('faol', btn.dataset.tur === y.tur)
  );

  // Firma field faqat vozvrat uchun
  document.getElementById('tahrir-firma-wrap').style.display = y.tur === 'vozvrat' ? '' : 'none';

  document.getElementById('tahrir-modal-overlay').classList.add('faol');
}

function tahrirTurTanla(btn) {
  document.querySelectorAll('.tahrir-tur-btn').forEach(b => b.classList.remove('faol'));
  btn.classList.add('faol');
  document.getElementById('tahrir-firma-wrap').style.display =
    btn.dataset.tur === 'vozvrat' ? '' : 'none';
}

async function tahrirSaqla() {
  const btn   = document.getElementById('tahrir-saqlash-btn');
  const xatoEl = document.getElementById('tahrir-xato');
  const turBtn = document.querySelector('.tahrir-tur-btn.faol');

  xatoEl.textContent = '';
  if (!turBtn) { xatoEl.textContent = 'Turni tanlang'; return; }
  const tovar = document.getElementById('tahrir-tovar').value.trim();
  if (!tovar) { xatoEl.textContent = 'Tovar nomini kiriting'; return; }

  btn.disabled = true; btn.textContent = '...';
  try {
    const res = await fetch(`/api/yozuv/${tahrirYozuvId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tur:    turBtn.dataset.tur,
        tovar,
        miqdor: document.getElementById('tahrir-miqdor').value,
        birlik: document.getElementById('tahrir-birlik').value,
        summa:  document.getElementById('tahrir-summa').value.replace(/\s/g,''),
        sabab:  document.getElementById('tahrir-sabab').value.trim(),
        filial: document.getElementById('tahrir-filial').value,
        firma:  document.getElementById('tahrir-firma').value.trim(),
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.xato);
    tahrirModalYoptugma();
    yuklash();
  } catch (err) {
    xatoEl.textContent = err.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Saqlash';
  }
}

async function yozuvOchir() {
  if (!confirm(`#${tahrirYozuvId} yozuvni o'chirishni tasdiqlaysizmi?`)) return;
  try {
    const res  = await fetch(`/api/yozuv/${tahrirYozuvId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.xato);
    tahrirModalYoptugma();
    yuklash();
  } catch (err) {
    document.getElementById('tahrir-xato').textContent = err.message;
  }
}

function tahrirModalYop(e) {
  if (e.target === document.getElementById('tahrir-modal-overlay')) tahrirModalYoptugma();
}
function tahrirModalYoptugma() {
  document.getElementById('tahrir-modal-overlay').classList.remove('faol');
  tahrirYozuvId = null;
}

// ── Export & Logout ────────────────────────────────────────────────
function eksport() {
  window.location.href = '/api/eksport?' + filtrParams();
}
function chiqish() {
  fetch(`/${PANEL_PATH}/logout`, { method: 'POST' }).then(() => {
    window.location.href = `/${PANEL_PATH}/login`;
  });
}

// ── Sozlamalar ─────────────────────────────────────────────────────
let filialModalId = null; // null = yangi, number = tahrirlash

async function sozlamalarYukla() {
  await Promise.all([filiallarYukla(), kategoriyalarYukla(), guruhSozlamaYukla()]);
}

// ── Filiallar ──
async function filiallarYukla() {
  const list = document.getElementById('filiallar-list');
  if (!list) return;
  try {
    const rows = await fetch('/api/sozlamalar/filialar').then(r => r.json());
    if (!rows.length) {
      list.innerHTML = '<div class="soz-bosh">Hali filial qo\'shilmagan</div>';
      return;
    }
    list.innerHTML = rows.map(f => `
      <div class="filial-qator" id="filial-row-${f.id}">
        <div class="filial-qator-left">
          <div class="filial-aktiv-dot ${f.aktiv ? 'dot-yashil' : 'dot-kulrang'}"></div>
          <div>
            <div class="filial-nom">${escHtml(f.nomi)}</div>
            <div class="filial-topic">${f.topic_id ? `Topic: <b>#${f.topic_id}</b>` : '<span style="color:var(--text3)">Topic yo\'q</span>'}</div>
          </div>
        </div>
        <div class="filial-qator-right">
          <button class="btn btn-default btn-sm" onclick="filialTahrir(${f.id},'${escHtml(f.nomi)}',${f.topic_id||'null'})">Tahrirlash</button>
          <button class="btn btn-default btn-sm" onclick="filialAktivToggle(${f.id},${!f.aktiv})" style="${f.aktiv ? 'color:var(--red)' : 'color:var(--green)'}">
            ${f.aktiv ? 'O\'chirish' : 'Yoqish'}
          </button>
        </div>
      </div>
    `).join('');
  } catch {
    list.innerHTML = '<div class="soz-bosh" style="color:var(--red)">Yuklab bo\'lmadi</div>';
  }
}

function filialQosh() {
  filialModalId = null;
  document.getElementById('filial-modal-sarlavha').textContent = 'Filial qo\'shish';
  document.getElementById('filial-nomi').value  = '';
  document.getElementById('filial-topic').value = '';
  document.getElementById('filial-modal-xato').textContent = '';
  document.getElementById('filial-modal-btn').textContent = 'Qo\'shish';
  document.getElementById('filial-modal-overlay').classList.add('faol');
}

function filialTahrir(id, nomi, topicId) {
  filialModalId = id;
  document.getElementById('filial-modal-sarlavha').textContent = 'Filial tahrirlash';
  document.getElementById('filial-nomi').value  = nomi;
  document.getElementById('filial-topic').value = topicId || '';
  document.getElementById('filial-modal-xato').textContent = '';
  document.getElementById('filial-modal-btn').textContent = 'Saqlash';
  document.getElementById('filial-modal-overlay').classList.add('faol');
}

async function filialModalSaqla() {
  const nomi    = document.getElementById('filial-nomi').value.trim();
  const topicRaw = document.getElementById('filial-topic').value.trim();
  const topic_id = topicRaw ? Number(topicRaw) : null;
  const xatoEl  = document.getElementById('filial-modal-xato');
  const btn     = document.getElementById('filial-modal-btn');

  if (!nomi) { xatoEl.textContent = 'Filial nomi kerak'; return; }
  if (topicRaw && isNaN(topic_id)) { xatoEl.textContent = 'Topic ID faqat raqam bo\'lishi kerak'; return; }

  btn.disabled = true; btn.textContent = '...';
  xatoEl.textContent = '';
  try {
    const url    = filialModalId ? `/api/sozlamalar/filialar/${filialModalId}` : '/api/sozlamalar/filialar';
    const method = filialModalId ? 'PATCH' : 'POST';
    const res    = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nomi, topic_id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.xato);
    filialModalYoptugma();
    filiallarYukla();
  } catch (err) {
    xatoEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = filialModalId ? 'Saqlash' : 'Qo\'shish';
  }
}

async function filialAktivToggle(id, aktiv) {
  try {
    await fetch(`/api/sozlamalar/filialar/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aktiv })
    });
    filiallarYukla();
  } catch {}
}

function filialModalYop(e) {
  if (e.target === document.getElementById('filial-modal-overlay')) filialModalYoptugma();
}
function filialModalYoptugma() {
  document.getElementById('filial-modal-overlay').classList.remove('faol');
  filialModalId = null;
}

// ── Kategoriyalar ──
let kategoriyaModalId = null; // null = yangi, number = tahrirlash

async function kategoriyalarYukla() {
  const list = document.getElementById('kategoriyalar-list');
  if (!list) return;
  try {
    const rows = await fetch('/api/sozlamalar/kategoriyalar').then(r => r.json());
    if (!rows.length) {
      list.innerHTML = '<div class="soz-bosh">Hali kategoriya yo\'q. Yangi yozuv qo\'shilganda AI avtomatik yaratadi yoki qo\'lda qo\'shing.</div>';
      return;
    }
    list.innerHTML = rows.map(k => `
      <div class="filial-qator" id="kat-row-${k.id}">
        <div class="filial-qator-left">
          <div class="filial-aktiv-dot dot-yashil"></div>
          <div>
            <div class="filial-nom">${escHtml(k.nomi)}</div>
            <div class="filial-topic">${Number(k.soni) > 0 ? `<b>${k.soni}</b> ta yozuvda` : '<span style="color:var(--text3)">Ishlatilmagan</span>'}</div>
          </div>
        </div>
        <div class="filial-qator-right">
          <button class="btn btn-default btn-sm" onclick="kategoriyaTahrir(${k.id},'${escHtml(k.nomi).replace(/'/g, "\\'")}')">Tahrirlash</button>
          <button class="btn btn-default btn-sm" onclick="kategoriyaOchir(${k.id},'${escHtml(k.nomi).replace(/'/g, "\\'")}',${k.soni})" style="color:var(--red)">O'chirish</button>
        </div>
      </div>
    `).join('');
  } catch {
    list.innerHTML = '<div class="soz-bosh" style="color:var(--red)">Yuklab bo\'lmadi</div>';
  }
}

function kategoriyaQosh() {
  kategoriyaModalId = null;
  document.getElementById('kategoriya-modal-sarlavha').textContent = 'Kategoriya qo\'shish';
  document.getElementById('kategoriya-nomi').value = '';
  document.getElementById('kategoriya-modal-xato').textContent = '';
  document.getElementById('kategoriya-modal-btn').textContent = 'Qo\'shish';
  document.getElementById('kategoriya-modal-overlay').classList.add('faol');
}

function kategoriyaTahrir(id, nomi) {
  kategoriyaModalId = id;
  document.getElementById('kategoriya-modal-sarlavha').textContent = 'Kategoriya tahrirlash';
  document.getElementById('kategoriya-nomi').value = nomi;
  document.getElementById('kategoriya-modal-xato').textContent = '';
  document.getElementById('kategoriya-modal-btn').textContent = 'Saqlash';
  document.getElementById('kategoriya-modal-overlay').classList.add('faol');
}

async function kategoriyaModalSaqla() {
  const nomi   = document.getElementById('kategoriya-nomi').value.trim();
  const xatoEl = document.getElementById('kategoriya-modal-xato');
  const btn    = document.getElementById('kategoriya-modal-btn');
  if (!nomi) { xatoEl.textContent = 'Kategoriya nomi kerak'; return; }

  btn.disabled = true; btn.textContent = '...';
  xatoEl.textContent = '';
  try {
    const url    = kategoriyaModalId ? `/api/sozlamalar/kategoriyalar/${kategoriyaModalId}` : '/api/sozlamalar/kategoriyalar';
    const method = kategoriyaModalId ? 'PATCH' : 'POST';
    const res    = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nomi })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.xato);
    kategoriyaModalYoptugma();
    kategoriyalarYukla();
  } catch (err) {
    xatoEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = kategoriyaModalId ? 'Saqlash' : 'Qo\'shish';
  }
}

async function kategoriyaOchir(id, nomi, soni) {
  const ogoh = Number(soni) > 0
    ? `"${nomi}" o'chirilsinmi?\n${soni} ta yozuvda kategoriya bo'sh qoladi (yozuvlar o'chmaydi).`
    : `"${nomi}" o'chirilsinmi?`;
  if (!confirm(ogoh)) return;
  try {
    const res  = await fetch(`/api/sozlamalar/kategoriyalar/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.xato);
    kategoriyalarYukla();
  } catch (err) {
    alert(err.message);
  }
}

function kategoriyaModalYop(e) {
  if (e.target === document.getElementById('kategoriya-modal-overlay')) kategoriyaModalYoptugma();
}
function kategoriyaModalYoptugma() {
  document.getElementById('kategoriya-modal-overlay').classList.remove('faol');
  kategoriyaModalId = null;
}

async function kategoriyaBackfill() {
  const btn = document.getElementById('kat-backfill-btn');
  const okEl = document.getElementById('kat-backfill-natija');
  okEl.textContent = '';
  if (!confirm('Kategoriyasi yo\'q yozuvlarni AI bilan to\'ldirish boshlansinmi?\nBu bir necha soniya/daqiqa olishi mumkin.')) return;
  btn.disabled = true; btn.textContent = '⏳ To\'ldirilmoqda...';
  try {
    const res  = await fetch('/api/kategoriya/backfill', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 200 })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.xato || 'Xatolik');
    okEl.textContent = `✓ ${data.kategoriyalandi} ta yozuv kategoriyalandi`;
    kategoriyalarYukla();
    setTimeout(() => okEl.textContent = '', 6000);
  } catch (err) {
    okEl.style.color = 'var(--red)';
    okEl.textContent = err.message;
    setTimeout(() => { okEl.textContent = ''; okEl.style.color = ''; }, 6000);
  } finally {
    btn.disabled = false; btn.textContent = '✨ AI to\'ldirish';
  }
}

// ── Guruh sozlama ──
async function guruhSozlamaYukla() {
  try {
    const data = await fetch('/api/sozlamalar/guruh').then(r => r.json());
    const el = document.getElementById('guruh-chat-id');
    if (el) el.value = data.chat_id || '';
  } catch {}
}

async function guruhSaqla() {
  const chatId = document.getElementById('guruh-chat-id').value.trim();
  const xatoEl = document.getElementById('guruh-xato');
  const okEl   = document.getElementById('guruh-ok');
  xatoEl.textContent = ''; okEl.textContent = '';
  if (!chatId) { xatoEl.textContent = 'Chat ID kerak'; return; }
  try {
    const res  = await fetch('/api/sozlamalar/guruh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.xato);
    okEl.textContent = '✓ Saqlandi';
    setTimeout(() => okEl.textContent = '', 3000);
  } catch (err) {
    xatoEl.textContent = err.message;
  }
}

// ── Parol ──
async function parolSaqla() {
  const joriy  = document.getElementById('parol-joriy').value;
  const yangi  = document.getElementById('parol-yangi').value;
  const tasdiq = document.getElementById('parol-tasdiq').value;
  const xatoEl = document.getElementById('parol-xato');
  const okEl   = document.getElementById('parol-ok');
  xatoEl.textContent = ''; okEl.textContent = '';

  if (!joriy || !yangi) { xatoEl.textContent = 'Barcha maydonlarni to\'ldiring'; return; }
  if (yangi !== tasdiq) { xatoEl.textContent = 'Yangi parollar mos kelmadi'; return; }
  if (yangi.length < 6) { xatoEl.textContent = 'Parol kamida 6 ta belgi bo\'lishi kerak'; return; }

  try {
    const res  = await fetch('/api/sozlamalar/parol', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ joriy, yangi })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.xato);
    okEl.textContent = '✓ Parol yangilandi';
    ['parol-joriy','parol-yangi','parol-tasdiq'].forEach(id => document.getElementById(id).value = '');
    setTimeout(() => okEl.textContent = '', 4000);
  } catch (err) {
    xatoEl.textContent = err.message;
  }
}

// Auto-refresh every 60s
setInterval(yuklash, 60000);
