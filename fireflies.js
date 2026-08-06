/* ════════════════════════════════════════════════════
   Shared workspace + Fireflies helpers
   ────────────────────────────────────────────────────
   Loaded by login.html (sign-in), index.html (Overview)
   and meetings.html (Meetings). They need the same
   session handling and the same Fireflies parsing, so
   it lives here once instead of being copied into each.

   Classic script, no module: every top-level binding
   below is a global the including page can use. Load
   this BEFORE the page's own script.
   ════════════════════════════════════════════════════ */

/* ── Config ──────────────────────────────────────────
   LOGIN_URL     POST { email, password }              → { token, email }
   WEBHOOK_URL   POST Bearer + { meetingLink, title }  → sends Fireflies
   MEETINGS_URL  GET  Bearer                           → that user's sheet rows
   LINK_URL      POST Bearer + { meetId }              → a fresh recording URL

   Sheet columns:
   Meet Id | Meet Name | MeetDate | Meet link | Gist |
   ShortSummary | Overview | BulletGist | ActionItems | Full Summary

   ⚠ "Meet link" is a Fireflies-signed URL that EXPIRES. Treat it as a
     flag meaning "a recording exists" — never as an href. To open a
     recording, POST its Meet Id to LINK_URL and use the URL that comes
     back (openRecording, at the bottom of this file). A link baked into
     the page at render time is already dead by the time it is clicked. */
const LOGIN_URL     = "https://n8n.moveneticsdigital.com/webhook/fireflies-login";
const WEBHOOK_URL   = "https://n8n.moveneticsdigital.com/webhook/firefilescall";
const MEETINGS_URL  = "https://n8n.moveneticsdigital.com/webhook/fireflies-meetings";
const LINK_URL      = "https://n8n.moveneticsdigital.com/webhook/fireflies-meeting-link";
const SESSION_KEY   = "fireflies.session";
const SUPPORT_EMAIL = "moutasim.qazi@moveneticsdigital.com";

/* Same-origin PHP backend (pm-backend-php/), deployed as a subfolder
   of this same site — no CORS to worry about. */
const PM_API_BASE = "https://management.moveneticsdigital.com/pm-backend-php/";

/* DB-backed login for HR / Marketing / QA / Employee accounts — n8n's
   LOGIN_URL above is tried first (unchanged, for the 6 existing
   managers); this is only reached when that login rejects the
   email/password, i.e. for accounts n8n has never heard of. */
const PM_LOGIN_URL = PM_API_BASE + "pm-login.php";

/* ── Small helpers ───────────────────────────────────── */
function esc(s){
  return String(s == null ? '' : s)
    .replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
}

function fmtDate(v){
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString('en-IN', {
    day:'numeric', month:'short', year:'numeric', hour:'numeric', minute:'2-digit'
  });
}

function fmtDay(v){
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-IN', {
    day:'numeric', month:'short', year:'numeric'
  });
}

function setStatus(el, kind, msg){
  el.className = 'status ' + kind;
  el.innerHTML = kind ? '<span class="dot"></span><span>' + msg + '</span>' : '';
}

/* ── Role names ──────────────────────────────────────
   MANAGER is what the database stores; the team calls them business
   analysts, so that is what every screen says. The stored value is left
   alone deliberately — renaming it would mean a migration plus every
   token, endpoint and role check moving in lockstep, for nothing the
   user would see. The top-bar badge uses the short form, because
   "Business Analyst" does not fit beside the name and Sign out. */
const ROLE_LABELS = {
  ADMIN:'Admin', MANAGER:'Business Analyst', HR:'HR',
  MARKETING:'Marketing', QA:'QA', DESIGNER:'Designer', EMPLOYEE:'Developer'
};
const ROLE_BADGES = { MANAGER:'BA' };

