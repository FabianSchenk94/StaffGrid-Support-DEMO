/* StaffGrid Support – Cloudflare Worker (fiktives Demo)
 * Verbindet die Website mit Jira Service Management. Das API-Token bleibt hier geheim.
 *
 * Benötigte Einstellungen im Cloudflare-Dashboard (Settings → Variables and Secrets):
 *   JIRA_EMAIL  (Text)    – E-Mail-Adresse des Atlassian-Kontos
 *   JIRA_TOKEN  (Secret)  – API-Token von id.atlassian.com
 *   AGENT_KEY   (Secret)  – Schlüssel für den KI-Agenten (ElevenLabs), gleicher Wert wie im Agenten-Tool
 * Optional:
 *   ISSUE_TYPE  (Text)    – Name des Vorgangstyps, falls die automatische Wahl nicht passt
 *
 * Aktionen (POST, JSON): create_case, get_case, reply_case
 * Mit gültigem agent_key darf der Agent zusätzlich eine Priorität (p1–p4) als KI-Ersteinschätzung setzen.
 * Prüfung: GET /check  → zeigt, ob Jira erreichbar ist (keine persönlichen Daten)
 */

const VERSION = '2026-10-16.5';
const JIRA_SITE = 'https://staffgrid-support.atlassian.net';
const PROJECT = 'SUP';
const ALLOWED_ORIGINS = [
  'https://fabianschenk94.github.io',
  'http://localhost:8765',
  'http://127.0.0.1:8765'
];
const CATEGORIES = ['sso', 'time', 'plan', 'absence', 'payroll', 'api', 'account'];
const ID_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const ID_RE = /^SG-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;
const PRIO = { highest: 'p1', high: 'p2', medium: 'p3', low: 'p4', lowest: 'p4' };
const PRIO_BY_ID = { '1': 'p1', '2': 'p2', '3': 'p3', '4': 'p4', '5': 'p4' };
const JIRA_PRIO_ID = { p1: '1', p2: '2', p3: '3', p4: '4' };
const PORTAL_PROP = 'staffgrid.portal';

/* ---------- Bremse (pro Worker-Instanz, für ein Demo ausreichend) ---------- */
const hits = new Map();
function limited(ip, kind, max, windowMs) {
  const key = kind + ':' + ip, now = Date.now();
  const list = (hits.get(key) || []).filter(t => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}

/* ---------- Hilfen ---------- */
function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
function reply(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors(origin))
  });
}
const fail = (code, error, origin) => reply({ ok: false, code, error }, code, origin);
const clip = (v, n) => String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, n);

function newCaseId() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  const s = Array.from(b, x => ID_CHARS[x % ID_CHARS.length]).join('');
  return 'SG-' + s.slice(0, 4) + '-' + s.slice(4);
}
function normCaseId(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const core = s.startsWith('SG') ? s.slice(2) : s;
  if (core.length !== 8) return null;
  const id = 'SG-' + core.slice(0, 4) + '-' + core.slice(4);
  return ID_RE.test(id) ? id : null;
}

/* Text ↔ Atlassian Document Format */
function toAdf(text) {
  const paras = String(text).split(/\r?\n/).map(l => l.trimEnd());
  const content = paras.map(l => l
    ? { type: 'paragraph', content: [{ type: 'text', text: l }] }
    : { type: 'paragraph', content: [] });
  return { type: 'doc', version: 1, content: content.length ? content : [{ type: 'paragraph', content: [] }] };
}
function fromAdf(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  const inner = (node.content || []).map(fromAdf).join('');
  const block = ['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote', 'rule'];
  return block.includes(node.type) ? inner + '\n' : inner;
}
const adfText = n => fromAdf(n).replace(/\n{3,}/g, '\n\n').trim();

