/* ════════════════════════════════════════════════════
   Meetings module
   ────────────────────────────────────────────────────
   Its own section of the workspace: the meeting list,
   action items across every meeting, dispatching the
   Fireflies bot, and a meeting's detail view.

   Split out of index.html so Overview stays a single
   dashboard page with no second nav tier, and so this
   section owns its own layout and sub-navigation.

   Shared session + Fireflies helpers come from
   fireflies.js, which must load first.

   Pages: #/meetings  #/actions  #/dispatch  #/meeting/<key>
   ════════════════════════════════════════════════════ */

/* ── DOM references ─────────────────────────────────── */
const pmSignedOut = document.getElementById('pmSignedOut');
const appView     = document.getElementById('appView');
const whoEmail    = document.getElementById('whoEmail');
const roleBadge   = document.getElementById('roleBadge');
const signOutBtn  = document.getElementById('signOut');
const form        = document.getElementById('form');
const btn         = document.getElementById('submit');
const statusEl    = document.getElementById('status');
const meetingsEl  = document.getElementById('meetings');
const refreshBtn  = document.getElementById('refresh');
const searchEl    = document.getElementById('search');
const meetCountEl = document.getElementById('meetCount');
const detailEl    = document.getElementById('detailContent');
const navLinks    = document.querySelectorAll('nav.subnav a');
const pages       = document.querySelectorAll('.page');

let allMeetings = [];   // sheet rows, sorted newest first

/* ── Boot / session gate ─────────────────────────────── */
function showSignedOut(){
  document.body.classList.remove('dash');
  appView.classList.remove('active');
  pmSignedOut.classList.add('active');
}

function showApp(session){
  document.body.classList.add('dash');
  pmSignedOut.classList.remove('active');
  appView.classList.add('active');
  renderUserChip(whoEmail, session.email);
  const isAdmin = String(session.role || '').toUpperCase() === 'ADMIN';
  roleBadge.textContent = isAdmin ? 'Admin' : 'Manager';
  roleBadge.className = 'role-badge' + (isAdmin ? '' : ' manager');
  document.querySelectorAll('.nav-admin').forEach(a => { a.hidden = !isAdmin; });
  setStatus(statusEl, '', '');
  loadMeetings();
  route();
}

signOutBtn.addEventListener('click', () => {
  clearSession();
  location.href = 'index.html';
});

/* ── Router ──────────────────────────────────────────── */
function route(){
  if (!readSession()) { showSignedOut(); return; }

  const hash  = location.hash || '#/meetings';
  const parts = hash.replace(/^#\//, '').split('/');
  let page    = parts[0] || 'meetings';
  if (!['meetings','actions','dispatch','meeting'].includes(page)) page = 'meetings';

  pages.forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  navLinks.forEach(a => a.classList.toggle('on',
    a.dataset.nav === (page === 'meeting' ? 'meetings' : page)));

  if (page === 'meeting')  renderDetail(parts.slice(1).join('/'));
  if (page === 'actions')  renderActionsPage();
  if (page === 'dispatch') document.getElementById('meetingLink').focus();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

// clicking the logo goes back to the list and reloads
document.getElementById('homeLogo').addEventListener('click', () => {
  location.hash = '#/meetings';
  loadMeetings();
});

/* ════════════════════════════════════════════════════
   Dispatch Fireflies
   ════════════════════════════════════════════════════ */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const session = readSession();
  if (!session) { showSignedOut(); return; }

  const payload = {
    meetingLink: document.getElementById('meetingLink').value.trim(),
    title: document.getElementById('title').value.trim()
  };

  btn.disabled = true;
  setStatus(statusEl, 'busy', 'Sending Fireflies to the meeting…');

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.token
      },
      body: JSON.stringify(payload)
    });

    if (res.status === 401 || res.status === 403) {
      clearSession();
      showSignedOut();
      return;
    }
    if (!res.ok) throw new Error('Webhook responded with ' + res.status);

    setStatus(statusEl, 'ok', 'Fireflies is on the way. It should join in 2–3 minutes and the transcript lands in your notebook after the call.');
    form.reset();
  } catch (err) {
    setStatus(statusEl, 'err', "Couldn't reach the webhook: " + err.message + '. Check that the workflow is active and that CORS is allowed on the webhook node.');
  } finally {
    btn.disabled = false;
  }
});

