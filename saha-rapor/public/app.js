/* =====================================================
   SAHA RAPOR – app.js  (tek sayfa uygulama, bağımlılıksız)
====================================================== */
(() => {
  'use strict';

  /* ---------------- Yardımcılar ---------------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const STATUS = { taslak: 'Taslak', gonderildi: 'Gönderildi', incelendi: 'İncelendi', onaylandi: 'Onaylandı', revizyon: 'Revizyon İstendi' };
  const TYPES = {
    section: 'Bölüm başlığı', text: 'Kısa metin', textarea: 'Uzun metin', number: 'Sayı', date: 'Tarih', time: 'Saat',
    select: 'Seçim listesi', checkbox: 'Onay kutusu', checklist: 'Çoklu seçim', signature: 'İmza',
  };
  const ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>',
    inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v7H2v-7z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>',
    tpl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><circle cx="17" cy="9" r="3"/><path d="M22 20a5 5 0 0 0-6-5"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  };

  const state = { user: null, pending: 0, sse: null, lastListParams: {} };

  function fmtDate(s, withTime = true) {
    if (!s) return '';
    const d = new Date(String(s).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return s;
    const p = (n) => String(n).padStart(2, '0');
    const base = `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
    return withTime && /\d{2}:\d{2}/.test(s) ? `${base} ${p(d.getHours())}:${p(d.getMinutes())}` : base;
  }
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const fmtSize = (b) => (b > 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');

  async function api(method, path, body) {
    const opt = { method, headers: {} };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const res = await fetch(path, opt);
    let data = {};
    try { data = await res.json(); } catch { /* boş */ }
    if (res.status === 401 && !path.endsWith('/login') && !path.endsWith('/me')) { state.user = null; location.hash = '#/giris'; }
    if (!res.ok) throw new Error(data.error || `Hata (${res.status})`);
    return data;
  }

  /* ---------------- Bildirim / Modal ---------------- */
  function toast(msg, type = '', ms = 3500) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = msg;
    el.onclick = () => el.remove();
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), ms);
    return el;
  }

  function modal(html, { onClose } = {}) {
    const root = $('#modal-root');
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal">${html}</div>`;
    const close = () => { bg.remove(); onClose && onClose(); };
    bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
    root.appendChild(bg);
    return { el: $('.modal', bg), close };
  }

  function confirmDlg(msg, { okText = 'Evet', danger = false } = {}) {
    return new Promise((resolve) => {
      const m = modal(`<h3>Onay</h3><p>${esc(msg)}</p><div class="actions"><button class="btn ghost" data-no>Vazgeç</button><button class="btn ${danger ? 'danger' : ''}" data-ok>${esc(okText)}</button></div>`);
      $('[data-no]', m.el).onclick = () => { m.close(); resolve(false); };
      $('[data-ok]', m.el).onclick = () => { m.close(); resolve(true); };
    });
  }

  function promptDlg(title, { label = '', value = '', multiline = false, okText = 'Tamam' } = {}) {
    return new Promise((resolve) => {
      const m = modal(`<h3>${esc(title)}</h3><div class="field">${label ? `<label>${esc(label)}</label>` : ''}${multiline ? `<textarea data-v>${esc(value)}</textarea>` : `<input type="text" data-v value="${esc(value)}">`}</div><div class="actions"><button class="btn ghost" data-no>Vazgeç</button><button class="btn" data-ok>${esc(okText)}</button></div>`);
      const inp = $('[data-v]', m.el); inp.focus();
      $('[data-no]', m.el).onclick = () => { m.close(); resolve(null); };
      $('[data-ok]', m.el).onclick = () => { m.close(); resolve(inp.value); };
      if (!multiline) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { m.close(); resolve(inp.value); } });
    });
  }

  function lightbox(items, index = 0) {
    let i = index;
    const el = document.createElement('div');
    el.className = 'lightbox';
    const draw = () => {
      const it = items[i];
      el.innerHTML = `
        <button class="x" aria-label="Kapat">✕</button>
        ${items.length > 1 ? '<button class="navb l">‹</button><button class="navb r">›</button>' : ''}
        ${it.kind === 'video' ? `<video src="${esc(it.url)}" controls autoplay playsinline></video>` : it.kind === 'foto' ? `<img src="${esc(it.url)}" alt="">` : `<a class="btn accent" href="${esc(it.url)}" target="_blank">${esc(it.filename)} dosyasını aç</a>`}
        <div class="cap">${esc(it.caption || it.filename)} <span class="muted">(${i + 1}/${items.length})</span></div>`;
      $('.x', el).onclick = () => el.remove();
      const l = $('.navb.l', el), r = $('.navb.r', el);
      if (l) l.onclick = () => { i = (i - 1 + items.length) % items.length; draw(); };
      if (r) r.onclick = () => { i = (i + 1) % items.length; draw(); };
    };
    draw();
    el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
    const key = (e) => { if (e.key === 'Escape') { el.remove(); document.removeEventListener('keydown', key); } };
    document.addEventListener('keydown', key);
    document.body.appendChild(el);
  }

  /* ---------------- Canlı olaylar ---------------- */
  function connectEvents() {
    if (state.sse) { state.sse.close(); state.sse = null; }
    if (!state.user) return;
    const es = new EventSource('/api/events');
    state.sse = es;
    es.addEventListener('report.submitted', (e) => {
      const d = JSON.parse(e.data);
      state.pending += 1;
      updateBadge();
      const t = toast(`<b>Yeni rapor geldi</b>${esc(d.technician_name)} · ${esc(d.title)}${d.customer ? ' · ' + esc(d.customer) : ''}`, 'info', 8000);
      t.onclick = () => { t.remove(); location.hash = `#/rapor/${d.id}`; };
      notify('Yeni rapor geldi', `${d.technician_name}: ${d.title}`, `#/rapor/${d.id}`);
      if (route().page === 'home') render();
    });
    es.addEventListener('report.reviewed', (e) => {
      const d = JSON.parse(e.data);
      const label = STATUS[d.status] || d.status;
      const t = toast(`<b>Raporunuz ${esc(label.toLowerCase())}</b>${esc(d.title)}${d.note ? ' · ' + esc(d.note) : ''}`, d.status === 'revizyon' ? 'err' : 'ok', 8000);
      t.onclick = () => { t.remove(); location.hash = `#/rapor/${d.id}`; };
      notify(`Rapor ${label.toLowerCase()}`, d.title, `#/rapor/${d.id}`);
      const r = route();
      if (r.page === 'home' || (r.page === 'rapor' && Number(r.id) === d.id)) render();
    });
  }

  function notify(title, body, hash) {
    if (!('Notification' in window) || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
    try { const n = new Notification(title, { body, icon: 'icon.svg' }); n.onclick = () => { window.focus(); location.hash = hash; }; } catch { /* yok say */ }
  }

  function updateBadge() {
    const b = $('#nav-badge');
    if (!b) return;
    b.textContent = state.pending;
    b.classList.toggle('hidden', !state.pending);
    document.title = (state.pending ? `(${state.pending}) ` : '') + 'Saha Rapor';
  }

  async function refreshPending() {
    if (!state.user) return;
    try {
      const { stats } = await api('GET', '/api/stats');
      state.pending = state.user.role === 'mudur' ? stats.gonderildi : stats.revizyon;
      updateBadge();
    } catch { /* yok say */ }
  }

  /* ---------------- Yönlendirme ---------------- */
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const parts = h.split('/').filter(Boolean);
    const [a, b, c] = parts;
    if (!a) return { page: 'home' };
    if (a === 'giris') return { page: 'giris' };
    if (a === 'yeni') return { page: 'yeni' };
    if (a === 'rapor' && b) return { page: c === 'duzenle' ? 'duzenle' : 'rapor', id: b };
    if (a === 'sablonlar') return { page: b ? 'sablon' : 'sablonlar', id: b === 'yeni' ? null : b, copy: c === 'kopya' };
    if (a === 'kullanicilar') return { page: 'kullanicilar' };
    if (a === 'ayarlar') return { page: 'ayarlar' };
    return { page: 'home' };
  }

  function shell(content, active) {
    const u = state.user;
    const isM = u.role === 'mudur';
    const nav = [
      { h: '#/', k: 'home', t: isM ? 'Gelen Raporlar' : 'Raporlarım', i: isM ? ICONS.inbox : ICONS.home, badge: true },
      { h: '#/yeni', k: 'yeni', t: 'Yeni Rapor', i: ICONS.plus },
      { h: '#/sablonlar', k: 'sablonlar', t: 'Şablonlar', i: ICONS.tpl },
      ...(isM ? [{ h: '#/kullanicilar', k: 'kullanicilar', t: 'Ekip', i: ICONS.users }] : []),
      { h: '#/ayarlar', k: 'ayarlar', t: 'Ayarlar', i: ICONS.gear },
    ];
    $('#app').innerHTML = `
      <header class="topbar">
        <a class="brand" href="#/"><img src="icon.svg" alt="">Saha Rapor</a>
        <div class="spacer"></div>
        <div class="user"><b>${esc(u.name)}</b><span>${isM ? 'Müdür' : 'Teknisyen'}</span></div>
        <button class="icon-btn" id="logout" title="Çıkış">Çıkış</button>
      </header>
      <nav class="nav">${nav.map((n) => `<a href="${n.h}" class="${active === n.k ? 'active' : ''}">${n.i}<span>${n.t}</span>${n.badge ? `<span class="badge ${state.pending ? '' : 'hidden'}" id="nav-badge">${state.pending}</span>` : ''}</a>`).join('')}</nav>
      <main class="main">${content}</main>`;
    $('#logout').onclick = async () => { await api('POST', '/api/logout'); state.user = null; if (state.sse) state.sse.close(); location.hash = '#/giris'; };
  }

  async function render() {
    const r = route();
    if (!state.user) { renderLogin(); return; }
    if (r.page === 'giris') { location.hash = '#/'; return; }
    try {
      switch (r.page) {
        case 'home': await viewHome(); break;
        case 'yeni': await viewNew(); break;
        case 'duzenle': await viewEditor(r.id); break;
        case 'rapor': await viewReport(r.id); break;
        case 'sablonlar': await viewTemplates(); break;
        case 'sablon': await viewTemplateEditor(r.id, r.copy); break;
        case 'kullanicilar': await viewUsers(); break;
        case 'ayarlar': await viewSettings(); break;
        default: await viewHome();
      }
    } catch (e) {
      shell(`<div class="empty"><div class="big">⚠️</div><p>${esc(e.message)}</p><a class="btn mt" href="#/">Ana sayfa</a></div>`, '');
    }
  }

  /* ---------------- Giriş ---------------- */
  function renderLogin() {
    $('#app').innerHTML = `
      <div class="login"><form class="box" id="login-form">
        <div class="logo"><img src="icon.svg" alt=""><div><b>Saha Rapor</b><span>Elektrik işleri için rapor sistemi</span></div></div>
        <div class="error hidden" id="login-err"></div>
        <div class="field"><label>Kullanıcı adı</label><input type="text" name="username" autocomplete="username" autocapitalize="none" required autofocus></div>
        <div class="field"><label>Şifre</label><input type="password" name="password" autocomplete="current-password" required></div>
        <button class="btn accent block" type="submit">Giriş Yap</button>
        <p class="hint">İlk kurulum hesapları: <b>mudur / 1234</b>, <b>ahmet / 1234</b>. Giriş yaptıktan sonra Ayarlar'dan şifreyi değiştirin.</p>
      </form></div>`;
    $('#login-form').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const err = $('#login-err');
      err.classList.add('hidden');
      try {
        const { user } = await api('POST', '/api/login', { username: f.username.value, password: f.password.value });
        state.user = user;
        await afterLogin();
        location.hash = '#/';
        render();
      } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); }
    };
  }

  async function afterLogin() {
    await refreshPending();
    connectEvents();
    if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch { /* yok say */ } }
  }

  /* ---------------- Ana sayfa / Gelen kutusu ---------------- */
  function reportItem(r) {
    const isM = state.user.role === 'mudur';
    const icon = r.status === 'onaylandi' ? '✅' : r.status === 'revizyon' ? '↩️' : r.status === 'taslak' ? '📝' : r.status === 'incelendi' ? '👁️' : '📨';
    return `<a class="item ${isM && r.status === 'gonderildi' ? 'new' : ''}" href="#/rapor/${r.id}${r.status === 'taslak' ? '/duzenle' : ''}">
      <div class="ic">${icon}</div>
      <div class="body">
        <div class="title"><span>${esc(r.title)}</span><span class="chip ${r.status}">${STATUS[r.status]}</span></div>
        <div class="meta">
          ${isM ? `<span>👷 ${esc(r.technician_name)}</span>` : ''}
          ${r.customer ? `<span>🏢 ${esc(r.customer)}</span>` : ''}
          <span>📅 ${fmtDate(r.job_date, false)}</span>
          ${r.attachment_count ? `<span>📎 ${r.attachment_count}</span>` : ''}
          <span class="muted">${esc(r.template_name)}</span>
        </div>
      </div></a>`;
  }

  async function viewHome() {
    const isM = state.user.role === 'mudur';
    const p = state.lastListParams;
    const tabsM = [['gonderildi', 'Yeni'], ['incelendi', 'İncelenen'], ['revizyon', 'Revizyonda'], ['onaylandi', 'Onaylanan'], ['', 'Tümü']];
    const tabsT = [['', 'Tümü'], ['taslak', 'Taslak'], ['gonderildi,incelendi', 'Gönderilen'], ['revizyon', 'Revizyon'], ['onaylandi', 'Onaylanan']];
    const tabs = isM ? tabsM : tabsT;
    if (p.status === undefined) p.status = isM ? 'gonderildi' : '';
    const [{ reports }, { stats, today, week, topTech }] = await Promise.all([
      api('GET', `/api/reports?status=${encodeURIComponent(p.status)}&q=${encodeURIComponent(p.q || '')}`),
      api('GET', '/api/stats'),
    ]);
    state.pending = isM ? stats.gonderildi : stats.revizyon;

    const statsHtml = isM
      ? `<div class="stats">
          <div class="stat blue"><div class="v">${stats.gonderildi}</div><div class="l">İncelenmeyi bekleyen</div></div>
          <div class="stat amber"><div class="v">${today}</div><div class="l">Bugün gelen</div></div>
          <div class="stat"><div class="v">${week}</div><div class="l">Son 7 gün</div></div>
          <div class="stat green"><div class="v">${stats.onaylandi}</div><div class="l">Onaylanan (toplam)</div></div>
        </div>`
      : `<div class="stats">
          <div class="stat"><div class="v">${stats.taslak}</div><div class="l">Taslak</div></div>
          <div class="stat blue"><div class="v">${stats.gonderildi + stats.incelendi}</div><div class="l">Müdürde</div></div>
          <div class="stat red"><div class="v">${stats.revizyon}</div><div class="l">Revizyon istendi</div></div>
          <div class="stat green"><div class="v">${stats.onaylandi}</div><div class="l">Onaylandı</div></div>
        </div>`;

    shell(`
      <div class="page-head"><h1>${isM ? 'Gelen Raporlar' : 'Raporlarım'}</h1><a class="btn accent sm" href="#/yeni">＋ Yeni Rapor</a></div>
      ${statsHtml}
      <div class="search">${ICONS.search}<input type="search" id="q" placeholder="Başlık, müşteri, adres${isM ? ', teknisyen' : ''} ara…" value="${esc(p.q || '')}"></div>
      <div class="tabs">${tabs.map(([v, t]) => `<button class="${p.status === v ? 'active' : ''}" data-s="${v}">${t}${v === 'gonderildi' && isM ? `<span class="n">${stats.gonderildi}</span>` : ''}</button>`).join('')}</div>
      <div class="list" id="list">${reports.length ? reports.map(reportItem).join('') : `<div class="empty"><div class="big">📭</div>${isM ? 'Bu kategoride rapor yok.' : 'Henüz rapor yok. Sağ üstten yeni rapor oluşturun.'}</div>`}</div>
      ${isM && topTech.length ? `<div class="section-title">Son 30 gün · teknisyen bazında</div><div class="card"><table class="tbl">${topTech.map((t) => `<tr><td>${esc(t.name)}</td><td style="text-align:right"><b>${t.c}</b> rapor</td></tr>`).join('')}</table></div>` : ''}
    `, 'home');
    updateBadge();
    $$('.tabs button').forEach((b) => { b.onclick = () => { p.status = b.dataset.s; render(); }; });
    let t;
    $('#q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { p.q = e.target.value; render().then(() => { const i = $('#q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 350); };
  }

  /* ---------------- Yeni rapor: şablon seçimi ---------------- */
  async function viewNew() {
    const { templates } = await api('GET', '/api/templates');
    const cats = [...new Set(templates.map((t) => t.category || 'Diğer'))];
    shell(`
      <div class="page-head"><h1>Yeni Rapor</h1></div>
      <p class="muted mb">Bir şablon seçin. Rapor içinde alanları değiştirebilir, isterseniz sıfırdan da yazabilirsiniz.</p>
      ${cats.map((c) => `<div class="section-title">${esc(c)}</div><div class="tpl-grid">${templates.filter((t) => (t.category || 'Diğer') === c).map((t) => `
        <div class="tpl">
          <div class="t"><span>${esc(t.name)}</span>${t.owner_id ? '<span class="chip neutral">Kişisel</span>' : ''}</div>
          <div class="d">${esc(t.description)}</div>
          <div class="small muted">${t.fields.filter((f) => f.type !== 'section').length} alan</div>
          <div class="actions"><button class="btn sm accent" data-use="${t.id}">Bu şablonla başla</button></div>
        </div>`).join('')}</div>`).join('')}
      <div class="section-title">Sıfırdan</div>
      <div class="tpl"><div class="t">Boş rapor</div><div class="d">Hiç alan olmadan başlayın; alanları kendiniz ekleyin ya da sadece not ve fotoğraf kullanın.</div><div class="actions"><button class="btn sm ghost" data-use="">Boş başla</button></div></div>
    `, 'yeni');
    $$('[data-use]').forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        try {
          const body = b.dataset.use ? { template_id: Number(b.dataset.use) } : { title: 'Yeni Rapor', fields: [{ key: 'icerik', label: 'Rapor İçeriği', type: 'textarea', required: true }] };
          const { report } = await api('POST', '/api/reports', body);
          location.hash = `#/rapor/${report.id}/duzenle`;
        } catch (e) { toast(e.message, 'err'); b.disabled = false; }
      };
    });
  }

  /* ---------------- Form alanları ---------------- */
  function renderField(f, value) {
    const req = f.required ? '<span class="req">*</span>' : '';
    const help = f.help ? `<div class="help">${esc(f.help)}</div>` : '';
    const name = `f_${f.key}`;
    const v = value ?? '';
    switch (f.type) {
      case 'section': return `<div class="form-section">${esc(f.label)}</div>`;
      case 'textarea': return `<div class="field" data-key="${f.key}"><label>${esc(f.label)}${req}</label><textarea name="${name}" placeholder="${esc(f.placeholder)}">${esc(v)}</textarea>${help}</div>`;
      case 'number': return `<div class="field" data-key="${f.key}"><label>${esc(f.label)}${req}</label><input type="number" inputmode="decimal" step="any" name="${name}" value="${esc(v)}" placeholder="${esc(f.placeholder)}">${help}</div>`;
      case 'date': return `<div class="field" data-key="${f.key}"><label>${esc(f.label)}${req}</label><input type="date" name="${name}" value="${esc(v)}">${help}</div>`;
      case 'time': return `<div class="field" data-key="${f.key}"><label>${esc(f.label)}${req}</label><input type="time" name="${name}" value="${esc(v)}">${help}</div>`;
      case 'select': return `<div class="field" data-key="${f.key}"><label>${esc(f.label)}${req}</label><select name="${name}"><option value="">Seçiniz…</option>${(f.options || []).map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>${help}</div>`;
      case 'checkbox': return `<div class="field" data-key="${f.key}"><label class="check"><input type="checkbox" name="${name}" ${v ? 'checked' : ''}><span>${esc(f.label)}${req}</span></label>${help}</div>`;
      case 'checklist': {
        const arr = Array.isArray(v) ? v : [];
        return `<div class="field" data-key="${f.key}"><div class="label">${esc(f.label)}${req}</div>${(f.options || []).map((o) => `<label class="check"><input type="checkbox" name="${name}" value="${esc(o)}" ${arr.includes(o) ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}${help}</div>`;
      }
      case 'signature': return `<div class="field" data-key="${f.key}" data-sig><label>${esc(f.label)}${req}</label>
          ${v ? `<img class="sig-preview" src="${esc(v)}" alt="İmza"><div class="row mt"><button type="button" class="btn sm ghost" data-sig-clear>İmzayı sil</button></div>` : `<canvas class="sig-pad"></canvas><div class="row mt"><button type="button" class="btn sm ghost" data-sig-reset>Temizle</button><span class="small muted">Parmakla veya fareyle imzalayın</span></div>`}
          <input type="hidden" name="${name}" value="${esc(v)}">${help}</div>`;
      default: return `<div class="field" data-key="${f.key}"><label>${esc(f.label)}${req}</label><input type="text" name="${name}" value="${esc(v)}" placeholder="${esc(f.placeholder)}">${help}</div>`;
    }
  }

  function collectData(container, fields) {
    const data = {};
    for (const f of fields) {
      if (f.type === 'section') continue;
      const name = `f_${f.key}`;
      if (f.type === 'checkbox') data[f.key] = !!$(`[name="${name}"]`, container)?.checked;
      else if (f.type === 'checklist') data[f.key] = $$(`[name="${name}"]:checked`, container).map((i) => i.value);
      else data[f.key] = $(`[name="${name}"]`, container)?.value ?? '';
    }
    return data;
  }

  function initSignaturePads(container, onChange) {
    $$('[data-sig]', container).forEach((wrap) => {
      const hidden = $('input[type=hidden]', wrap);
      const clearBtn = $('[data-sig-clear]', wrap);
      if (clearBtn) { clearBtn.onclick = () => { hidden.value = ''; onChange(); }; return; }
      const canvas = $('canvas', wrap);
      const ctx = canvas.getContext('2d');
      const resize = () => {
        const ratio = window.devicePixelRatio || 1;
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h) return;
        const prev = canvas.width ? canvas.toDataURL() : null;
        canvas.width = w * ratio; canvas.height = h * ratio;
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
        if (prev) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, w, h); img.src = prev; }
      };
      resize();
      let drawing = false, dirty = false;
      const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      canvas.addEventListener('pointerdown', (e) => { drawing = true; canvas.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); });
      canvas.addEventListener('pointermove', (e) => { if (!drawing) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); dirty = true; });
      const end = () => { if (!drawing) return; drawing = false; if (dirty) { hidden.value = canvas.toDataURL('image/png'); onChange(); } };
      canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('pointerleave', end);
      $('[data-sig-reset]', wrap).onclick = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); hidden.value = ''; dirty = false; onChange(); };
    });
  }

  /* ---------------- Alan düzenleyici (şablon kurucu) ---------------- */
  function fieldBuilder(container, initial) {
    let fields = JSON.parse(JSON.stringify(initial || []));
    const slug = (s) => s.toLowerCase().replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
    const uniqueKey = (base, idx) => {
      let k = base || `alan_${idx + 1}`;
      let n = 2;
      while (fields.some((f, i) => i !== idx && f.key === k)) k = `${base}_${n++}`;
      return k;
    };
    function draw() {
      container.innerHTML = `<div class="fb-list">${fields.map((f, i) => `
        <div class="fb-item ${f.type === 'section' ? 'section' : ''}" data-i="${i}">
          <div class="fb-head">
            <span class="drag">${f.type === 'section' ? '§' : '≡'}</span>
            <input type="text" data-k="label" value="${esc(f.label)}" placeholder="${f.type === 'section' ? 'Bölüm başlığı' : 'Alan adı'}">
            <select data-k="type">${Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
            <button type="button" class="mini" data-act="up" ${i === 0 ? 'disabled' : ''} title="Yukarı">↑</button>
            <button type="button" class="mini" data-act="down" ${i === fields.length - 1 ? 'disabled' : ''} title="Aşağı">↓</button>
            <button type="button" class="mini" data-act="del" title="Sil">🗑</button>
          </div>
          ${f.type === 'section' ? '' : `<div class="fb-more">
            <label class="req"><input type="checkbox" data-k="required" ${f.required ? 'checked' : ''}> Zorunlu</label>
            ${['text', 'textarea', 'number'].includes(f.type) ? `<input type="text" data-k="placeholder" value="${esc(f.placeholder || '')}" placeholder="İpucu metni (opsiyonel)" style="flex:1;min-width:160px">` : ''}
            ${['select', 'checklist'].includes(f.type) ? `<textarea data-k="options" placeholder="Seçenekler – her satıra bir tane">${esc((f.options || []).join('\n'))}</textarea>` : ''}
          </div>`}
        </div>`).join('')}</div>
        <div class="fb-add">
          <button type="button" class="btn sm ghost" data-add="text">＋ Metin</button>
          <button type="button" class="btn sm ghost" data-add="textarea">＋ Uzun metin</button>
          <button type="button" class="btn sm ghost" data-add="number">＋ Sayı</button>
          <button type="button" class="btn sm ghost" data-add="select">＋ Seçim</button>
          <button type="button" class="btn sm ghost" data-add="checklist">＋ Çoklu seçim</button>
          <button type="button" class="btn sm ghost" data-add="checkbox">＋ Onay kutusu</button>
          <button type="button" class="btn sm ghost" data-add="date">＋ Tarih</button>
          <button type="button" class="btn sm ghost" data-add="signature">＋ İmza</button>
          <button type="button" class="btn sm ghost" data-add="section">＋ Bölüm başlığı</button>
        </div>`;
      $$('[data-add]', container).forEach((b) => { b.onclick = () => { const type = b.dataset.add; fields.push({ key: uniqueKey(type + '_' + (fields.length + 1), fields.length), label: type === 'section' ? 'Yeni Bölüm' : 'Yeni alan', type, required: false, placeholder: '', options: type === 'select' || type === 'checklist' ? ['Seçenek 1', 'Seçenek 2'] : undefined }); draw(); $$('.fb-item input[data-k=label]', container).at(-1)?.focus(); }; });
      $$('.fb-item', container).forEach((item) => {
        const i = Number(item.dataset.i);
        $$('[data-act]', item).forEach((b) => {
          b.onclick = () => {
            const a = b.dataset.act;
            if (a === 'del') fields.splice(i, 1);
            if (a === 'up' && i > 0) [fields[i - 1], fields[i]] = [fields[i], fields[i - 1]];
            if (a === 'down' && i < fields.length - 1) [fields[i + 1], fields[i]] = [fields[i], fields[i + 1]];
            draw();
          };
        });
        $$('[data-k]', item).forEach((inp) => {
          const k = inp.dataset.k;
          const handler = () => {
            const f = fields[i];
            if (k === 'required') f.required = inp.checked;
            else if (k === 'options') f.options = inp.value.split('\n').map((s) => s.trim()).filter(Boolean);
            else if (k === 'type') { f.type = inp.value; if ((f.type === 'select' || f.type === 'checklist') && !f.options) f.options = ['Seçenek 1', 'Seçenek 2']; draw(); }
            else if (k === 'label') { f.label = inp.value; if (!f._keyLocked) f.key = uniqueKey(slug(inp.value), i); }
            else f[k] = inp.value;
          };
          inp.addEventListener(k === 'type' ? 'change' : 'input', handler);
        });
      });
    }
    draw();
    return { get: () => fields.map(({ _keyLocked, ...f }) => f), set: (f) => { fields = JSON.parse(JSON.stringify(f)); draw(); } };
  }

  /* ---------------- Rapor düzenleyici ---------------- */
  async function viewEditor(id) {
    let { report } = await api('GET', `/api/reports/${id}`);
    const editable = report.technician_id === state.user.id && (report.status === 'taslak' || report.status === 'revizyon');
    if (!editable) { location.hash = `#/rapor/${id}`; return; }

    const draw = () => {
      shell(`
        <div class="page-head"><a class="btn ghost sm" href="#/">‹ Geri</a><h1>${report.status === 'revizyon' ? 'Raporu Düzelt' : 'Rapor Yaz'}</h1><span class="chip ${report.status}">${STATUS[report.status]}</span></div>
        ${report.status === 'revizyon' && report.manager_note ? `<div class="card report-view mb"><div class="note-box rev"><b>Müdür revizyon istedi${report.reviewer_name ? ' (' + esc(report.reviewer_name) + ')' : ''}:</b><br>${esc(report.manager_note)}</div></div>` : ''}
        <form id="rf" autocomplete="off">
          <div class="card">
            <div class="row between mb"><h3>Rapor Bilgileri</h3><span class="small muted" id="save-state">${esc(report.template_name)}</span></div>
            <div class="field"><label>Rapor Başlığı <span class="req">*</span></label><input type="text" name="title" value="${esc(report.title)}" required></div>
            <div class="grid-2">
              <div class="field"><label>Müşteri / Firma</label><input type="text" name="customer" value="${esc(report.customer)}" placeholder="Müşteri adı"></div>
              <div class="field"><label>İş Tarihi</label><input type="date" name="job_date" value="${esc(report.job_date || todayISO())}"></div>
            </div>
            <div class="field"><label>Adres / Lokasyon</label><input type="text" name="address" value="${esc(report.address)}" placeholder="İşin yapıldığı adres"></div>
          </div>
          <div class="card mt">
            <div class="row between mb"><h3>Rapor Alanları</h3><button type="button" class="btn sm ghost" id="edit-fields">✎ Alanları düzenle</button></div>
            <div id="fields-area">${report.fields.length ? report.fields.map((f) => renderField(f, report.data[f.key])).join('') : '<p class="muted">Bu raporda alan yok. "Alanları düzenle" ile ekleyin ya da aşağıdaki notları kullanın.</p>'}</div>
          </div>
          <div class="card mt">
            <h3>Fotoğraf & Video</h3>
            <div class="upload-zone" id="uz">
              <div>Çalışma öncesi / sonrası fotoğraf ve video ekleyin</div>
              <div class="btns">
                <label class="btn sm accent">📷 Fotoğraf çek<input type="file" accept="image/*" capture="environment" hidden data-up></label>
                <label class="btn sm accent">🎥 Video çek<input type="file" accept="video/*" capture="environment" hidden data-up></label>
                <label class="btn sm ghost">🖼 Galeriden seç<input type="file" accept="image/*,video/*,.pdf" multiple hidden data-up></label>
              </div>
              <div class="progress hidden" id="prog"><div></div></div>
              <div class="small muted mt" id="prog-txt"></div>
            </div>
            <div class="att-grid" id="atts"></div>
          </div>
          <div class="card mt">
            <h3>Ek Notlar</h3>
            <div class="field"><textarea name="notes" placeholder="Müdüre iletmek istediğiniz ek notlar…">${esc(report.notes)}</textarea></div>
          </div>
          <div class="row mt" style="justify-content:flex-end">
            <button type="button" class="btn danger ghost sm" id="del">Taslağı sil</button>
            <div class="spacer" style="flex:1"></div>
            <button type="button" class="btn ghost" id="save">Kaydet</button>
            <button type="button" class="btn accent" id="submit">📨 Müdüre Gönder</button>
          </div>
        </form>
      `, 'yeni');
      bind();
    };

    let saveTimer = null;
    let saving = false;
    const setState = (t) => { const el = $('#save-state'); if (el) el.textContent = t; };

    const payload = () => {
      const f = $('#rf');
      return {
        title: f.title.value, customer: f.customer.value, address: f.address.value, job_date: f.job_date.value,
        notes: f.notes.value, fields: report.fields, data: collectData($('#fields-area'), report.fields),
      };
    };

    const save = async (silent = true) => {
      if (saving) return;
      saving = true;
      setState('Kaydediliyor…');
      try {
        const res = await api('PUT', `/api/reports/${report.id}`, payload());
        report = { ...res.report, attachments: report.attachments };
        setState('Kaydedildi ✓');
        if (!silent) toast('Rapor kaydedildi', 'ok');
      } catch (e) { setState('Kaydedilemedi'); if (!silent) toast(e.message, 'err'); }
      saving = false;
    };
    const scheduleSave = () => { clearTimeout(saveTimer); setState('Değişiklik var…'); saveTimer = setTimeout(() => save(true), 1500); };

    function drawAtts() {
      const g = $('#atts');
      g.innerHTML = report.attachments.map((a) => `
        <div class="att" data-id="${a.id}">
          <span class="kind">${a.kind === 'video' ? 'VİDEO' : a.kind === 'foto' ? 'FOTO' : 'DOSYA'}</span>
          <button type="button" class="del" title="Sil">✕</button>
          ${a.kind === 'video' ? `<div class="thumb video" data-open><video src="${esc(a.url)}#t=0.5" preload="metadata" muted playsinline></video><span>▶</span></div>` : a.kind === 'foto' ? `<img class="thumb" src="${esc(a.url)}" alt="" loading="lazy" data-open>` : `<div class="thumb video" data-open><span>📄</span></div>`}
          <div class="cap"><input type="text" placeholder="Açıklama (örn. Pano önce)" value="${esc(a.caption)}"></div>
        </div>`).join('');
      $$('.att', g).forEach((el, i) => {
        const id = Number(el.dataset.id);
        $('[data-open]', el).onclick = () => lightbox(report.attachments, i);
        $('.del', el).onclick = async () => {
          if (!(await confirmDlg('Bu ek silinsin mi?', { danger: true, okText: 'Sil' }))) return;
          try { await api('DELETE', `/api/attachments/${id}`); report.attachments = report.attachments.filter((a) => a.id !== id); drawAtts(); } catch (e) { toast(e.message, 'err'); }
        };
        let t;
        $('.cap input', el).oninput = (e) => { clearTimeout(t); const v = e.target.value; t = setTimeout(async () => { try { await api('PATCH', `/api/attachments/${id}`, { caption: v }); const a = report.attachments.find((x) => x.id === id); if (a) a.caption = v; } catch (err) { toast(err.message, 'err'); } }, 600); };
      });
    }

    function upload(file) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/reports/${report.id}/attachments`);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name || 'dosya'));
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) { $('#prog div').style.width = Math.round((e.loaded / e.total) * 100) + '%'; } };
        xhr.onload = () => { try { const d = JSON.parse(xhr.responseText); if (xhr.status >= 200 && xhr.status < 300) resolve(d.attachment); else reject(new Error(d.error || 'Yükleme hatası')); } catch { reject(new Error('Yükleme hatası')); } };
        xhr.onerror = () => reject(new Error('Bağlantı hatası'));
        xhr.send(file);
      });
    }

    async function handleFiles(files) {
      const list = Array.from(files);
      if (!list.length) return;
      $('#prog').classList.remove('hidden');
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        $('#prog-txt').textContent = `${i + 1}/${list.length} yükleniyor: ${f.name} (${fmtSize(f.size)})`;
        $('#prog div').style.width = '0%';
        try { const a = await upload(f); report.attachments.push(a); drawAtts(); }
        catch (e) { toast(`${f.name}: ${e.message}`, 'err', 6000); }
      }
      $('#prog').classList.add('hidden');
      $('#prog-txt').textContent = `${report.attachments.length} ek`;
    }

    function bind() {
      const form = $('#rf');
      form.addEventListener('input', scheduleSave);
      form.addEventListener('change', scheduleSave);
      form.addEventListener('submit', (e) => e.preventDefault());
      initSignaturePads($('#fields-area'), scheduleSave);
      drawAtts();
      $$('[data-up]').forEach((inp) => { inp.onchange = () => { handleFiles(inp.files); inp.value = ''; }; });
      const uz = $('#uz');
      uz.addEventListener('dragover', (e) => { e.preventDefault(); uz.style.borderColor = 'var(--accent)'; });
      uz.addEventListener('dragleave', () => { uz.style.borderColor = ''; });
      uz.addEventListener('drop', (e) => { e.preventDefault(); uz.style.borderColor = ''; handleFiles(e.dataTransfer.files); });

      $('#save').onclick = () => { clearTimeout(saveTimer); save(false); };
      $('#edit-fields').onclick = () => {
        const m = modal(`<h3>Rapor alanlarını düzenle</h3><p class="small muted mb">Bu değişiklik yalnızca bu raporu etkiler. Kalıcı bir şablon için "Şablonlar" sayfasını kullanın.</p><div id="fb"></div><div class="actions"><button class="btn ghost" data-saveas>Şablon olarak kaydet</button><button class="btn ghost" data-no>Vazgeç</button><button class="btn" data-ok>Uygula</button></div>`);
        const fb = fieldBuilder($('#fb', m.el), report.fields);
        $('[data-no]', m.el).onclick = m.close;
        $('[data-ok]', m.el).onclick = async () => {
          const data = collectData($('#fields-area'), report.fields);
          report.fields = fb.get();
          report.data = { ...data };
          m.close();
          $('#fields-area').innerHTML = report.fields.map((f) => renderField(f, report.data[f.key])).join('');
          initSignaturePads($('#fields-area'), scheduleSave);
          scheduleSave();
        };
        $('[data-saveas]', m.el).onclick = async () => {
          const name = await promptDlg('Şablon adı', { value: report.title });
          if (!name) return;
          try { await api('POST', '/api/templates', { name, fields: fb.get(), shared: false, category: 'Kişisel' }); toast('Şablon kaydedildi', 'ok'); } catch (e) { toast(e.message, 'err'); }
        };
      };
      $('#del').onclick = async () => {
        if (!(await confirmDlg('Bu rapor ve ekleri silinecek. Emin misiniz?', { danger: true, okText: 'Sil' }))) return;
        try { await api('DELETE', `/api/reports/${report.id}`); toast('Rapor silindi'); location.hash = '#/'; } catch (e) { toast(e.message, 'err'); }
      };
      $('#submit').onclick = async () => {
        clearTimeout(saveTimer);
        const p = payload();
        const missing = report.fields.filter((f) => f.required && f.type !== 'section').filter((f) => { const v = p.data[f.key]; return f.type === 'checklist' ? !v.length : f.type === 'checkbox' ? !v : !String(v ?? '').trim(); });
        $$('.field.invalid').forEach((el) => el.classList.remove('invalid'));
        if (!p.title.trim()) { toast('Rapor başlığı gerekli', 'err'); $('[name=title]').focus(); return; }
        if (missing.length) {
          missing.forEach((f) => $(`.field[data-key="${f.key}"]`)?.classList.add('invalid'));
          toast('Zorunlu alanlar boş: ' + missing.map((f) => f.label).join(', '), 'err', 6000);
          $(`.field[data-key="${missing[0].key}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        if (!report.attachments.length && !(await confirmDlg('Rapora hiç fotoğraf eklenmedi. Yine de gönderilsin mi?', { okText: 'Gönder' }))) return;
        try {
          await save(true);
          await api('POST', `/api/reports/${report.id}/submit`);
          toast('<b>Rapor müdüre gönderildi</b>', 'ok');
          location.hash = `#/rapor/${report.id}`;
        } catch (e) { toast(e.message, 'err', 6000); }
      };
    }
    draw();
  }

  /* ---------------- Rapor görüntüleme ---------------- */
  function valueHtml(f, v) {
    if (f.type === 'checkbox') return v ? '✔ Evet' : '— Hayır';
    if (f.type === 'checklist') return Array.isArray(v) && v.length ? v.map((o) => `✔ ${esc(o)}`).join('<br>') : '<span class="empty-v">—</span>';
    if (f.type === 'signature') return v ? `<img class="sig-preview" src="${esc(v)}" alt="İmza">` : '<span class="empty-v">İmzalanmadı</span>';
    if (f.type === 'date') return v ? fmtDate(v, false) : '<span class="empty-v">—</span>';
    return v !== undefined && v !== null && String(v).trim() !== '' ? esc(v) : '<span class="empty-v">—</span>';
  }

  async function viewReport(id) {
    const { report: r } = await api('GET', `/api/reports/${id}`);
    const isM = state.user.role === 'mudur';
    const mine = r.technician_id === state.user.id;
    const editable = mine && (r.status === 'taslak' || r.status === 'revizyon');

    const noteBox = r.manager_note || r.status === 'onaylandi' || r.status === 'incelendi'
      ? `<div class="note-box ${r.status === 'onaylandi' ? 'ok' : r.status === 'revizyon' ? 'rev' : ''}"><b>${r.status === 'onaylandi' ? 'Onaylandı' : r.status === 'revizyon' ? 'Revizyon istendi' : 'İncelendi'}${r.reviewer_name ? ' · ' + esc(r.reviewer_name) : ''}${r.reviewed_at ? ' · ' + fmtDate(r.reviewed_at) : ''}</b>${r.manager_note ? '<br>' + esc(r.manager_note) : ''}</div>` : '';

    shell(`
      <div class="print-head"><h1>${esc(r.title)}</h1><div>${esc(r.template_name)} · ${esc(r.technician_name)} · ${fmtDate(r.job_date, false)}${r.customer ? ' · ' + esc(r.customer) : ''}</div></div>
      <div class="page-head no-print"><a class="btn ghost sm" href="#/">‹ Geri</a><h1 style="font-size:18px">${esc(r.title)}</h1><span class="chip ${r.status}">${STATUS[r.status]}</span></div>
      <div class="row mb no-print">
        <button class="btn ghost sm" onclick="window.print()">🖨 Yazdır / PDF</button>
        ${editable ? `<a class="btn sm accent" href="#/rapor/${r.id}/duzenle">✎ Düzenle</a>` : ''}
        ${isM || (mine && r.status !== 'onaylandi') ? `<button class="btn ghost sm" id="del">🗑 Sil</button>` : ''}
      </div>
      <div class="report-view">
        ${noteBox ? `<div class="card mb">${noteBox}</div>` : ''}
        <div class="card">
          <div class="kv">
            <div class="r"><div class="k">Teknisyen</div><div class="v">${esc(r.technician_name)}</div></div>
            <div class="r"><div class="k">Müşteri</div><div class="v">${r.customer ? esc(r.customer) : '<span class="empty-v">—</span>'}</div></div>
            <div class="r"><div class="k">Adres</div><div class="v">${r.address ? esc(r.address) : '<span class="empty-v">—</span>'}</div></div>
            <div class="r"><div class="k">İş Tarihi</div><div class="v">${fmtDate(r.job_date, false)}</div></div>
            <div class="r"><div class="k">Şablon</div><div class="v">${esc(r.template_name)}</div></div>
            ${r.submitted_at ? `<div class="r"><div class="k">Gönderim</div><div class="v">${fmtDate(r.submitted_at)}</div></div>` : ''}
          </div>
        </div>
        ${r.fields.length ? `<div class="card mt"><div class="kv">${r.fields.map((f) => f.type === 'section' ? `<div class="form-section">${esc(f.label)}</div>` : `<div class="r"><div class="k">${esc(f.label)}</div><div class="v">${valueHtml(f, r.data[f.key])}</div></div>`).join('')}</div></div>` : ''}
        ${r.notes ? `<div class="card mt"><h3>Ek Notlar</h3><div style="white-space:pre-wrap">${esc(r.notes)}</div></div>` : ''}
        <div class="card mt">
          <h3>Fotoğraf & Video <span class="muted small">(${r.attachments.length})</span></h3>
          ${r.attachments.length ? `<div class="att-grid" id="atts">${r.attachments.map((a, i) => `
            <div class="att" data-i="${i}">
              <span class="kind">${a.kind === 'video' ? 'VİDEO' : a.kind === 'foto' ? 'FOTO' : 'DOSYA'}</span>
              ${a.kind === 'video' ? `<div class="thumb video" data-open><video src="${esc(a.url)}#t=0.5" preload="metadata" muted playsinline></video><span>▶</span></div>` : a.kind === 'foto' ? `<img class="thumb" src="${esc(a.url)}" alt="${esc(a.caption)}" loading="lazy" data-open>` : `<div class="thumb video" data-open><span>📄</span></div>`}
              <div class="cap" title="${esc(a.caption || a.filename)}">${esc(a.caption || a.filename)}</div>
            </div>`).join('')}</div>` : '<p class="muted">Ek yok.</p>'}
        </div>
        ${isM && r.status !== 'taslak' ? `
        <div class="review-bar no-print">
          <div class="field"><label>Teknisyene not (revizyon için zorunlu)</label><textarea id="note" placeholder="Örn. Pano fotoğrafı eksik, ölçüm değerlerini ekleyin…">${esc(r.manager_note)}</textarea></div>
          <div class="row">
            ${r.status === 'gonderildi' ? '<button class="btn warn" data-rev="incelendi">👁 İncelendi olarak işaretle</button>' : ''}
            <button class="btn success" data-rev="onaylandi">✔ Onayla</button>
            <button class="btn danger" data-rev="revizyon">↩ Revizyon iste</button>
          </div>
        </div>` : ''}
      </div>
    `, 'home');

    $$('[data-open]').forEach((el) => { el.onclick = () => lightbox(r.attachments, Number(el.closest('.att').dataset.i)); });
    $$('[data-rev]').forEach((b) => {
      b.onclick = async () => {
        const status = b.dataset.rev;
        const note = $('#note').value.trim();
        if (status === 'revizyon' && !note) { toast('Revizyon için teknisyene not yazın', 'err'); $('#note').focus(); return; }
        try {
          await api('POST', `/api/reports/${r.id}/review`, { status, note });
          toast(`Rapor ${STATUS[status].toLowerCase()}`, 'ok');
          await refreshPending();
          render();
        } catch (e) { toast(e.message, 'err'); }
      };
    });
    const del = $('#del');
    if (del) del.onclick = async () => {
      if (!(await confirmDlg('Bu rapor ve tüm ekleri kalıcı olarak silinecek. Emin misiniz?', { danger: true, okText: 'Sil' }))) return;
      try { await api('DELETE', `/api/reports/${r.id}`); toast('Rapor silindi'); location.hash = '#/'; } catch (e) { toast(e.message, 'err'); }
    };
  }

  /* ---------------- Şablonlar ---------------- */
  async function viewTemplates() {
    const { templates } = await api('GET', '/api/templates');
    const isM = state.user.role === 'mudur';
    const shared = templates.filter((t) => !t.owner_id);
    const own = templates.filter((t) => t.owner_id);
    const card = (t) => {
      const canEdit = isM || t.owner_id === state.user.id;
      return `<div class="tpl">
        <div class="t"><span>${esc(t.name)}</span><span class="chip neutral">${t.owner_id ? (isM && t.owner_id !== state.user.id ? esc(t.owner_name || 'Kişisel') : 'Kişisel') : 'Firma'}</span></div>
        <div class="d">${esc(t.description || '')}</div>
        <div class="small muted">${t.fields.filter((f) => f.type !== 'section').length} alan${t.category ? ' · ' + esc(t.category) : ''}</div>
        <div class="actions">
          ${canEdit ? `<a class="btn sm" href="#/sablonlar/${t.id}">✎ Düzenle</a>` : ''}
          <a class="btn sm ghost" href="#/sablonlar/${t.id}/kopya">⧉ Kopyala</a>
          ${canEdit ? `<button class="btn sm ghost" data-del="${t.id}">🗑</button>` : ''}
        </div></div>`;
    };
    shell(`
      <div class="page-head"><h1>Şablonlar</h1><a class="btn accent sm" href="#/sablonlar/yeni">＋ Yeni Şablon</a></div>
      <p class="muted small mb">${isM ? 'Firma şablonlarını herkes kullanır; düzenlemeleri siz yaparsınız. Teknisyenlerin kendi kişisel şablonlarını da görebilirsiniz.' : 'Firma şablonlarını kullanabilir, kopyalayıp kendinize göre değiştirebilir veya sıfırdan kendi şablonunuzu yazabilirsiniz.'}</p>
      <div class="section-title">Firma şablonları</div>
      <div class="tpl-grid">${shared.map(card).join('') || '<p class="muted">Yok</p>'}</div>
      <div class="section-title">${isM ? 'Kişisel şablonlar' : 'Benim şablonlarım'}</div>
      <div class="tpl-grid">${own.map(card).join('') || '<p class="muted">Henüz kişisel şablon yok.</p>'}</div>
    `, 'sablonlar');
    $$('[data-del]').forEach((b) => {
      b.onclick = async () => {
        if (!(await confirmDlg('Şablon silinsin mi? Mevcut raporlar etkilenmez.', { danger: true, okText: 'Sil' }))) return;
        try { await api('DELETE', `/api/templates/${b.dataset.del}`); toast('Şablon silindi'); render(); } catch (e) { toast(e.message, 'err'); }
      };
    });
  }

  async function viewTemplateEditor(id, copy) {
    const isM = state.user.role === 'mudur';
    let tpl = { name: '', description: '', category: '', fields: [], owner_id: state.user.id };
    if (id) {
      const { templates } = await api('GET', '/api/templates');
      const found = templates.find((t) => String(t.id) === String(id));
      if (!found) throw new Error('Şablon bulunamadı');
      tpl = copy ? { ...found, id: null, name: found.name + ' (kopya)', owner_id: state.user.id, category: found.category || 'Kişisel' } : found;
    }
    const isNew = !tpl.id;
    shell(`
      <div class="page-head"><a class="btn ghost sm" href="#/sablonlar">‹ Geri</a><h1>${isNew ? (copy ? 'Şablonu Kopyala' : 'Yeni Şablon') : 'Şablonu Düzenle'}</h1></div>
      <form id="tf" autocomplete="off">
        <div class="card">
          <div class="field"><label>Şablon adı <span class="req">*</span></label><input type="text" name="name" value="${esc(tpl.name)}" required placeholder="Örn. Jeneratör Bakım Raporu"></div>
          <div class="grid-2">
            <div class="field"><label>Kategori</label><input type="text" name="category" value="${esc(tpl.category)}" placeholder="Kurulum, Arıza, Bakım…"></div>
            ${isM ? `<div class="field"><label>Görünürlük</label><select name="shared"><option value="1" ${!tpl.owner_id ? 'selected' : ''}>Firma şablonu (herkes kullanır)</option><option value="0" ${tpl.owner_id ? 'selected' : ''}>Sadece ben</option></select></div>` : ''}
          </div>
          <div class="field"><label>Açıklama</label><input type="text" name="description" value="${esc(tpl.description)}" placeholder="Bu şablon hangi işler için?"></div>
        </div>
        <div class="card mt">
          <div class="row between mb"><h3>Alanlar</h3><button type="button" class="btn sm ghost" id="preview">👁 Önizle</button></div>
          <div id="fb"></div>
        </div>
        <div class="row mt" style="justify-content:flex-end"><button class="btn accent" type="submit">${isNew ? 'Şablonu Oluştur' : 'Kaydet'}</button></div>
      </form>
    `, 'sablonlar');
    const fb = fieldBuilder($('#fb'), tpl.fields);
    $('#preview').onclick = () => {
      const fields = fb.get();
      const m = modal(`<h3>Önizleme</h3><div>${fields.map((f) => renderField(f, '')).join('') || '<p class="muted">Alan yok</p>'}</div><div class="actions"><button class="btn" data-no>Kapat</button></div>`);
      initSignaturePads(m.el, () => {});
      $('[data-no]', m.el).onclick = m.close;
    };
    $('#tf').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const body = { name: f.name.value, category: f.category.value, description: f.description.value, fields: fb.get() };
      if (isM) body.shared = f.shared.value === '1';
      if (!body.fields.length) { toast('En az bir alan ekleyin', 'err'); return; }
      try {
        if (isNew) await api('POST', '/api/templates', body);
        else await api('PUT', `/api/templates/${tpl.id}`, body);
        toast('Şablon kaydedildi', 'ok');
        location.hash = '#/sablonlar';
      } catch (ex) { toast(ex.message, 'err'); }
    };
  }

  /* ---------------- Kullanıcılar ---------------- */
  async function viewUsers() {
    const { users } = await api('GET', '/api/users');
    shell(`
      <div class="page-head"><h1>Ekip</h1><button class="btn accent sm" id="add">＋ Kullanıcı ekle</button></div>
      <div class="card">
        <table class="tbl"><thead><tr><th>Ad</th><th>Kullanıcı</th><th>Rol</th><th>Durum</th><th></th></tr></thead>
        <tbody>${users.map((u) => `<tr>
          <td><b>${esc(u.name)}</b></td><td class="muted">${esc(u.username)}</td>
          <td>${u.role === 'mudur' ? 'Müdür' : 'Teknisyen'}</td>
          <td>${u.active ? '<span class="chip onaylandi">Aktif</span>' : '<span class="chip revizyon">Pasif</span>'}</td>
          <td style="text-align:right"><button class="btn sm ghost" data-edit="${u.id}">Düzenle</button></td>
        </tr>`).join('')}</tbody></table>
      </div>
    `, 'kullanicilar');

    const userForm = (u) => `
      <div class="field"><label>Ad Soyad</label><input type="text" name="name" value="${esc(u?.name || '')}" required></div>
      ${u ? '' : '<div class="field"><label>Kullanıcı adı</label><input type="text" name="username" autocapitalize="none" required placeholder="küçük harf, boşluksuz"></div>'}
      <div class="field"><label>Rol</label><select name="role"><option value="teknisyen" ${u?.role !== 'mudur' ? 'selected' : ''}>Teknisyen</option><option value="mudur" ${u?.role === 'mudur' ? 'selected' : ''}>Müdür</option></select></div>
      <div class="field"><label>${u ? 'Yeni şifre (boş bırakılırsa değişmez)' : 'Şifre'}</label><input type="password" name="password" ${u ? '' : 'required'} autocomplete="new-password"></div>
      ${u && u.id !== state.user.id ? `<label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Hesap aktif (pasif kullanıcı giriş yapamaz)</label>` : ''}`;

    $('#add').onclick = () => {
      const m = modal(`<h3>Yeni kullanıcı</h3><form id="uf">${userForm(null)}<div class="actions"><button type="button" class="btn ghost" data-no>Vazgeç</button><button class="btn" type="submit">Oluştur</button></div></form>`);
      $('[data-no]', m.el).onclick = m.close;
      $('#uf', m.el).onsubmit = async (e) => {
        e.preventDefault(); const f = e.target;
        try { await api('POST', '/api/users', { name: f.name.value, username: f.username.value, role: f.role.value, password: f.password.value }); m.close(); toast('Kullanıcı eklendi', 'ok'); render(); } catch (ex) { toast(ex.message, 'err'); }
      };
    };
    $$('[data-edit]').forEach((b) => {
      b.onclick = () => {
        const u = users.find((x) => x.id === Number(b.dataset.edit));
        const m = modal(`<h3>${esc(u.name)}</h3><form id="uf">${userForm(u)}<div class="actions"><button type="button" class="btn ghost" data-no>Vazgeç</button><button class="btn" type="submit">Kaydet</button></div></form>`);
        $('[data-no]', m.el).onclick = m.close;
        $('#uf', m.el).onsubmit = async (e) => {
          e.preventDefault(); const f = e.target;
          const body = { name: f.name.value, role: f.role.value };
          if (f.password.value) body.password = f.password.value;
          if (f.active) body.active = f.active.checked;
          try { await api('PATCH', `/api/users/${u.id}`, body); m.close(); toast('Kaydedildi', 'ok'); render(); } catch (ex) { toast(ex.message, 'err'); }
        };
      };
    });
  }

  /* ---------------- Ayarlar ---------------- */
  async function viewSettings() {
    const u = state.user;
    const notif = 'Notification' in window ? Notification.permission : 'unsupported';
    shell(`
      <div class="page-head"><h1>Ayarlar</h1></div>
      <div class="card"><h3>${esc(u.name)}</h3><p class="muted">${esc(u.username)} · ${u.role === 'mudur' ? 'Müdür' : 'Teknisyen'}</p></div>
      <div class="card mt"><h3>Şifre değiştir</h3>
        <form id="pf">
          <div class="field"><label>Mevcut şifre</label><input type="password" name="current" required autocomplete="current-password"></div>
          <div class="field"><label>Yeni şifre</label><input type="password" name="next" required minlength="4" autocomplete="new-password"></div>
          <button class="btn" type="submit">Güncelle</button>
        </form>
      </div>
      <div class="card mt"><h3>Bildirimler</h3>
        <p class="small muted mb">Uygulama açıkken yeni rapor / onay bildirimleri ekranda belirir. Tarayıcı bildirimi açılırsa sekme arka plandayken de haber verilir.</p>
        <p class="small mb">Durum: <b>${notif === 'granted' ? 'Açık' : notif === 'denied' ? 'Tarayıcıda engellenmiş' : notif === 'unsupported' ? 'Desteklenmiyor' : 'Kapalı'}</b></p>
        ${notif === 'default' ? '<button class="btn ghost sm" id="notif">Bildirimleri aç</button>' : ''}
      </div>
      <div class="card mt"><h3>Telefona ekle</h3><p class="small muted">Safari/Chrome'da "Paylaş → Ana Ekrana Ekle" ile uygulama gibi kullanabilirsiniz.</p></div>
    `, 'ayarlar');
    $('#pf').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target;
      try { await api('POST', '/api/me/password', { current: f.current.value, next: f.next.value }); toast('Şifre güncellendi', 'ok'); f.reset(); } catch (ex) { toast(ex.message, 'err'); }
    };
    const nb = $('#notif');
    if (nb) nb.onclick = async () => { await Notification.requestPermission(); render(); };
  }

  /* ---------------- Başlat ---------------- */
  async function boot() {
    try {
      const { user } = await api('GET', '/api/me');
      state.user = user;
      if (user) await afterLogin();
    } catch { state.user = null; }
    if (!state.user && route().page !== 'giris') location.hash = '#/giris';
    render();
    window.addEventListener('hashchange', render);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.user) refreshPending(); });
  }
  boot();
})();