/* ---------- Jira ---------- */
async function jira(env, method, path, body) {
  const res = await fetch(JIRA_SITE + path, {
    method,
    headers: {
      'Authorization': 'Basic ' + btoa(env.JIRA_EMAIL + ':' + env.JIRA_TOKEN),
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* kein JSON */ }
  if (!res.ok) {
    console.log('Jira', method, path, res.status, text.slice(0, 500));
    const err = new Error('jira ' + res.status);
    err.status = res.status;
    throw err;
  }
  return json;
}

let issueTypeCache = null;
async function issueTypeId(env) {
  if (issueTypeCache) return issueTypeCache;
  const p = await jira(env, 'GET', '/rest/api/3/project/' + PROJECT);
  const types = (p.issueTypes || []).filter(t => !t.subtask);
  const wanted = env.ISSUE_TYPE ? [new RegExp('^' + env.ISSUE_TYPE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i')] : [];
  const prefs = wanted.concat([/service ?request|serviceanfrage|anfrage/i, /support|question|frage/i, /incident|vorfall/i, /task|aufgabe/i]);
  for (const re of prefs) {
    const hit = types.find(t => re.test(t.name.replace(/^\[System\]\s*/, '')));
    if (hit) return (issueTypeCache = hit.id);
  }
  if (!types.length) throw new Error('no issue types');
  return (issueTypeCache = types[0].id);
}

async function findIssue(env, id) {
  const r = await jira(env, 'POST', '/rest/api/3/search/jql', {
    jql: 'project = ' + PROJECT + ' AND labels = "fall-' + id + '"',
    fields: ['summary', 'description', 'status', 'priority', 'labels', 'created', 'updated'],
    maxResults: 1
  });
  return (r && r.issues && r.issues[0]) || null;
}

async function toCase(env, issue, id) {
  const f = issue.fields;
  const cat = (f.labels || []).map(l => (l.match(/^thema-(\w+)$/) || [])[1]).find(Boolean) || 'account';
  const sc = (f.status && f.status.statusCategory && f.status.statusCategory.key) || 'new';
  const sname = (f.status && f.status.name) || '';
  let status = 'open';
  // Nur eindeutige Arbeitsstatus zählen als „In Bearbeitung“; „Waiting for support“ u. Ä. bleibt „Eingegangen“
  if (sc === 'done') status = 'resolved';
  else if (/customer|kunde/i.test(sname)) status = 'waiting';
  else if (/progress|bearbeitung|in arbeit|escalat|eskal|pending|ausstehend|investigat|untersuch|implement|work in/i.test(sname)) status = 'progress';
  // Priorität: Solange der Fall „Eingegangen“ ist, gilt nur eine KI-Ersteinschätzung (Label ki-prio-pX).
  // Danach zählt die Priorität, die der Service Desk in Jira führt.
  const aiPrio = (f.labels || []).map(l => (l.match(/^ki-prio-(p[1-4])$/) || [])[1]).find(Boolean) || '';
  const deskPrio = PRIO_BY_ID[String((f.priority && f.priority.id) || '')] ||
    PRIO[String((f.priority && f.priority.name) || '').toLowerCase()] || '';
  let priority = '', priorityBy = '';
  if (status !== 'open' && deskPrio) { priority = deskPrio; priorityBy = 'desk'; }
  else if (aiPrio) { priority = aiPrio; priorityBy = 'ai'; }

  const events = [
    { who: 'you', text: adfText(f.description), at: f.created },
    { who: 'system', key: 'ev.auto', at: f.created }
  ];
  const cm = await jira(env, 'GET', '/rest/api/3/issue/' + issue.id + '/comment?orderBy=created&maxResults=100&expand=properties');
  for (const c of (cm && cm.comments) || []) {
    const props = c.properties || [];
    const sd = props.find(p => p.key === 'sd.public.comment');
    const internal = c.jsdPublic === false || (sd && sd.value && sd.value.internal === true);
    if (internal) continue;                                   // interne Notizen nie zeigen
    const fromPortal = props.some(p => p.key === PORTAL_PROP);
    const text = adfText(c.body);
    if (text) events.push({ who: fromPortal ? 'you' : 'team', text, at: c.created });
  }
  return { id, category: cat, priority, priorityBy, status, subject: f.summary, created: f.created, updated: f.updated, events };
}

/* ---------- Aktionen ---------- */
async function createCase(env, d, isAgent) {
  const name = clip(d.name, 100), email = clip(d.email, 200), company = clip(d.company, 150);
  const subject = clip(d.subject, 150).replace(/[\r\n]+/g, ' ');
  const description = clip(d.description, 5000);
  const category = CATEGORIES.includes(d.category) ? d.category : null;
  const lang = ['en', 'fr', 'de'].includes(d.lang) ? d.lang : 'en';
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !company || !category || !subject || !description) {
    return { error: 'invalid', code: 400 };
  }
  // Priorität darf nur der Agent setzen (KI-Ersteinschätzung); das Website-Formular nie
  const aiPrio = isAgent && /^p[1-4]$/.test(String(d.priority || '').toLowerCase()) ? String(d.priority).toLowerCase() : '';
  const reason = isAgent ? clip(d.priority_reason, 500) : '';
  const source = isAgent ? (/voice|sprache|call/i.test(String(d.source)) ? 'Adrian Voice' : 'Adrian Chat') : 'Website';

  let id;
  for (let i = 0; i < 5; i++) { id = newCaseId(); if (!(await findIssue(env, id))) break; }

  const labels = ['fall-' + id, 'thema-' + category, isAgent ? 'quelle-agent' : 'quelle-website', 'sprache-' + lang];
  if (aiPrio) labels.push('ki-prio-' + aiPrio);
  const fields = {
    project: { key: PROJECT },
    issuetype: { id: await issueTypeId(env) },
    summary: subject,
    description: toAdf(description),
    labels
  };
  let created;
  if (aiPrio) {
    // Jira-Priorität mitsetzen; erlaubt die Maske das Feld nicht, ohne Priorität anlegen (Label reicht fürs Portal)
    try { created = await jira(env, 'POST', '/rest/api/3/issue', { fields: Object.assign({ priority: { id: JIRA_PRIO_ID[aiPrio] } }, fields) }); }
    catch (e) { if (e.status !== 400) throw e; }
  }
  if (!created) created = await jira(env, 'POST', '/rest/api/3/issue', { fields });

  // Kontaktdaten nur als interne Notiz – erscheinen nie in der Statusansicht
  let note = 'Kontakt (' + (isAgent ? 'aufgenommen vom KI-Agenten Adrian' : 'aus dem Portal') + ')\nFallnummer: ' + id +
    '\nName: ' + name + '\nE-Mail: ' + email + '\nFirma: ' + company + '\nSprache: ' + lang + '\nKanal: ' + source;
  if (aiPrio) note += '\n\nKI-Ersteinschätzung: ' + aiPrio.toUpperCase() + (reason ? '\nBegründung: ' + reason : '') +
    '\nBitte prüfen und in Jira bestätigen oder anpassen.';
  await jira(env, 'POST', '/rest/api/3/issue/' + created.id + '/comment', {
    body: toAdf(note),
    properties: [{ key: 'sd.public.comment', value: { internal: true } }]
  });
  const issue = await findIssueById(env, created.id);
  return { case: await toCase(env, issue, id) };
}
async function findIssueById(env, issueId) {
  return jira(env, 'GET', '/rest/api/3/issue/' + issueId + '?fields=summary,description,status,priority,labels,created,updated');
}
async function getCase(env, d) {
  const id = normCaseId(d.id);
  if (!id) return { error: 'format', code: 400 };
  const issue = await findIssue(env, id);
  if (!issue) return { error: 'not_found', code: 404 };
  return { case: await toCase(env, issue, id) };
}
async function replyCase(env, d) {
  const id = normCaseId(d.id);
  const text = clip(d.text, 3000);
  if (!id || !text) return { error: 'invalid', code: 400 };
  const issue = await findIssue(env, id);
  if (!issue) return { error: 'not_found', code: 404 };
  await jira(env, 'POST', '/rest/api/3/issue/' + issue.id + '/comment', {
    body: toAdf(text),
    properties: [
      { key: 'sd.public.comment', value: { internal: false } },
      { key: PORTAL_PROP, value: { from: 'customer' } }
    ]
  });
  return { case: await toCase(env, await findIssueById(env, issue.id), id) };
}

/* Verbindungstest: zeigt nur, ob Jira und das Projekt erreichbar sind */
async function check(env) {
  const out = { worker: true, version: VERSION, secrets: !!(env.JIRA_EMAIL && env.JIRA_TOKEN), agent_key: !!env.AGENT_KEY };
  if (!out.secrets) return out;
  try { await jira(env, 'GET', '/rest/api/3/myself'); out.jira_login = true; }
  catch (e) { out.jira_login = false; out.jira_status = e.status; return out; }
  try {
    const p = await jira(env, 'GET', '/rest/api/3/project/' + PROJECT);
    out.project = p.key;
    out.issue_types = (p.issueTypes || []).filter(t => !t.subtask).map(t => t.name);
    issueTypeCache = null;
    const tid = await issueTypeId(env);
    out.chosen_type = ((p.issueTypes || []).find(t => t.id === tid) || {}).name;
  } catch (e) { out.project = false; out.project_status = e.status; return out; }
  try {
    const st = await jira(env, 'GET', '/rest/api/3/project/' + PROJECT + '/statuses');
    const names = new Set();
    for (const t of st || []) for (const s of t.statuses || []) names.add(s.name + ' (' + ((s.statusCategory || {}).key || '?') + ')');
    out.statuses = Array.from(names);
  } catch (e) { out.statuses = false; }
  try { await jira(env, 'POST', '/rest/api/3/search/jql', { jql: 'project = ' + PROJECT, maxResults: 1, fields: ['summary'] }); out.search = true; }
  catch (e) { out.search = false; out.search_status = e.status; }
  return out;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method === 'GET' && url.pathname === '/check') return reply(await check(env), 200, origin);
    if (request.method !== 'POST') return fail(405, 'method', origin);
    if (origin && !ALLOWED_ORIGINS.includes(origin)) return fail(403, 'origin', origin);
    if (!env.JIRA_EMAIL || !env.JIRA_TOKEN) return fail(500, 'not_configured', origin);

    let d;
    try { d = await request.json(); } catch (e) { return fail(400, 'json', origin); }
    if (!d || typeof d !== 'object') return fail(400, 'json', origin);

    // Agent (ElevenLabs) erkennt sich am geheimen Schlüssel; er teilt sich IP-Adressen mit anderen Kunden,
    // daher eigene, gemeinsame Bremse statt der IP-Bremse
    const isAgent = !!(env.AGENT_KEY && typeof d.agent_key === 'string' && d.agent_key === env.AGENT_KEY);
    if (d.agent_key && !isAgent) return fail(403, 'agent_key', origin);
    const ip = isAgent ? 'agent' : (request.headers.get('CF-Connecting-IP') || 'unknown');
    const f = isAgent ? 4 : 1;   // Agent darf etwas mehr
    if (limited(ip, 'all', 30 * f, 60000)) return fail(429, 'slow_down', origin);

    try {
      let r;
      if (d.action === 'create_case') {
        if (limited(ip, 'create', 5 * f, 600000)) return fail(429, 'slow_down', origin);
        r = await createCase(env, d, isAgent);
      } else if (d.action === 'get_case') {
        if (limited(ip, 'get', 10 * f, 60000)) return fail(429, 'slow_down', origin);
        r = await getCase(env, d);
      } else if (d.action === 'reply_case') {
        if (limited(ip, 'reply', 10 * f, 600000)) return fail(429, 'slow_down', origin);
        r = await replyCase(env, d);
      } else return fail(400, 'action', origin);
      if (r.error) return fail(r.code, r.error, origin);
      return reply({ ok: true, case: r.case }, 200, origin);
    } catch (e) {
      console.log('Fehler', e && e.message);
      return fail(502, 'backend', origin);
    }
  }
};