/* ════════════════════════════════════════════════════
   Meetings: load + list
   ════════════════════════════════════════════════════ */
async function loadMeetings(){
  const session = readSession();
  if (!session) return;

  meetingsEl.innerHTML = '<div class="empty">Loading your meetings…</div>';

  try {
    allMeetings = await fetchMeetings(session.token);
    renderMeetingList();
    route();   // re-render the detail page if that's where we are
  } catch (err) {
    if (err.unauthorized) { clearSession(); showSignedOut(); return; }
    allMeetings = [];
    meetingsEl.innerHTML = '<div class="empty">Couldn\'t load meetings (' + esc(err.message) + ').</div>';
  }
}

function hrefForMeeting(m){
  return '#/meeting/' + meetingKey(m, allMeetings.indexOf(m));
}

function renderMeetingList(){
  const q = (searchEl.value || '').trim().toLowerCase();
  const rows = q
    ? allMeetings.filter(m =>
        String(m['Meet Name'] || '').toLowerCase().includes(q) ||
        String(m.Gist || '').toLowerCase().includes(q) ||
        String(m.ShortSummary || '').toLowerCase().includes(q))
    : allMeetings;

  meetCountEl.textContent = String(allMeetings.length);

  if (!allMeetings.length) {
    meetingsEl.innerHTML = '<div class="empty">No meeting summaries yet.<br>They\'ll appear here after Fireflies records a call.</div>';
    return;
  }
  if (!rows.length) {
    meetingsEl.innerHTML = '<div class="empty">No meetings match “' + esc(q) + '”.</div>';
    return;
  }
  meetingsEl.innerHTML = meetingsTable(rows, hrefForMeeting);
  wireMeetingRowClicks(meetingsEl);
  translateWithin(meetingsEl);
}

searchEl.addEventListener('input', renderMeetingList);
refreshBtn.addEventListener('click', loadMeetings);

/* ════════════════════════════════════════════════════
   Action items page
   ────────────────────────────────────────────────────
   Left pane picks a person; right pane lists that
   person's items newest-first, paged with "Load more".
   ════════════════════════════════════════════════════ */
function collectActions(){
  const rows = [];
  allMeetings.forEach(m => {
    parseActionItems(m.ActionItems).forEach(g => {
      g.items.forEach(t => rows.push({
        text: t,
        who: (g.name || 'Unassigned').trim(),
        meeting: m['Meet Name'] || 'Meeting',
        date: m.MeetDate,
        time: new Date(m.MeetDate || 0).getTime() || 0
      }));
    });
  });
  return rows.sort((a, b) => b.time - a.time);   // newest first
}

