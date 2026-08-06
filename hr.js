/* ════════════════════════════════════════════════════
   HR module
   ────────────────────────────────────────────────────
   Same shared session + PHP backend as projects.js. Reachable
   by the HR role (and ADMIN, who can see/do everything).
   ════════════════════════════════════════════════════ */
const SESSION_KEY = "fireflies.session";
const PM_API_BASE = "https://management.moveneticsdigital.com/pm-backend-php/";

const PM_EMPLOYEES_LIST_URL   = PM_API_BASE + "pm-employees-list.php";
const PM_EMPLOYEES_CREATE_URL = PM_API_BASE + "pm-employees-create.php";
const PM_EMPLOYEES_UPDATE_URL = PM_API_BASE + "pm-employees-update.php";
const PM_EMPLOYEES_DELETE_URL = PM_API_BASE + "pm-employees-delete.php";
const PM_EMPLOYEES_RESET_PW_URL = PM_API_BASE + "pm-employees-reset-password.php";
const PM_MANAGERS_RESET_PW_URL  = PM_API_BASE + "pm-managers-reset-password.php";
const PM_OPENINGS_LIST_URL    = PM_API_BASE + "pm-openings-list.php";
const PM_OPENINGS_CREATE_URL  = PM_API_BASE + "pm-openings-create.php";
const PM_OPENINGS_UPDATE_URL  = PM_API_BASE + "pm-openings-update.php";
const PM_CANDIDATES_LIST_URL  = PM_API_BASE + "pm-candidates-list.php";
const PM_CANDIDATES_CREATE_URL= PM_API_BASE + "pm-candidates-create.php";
const PM_CANDIDATES_UPDATE_URL= PM_API_BASE + "pm-candidates-update.php";
const PM_LEAVE_LIST_URL       = PM_API_BASE + "pm-leave-list.php";
const PM_MANAGERS_LIST_URL    = PM_API_BASE + "pm-managers-list.php";
const PM_MANAGERS_CREATE_URL  = PM_API_BASE + "pm-managers-create.php";
const PM_PEOPLE_ROLE_URL      = PM_API_BASE + "pm-people-role.php";
const PM_PEOPLE_LIST_URL      = PM_API_BASE + "pm-people-list.php";
const PM_PEOPLE_CREATE_URL    = PM_API_BASE + "pm-people-create.php";
const PM_PROJECTS_LIST_URL    = PM_API_BASE + "pm-projects-list.php";
const PM_QA_ASSIGNMENTS_URL   = PM_API_BASE + "pm-qa-assignments-list.php";
const PM_QA_ASSIGN_URL        = PM_API_BASE + "pm-qa-assign.php";

/* ── DOM references ─────────────────────────────────── */
const pmSignedOut = document.getElementById('pmSignedOut');
const appView     = document.getElementById('appView');
const whoEmail    = document.getElementById('whoEmail');
const roleBadge   = document.getElementById('roleBadge');
const signOutBtn  = document.getElementById('signOut');
const navLinks    = document.querySelectorAll('nav.subnav a');
const pages       = document.querySelectorAll('.page');

let session = null;
let isAdmin = false;
let allEmployees = [];
let allOpenings  = [];

