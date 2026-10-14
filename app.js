/* Rotawren Support – Logik (fiktives Demo)
 * Ohne Backend werden Anfragen im Browser gespeichert (localStorage).
 * Sobald RW_CONFIG.apiUrl gesetzt ist, gehen alle Aufrufe per POST an das Backend. */
(function () {
  'use strict';

  const RW_CONFIG = {
    apiUrl: '',            // später: Apps-Script-URL
    token: 'rotawren-demo' // öffentlicher Web-Schlüssel, nur für Website-Aktionen
  };

  const T = window.RW_TEXT, ARTICLES = window.RW_ARTICLES, CATS = window.RW_CATEGORIES;
  const LANGS = ['en', 'fr', 'de'];
  const LOCALE = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE' };
  const TZ = 'Europe/Berlin';
  const PRIOS = [
    { id: 'low', c: '#9AA6A2' }, { id: 'normal', c: '#1F5A4E' },
    { id: 'high', c: '#E9A93B' }, { id: 'urgent', c: '#A8432C' }
  ];
  // Servicezeiten (Mo=0 … So=6), Stunden in Europe/Berlin
  const HOURS = [[7, 22], [7, 22], [7, 22], [7, 22], [7, 22], [9, 18], [9, 18]];
  const STORE = 'rw_requests_v1';
  const EXAMPLE = { id: 'RW-204817', email: 'demo@rotawren.example' };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- Sprache ---------- */
  let lang = pickLang();
  function pickLang() {
    try { const s = localStorage.getItem('rw_lang'); if (LANGS.includes(s)) return s; } catch (e) {}
    const n = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return LANGS.includes(n) ? n : 'en';
  }
  function t(key, vars) {
    let s = (T[lang] && T[lang][key]) ?? T.en[key] ?? key;
    if (vars && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : ''));
    return s;
  }
  function setLang(l) {
    lang = l;
    try { localStorage.setItem('rw_lang', l); } catch (e) {}
    applyText();
    render();
  }
  function applyText() {
    document.documentElement.lang = lang;
    document.title = t('meta.title');
    $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    $$('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    $$('.lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    buildCategorySelect();
    buildPriorities();
    buildStatus();
    buildRota();
  }

  /* ---------- Hilfen ---------- */
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach(c => { if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return n;
  }
  const fmtDate = iso => new Intl.DateTimeFormat(LOCALE[lang], { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
  const fmtDateTime = iso => new Intl.DateTimeFormat(LOCALE[lang], { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  const fmtTime = d => new Intl.DateTimeFormat(LOCALE[lang], { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let toastTimer;
  function toast(msg) {
    const n = $('#toast'); n.textContent = msg; n.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => n.classList.remove('show'), 2600);
  }

  /* ---------- Dienstplan des Support-Teams ---------- */
  function berlinNow() {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const get = k => parts.find(p => p.type === k).value;
    const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'));
    return { day, h: +get('hour') + (+get('minute')) / 60 };
  }
  const pad = h => String(h).padStart(2, '0') + ':00';
  function buildRota() {
    const grid = $('#rotaGrid'); if (!grid) return;
    const days = t('rota.days'), now = berlinNow();
    grid.textContent = '';
    HOURS.forEach(([a, b], i) => {
      grid.append(
        el('div', { class: 'rota-day' + (i === now.day ? ' today' : '') }, days[i]),
        el('div', { class: 'rota-track' }, el('span', { class: 'rota-shift', style: `left:${a / 24 * 100}%;width:${(b - a) / 24 * 100}%;--i:${i}` }))
      );
    });
    grid.append(el('div'), el('div', { class: 'rota-axis' }, ['00', '06', '12', '18', '24'].map(x => el('span', null, x))));
    const line = el('div', { class: 'rota-now', style: `left:calc(2.6rem + (100% - 2.6rem) * ${now.h / 24})` }, el('span', null, t('rota.now')));
    grid.append(line);

    const [a, b] = HOURS[now.day];
    const online = now.h >= a && now.h < b;
    $('#rotaState').classList.toggle('off', !online);
    if (online) $('#rotaStateText').textContent = t('rota.online');
    else {
      let d = now.day, first = true;
      while (true) {
        const [s] = HOURS[d];
        if (!(first && now.h >= s)) break;
        first = false; d = (d + 1) % 7;
      }
      const label = d === now.day ? pad(HOURS[d][0]) : `${days[d]} ${pad(HOURS[d][0])}`;
      $('#rotaStateText').textContent = t('rota.offline', { time: label });
    }
    $('#rotaHours').textContent = `${days[0]}–${days[4]} 07:00–22:00, ${days[5]}–${days[6]} 09:00–18:00. ${t('rota.tz')}.`;
  }

  /* ---------- Hilfe-Center ---------- */
  const art = a => a[lang] || a.en;
  function articleLink(a) {
    const x = art(a);
    return el('li', null, el('a', { href: '#/article/' + a.id },
      el('span', { class: 'a-title' }, x.t), el('span', { class: 'a-sum' }, x.s)));
  }
  function buildTopics() {
    const box = $('#topicIndex'); box.textContent = '';
    CATS.forEach(c => {
      const list = ARTICLES.filter(a => a.cat === c);
      box.append(el('section', { class: 'topic' },
        el('div', { class: 'topic-head' },
          el('h3', null, t('cat.' + c)),
          el('span', { class: 'topic-count' }, list.length === 1 ? t('topics.count1') : t('topics.count', { n: list.length }))),
        el('p', { class: 'topic-desc' }, t('cat.' + c + '.d')),
        el('ul', null, list.map(a => el('li', null, el('a', { href: '#/article/' + a.id }, art(a).t))))
      ));
    });
  }
  function search(q) {
    const words = norm(q).split(/\s+/).filter(w => w.length > 1);
    if (!words.length) return [];
    return ARTICLES.map(a => {
      const x = art(a);
      const title = norm(x.t), body = norm([x.s, x.steps.join(' '), x.k, t('cat.' + a.cat)].join(' '));
      let score = 0;
      words.forEach(w => { if (title.includes(w)) score += 3; else if (body.includes(w)) score += 1; });
      const hits = words.filter(w => title.includes(w) || body.includes(w)).length;
      return { a, score: hits === words.length ? score + 2 : (hits ? score : 0) };
    }).filter(r => r.score > 0).sort((x, y) => y.score - x.score).map(r => r.a);
  }
  let lastQuery = '';
  function showResults(q) {
    lastQuery = q.trim();
    const box = $('#results');
    if (!lastQuery) { box.hidden = true; return; }
    const found = search(lastQuery), list = $('#resultsList');
    list.textContent = '';
    $('#resultsTitle').textContent = found.length
      ? (found.length === 1 ? t('search.result1', { q: lastQuery }) : t('search.results', { n: found.length, q: lastQuery }))
      : t('search.none', { q: lastQuery });
    found.forEach(a => list.append(articleLink(a)));
    box.hidden = false;
  }

  function renderArticle(id) {
    const a = ARTICLES.find(x => x.id === id), box = $('#article');
    box.textContent = '';
    if (!a) { location.hash = '#/'; return; }
    const x = art(a);
    const msg = el('p', { class: 'helpful-msg', 'aria-live': 'polite' });
    const others = ARTICLES.filter(o => o.cat === a.cat && o.id !== a.id);
    box.append(
      el('h1', null, x.t),
      el('p', { class: 'lead' }, x.s),
      el('h2', { class: 'steps-title' }, t('article.steps')),
      el('ol', { class: 'steps' }, x.steps.map(s => el('li', null, s))),
      el('div', { class: 'helpful' },
        el('strong', null, t('article.helpful')),
        el('button', { type: 'button', class: 'btn ghost', onclick: () => { msg.textContent = t('article.thanks'); } }, t('article.yes')),
        el('button', { type: 'button', class: 'btn ghost', onclick: () => {
          msg.textContent = '';
          msg.append(t('article.notyet') + ' ', el('a', { href: '#/new?cat=' + a.cat }, t('nav.new')));
        } }, t('article.no')),
        msg),
      others.length ? el('section', { class: 'related' },
        el('h2', null, t('article.related', { cat: t('cat.' + a.cat) })),
        el('ul', { class: 'article-list' }, others.map(articleLink))) : null
    );
  }

  function buildStatus() {
    const box = $('#statusList'); if (!box) return;
    box.textContent = '';
    ['web', 'mobile', 'terminal', 'payroll', 'notify', 'api'].forEach(c =>
      box.append(el('li', null, el('span', null, t('status.c.' + c)), el('span', { class: 'st' }, el('i'), t('status.operational')))));
    $('#statusChecked').textContent = t('status.checked', { time: fmtTime(new Date()) });
  }

  /* ---------- Formular ---------- */
  function buildCategorySelect() {
    const s = $('#f_category'), cur = s.value;
    s.textContent = '';
    s.append(el('option', { value: '' }, t('f.category.choose')));
    CATS.forEach(c => s.append(el('option', { value: c }, t('cat.' + c))));
    s.value = cur;
  }
  function buildPriorities() {
    const box = $('#prioList'), cur = (box.querySelector('input:checked') || {}).value || 'normal';
    box.textContent = '';
    PRIOS.forEach(p => box.append(el('div', { class: 'prio-opt', style: '--c:' + p.c },
      el('input', { type: 'radio', name: 'priority', id: 'p_' + p.id, value: p.id, checked: p.id === cur }),
      el('label', { for: 'p_' + p.id }, t('p.' + p.id), el('small', null, t('p.' + p.id + '.d'))))));
  }
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function setErr(id, key) {
    const input = $('#f_' + id), out = $('#e_' + id);
    if (input.dataset.desc === undefined) input.dataset.desc = input.getAttribute('aria-describedby') || '';
    out.textContent = key ? t(key) : '';
    if (key) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', ['e_' + id, input.dataset.desc].filter(Boolean).join(' ')); }
    else { input.removeAttribute('aria-invalid'); if (input.dataset.desc) input.setAttribute('aria-describedby', input.dataset.desc); else input.removeAttribute('aria-describedby'); }
    return !key;
  }
  function validate(f) {
    const v = n => f.elements[n].value.trim();
    const checks = [
      setErr('name', v('name').length < 2 ? 'err.required' : ''),
      setErr('email', !v('email') ? 'err.required' : (!EMAIL_RE.test(v('email')) ? 'err.email' : '')),
      setErr('category', !v('category') ? 'err.required' : ''),
      setErr('subject', v('subject').length < 3 ? 'err.required' : ''),
      setErr('description', !v('description') ? 'err.required' : (v('description').length < 20 ? 'err.short' : '')),
      setErr('consent', f.elements.consent.checked ? '' : 'err.consent')
    ];
    return checks.every(Boolean);
  }

  /* ---------- Datenzugriff: Backend oder lokaler Demo-Speicher ---------- */
  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch (e) { return []; } }
  function save(list) { try { localStorage.setItem(STORE, JSON.stringify(list)); } catch (e) {} }
  function exampleTicket() {
    const day = 864e5, base = Date.now();
    const at = (d, h) => new Date(base - d * day + h * 36e5).toISOString();
    return {
      id: EXAMPLE.id, email: EXAMPLE.email, name: 'Anna Becker', workspace: 'Seehotel Lindenhof',
      category: 'payroll', priority: 'high', status: 'resolved', subjectKey: 'seed.subject',
      created: at(6, 0), updated: at(5, 3),
      events: [
        { who: 'you', key: 'seed.msg1', at: at(6, 0) },
        { who: 'system', key: 'ev.auto', at: at(6, 0.01) },
        { who: 'team', key: 'seed.reply1', at: at(6, 1.4) },
        { who: 'you', key: 'seed.msg2', at: at(5, 2.9) },
        { who: 'note', key: 'seed.done', at: at(5, 3) }
      ]
    };
  }
  async function post(action, data) {
    const res = await fetch(RW_CONFIG.apiUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action, token: RW_CONFIG.token, lang }, data))
    });
    const json = await res.json();
    if (!json.ok) { const e = new Error(json.error || 'error'); e.guest = json.error; throw e; }
    return json;
  }
  const api = {
    async create(d) {
      if (RW_CONFIG.apiUrl) return (await post('create_ticket', d)).ticket;
      const now = new Date().toISOString(), list = load();
      let id; do { id = 'RW-' + String(Math.floor(100000 + Math.random() * 900000)); } while (list.some(x => x.id === id) || id === EXAMPLE.id);
      const tk = { id, email: d.email.toLowerCase(), name: d.name, workspace: d.workspace, category: d.category, priority: d.priority,
        subject: d.subject, status: 'open', created: now, updated: now,
        events: [{ who: 'you', text: d.description, at: now }, { who: 'system', key: 'ev.auto', at: now }] };
      list.push(tk); save(list);
      return tk;
    },
    async get(id, email) {
      id = id.trim().toUpperCase(); email = email.trim().toLowerCase();
      if (RW_CONFIG.apiUrl) return (await post('get_ticket', { id, email })).ticket;
      if (id === EXAMPLE.id && email === EXAMPLE.email) return exampleTicket();
      return load().find(x => x.id === id && x.email === email) || null;
    },
    async reply(id, email, text) {
      if (RW_CONFIG.apiUrl) return (await post('reply_ticket', { id, email, text })).ticket;
      const now = new Date().toISOString();
      if (id === EXAMPLE.id) {   // Beispiel bleibt unverändert gespeichert, Antwort nur in dieser Ansicht
        const tk = current; tk.events.push({ who: 'you', text, at: now }); tk.status = 'open'; tk.updated = now; return tk;
      }
      const list = load(), tk = list.find(x => x.id === id && x.email === email.toLowerCase());
      if (!tk) return null;
      tk.events.push({ who: 'you', text, at: now }); tk.status = 'open'; tk.updated = now;
      save(list); return tk;
    }
  };

  /* ---------- Anfrage anzeigen ---------- */
  let current = null;
  const STATUS_CLASS = { open: '', progress: '', waiting: 'waiting', resolved: 'resolved' };
  function renderTicket() {
    const tk = current, box = $('#ticketView');
    box.textContent = '';
    if (!tk) { box.hidden = true; $('#trackLookup').hidden = false; return; }
    const subject = tk.subjectKey ? t(tk.subjectKey) : tk.subject;
    const who = { you: t('t.you'), team: t('t.team'), system: t('t.system'), note: t('t.team') };
    const replyArea = el('textarea', { id: 'r_text', rows: '4', maxlength: '3000', 'aria-describedby': 'r_hint' });
    const replyErr = el('p', { class: 'err', 'aria-live': 'polite' });
    const sendBtn = el('button', { type: 'submit', class: 'btn' }, t('t.reply.btn'));
    box.append(
      el('div', { class: 't-top' },
        el('span', { class: 't-id' }, tk.id),
        el('span', { class: 'chip ' + (STATUS_CLASS[tk.status] || '') }, t('s.' + tk.status))),
      el('h1', null, subject),
      el('dl', { class: 't-meta' },
        el('div', null, el('dt', null, t('t.category')), el('dd', null, t('cat.' + tk.category))),
        el('div', null, el('dt', null, t('t.priority')), el('dd', null, t('p.' + tk.priority))),
        el('div', null, el('dt', null, t('t.created')), el('dd', null, fmtDate(tk.created))),
        el('div', null, el('dt', null, t('t.updated')), el('dd', null, fmtDateTime(tk.updated)))),
      el('section', { class: 't-history' },
        el('h2', null, t('t.history')),
        el('ol', { class: 'events' }, tk.events.map(e => el('li', { class: 'ev ' + e.who },
          el('div', { class: 'ev-head' }, el('span', { class: 'ev-who' }, who[e.who] || e.who), el('time', { class: 'ev-time', datetime: e.at }, fmtDateTime(e.at))),
          el('div', { class: 'ev-body' }, e.key ? t(e.key) : e.text))))),
      el('form', { class: 'reply', novalidate: true, onsubmit: async ev => {
        ev.preventDefault();
        const text = replyArea.value.trim();
        if (!text) { replyErr.textContent = t('t.reply.empty'); replyArea.setAttribute('aria-invalid', 'true'); replyArea.focus(); return; }
        sendBtn.disabled = true;
        try {
          const tk2 = await api.reply(tk.id, tk.email, text);
          if (tk2) { current = tk2; renderTicket(); toast(t('t.reply.ok')); }
        } catch (e) { replyErr.textContent = e.guest || t('err.network'); }
        finally { sendBtn.disabled = false; }
      } },
        el('label', { for: 'r_text', class: 'h3' }, el('strong', null, t('t.reply'))),
        replyArea,
        el('p', { class: 'hint', id: 'r_hint' }, t('t.reply.h')),
        replyErr, sendBtn),
      el('p', { class: 't-actions' }, el('button', { type: 'button', class: 'link', onclick: () => { current = null; renderTicket(); $('#t_id').focus(); } }, t('track.another')))
    );
    $('#trackLookup').hidden = true;
    box.hidden = false;
  }
  async function openTicket(id, email) {
    const alert = $('#trackAlert');
    alert.hidden = true;
    try {
      const tk = await api.get(id, email);
      if (!tk) { alert.textContent = t('track.notfound'); alert.hidden = false; return false; }
      current = tk;
      if (location.hash !== '#/track') location.hash = '#/track';
      renderTicket();
      window.scrollTo(0, 0);
      return true;
    } catch (e) { alert.textContent = e.guest || t('err.network'); alert.hidden = false; return false; }
  }

  /* ---------- Routing ---------- */
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, query] = h.split('?');
    const parts = path.split('/');
    let view = 'help';
    if (parts[0] === 'article') view = 'article';
    else if (parts[0] === 'new') view = 'new';
    else if (parts[0] === 'track') view = 'track';
    return { view, id: parts[1], query: new URLSearchParams(query || '') };
  }
  let lastView = null;
  function render() {
    const r = route();
    $$('[data-view]').forEach(v => { v.hidden = v.dataset.view !== r.view; });
    $$('.nav a').forEach(a => {
      const on = a.dataset.route === r.view || (r.view === 'article' && a.dataset.route === 'help');
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (r.view === 'help') { buildTopics(); showResults(lastQuery); }
    if (r.view === 'article') renderArticle(r.id);
    if (r.view === 'new') {
      const cat = r.query.get('cat');
      if (cat && CATS.includes(cat) && !$('#f_category').value) $('#f_category').value = cat;
    }
    if (r.view === 'track') renderTicket();
    if (lastView !== null && lastView + (r.id || '') !== r.view + (r.id || '__')) {
      window.scrollTo(0, 0);
      if (r.view !== 'help') $('#main').focus({ preventScroll: true });
    }
    lastView = r.view + (r.id || '');
  }

  /* ---------- Ereignisse ---------- */
  function init() {
    applyText();
    render();
    window.addEventListener('hashchange', render);
    $$('.lang button').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));

    $('#searchForm').addEventListener('submit', e => {
      e.preventDefault();
      showResults($('#q').value);
      if (!$('#results').hidden) $('#results').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    });
    $('#clearSearch').addEventListener('click', () => { $('#q').value = ''; showResults(''); $('#q').focus(); });

    const form = $('#ticketForm');
    form.addEventListener('input', e => {
      const n = e.target.name;
      if (['name', 'email', 'category', 'subject', 'description', 'consent'].includes(n) && $('#e_' + n).textContent) validate(form);
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const alert = $('#formAlert');
      alert.hidden = true;
      if (form.elements.company.value) return; // Honeypot
      if (!validate(form)) {
        alert.textContent = t('err.fix'); alert.hidden = false;
        const first = form.querySelector('[aria-invalid="true"]'); if (first) first.focus();
        return;
      }
      const btn = $('#submitBtn');
      btn.disabled = true; btn.textContent = t('f.sending');
      const v = n => form.elements[n].value.trim();
      try {
        const tk = await api.create({
          name: v('name'), email: v('email'), workspace: v('workspace'), category: v('category'),
          priority: (form.querySelector('input[name=priority]:checked') || {}).value || 'normal',
          subject: v('subject'), description: v('description'), source: 'Website'
        });
        current = tk;
        form.hidden = true;
        $('#doneText').textContent = t('ok.text', { id: tk.id });
        $('#doneId').textContent = tk.id;
        $('#ticketDone').hidden = false;
        $('#ticketDone').focus();
      } catch (err) {
        alert.textContent = err.guest || t('err.network'); alert.hidden = false;
      } finally { btn.disabled = false; btn.textContent = t('f.submit'); }
    });
    $('#doneView').addEventListener('click', () => {
      const tk = current;
      $('#t_id').value = tk.id; $('#t_email').value = tk.email;
      openTicket(tk.id, tk.email);
    });
    $('#doneAnother').addEventListener('click', () => {
      form.reset(); buildPriorities(); form.hidden = false; $('#ticketDone').hidden = true; $('#f_name').focus();
    });

    $('#trackForm').addEventListener('submit', e => {
      e.preventDefault();
      const id = $('#t_id').value, email = $('#t_email').value;
      if (!id.trim() || !email.trim()) { const a = $('#trackAlert'); a.textContent = t('err.required'); a.hidden = false; return; }
      openTicket(id, email);
    });
    $('#trackExample').addEventListener('click', () => {
      $('#t_id').value = EXAMPLE.id; $('#t_email').value = EXAMPLE.email;
      openTicket(EXAMPLE.id, EXAMPLE.email);
    });

    setInterval(buildRotaQuiet, 60000);
  }
  function buildRotaQuiet() { // aktualisiert Jetzt-Linie ohne Animation
    const g = $('#rotaGrid'); if (!g) return;
    g.style.setProperty('--quiet', '1');
    buildRota();
    $$('.rota-shift, .rota-now', g).forEach(n => { n.style.animation = 'none'; });
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