function initialsOf(name){
  if (name === 'Unassigned') return '–';
  return name.split(/\s+/).filter(Boolean)
    .map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

const ACTIONS_PAGE = 15;      // items rendered per "Load more" step
let actionPerson = null;      // selected person, null = everyone
let actionsShown = ACTIONS_PAGE;

function renderActionsPage(){
  const listEl   = document.getElementById('actionList');
  const peopleEl = document.getElementById('peopleList');
  const moreBtn  = document.getElementById('actionsMore');
  const q = (document.getElementById('actionSearch').value || '').trim().toLowerCase();

  const all = collectActions();

  // text filter first, so the people counts reflect the search
  const matched = q
    ? all.filter(r =>
        r.who.toLowerCase().includes(q) ||
        r.text.toLowerCase().includes(q) ||
        r.meeting.toLowerCase().includes(q))
    : all;

  // people ordered by most recent activity (not alphabetically)
  const seen = new Map();
  matched.forEach(r => {
    const p = seen.get(r.who);
    if (p) p.n++;
    else seen.set(r.who, { name: r.who, n: 1, time: r.time });
  });
  const people = [...seen.values()].sort((a, b) => b.time - a.time);

  if (actionPerson && !seen.has(actionPerson)) actionPerson = null;

  peopleEl.innerHTML =
    '<button type="button" class="personrow all' + (actionPerson ? '' : ' on') + '" data-pick="">' +
      '<span class="avatar">All</span>' +
      '<span class="pname">Everyone</span>' +
      '<span class="n">' + matched.length + '</span>' +
    '</button>' +
    people.map(p =>
      '<button type="button" class="personrow' + (actionPerson === p.name ? ' on' : '') +
        '" data-pick="' + esc(p.name) + '">' +
        '<span class="avatar">' + esc(initialsOf(p.name)) + '</span>' +
        '<span class="pname" data-tr>' + esc(p.name) + '</span>' +
        '<span class="n">' + p.n + '</span>' +
      '</button>').join('');

  const rows = actionPerson ? matched.filter(r => r.who === actionPerson) : matched;
  document.getElementById('actionCount').textContent = String(rows.length);
  document.getElementById('actionsTitle').textContent =
    actionPerson ? actionPerson : 'All action items';

  if (!rows.length) {
    listEl.innerHTML = '<div class="empty">' +
      (q ? 'No action items match “' + esc(q) + '”.'
         : (allMeetings.length ? 'No action items found in your meetings yet.' : 'Loading…')) +
      '</div>';
    moreBtn.style.display = 'none';
    return;
  }

  const visible = rows.slice(0, actionsShown);
  listEl.innerHTML =
    '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      '<th>Task</th><th>Person</th><th>Meeting</th><th>Date</th>' +
    '</tr></thead><tbody>' +
    visible.map(r =>
      '<tr>' +
        '<td><span data-tr>' + esc(r.text) + '</span></td>' +
        '<td><span data-tr>' + esc(r.who) + '</span></td>' +
        '<td><span data-tr>' + esc(r.meeting) + '</span></td>' +
        '<td class="nowrap">' + (r.date ? esc(fmtDate(r.date)) : '—') + '</td>' +
      '</tr>').join('') +
    '</tbody></table></div>';

  if (rows.length > visible.length) {
    moreBtn.style.display = '';
    moreBtn.textContent = 'Load ' + Math.min(ACTIONS_PAGE, rows.length - visible.length) +
      ' more (' + (rows.length - visible.length) + ' left)';
  } else {
    moreBtn.style.display = 'none';
  }
  translateWithin(listEl);
  translateWithin(peopleEl);
}

document.getElementById('actionSearch').addEventListener('input', () => {
  actionsShown = ACTIONS_PAGE;
  renderActionsPage();
});

document.getElementById('peopleList').addEventListener('click', (e) => {
  const pick = e.target.closest('[data-pick]');
  if (!pick) return;
  actionPerson = pick.dataset.pick || null;
  actionsShown = ACTIONS_PAGE;
  renderActionsPage();
  window.scrollTo(0, 0);
});

document.getElementById('actionsMore').addEventListener('click', () => {
  actionsShown += ACTIONS_PAGE;
  renderActionsPage();
});

/* ════════════════════════════════════════════════════
   Meeting details page
   ════════════════════════════════════════════════════ */
function sectionText(title, value, extraClass){
  if (!value) return '';
  const clean = String(value).replace(/\\n/g, '\n').trim();
  const items = bulletsFrom(clean);
  if (items) {
    return '<div class="sect ' + (extraClass || '') + '"><h4>' + title + '</h4><ul>' +
      items.map(t => '<li><span data-tr>' + esc(t) + '</span></li>').join('') +
    '</ul></div>';
  }
  return '<div class="sect ' + (extraClass || '') + '"><h4>' + title + '</h4><p data-tr>' +
    esc(clean.replace(/\*\*/g, '')) + '</p></div>';
}

/* The "Full Summary" column often holds the raw Fireflies JSON payload.
   Parse it and show the useful parts (topics + chaptered notes) instead
   of the raw blob; fall back to plain text when it isn't JSON. */
function renderFullSummary(v){
  if (!v) return '';
  const str = String(v).trim();
  if (str[0] !== '{') return sectionText('Full summary', str, 'full');
  let o;
  try { o = JSON.parse(str); } catch (_) { return ''; }   // unparseable blob → hide
  let out = '';
  if (Array.isArray(o.keywords) && o.keywords.length) {
    out += '<div class="sect full"><h4>Topics</h4><div class="tags">' +
      o.keywords.map(k => '<span class="tag" data-tr>' + esc(k) + '</span>').join('') +
    '</div></div>';
  }
  const notes = o.shorthand_bullet || o.outline;
  if (notes) out += sectionNotes('Meeting notes', notes);
  return out;
}

/* Chaptered meeting notes: lines ending in "(00:22 - 01:14)" become
   chapter headings; the lines after each one become its bullet list. */
function sectionNotes(title, value){
  const lines = String(value)
    .replace(/\\n/g, '\n')
    .replace(/\*\*/g, '')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
  if (!lines.length) return '';

  const TIME = /\(\d{1,2}:\d{2}(?::\d{2})?\s*[-–]\s*\d{1,2}:\d{2}(?::\d{2})?\)$/;
  let html = '', buf = [];
  const flush = () => {
    if (!buf.length) return;
    html += '<ul>' + buf.map(t => '<li><span data-tr>' + esc(t) + '</span></li>').join('') + '</ul>';
    buf = [];
  };

  lines.forEach(line => {
    const m = line.match(TIME);
    if (m) {
      flush();
      const head = line.slice(0, line.length - m[0].length).trim();
      html += '<div class="chapter"><span data-tr>' + esc(head) + '</span>' +
              '<span class="time">' + esc(m[0]) + '</span></div>';
    } else {
      buf.push(line.replace(/^(?:[-•▪]|\d+[.)])\s*/, ''));
    }
  });
  flush();

  return '<div class="sect full">' +
    '<h4>' + title + '</h4>' + html +
  '</div>';
}