/* ── Helpers ─────────────────────────────────────────── */
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
function statusLabel(s){
  return String(s || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function badge(status){
  if (!status) return '';
  return '<span class="status-badge ' + esc(String(status).toLowerCase()) + '">' +
    esc(statusLabel(status)) + '</span>';
}
/* MANAGER is the stored role; the team calls them business analysts. Only
   the label changes — see the note in fireflies.js. */
const ROLE_LABELS = { ADMIN:'Admin', MANAGER:'Business Analyst', HR:'HR',
                      MARKETING:'Marketing', QA:'QA', EMPLOYEE:'Developer' };
function roleLabel(role){
  return ROLE_LABELS[String(role || '').toUpperCase()] || statusLabel(role);
}
function roleTag(role){
  if (!role) return '';
  return '<span class="status-badge ' + esc(String(role).toLowerCase()) + '">' +
    esc(roleLabel(role)) + '</span>';
}

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
function clearSession(){
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

/* ── API helper ──────────────────────────────────────── */
async function api(url, opts){
  opts = opts || {};
  const headers = { 'Authorization': 'Bearer ' + session.token };
  if (opts.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (res.status === 401) {
    clearSession();
    showSignedOut();
    throw new Error('Session expired');
  }
  if (!res.ok) {
    let msg = 'Request failed (' + res.status + ')';
    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch(_) {}
    throw new Error(msg);
  }
  return res.json().catch(() => ([]));
}
function qs(params){
  const pairs = Object.entries(params || {}).filter(([,v]) => v !== undefined && v !== null && v !== '');
  return pairs.length ? '?' + pairs.map(([k,v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&') : '';
}

/* ── Boot / session gate ─────────────────────────────── */
function showSignedOut(){
  document.body.classList.remove('dash');
  appView.classList.remove('active');
  pmSignedOut.classList.add('active');
}
function showApp(){
  document.body.classList.add('dash');
  pmSignedOut.classList.remove('active');
  appView.classList.add('active');
  renderUserChip(whoEmail, session.email);
  roleBadge.textContent = isAdmin ? 'Admin' : 'HR';
  document.getElementById('qaNavLink').hidden = !isAdmin;
  document.querySelectorAll('.nav-admin').forEach(a => { a.hidden = !isAdmin; });
  route();
}
signOutBtn.addEventListener('click', () => {
  clearSession();
  location.href = 'login.html?m=out';
});

/* ── Router ──────────────────────────────────────────── */

function route(){
  if (!readSession()) { showSignedOut(); return; }
  const hash  = location.hash || '#/openings';
  const parts = hash.replace(/^#\//, '').split('/');
  let page    = parts[0] || 'openings';
  if (!['openings','opening','leave','people','qa'].includes(page)) page = 'openings';
  if (page === 'qa' && !isAdmin) page = 'openings';

  pages.forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  const navTarget = page === 'opening' ? 'openings' : page;
  navLinks.forEach(a => a.classList.toggle('on', a.dataset.nav === navTarget));

  if (page === 'openings')  renderOpenings();
  if (page === 'opening')   renderOpeningDetail(Number(parts[1]));
  if (page === 'leave')     renderLeave();
  if (page === 'people')    renderPeople();
  if (page === 'qa')        renderQaAccess();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* ════════════════════════════════════════════════════
   Openings + candidates
   ════════════════════════════════════════════════════ */
async function renderOpenings(){
  const listEl = document.getElementById('openingsList');
  listEl.innerHTML = '<div class="empty">Loading…</div>';
  try {
    allOpenings = await api(PM_OPENINGS_LIST_URL);
    listEl.innerHTML = allOpenings.length
      ? allOpenings.map(openingCard).join('')
      : '<div class="empty">No openings yet. Create your first one above.</div>';
  } catch (err) {
    listEl.innerHTML = '<div class="empty">Could not load openings (' + esc(err.message) + ').</div>';
  }
}
function openingCard(o){
  return '<a class="project-card" href="#/opening/' + o.opening_id + '">' +
    '<h3>' + esc(o.title) + '</h3>' +
    (o.department ? '<p><strong>' + esc(o.department) + '</strong></p>' : '') +
    '<div class="pcmeta">' + badge(o.status) + '<span>' + o.candidate_count + ' candidate' + (o.candidate_count === 1 ? '' : 's') + '</span></div>' +
  '</a>';
}
document.getElementById('newOpeningToggle').addEventListener('click', () => {
  document.getElementById('newOpeningForm').classList.toggle('open');
});
document.getElementById('openingCancelBtn').addEventListener('click', () => {
  document.getElementById('newOpeningForm').classList.remove('open');
});
document.getElementById('newOpeningForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('openTitle').value.trim();
  const department = document.getElementById('openDept').value.trim();
  const notes = document.getElementById('openNotes').value.trim();
  if (!title) return;
  try {
    await api(PM_OPENINGS_CREATE_URL, { method: 'POST', body: { title, department, notes } });
    e.target.reset();
    e.target.classList.remove('open');
    renderOpenings();
  } catch (err) {
    toast('Could not create opening: ' + err.message, 'err');
  }
});

async function renderOpeningDetail(openingId){
  const el = document.getElementById('openingDetailContent');
  el.innerHTML = '<div class="empty">Loading…</div>';
  try {
    if (!allOpenings.length) allOpenings = await api(PM_OPENINGS_LIST_URL);
    const opening = allOpenings.find(o => o.opening_id === openingId);
    const candidates = await api(PM_CANDIDATES_LIST_URL + qs({ opening_id: openingId }));
    if (!opening) { el.innerHTML = '<div class="empty">Opening not found.</div>'; return; }

    el.innerHTML =
      '<div class="detail-hero">' +
        '<div class="hero-top"><h1>' + esc(opening.title) + '</h1></div>' +
        '<div class="meta">' + badge(opening.status) +
          (opening.department ? '<span class="chip">' + esc(opening.department) + '</span>' : '') +
        '</div>' +
      '</div>' +
      (opening.notes ? '<div class="sect full" style="margin-bottom:16px"><h4>Notes</h4><p>' + esc(opening.notes) + '</p></div>' : '') +
      '<form id="editOpeningForm" class="inline-form open">' +
        '<div class="row">' +
          '<div class="field"><label>Status</label><select id="editOpeningStatus">' +
            ['OPEN','ON_HOLD','CLOSED'].map(s => '<option value="' + s + '"' + (opening.status === s ? ' selected' : '') + '>' + statusLabel(s) + '</option>').join('') +
          '</select></div>' +
        '</div>' +
        '<div class="actions"><button type="submit">Save status</button></div>' +
      '</form>' +
      '<div class="panel-head"><h2>Candidates</h2><span class="count">' + candidates.length + '</span>' +
        '<span class="spacer"></span><button type="button" class="btn-sm" id="newCandidateToggle" style="border:none">+ Add candidate</button></div>' +
      '<form id="newCandidateForm" class="inline-form">' +
        '<div class="row">' +
          '<div class="field"><label>Name</label><input id="candName" required placeholder="Candidate name" /></div>' +
          '<div class="field"><label>Email <span class="opt">— optional</span></label><input id="candEmail" type="email" /></div>' +
        '</div>' +
        '<div class="field"><label>Phone <span class="opt">— optional</span></label><input id="candPhone" /></div>' +
        '<div class="field"><label>Notes <span class="opt">— optional</span></label><input id="candNotes" /></div>' +
        '<div class="actions"><button type="submit">Add candidate</button><button type="button" class="secondary" id="candCancelBtn">Cancel</button></div>' +
      '</form>' +
      '<div id="candidatesList"></div>';

    document.getElementById('editOpeningForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = document.getElementById('editOpeningStatus').value;
      try {
        await api(PM_OPENINGS_UPDATE_URL, { method: 'POST',
          body: { opening_id: openingId, title: opening.title, department: opening.department, notes: opening.notes, status } });
        allOpenings = [];
        renderOpeningDetail(openingId);
      } catch (err) { toast('Could not save: ' + err.message, 'err'); }
    });
    document.getElementById('newCandidateToggle').addEventListener('click', () => {
      document.getElementById('newCandidateForm').classList.toggle('open');
    });
    document.getElementById('candCancelBtn').addEventListener('click', () => {
      document.getElementById('newCandidateForm').classList.remove('open');
    });
    document.getElementById('newCandidateForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('candName').value.trim();
      const email = document.getElementById('candEmail').value.trim();
      const phone = document.getElementById('candPhone').value.trim();
      const notes = document.getElementById('candNotes').value.trim();
      if (!name) return;
      try {
        await api(PM_CANDIDATES_CREATE_URL, { method: 'POST', body: { opening_id: openingId, name, email, phone, notes } });
        renderOpeningDetail(openingId);
      } catch (err) { toast('Could not add candidate: ' + err.message, 'err'); }
    });

    const listEl = document.getElementById('candidatesList');
    listEl.innerHTML = candidates.length
      ? candidates.map(candidateRow).join('')
      : '<div class="empty">No candidates yet. Add the first one above.</div>';
    wireCandidateRows(listEl, () => renderOpeningDetail(openingId));
  } catch (err) {
    el.innerHTML = '<div class="empty">Could not load opening (' + esc(err.message) + ').</div>';
  }
}
const STAGES = ['APPLIED','SCREENING','INTERVIEW','OFFER','HIRED','REJECTED'];
function candidateRow(c){
  const options = STAGES.filter(s => s !== c.stage).map(s => '<option value="' + s + '">' + statusLabel(s) + '</option>');
  return '<div class="task-row" data-cand-row="' + c.candidate_id + '">' +
    '<div class="tinfo"><div class="ttitle">' + esc(c.name) + '</div>' +
      '<div class="tmeta">' +
        (c.email ? '<span>' + esc(c.email) + '</span>' : '') +
        (c.phone ? '<span>' + esc(c.phone) + '</span>' : '') +
        (c.notes ? '<span>' + esc(c.notes) + '</span>' : '') +
      '</div></div>' +
    '<div class="tactions">' + badge(c.stage) +
      '<select class="status-select" data-cand-id="' + c.candidate_id + '"><option value="">Move to…</option>' + options.join('') + '</select>' +
    '</div></div>';
}
function wireCandidateRows(root, onChanged){
  root.querySelectorAll('select[data-cand-id]').forEach(sel => {
    sel.addEventListener('change', async () => {
      const stage = sel.value;
      if (!stage) return;
      const id = Number(sel.dataset.candId);
      sel.disabled = true;
      try {
        const row = root.querySelector('[data-cand-row="' + id + '"]');
        const name = row.querySelector('.ttitle').textContent;
        await api(PM_CANDIDATES_UPDATE_URL, { method: 'POST', body: { candidate_id: id, name, stage } });
        onChanged();
      } catch (err) {
        toast('Could not move candidate: ' + err.message, 'err');
        sel.disabled = false; sel.value = '';
      }
    });
  });
}

/* ════════════════════════════════════════════════════
   Leave
   ════════════════════════════════════════════════════ */
function currentMonth(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
// HR tracks leave — approval itself happens on the approver's side (their
// dashboard), so this page is read-only: the monthly summary plus every
// request and who it's waiting on / was decided by.
async function renderLeave(){
  const pendingEl = document.getElementById('pendingLeaveList');
  const allEl = document.getElementById('allLeaveList');
  const summaryEl = document.getElementById('monthSummary');
  pendingEl.innerHTML = '<div class="empty">Loading…</div>';
  allEl.innerHTML = '';
  const month = currentMonth();
  document.getElementById('monthLabel').textContent =
    'This month (' + new Date(month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) + ')';
  try {
    const [all, monthRows] = await Promise.all([
      api(PM_LEAVE_LIST_URL),
      api(PM_LEAVE_LIST_URL + qs({ month }))
    ]);

    // Monthly summary: approved days taken per employee this month —
    // recomputes automatically every time the calendar rolls to a new month.
    const perEmployee = new Map();
    monthRows.filter(r => r.status === 'APPROVED').forEach(r => {
      const days = Math.round((new Date(r.end_date) - new Date(r.start_date)) / 86400000) + 1;
      perEmployee.set(r.employee_name, (perEmployee.get(r.employee_name) || 0) + days);
    });
    summaryEl.innerHTML = perEmployee.size
      ? [...perEmployee.entries()].map(([name, days]) =>
          '<span class="summary-chip">' + esc(name) + ' <b>' + days + 'd</b></span>').join('')
      : '<span class="summary-chip">No approved leave taken this month yet.</span>';

    const pending = all.filter(r => r.status === 'PENDING');
    document.getElementById('pendingCount').textContent = String(pending.length);
    pendingEl.innerHTML = pending.length
      ? pending.map(leaveRow).join('')
      : '<div class="empty">Nothing pending with an approver right now.</div>';

    document.getElementById('allLeaveCount').textContent = String(all.length);
    allEl.innerHTML = all.length
      ? all.map(leaveRow).join('')
      : '<div class="empty">No leave requests yet.</div>';
  } catch (err) {
    pendingEl.innerHTML = '<div class="empty">Could not load leave (' + esc(err.message) + ').</div>';
  }
}
function leaveRow(r){
  return '<div class="leave-row" data-leave-row="' + r.leave_id + '">' +
    '<div class="linfo"><div class="ltitle">' + esc(r.employee_name) + '</div>' +
      '<div class="lmeta">' +
        '<span>' + esc(fmtDay(r.start_date)) + ' – ' + esc(fmtDay(r.end_date)) + '</span>' +
        (r.reason ? '<span>' + esc(r.reason) + '</span>' : '') +
        (r.approver_names ? '<span>To ' + esc(r.approver_names) + '</span>' : '') +
        (r.reviewed_by_name ? '<span>Reviewed by ' + esc(r.reviewed_by_name) + '</span>' : '') +
      '</div></div>' +
    '<div class="tactions">' + badge(r.status) + '</div></div>';
}

/* ════════════════════════════════════════════════════
   People — one directory over staff logins and the roster
   ────────────────────────────────────────────────────
   `managers` and `employees` remain separate tables (tasks, leave,
   questions and bugs all hold foreign keys into `employees`), but there
   is no reason the admin screen should expose that split. Each row
   carries `kind` so the right endpoints get used per person.
   ════════════════════════════════════════════════════ */
let allPeople = [];

async function renderPeople(){
  const listEl = document.getElementById('peopleList');
  listEl.innerHTML = '<div class="empty">Loading…</div>';
  try {
    allPeople = await api(PM_PEOPLE_LIST_URL);
    drawPeople();
  } catch (err) {
    listEl.innerHTML = '<div class="empty">Could not load people (' + esc(err.message) + ').</div>';
  }
}

// Filter + draw, split from the fetch so typing re-renders instantly
// instead of hitting the network on every keystroke.
function drawPeople(){
  const listEl = document.getElementById('peopleList');
  const q = (document.getElementById('peopleSearch').value || '').trim().toLowerCase();
  const roleFilter = document.getElementById('peopleRoleFilter').value;

  const rows = allPeople.filter(p =>
    (!roleFilter || p.role === roleFilter) &&
    (!q || [p.name, p.email, p.department, p.designation]
        .some(v => String(v || '').toLowerCase().includes(q))));

  document.getElementById('peopleCount').textContent =
    (q || roleFilter) ? rows.length + ' of ' + allPeople.length : String(allPeople.length);

  if (!allPeople.length) {
    listEl.innerHTML = '<div class="empty">Nobody here yet — use “+ Add person”.</div>';
    return;
  }
  if (!rows.length) {
    listEl.innerHTML = '<div class="empty">Nobody matches that filter.</div>';
    return;
  }

  listEl.innerHTML =
    '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      '<th>Name</th><th>Role</th><th>Email</th><th>Login</th><th></th>' +
    '</tr></thead><tbody>' + rows.map(personRow).join('') + '</tbody></table></div>';
  wirePeopleRows(listEl);
}

/* Every role anyone can hold, roster included. Moving between EMPLOYEE and
   a staff role moves a person between two tables, which the backend does
   by deactivating the old row and creating the new one — so it works in
   both directions, but it mints (or ends) a login and is confirmed first. */
const ALL_ROLES = ['EMPLOYEE', 'MANAGER', 'QA', 'HR', 'MARKETING', 'ADMIN'];

function personRow(p){
  const login = p.has_login == 1
    ? (p.temp_password
        ? '<code class="secret">' + esc(p.temp_password) + '</code>' +
          '<button type="button" class="icon-btn" data-copy="' + esc(p.temp_password) + '">Copy</button>'
        : '<span class="tsub">Set by user</span>')
    : '<span class="status-badge todo">No login</span>';

  const roleCell = isAdmin
    ? '<select class="status-select" data-role-for="' + p.kind + '-' + p.id + '">' +
        ALL_ROLES.map(r => '<option value="' + r + '"' + (p.role === r ? ' selected' : '') + '>' +
          esc(roleLabel(r)) + '</option>').join('') +
      '</select>'
    : roleTag(p.role);

  return '<tr data-person-row="' + p.kind + '-' + p.id + '">' +
    '<td><div class="ttitle">' + esc(p.name) + '</div>' +
      (p.designation || p.department
        ? '<div class="tsub">' + esc([p.designation, p.department].filter(Boolean).join(' · ')) + '</div>'
        : '') +
      (p.is_active == 0 ? '<div class="tsub">Deactivated</div>' : '') + '</td>' +
    '<td>' + roleCell + '</td>' +
    '<td>' + esc(p.email || '—') + '</td>' +
    '<td class="nowrap">' + login + '</td>' +
    '<td class="actions-cell">' +
      (p.has_login == 1 && isAdmin
        ? '<button type="button" class="icon-btn" data-reset-pw="' + p.kind + '-' + p.id + '">Reset password</button>'
        : '') +
      (p.kind === 'EMPLOYEE'
        ? '<button type="button" class="icon-btn danger" data-emp-delete="' + p.id + '">Delete</button>'
        : '') +
    '</td></tr>';
}

function wirePeopleRows(root){
  wireCopyButtons(root);

  root.querySelectorAll('[data-role-for]').forEach(sel => {
    const original = sel.value;
    const [kind, id] = sel.dataset.roleFor.split('-');
    sel.addEventListener('change', async () => {
      const role = sel.value;
      const person = allPeople.find(p => p.kind === kind && p.id === Number(id));
      const name = person ? person.name : 'this person';
      const revert = () => { sel.value = original; sel.disabled = false; };

      /* Crossing between the roster and a staff login is not a relabelling:
         it creates a sign-in (or ends one) and takes the person off the
         other side. Worth a confirmation; a staff-to-staff change is not. */
      const gainsLogin = original === 'EMPLOYEE' && role !== 'EMPLOYEE';
      const losesLogin = original !== 'EMPLOYEE' && role === 'EMPLOYEE';
      if (gainsLogin && !confirm(
            'Make ' + name + ' a ' + roleLabel(role) + '?\n\n' +
            'They get a staff login and come off the developer roster, so no ' +
            'new tasks can be assigned to them. Their existing tasks, leave ' +
            'and questions are kept.')) { revert(); return; }
      if (losesLogin && !confirm(
            'Move ' + name + ' to the developer roster?\n\n' +
            'Their staff login stops working and they can be assigned tasks ' +
            'instead. Everything they reported or approved is kept.')) { revert(); return; }

      sel.disabled = true;
      try {
        const res = await api(PM_PEOPLE_ROLE_URL, { method: 'POST',
          body: { kind, id: Number(id), role } });
        if (res.temp_password) {
          toast('Now a ' + roleLabel(role) + '. New login for ' + res.login_email +
                '.\nTemporary password: ' + res.temp_password +
                '\n\nAlso visible any time in the list below.', 'ok', true);
        } else {
          toast('Role updated to ' + roleLabel(role) + '.', 'ok');
        }
        renderPeople();
      } catch (err) {
        toast('Could not change role: ' + err.message, 'err');
        revert();                  // put the control back to the truth
      }
    });
  });

  root.querySelectorAll('[data-reset-pw]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const [kind, id] = btn.dataset.resetPw.split('-');
      btn.disabled = true;
      try {
        await api(kind === 'STAFF' ? PM_MANAGERS_RESET_PW_URL : PM_EMPLOYEES_RESET_PW_URL,
          { method: 'POST',
            body: kind === 'STAFF' ? { manager_id: Number(id) } : { employee_id: Number(id) } });
        toast('Password reset — the new one is in the list.', 'ok');
        renderPeople();
      } catch (err) {
        toast('Could not reset password: ' + err.message, 'err');
        btn.disabled = false;
      }
    });
  });

  root.querySelectorAll('[data-emp-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.empDelete);
      const person = allPeople.find(p => p.kind === 'EMPLOYEE' && p.id === id);
      if (!confirm('Delete ' + (person ? person.name : 'this person') + '? This cannot be undone.')) return;
      btn.disabled = true;
      try {
        await api(PM_EMPLOYEES_DELETE_URL, { method: 'POST', body: { employee_id: id } });
        renderPeople();
      } catch (err) {
        toast('Could not delete: ' + err.message, 'err');
        btn.disabled = false;
      }
    });
  });
}

// Copy-to-clipboard for generated passwords — they were displayed but
// could only be transcribed by hand, which is where typos come from.
function wireCopyButtons(root){
  root.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        toast('Password copied to clipboard.', 'ok');
      } catch (_) {
        toast('Could not copy automatically — select the text and copy it.', 'err');
      }
    });
  });
}