function roleLabel(role){
  const r = String(role || '').toUpperCase();
  return ROLE_LABELS[r] ||
    r.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function roleBadgeLabel(role){
  const r = String(role || '').toUpperCase();
  return ROLE_BADGES[r] || roleLabel(r);
}

/* Where a signed-in account lands: ADMIN/MANAGER stay on the Overview /
   Meetings pages, every other role gets its own dedicated page. */
function roleHome(role){
  const r = String(role || '').toUpperCase();
  if (r === 'HR') return 'hr.html';
  if (r === 'MARKETING') return 'marketing.html';
  if (r === 'QA') return 'qa.html';
  if (r === 'DESIGNER') return 'designers.html';
  if (r === 'EMPLOYEE') return 'employee.html';
  return null;
}

/* ── Session storage ─────────────────────────────────── */
function readSession(){
  for (const store of [localStorage, sessionStorage]) {
    try {
      const raw = store.getItem(SESSION_KEY);
      if (!raw) continue;
      const s = JSON.parse(raw);
      if (s && s.token) return s;
    } catch (_) {}
    store.removeItem(SESSION_KEY);
  }
  return null;
}

function writeSession(session, remember){
  clearSession();
  (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession(){
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

/* ── Chrome: toasts, the user chip, double-submit ────── */
/* Non-blocking notification, replacing alert(). Sticky toasts stay until
   dismissed — used for generated passwords, which need time to copy. */
function toast(msg, kind, sticky){
  let host = document.getElementById('toastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toastHost';
    host.className = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || 'info');
  const msgEl = document.createElement('span');
  msgEl.className = 'tmsg';
  msgEl.textContent = msg;              // textContent, so messages can't inject markup
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'tclose'; btn.textContent = '×';
  btn.setAttribute('aria-label', 'Dismiss');
  const close = () => { el.classList.add('leaving'); setTimeout(() => el.remove(), 200); };
  btn.addEventListener('click', close);
  el.appendChild(msgEl); el.appendChild(btn);
  host.appendChild(el);
  if (!sticky) setTimeout(close, kind === 'err' ? 6500 : 4000);
}

/* Double-submit guard. None of the create forms disabled their submit
   button while the request was in flight, so an impatient double-click
   created two projects / tasks / employees. Capture-phase so it applies
   to every form without touching each handler; re-enables when the
   handler resets the form (the success path) or after a timeout. */
document.addEventListener('submit', (e) => {
  const form = e.target;
  if (!(form instanceof HTMLFormElement)) return;
  const btn = form.querySelector('button[type="submit"]') ||
              form.querySelector('button:not([type="button"])');
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  let timer;
  const release = () => {
    btn.disabled = false;
    clearTimeout(timer);
    form.removeEventListener('reset', release);
  };
  timer = setTimeout(release, 6000);
  form.addEventListener('reset', release);
}, true);

/* The bar showed the full address truncated mid-domain, which cost ~150px
   and told you nothing. Show initial + handle; full address on hover. */
function renderUserChip(el, email){
  const addr = email || '';
  const handle = addr.split('@')[0] || '';
  const parts = handle.split(/[._-]+/).filter(Boolean);
  // "yusuf.shaikh" -> "Yusuf Shaikh" / "YS". Showing the raw handle next
  // to its own first letter read as a stutter ("yyusuf.shaikh").
  const name = parts.length
    ? parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
    : 'Signed in';
  const initials = (parts.length > 1 ? parts[0][0] + parts[1][0]
                                     : (parts[0] || '?').slice(0, 2)).toUpperCase();
  el.title = addr;
  el.innerHTML = '';
  const av = document.createElement('span');
  av.className = 'uavatar'; av.textContent = initials;
  const nm = document.createElement('span');
  nm.className = 'uname'; nm.textContent = name;
  el.appendChild(av); el.appendChild(nm);
}

/* ── Fireflies text parsing ──────────────────────────── */
// Split a text blob into clean bullet lines ("-", "•", "*", "1." prefixes, newlines)
function toList(v){
  if (!v) return [];
  return String(v)
    .replace(/\\n/g, '\n')
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*(?:[-•*▪]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

// If a text blob is essentially a bullet list, return its clean lines; else null
function bulletsFrom(value){
  const lines = String(value).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const bullets = lines.filter(l => /^(?:[-•▪]|\*\s|\d+[.)])\s*/.test(l));
  if (bullets.length < Math.max(2, lines.length - 1)) return null;
  return lines
    .map(l => l.replace(/^(?:[-•▪]|\d+[.)])\s*/, '').replace(/\*\*/g, '').trim())
    .filter(Boolean);
}

/* Parse a Fireflies ActionItems blob into groups per assignee.
   Handles "**Name**" headers, "Name:" headers, markdown bold,
   and trailing "(12:34)" timestamps. */
function parseActionItems(v){
  const groups = [];
  let current = null;
  toList(v).forEach(raw => {
    const boldHead = raw.match(/^\*{1,2}\s*(.+?)\s*\*{1,2}:?$/);
    const clean = raw
      .replace(/\*\*/g, '')
      .replace(/\s*\(?\b\d{1,2}:\d{2}(?::\d{2})?\)?\s*$/, '')
      .trim();
    const colonHead = !boldHead && /^[^:]{2,40}:$/.test(clean) &&
      clean.split(/\s+/).length <= 5;
    if (boldHead || colonHead) {
      const name = (boldHead ? boldHead[1].replace(/:$/, '') : clean.slice(0, -1)).trim();
      current = { name, items: [] };
      groups.push(current);
      return;
    }
    if (!clean) return;
    if (!current) { current = { name: '', items: [] }; groups.push(current); }
    current.items.push(clean);
  });
  return groups.filter(g => g.items.length);
}

// true if the meeting happened within the last 24 hours
function isRecent(v){
  if (!v) return false;
  const d = new Date(v);
  if (isNaN(d.getTime())) return false;
  const age = Date.now() - d.getTime();
  return age >= 0 && age <= 24 * 60 * 60 * 1000;
}

/* ── Auto-translate to English ──────────────────────
   Sheet text can arrive in any language; elements marked
   with [data-tr] are checked for non-Latin script and
   translated to English via Google Translate. Results
   are cached so nothing is translated twice. */
const trCache = new Map();
const NON_LATIN = /[Ѐ-ӿ԰-֏֐-׿؀-ۿ܀-ݏऀ-෿฀-๿຀-໿က-႟぀-ヿ㐀-鿿가-힯]/;

// Break long text into <=1500-char chunks on sentence/newline boundaries
function chunkText(text, max){
  if (text.length <= max) return [text];
  const parts = text.split(/(?<=[.!?।؟\n])\s+/);
  const chunks = [];
  let cur = '';
  parts.forEach(p => {
    if ((cur + ' ' + p).length > max && cur) { chunks.push(cur); cur = p; }
    else cur = cur ? cur + ' ' + p : p;
  });
  if (cur) chunks.push(cur);
  return chunks;
}

async function gtxTranslate(text){
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=' +
    encodeURIComponent(text);
  const res = await fetch(url);
  if (!res.ok) throw new Error('translate ' + res.status);
  const data = await res.json();
  return (data && data[0])
    ? data[0].map(seg => (seg && seg[0]) ? seg[0] : '').join('')
    : text;
}

async function translateText(text){
  if (trCache.has(text)) return trCache.get(text);
  try {
    const chunks = chunkText(text, 1500);
    const out = [];
    for (const c of chunks) out.push(await gtxTranslate(c));
    const joined = out.join(' ');
    trCache.set(text, joined);
    return joined;
  } catch (_) {
    return text;   // fall back to the original text on any failure
  }
}

function translateWithin(root){
  if (!root) return;
  root.querySelectorAll('[data-tr]').forEach(async (el) => {
    const original = el.textContent;
    if (!original || !NON_LATIN.test(original)) return;
    const translated = await translateText(original);
    if (el.textContent === original) el.textContent = translated;
  });
}

/* ── Meetings: fetch + the shared table ──────────────── */
/* Throws with .unauthorized set so the caller can decide whether to sign
   the user out (index.html) or bounce to the signed-out view (meetings). */
async function fetchMeetings(token){
  const res = await fetch(MEETINGS_URL, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (res.status === 401 || res.status === 403) {
    const err = new Error('unauthorized');
    err.unauthorized = true;
    throw err;
  }
  if (!res.ok) throw new Error('status ' + res.status);
  const data = await res.json().catch(() => []);
  const list = Array.isArray(data) ? data : (data.meetings || []);
  list.sort((a, b) => new Date(b.MeetDate || 0) - new Date(a.MeetDate || 0));
  return list;
}

/* A meeting is addressed by its Fireflies id rather than its position in
   the list, so a link from the dashboard still opens the right meeting
   after a new call has been recorded and shifted every index. */
function meetingKey(m, idx){
  const id = m && m['Meet Id'];
  return id ? 'id:' + encodeURIComponent(String(id)) : 'i:' + idx;
}

function findMeeting(list, key){
  if (!key) return null;
  if (key.indexOf('id:') === 0) {
    const id = decodeURIComponent(key.slice(3));
    return list.find(m => String(m['Meet Id']) === id) || null;
  }
  const idx = Number(key.indexOf('i:') === 0 ? key.slice(2) : key);
  return list[idx] || null;   // plain numbers still work, for old bookmarks
}

/* The Fireflies "Meet Id" is a long opaque string that ate a whole
   column without telling anyone anything — it stays on the detail page
   only. The gist is capped by .tsub's clamp so one long summary can't
   stretch a row to full-screen height. */
function meetingsTable(rows, hrefFor){
  return '<div class="table-wrap"><table class="data-table"><thead><tr>' +
    '<th>Meeting</th><th>Date</th><th>Summary</th><th></th>' +
    '</tr></thead><tbody>' +
    rows.map(m => meetingRow(m, hrefFor(m))).join('') +
    '</tbody></table></div>';
}

function meetingRow(m, href){
  const name = esc(m['Meet Name'] || 'Untitled meeting');
  const date = esc(fmtDate(m.MeetDate));
  const gist = esc(m.ShortSummary || m.Gist || '');
  const id   = m['Meet Id'];
  /* "Meet link" is read as a boolean — a recording exists — and the id is
     what actually opens it; without an id there is nothing to look up.
     Deliberately no href: an anchor without one is not a link, so a click
     cannot navigate to the expired URL even if the script fails. */
  const rec  = (m['Meet link'] && id)
    ? '<a class="rec" role="button" tabindex="0" data-recording="' + esc(id) + '">▶ Recording</a>'
    : '';
  return '<tr class="clickable" data-href="' + esc(href) + '">' +
    '<td><div class="ttitle" data-tr>' + name + '</div></td>' +
    '<td class="nowrap">' + (date || '—') + '</td>' +
    '<td>' + (gist ? '<span class="tsub" data-tr>' + gist + '</span>' : '—') + '</td>' +
    '<td class="actions-cell">' + rec + '</td>' +
  '</tr>';
}

function wireMeetingRowClicks(root){
  root.querySelectorAll('tr[data-href]').forEach(tr => {
    tr.addEventListener('click', (e) => {
      // The recording chip opens a tab of its own. This listener sits on an
      // ancestor, so it runs first — it has to step aside itself.
      if (e.target.closest('[data-recording]')) return;
      location.href = tr.dataset.href;
    });
  });
}

/* ── Opening a recording ─────────────────────────────
   The stored link is signed and short-lived, so a recording is opened by
   asking the backend for a fresh URL at click time. The list row and the
   detail hero both render a plain <a> carrying data-recording="<Meet Id>"
   and no href; the delegated handlers at the bottom do the rest, on every
   page that loads this file.

   This navigates the current tab rather than opening a new one. Opening a
   tab meant opening it blank up front — before the await, or the pop-up
   blocker eats it — which put an about:blank in front of the user for the
   length of the round-trip, took the focus with it, and left any error
   message toasting away on a tab nobody was looking at. Going in place
   costs a Back press and removes all of that. */

/* Most pages show "signed out" their own way — meetings.html has its own
   panel, for one — so a page can override this. The default sends you to
   the sign-in page with a note saying why you ended up back there. */
let onSessionExpired = function(){ clearSession(); location.href = 'login.html?m=expired'; };

async function openRecording(meetId, trigger){
  if (!meetId) return;
  if (trigger && trigger.classList.contains('is-busy')) return;   // already in flight

  const session = readSession();
  if (!session) { clearSession(); onSessionExpired(); return; }

  const label = trigger ? trigger.innerHTML : '';
  if (trigger) {
    trigger.classList.add('is-busy');
    trigger.setAttribute('aria-busy', 'true');
    trigger.innerHTML = '⏳ Getting link…';
  }

  try {
    const res = await fetch(LINK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.token
      },
      body: JSON.stringify({ meetId: String(meetId) })
    });

    // Same as loadMeetings: an expired token signs you out rather than
    // showing an error you can do nothing about.
    if (res.status === 401 || res.status === 403) {
      clearSession();
      onSessionExpired();
      return;
    }
    if (!res.ok) throw new Error('the link service responded with ' + res.status);

    const url = recordingUrlFrom(await res.text());
    if (!url) throw new Error('Fireflies has no recording for this meeting');

    location.href = url;
  } catch (err) {
    toast("Couldn't open the recording: " + err.message, 'err');
  } finally {
    if (trigger) {
      trigger.classList.remove('is-busy');
      trigger.removeAttribute('aria-busy');
      trigger.innerHTML = label;
    }
  }
}

/* The contract is { url } and nothing else. Reading any other key would
   defeat the whole point: if the workflow ever passes the meeting row
   through, "Meet link" is sitting right there — the expired URL this
   function exists to avoid — and opening it would look like success.
   Better to fail loudly. The array unwrap is for n8n's habit of
   responding with all incoming items rather than a bare object. */
function recordingUrlFrom(body){
  const str = String(body || '').trim();
  if (str[0] !== '{' && str[0] !== '[') return '';
  let o;
  try { o = JSON.parse(str); } catch (_) { return ''; }
  if (Array.isArray(o)) o = o[0];
  const url = String((o && o.url) || '').trim();
  return /^https?:\/\//i.test(url) ? url : '';   // never a javascript: URL
}

/* Delegated, on document: the list and the detail view each rebuild their
   whole innerHTML on every refresh, so per-element handlers would be
   thrown away along with the markup they were bound to. */
document.addEventListener('click', (e) => {
  const t = e.target.closest && e.target.closest('[data-recording]');
  if (!t) return;
  e.preventDefault();
  openRecording(t.dataset.recording, t);
});

// role="button" + tabindex="0" promise keyboard operation; deliver it.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
  const t = e.target.closest && e.target.closest('[data-recording]');
  if (!t) return;
  e.preventDefault();          // Space would otherwise scroll the page
  openRecording(t.dataset.recording, t);
});