function sectionList(title, value, extraClass){
  const items = toList(value).map(t => t.replace(/\*\*/g, '').trim()).filter(Boolean);
  if (!items.length) return '';
  return '<div class="sect ' + (extraClass || '') + '"><h4>' + title + '</h4><ul>' +
    items.map(t => '<li><span data-tr>' + esc(t) + '</span></li>').join('') +
  '</ul></div>';
}

// Action items get their own renderer: tasks grouped under each assignee
function sectionActions(title, value){
  const groups = parseActionItems(value);
  if (!groups.length) return '';
  const body = groups.map(g =>
    (g.name ? '<div class="assignee" data-tr>' + esc(g.name) + '</div>' : '') +
    '<ul>' + g.items.map(t => '<li><span data-tr>' + esc(t) + '</span></li>').join('') + '</ul>'
  ).join('');
  return '<div class="sect actionitems"><h4>' + title + '</h4>' + body + '</div>';
}

function renderDetail(key){
  const m = findMeeting(allMeetings, key);
  if (!m) {
    detailEl.innerHTML = '<div class="empty">' +
      (allMeetings.length ? 'Meeting not found.' : 'Loading meeting details…') + '</div>';
    return;
  }

  const date = fmtDate(m.MeetDate);
  const hero =
    '<div class="detail-hero">' +
      '<h1 data-tr>' + esc(m['Meet Name'] || 'Untitled meeting') + '</h1>' +
      '<div class="meta">' +
        (date ? '<span class="chip">' + esc(date) + '</span>' : '') +
        (m['Meet Id'] ? '<span class="chip">ID ' + esc(m['Meet Id']) + '</span>' : '') +
        (m['Meet link']
          ? '<a class="chip" href="' + esc(m['Meet link']) + '" target="_blank" rel="noopener">▶ Open recording</a>'
          : '') +
      '</div>' +
    '</div>';

  const sections =
    sectionText('Gist', m.Gist, 'full') +
    sectionText('Overview', m.Overview, 'full') +
    sectionList('Key points', m.BulletGist) +
    sectionActions('Action items', m.ActionItems) +
    sectionText('Short summary', m.ShortSummary, 'full') +
    renderFullSummary(m['Full Summary']);

  detailEl.innerHTML = hero +
    (sections
      ? '<div class="detail-grid">' + sections + '</div>'
      : '<div class="empty">No summary details for this meeting yet.</div>');
  translateWithin(detailEl);
}

/* ════════════════════════════════════════════════════
   Boot
   ════════════════════════════════════════════════════ */
(function boot(){
  const existing = readSession();
  if (!existing) { showSignedOut(); return; }
  // HR / Marketing / QA / Employee accounts have no Fireflies meetings —
  // send them to their own section rather than an empty page.
  const home = roleHome(existing.role);
  if (home) { location.href = home; return; }
  showApp(existing);
})();