document.getElementById('peopleSearch').addEventListener('input', drawPeople);
document.getElementById('peopleRoleFilter').addEventListener('change', drawPeople);
document.getElementById('personAddToggle').addEventListener('click', () => {
  document.getElementById('personAddForm').classList.toggle('open');
  document.getElementById('personName').focus();
});
document.getElementById('personAddCancel').addEventListener('click', () => {
  document.getElementById('personAddForm').classList.remove('open');
});

// Department/designation only mean anything for roster entries, and a
// staff login can't exist without an email — so the form follows the role.
function syncPersonForm(){
  const isEmployee = document.getElementById('personRole').value === 'EMPLOYEE';
  document.getElementById('personDeptField').hidden = !isEmployee;
  document.getElementById('personDesigField').hidden = !isEmployee;
  document.getElementById('personEmailHint').textContent =
    isEmployee ? '— optional, grants a login' : '— required for a staff login';
  document.getElementById('personEmail').required = !isEmployee;
}
document.getElementById('personRole').addEventListener('change', syncPersonForm);
syncPersonForm();

document.getElementById('personAddForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('personName').value.trim();
  const role = document.getElementById('personRole').value;
  const email = document.getElementById('personEmail').value.trim();
  if (!name) return;
  if (role !== 'EMPLOYEE' && !email) {
    toast('A staff login needs an email address.', 'err');
    return;
  }
  try {
    const result = await api(PM_PEOPLE_CREATE_URL, { method: 'POST', body: {
      name, role, email,
      department: document.getElementById('personDepartment').value.trim(),
      designation: document.getElementById('personDesignation').value.trim()
    }});
    e.target.reset();
    syncPersonForm();
    e.target.classList.remove('open');
    if (result.temp_password) {
      toast('Login created for ' + result.login_email +
            '.\nTemporary password: ' + result.temp_password +
            '\n\nAlso visible any time in the list below.', 'ok', true);
    } else {
      toast('Added to the roster.', 'ok');
    }
    renderPeople();
  } catch (err) {
    toast('Could not add person: ' + err.message, 'err');
  }
});

