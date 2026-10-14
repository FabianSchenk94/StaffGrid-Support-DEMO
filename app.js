/* StaffGrid Support – Logik (fiktives Demo)
 * Ohne Backend werden Fälle im Browser gespeichert (localStorage).
 * Sobald SG_CONFIG.apiUrl gesetzt ist, gehen alle Aufrufe per POST an das Backend
 * (Cloudflare Worker vor Jira Service Management). */
(function () {
  'use strict';

  const SG_CONFIG = {
    apiUrl: ''   // später: https://<worker>.<subdomain>.workers.dev
  };

  const T = window.SG_TEXT, ARTICLES = window.SG_ARTICLES, CATS = window.SG_CATEGORIES;
  const LANGS = ['en', 'fr', 'de'];
  const LOCALE = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE' };
  const TZ = 'Europe/Berlin';
  const PRIOS = [
    { id: 'p1', c: '#A8432C' }, { id: 'p2', c: '#E9A93B' },
    { id: 'p3', c: '#1F5A4E' }, { id: 'p4', c: '#9AA6A2' }
  ];
  // Servicezeiten (Mo=0 … So=6) in Europe/Berlin; null = geschlossen
  const HOURS = [[7, 20], [7, 20], [7, 20], [7, 20], [7, 20], [8, 14], null];
  const STORE = 'sg_cases_v1';
  const EXAMPLE_ID = 'SG-4X7Q-9MKD';
  const ID_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // ohne 0/O, 1/I/L

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- Sprache ---------- */
  let lang = pickLang();
  function pickLang() {
    try { const s = localStorage.getItem('sg_lang'); if (LANGS.includes(s)) return s; } catch (e) {}
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
    try { localStorage.setItem('sg_lang', l); } catch (e) {}
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
    buildProduct();
  }

  /* ---------- Hilfen ---------- */
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
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

  /* ---------- Fallnummern ---------- */
  function newCaseId() {
    const buf = new Uint32Array(8);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    const c = Array.from(buf, x => ID_CHARS[x % ID_CHARS.length]).join('');
    return 'SG-' + c.slice(0, 4) + '-' + c.slice(4);
  }
  // Eingabe tolerant normalisieren: Kleinbuchstaben, Leerzeichen, fehlende Bindestriche
  function normCaseId(raw) {
    const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^SG(?=.{8}$)/, '');
    if (s.length !== 8) return null;
    if (!/^[2-9A-HJKMNP-Z]{8}$/.test(s)) return null;
    return 'SG-' + s.slice(0, 4) + '-' + s.slice(4);
  }

  /* ---------- Servicezeiten ---------- */
  function berlinNow() {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const get = k => parts.find(p => p.type === k).value;
    const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'));
    return { day, h: +get('hour') + (+get('minute')) / 60 };
  }
  const pad = h => String(h).padStart(2, '0') + ':00';
  function buildRota(quiet) {
    const grid = $('#rotaGrid'); if (!grid) return;
    const days = t('rota.days'), now = berlinNow();
    grid.textContent = '';
    HOURS.forEach((span, i) => {
      const track = el('div', { class: 'rota-track' });
      if (span) track.append(el('span', { class: 'rota-shift', style: `left:${span[0] / 24 * 100}%;width:${(span[1] - span[0]) / 24 * 100}%;--i:${i}` }));
      else track.append(el('span', { class: 'rota-closed' }, t('rota.closed')));
      grid.append(el('div', { class: 'rota-day' + (i === now.day ? ' today' : '') }, days[i]), track);
    });
    grid.append(el('div'), el('div', { class: 'rota-axis' }, ['00', '06', '12', '18', '24'].map(x => el('span', null, x))));
    grid.append(el('div', { class: 'rota-now', style: `left:calc(2.6rem + (100% - 2.6rem) * ${now.h / 24})` }, el('span', null, t('rota.now'))));
    if (quiet) $$('.rota-shift, .rota-now', grid).forEach(n => { n.style.animation = 'none'; });

    const span = HOURS[now.day];
    const online = !!span && now.h >= span[0] && now.h < span[1];
    $('#rotaState').classList.toggle('off', !online);
    if (online) { $('#rotaStateText').textContent = t('rota.online'); }
    else {
      let d = now.day;
      for (let k = 0; k < 8; k++) {
        const s = HOURS[d];
        if (s && !(k === 0 && now.h >= s[0])) break;
        d = (d + 1) % 7;
      }
      const label = d === now.day ? pad(HOURS[d][0]) : `${days[d]} ${pad(HOURS[d][0])}`;
      $('#rotaStateText').textContent = t('rota.offline', { time: label });
    }
    $('#rotaHours').textContent = `${days[0]}–${days[4]} 07:00–20:00, ${days[5]} 08:00–14:00. ${t('rota.tz')}.`;
  }

  /* ---------- Produktblock mit App-Ansicht ---------- */
  // Schichtmuster: e=Früh, l=Spät, n=Nacht, a=abwesend, -=frei
  const MOCK = [
    ['J. Weber',  'e e e e e - -'],
    ['M. Öztürk', 'l l l l l - -'],
    ['L. Martin', 'n n n - - n n'],
    ['S. Novak',  'e e a a a - -'],
    ['T. Berg',   '- l l l l l -'],
    ['A. Rossi',  'e e e e - e -']
  ];
  const COVER = [92, 96, 84, 88, 90, 64, 58];
  function buildProduct() {
    const g = $('#mockGrid'); if (!g) return;
    const days = t('rota.days');
    $('#mockTitle').textContent = t('mock.title');
    const legend = $('#mockLegend'); legend.textContent = '';
    ['early', 'late', 'night', 'absent'].forEach(k => legend.append(el('span', { class: 'lg ' + k }, t('mock.legend.' + k))));
    g.textContent = '';
    g.append(el('span', { class: 'mg-h' }));
    days.forEach(d => g.append(el('span', { class: 'mg-h' }, d)));
    const map = { e: 'early', l: 'late', n: 'night', a: 'absent' };
    MOCK.forEach(([name, pat]) => {
      g.append(el('span', { class: 'mg-name' }, name));
      pat.split(' ').forEach(c => g.append(el('span', { class: 'mg-cell' }, map[c] ? el('i', { class: map[c] }) : null)));
    });
    g.append(el('span', { class: 'mg-name mg-cover' }, t('mock.cover')));
    COVER.forEach(v => g.append(el('span', { class: 'mg-cell mg-bar' }, el('b', { style: `height:${v}%`, class: v < 70 ? 'low' : '' }))));

    const dl = $('#modules'); dl.textContent = '';
    ['time', 'plan', 'absence', 'payroll', 'api'].forEach(m =>
      dl.append(el('div', { class: 'module' }, el('dt', null, t('mod.' + m)), el('dd', null, t('mod.' + m + '.d')))));
  }

  /* ---------- Wissensdatenbank ---------- */
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
      el('p', { class: 'crumb' }, t('cat.' + a.cat)),
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
    ['web', 'mobile', 'terminal', 'plan', 'payroll', 'api'].forEach(c =>
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
    const box = $('#prioList'), cur = (box.querySelector('input:checked') || {}).value || 'p3';
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
    return [
      setErr('name', v('name').length < 2 ? 'err.required' : ''),
      setErr('email', !v('email') ? 'err.required' : (!EMAIL_RE.test(v('email')) ? 'err.email' : '')),
      setErr('company', v('company').length < 2 ? 'err.required' : ''),
      setErr('category', !v('category') ? 'err.required' : ''),
      setErr('subject', v('subject').length < 3 ? 'err.required' : ''),
      setErr('description', !v('description') ? 'err.required' : (v('description').length < 20 ? 'err.short' : '')),
      setErr('consent', f.elements.consent.checked ? '' : 'err.consent')
    ].every(Boolean);
  }

  /* ---------- Datenzugriff: Backend oder lokaler Demo-Speicher ---------- */
  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch (e) { return []; } }
  function save(list) { try { localStorage.setItem(STORE, JSON.stringify(list)); } catch (e) {} }
  let exampleCase = null;
  function getExample() {
    if (exampleCase) return exampleCase;
    const day = 864e5, base = Date.now();
    const at = (d, h) => new Date(base - d * day + h * 36e5).toISOString();
    exampleCase = {
      id: EXAMPLE_ID, category: 'payroll', priority: 'p2', status: 'resolved', subjectKey: 'seed.subject',
      created: at(6, 0), updated: at(5, 3),
      events: [
        { who: 'you', key: 'seed.msg1', at: at(6, 0) },
        { who: 'system', key: 'ev.auto', at: at(6, 0.01) },
        { who: 'team', key: 'seed.reply1', at: at(6, 1.2) },
        { who: 'you', key: 'seed.msg2', at: at(5, 2.9) },
        { who: 'note', key: 'seed.done', at: at(5, 3) }
      ]
    };
    return exampleCase;
  }
  // Öffentliche Sicht: keine Namen, keine E-Mail-Adressen
  const publicView = c => c && ({ id: c.id, category: c.category, priority: c.priority, status: c.status,
    subject: c.subject, subjectKey: c.subjectKey, created: c.created, updated: c.updated, events: c.events });

  // Abfrage-Bremse im Browser (das Backend bremst später zusätzlich serverseitig)
  const lookups = [];
  function tooManyLookups() {
    const now = Date.now();
    while (lookups.length && now - lookups[0] > 60000) lookups.shift();
    lookups.push(now);
    return lookups.length > 10;
  }

  async function post(action, data) {
    const res = await fetch(SG_CONFIG.apiUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action, lang }, data))
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) { const e = new Error(json.error || 'error'); e.code = json.code || res.status; throw e; }
    return json;
  }
  const api = {
    async create(d) {
      if (SG_CONFIG.apiUrl) return (await post('create_case', d)).case;
      const now = new Date().toISOString(), list = load();
      let id; do { id = newCaseId(); } while (list.some(x => x.id === id) || id === EXAMPLE_ID);
      const c = { id, name: d.name, email: d.email, company: d.company, tenant: d.tenant,
        category: d.category, priority: d.priority, subject: d.subject, status: 'open', created: now, updated: now,
        events: [{ who: 'you', text: d.description, at: now }, { who: 'system', key: 'ev.auto', at: now }] };
      list.push(c); save(list);
      return publicView(c);
    },
    async get(id) {
      if (SG_CONFIG.apiUrl) return (await post('get_case', { id })).case;
      if (id === EXAMPLE_ID) return getExample();
      return publicView(load().find(x => x.id === id)) || null;
    },
    async reply(id, text) {
      if (SG_CONFIG.apiUrl) return (await post('reply_case', { id, text })).case;
      const now = new Date().toISOString();
      if (id === EXAMPLE_ID) { const c = getExample(); c.events.push({ who: 'you', text, at: now }); c.status = 'open'; c.updated = now; return c; }
      const list = load(), c = list.find(x => x.id === id);
      if (!c) return null;
      c.events.push({ who: 'you', text, at: now }); c.status = 'open'; c.updated = now;
      save(list); return publicView(c);
    }
  };

  /* ---------- Fall anzeigen ---------- */
  let current = null;
  const STATUS_CLASS = { open: '', progress: '', waiting: 'waiting', resolved: 'resolved' };
  function renderCase() {
    const c = current, box = $('#ticketView');
    box.textContent = '';
    if (!c) { box.hidden = true; $('#trackLookup').hidden = false; return; }
    const subject = c.subjectKey ? t(c.subjectKey) : c.subject;
    const who = { you: t('t.you'), team: t('t.team'), system: t('t.system'), note: t('t.team') };
    const replyArea = el('textarea', { id: 'r_text', rows: '4', maxlength: '3000', 'aria-describedby': 'r_hint' });
    const replyErr = el('p', { class: 'err', 'aria-live': 'polite' });
    const sendBtn = el('button', { type: 'submit', class: 'btn' }, t('t.reply.btn'));
    box.append(
      el('div', { class: 't-top' },
        el('span', { class: 't-id' }, c.id),
        el('span', { class: 'chip ' + (STATUS_CLASS[c.status] || '') }, t('s.' + c.status))),
      el('h1', null, subject),
      el('dl', { class: 't-meta' },
        el('div', null, el('dt', null, t('t.category')), el('dd', null, t('cat.' + c.category))),
        el('div', null, el('dt', null, t('t.priority')), el('dd', null, t('p.' + c.priority))),
        el('div', null, el('dt', null, t('t.created')), el('dd', null, fmtDate(c.created))),
        el('div', null, el('dt', null, t('t.updated')), el('dd', null, fmtDateTime(c.updated)))),
      el('p', { class: 'hint t-privacy' }, t('t.privacy')),
      el('section', { class: 't-history' },
        el('h2', null, t('t.history')),
        el('ol', { class: 'events' }, c.events.map(e => el('li', { class: 'ev ' + e.who },
          el('div', { class: 'ev-head' }, el('span', { class: 'ev-who' }, who[e.who] || e.who), el('time', { class: 'ev-time', datetime: e.at }, fmtDateTime(e.at))),
          el('div', { class: 'ev-body' }, e.key ? t(e.key) : e.text))))),
      el('form', { class: 'reply', novalidate: true, onsubmit: async ev => {
        ev.preventDefault();
        const text = replyArea.value.trim();
        if (!text) { replyErr.textContent = t('t.reply.empty'); replyArea.setAttribute('aria-invalid', 'true'); replyArea.focus(); return; }
        sendBtn.disabled = true;
        try {
          const c2 = await api.reply(c.id, text);
          if (c2) { current = c2; renderCase(); toast(t('t.reply.ok')); }
        } catch (e) { replyErr.textContent = t('err.network'); }
        finally { sendBtn.disabled = false; }
      } },
        el('label', { for: 'r_text' }, el('strong', null, t('t.reply'))),
        replyArea,
        el('p', { class: 'hint', id: 'r_hint' }, t('t.reply.h')),
        replyErr, sendBtn),
      el('p', { class: 't-actions' }, el('button', { type: 'button', class: 'link', onclick: () => { current = null; renderCase(); $('#t_id').value = ''; $('#t_id').focus(); } }, t('track.another')))
    );
    $('#trackLookup').hidden = true;
    box.hidden = false;
  }
  async function openCase(raw) {
    const alert = $('#trackAlert');
    alert.hidden = true;
    const id = normCaseId(raw);
    if (!id) { alert.textContent = t('track.format'); alert.hidden = false; $('#t_id').focus(); return false; }
    if (tooManyLookups()) { alert.textContent = t('track.slow'); alert.hidden = false; return false; }
    try {
      const c = await api.get(id);
      if (!c) { alert.textContent = t('track.notfound'); alert.hidden = false; return false; }
      current = c;
      if (location.hash !== '#/track') location.hash = '#/track';
      renderCase();
      window.scrollTo(0, 0);
      return true;
    } catch (e) {
      alert.textContent = e.code === 429 ? t('track.slow') : (e.code === 404 ? t('track.notfound') : t('err.network'));
      alert.hidden = false; return false;
    }
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
    if (r.view === 'track') renderCase();
    const key = r.view + (r.id || '');
    if (lastView !== null && lastView !== key) {
      window.scrollTo(0, 0);
      if (r.view !== 'help') $('#main').focus({ preventScroll: true });
    }
    lastView = key;
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
      if (['name', 'email', 'company', 'category', 'subject', 'description', 'consent'].includes(n) && $('#e_' + n).textContent) validate(form);
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const alert = $('#formAlert');
      alert.hidden = true;
      if (form.elements.website.value) return; // Honeypot
      if (!validate(form)) {
        alert.textContent = t('err.fix'); alert.hidden = false;
        const first = form.querySelector('[aria-invalid="true"]'); if (first) first.focus();
        return;
      }
      const btn = $('#submitBtn');
      btn.disabled = true; btn.textContent = t('f.sending');
      const v = n => form.elements[n].value.trim();
      try {
        const c = await api.create({
          name: v('name'), email: v('email'), company: v('company'), tenant: v('tenant'), category: v('category'),
          priority: (form.querySelector('input[name=priority]:checked') || {}).value || 'p3',
          subject: v('subject'), description: v('description'), source: 'Website'
        });
        current = c;
        form.hidden = true;
        $('#doneId').textContent = c.id;
        $('#doneText').textContent = t('ok.text');
        $('#ticketDone').hidden = false;
        $('#ticketDone').focus();
      } catch (err) {
        alert.textContent = t('err.network'); alert.hidden = false;
      } finally { btn.disabled = false; btn.textContent = t('f.submit'); }
    });
    $('#doneView').addEventListener('click', () => { $('#t_id').value = current.id; openCase(current.id); });
    $('#doneCopy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(current.id); toast(t('ok.copied')); }
      catch (e) { const r = document.createRange(); r.selectNodeContents($('#doneId')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    });
    $('#doneAnother').addEventListener('click', () => {
      form.reset(); buildPriorities(); form.hidden = false; $('#ticketDone').hidden = true; $('#f_name').focus();
    });

    $('#trackForm').addEventListener('submit', e => { e.preventDefault(); openCase($('#t_id').value); });
    $('#trackExample').addEventListener('click', () => { $('#t_id').value = EXAMPLE_ID; openCase(EXAMPLE_ID); });

    setInterval(() => buildRota(true), 60000);
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