/* ════════════════════════════════════════════════════
   QA access — which projects each QA account can see
   ════════════════════════════════════════════════════ */
async function renderQaAccess(){
  const el = document.getElementById('qaAccessList');
  if (!isAdmin) { el.innerHTML = '<div class="empty">Admins only.</div>'; return; }
  el.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const [qas, projects] = await Promise.all([
      api(PM_QA_ASSIGNMENTS_URL),
      api(PM_PROJECTS_LIST_URL)
    ]);
    if (!qas.length) {
      el.innerHTML = '<div class="empty">No QA accounts yet. Add one from ' +
        '<a class="xref" href="#/people">People</a> with the QA role.</div>';
      return;
    }
    if (!projects.length) {
      el.innerHTML = '<div class="empty">No projects exist yet to assign.</div>';
      return;
    }
    el.innerHTML = qas.map(q =>
      '<div class="sect" style="margin-bottom:14px" data-qa-card="' + q.qa_id + '">' +
        '<h4>' + esc(q.full_name) + '</h4>' +
        '<div class="check-group" style="margin-bottom:12px">' +
          projects.map(p =>
            '<label class="check"><input type="checkbox" value="' + p.project_id + '"' +
            (q.project_ids.includes(p.project_id) ? ' checked' : '') + ' data-qa-proj />' +
            '<span>' + esc(p.project_name) + '</span></label>').join('') +
        '</div>' +
        '<button type="button" class="icon-btn" data-qa-save="' + q.qa_id + '">Save access</button>' +
      '</div>').join('');

    el.querySelectorAll('[data-qa-save]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const qaId = Number(btn.dataset.qaSave);
        const card = el.querySelector('[data-qa-card="' + qaId + '"]');
        const ids = [...card.querySelectorAll('[data-qa-proj]:checked')].map(c => Number(c.value));
        btn.disabled = true;
        try {
          await api(PM_QA_ASSIGN_URL, { method: 'POST', body: { qa_id: qaId, project_ids: ids } });
          toast(ids.length ? 'Access saved — ' + ids.length + ' project(s).'
                           : 'Access cleared — this QA account now sees nothing.', 'ok');
        } catch (err) {
          toast('Could not save access: ' + err.message, 'err');
        }
        btn.disabled = false;
      });
    });
  } catch (err) {
    el.innerHTML = '<div class="empty">Could not load QA access (' + esc(err.message) + ').</div>';
  }
}

/* ════════════════════════════════════════════════════
   Boot
   ════════════════════════════════════════════════════ */
session = readSession();
if (session) {
  isAdmin = String(session.role || '').toUpperCase() === 'ADMIN';
  showApp();
} else {
  showSignedOut();
}
