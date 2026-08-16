/* ════════════════════════════════════════════════════
   Design / UI-UX module
   ────────────────────────────────────────────────────
   Same shared session + PHP backend as the rest of the
   workspace. A designer account only ever sees the
   projects an admin assigned it (design_assignments);
   ADMIN sees all and managers see their own. The backend
   enforces that — this file just renders what comes back.

   Designers live in the managers table, like QA, so they
   work across whole projects rather than being handed
   rows off one project's task list. Their work is
   design_tasks, not tasks.

   Pages: #/work  #/projects  #/questions  #/leave
   ════════════════════════════════════════════════════ */
const SESSION_KEY = "fireflies.session";
const PM_API_BASE = "https://management.moveneticsdigital.com/pm-backend-php/";

const PM_DESIGN_PROJECTS_URL  = PM_API_BASE + "pm-design-projects-list.php";
const PM_DESIGNERS_LIST_URL   = PM_API_BASE + "pm-designers-list.php";
const PM_DESIGN_LIST_URL      = PM_API_BASE + "pm-designtasks-list.php";
const PM_DESIGN_CREATE_URL    = PM_API_BASE + "pm-designtasks-create.php";
const PM_DESIGN_UPDATE_URL    = PM_API_BASE + "pm-designtasks-update.php";
const PM_DESIGN_DELETE_URL    = PM_API_BASE + "pm-designtasks-delete.php";
const PM_RATES_LIST_URL       = PM_API_BASE + "pm-design-estimates-list.php";
const PM_RATES_SAVE_URL       = PM_API_BASE + "pm-design-estimates-save.php";
const PM_RATES_DELETE_URL     = PM_API_BASE + "pm-design-estimates-delete.php";
const PM_BUGS_LIST_URL        = PM_API_BASE + "pm-bugs-list.php";
const PM_DEMOS_LIST_URL       = PM_API_BASE + "pm-demos-list.php";
const PM_BUGS_UPDATE_URL      = PM_API_BASE + "pm-bugs-update.php";
const PM_TASKS_LIST_URL       = PM_API_BASE + "pm-tasks-list.php";
const PM_QUESTIONS_LIST_URL   = PM_API_BASE + "pm-questions-list.php";
const PM_QUESTIONS_CREATE_URL = PM_API_BASE + "pm-questions-create.php";
const PM_LEAVE_LIST_URL       = PM_API_BASE + "pm-leave-list.php";
const PM_LEAVE_CREATE_URL     = PM_API_BASE + "pm-leave-create.php";
const PM_APPROVERS_LIST_URL   = PM_API_BASE + "pm-approvers-list.php";

/* ── DOM references ─────────────────────────────────── */
const pmSignedOut = document.getElementById('pmSignedOut');
const appView     = document.getElementById('appView');
const whoEmail    = document.getElementById('whoEmail');
const roleBadge   = document.getElementById('roleBadge');
const signOutBtn  = document.getElementById('signOut');
const navLinks    = document.querySelectorAll('nav.subnav a');
const pages       = document.querySelectorAll('.page');

let session     = null;
let isAdmin     = false;
let myProjects  = [];
let allDesigners = [];
let allDesigns  = [];
let allRates    = [];   // the design_estimates rate card, DESIGN rows

const STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'CHANGES', 'APPROVED'];
const KIND_LABELS = {
  UI:'UI', UX:'UX', BRANDING:'Branding', ILLUSTRATION:'Illustration', OTHER:'Other'
};

/* ── Helpers (same shapes as qa.js / projects.js) ────── */
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

/* A due date is only worth pointing at when it is close or gone. */
function dueNote(v){
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  const days = Math.ceil((d.setHours(23,59,59,999) - Date.now()) / 86400000);
  if (days < 0)  return '<span class="due over">' + Math.abs(days) + 'd overdue</span>';
  if (days === 0) return '<span class="due soon">Due today</span>';
  if (days <= 3)  return '<span class="due soon">Due in ' + days + 'd</span>';
  return '<span>Due ' + esc(fmtDay(v)) + '</span>';
}

/* Non-blocking notification, replacing alert(). */
function toast(msg, kind, sticky){
  let host = document.getElementById('toastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toastHost';
    host.className = 'toast-host';
    /* Announced to a screen reader. Without this a toast is the only
       feedback for saving, deleting or failing, and it is silent —
       polite so it waits for a pause rather than cutting across. */
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || 'info');
  const msgEl = document.createElement('span');
  msgEl.className = 'tmsg';
  msgEl.textContent = msg;
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'tclose'; btn.textContent = '×';
  btn.setAttribute('aria-label', 'Dismiss');
  const close = () => { el.classList.add('leaving'); setTimeout(() => el.remove(), 200); };
  btn.addEventListener('click', close);
  el.appendChild(msgEl); el.appendChild(btn);
  host.appendChild(el);
  if (!sticky) setTimeout(close, kind === 'err' ? 6500 : 4000);
}

/* Double-submit guard — see the same block in the other modules. */
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

function renderUserChip(el, email){
  const addr = email || '';
  const handle = addr.split('@')[0] || '';
  const parts = handle.split(/[._-]+/).filter(Boolean);
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
  isAdmin = String(session.role || '').toUpperCase() === 'ADMIN';
  roleBadge.textContent = isAdmin ? 'Admin' : 'Designer';
  roleBadge.className = 'role-badge' + (isAdmin ? '' : ' manager');
  document.querySelectorAll('.nav-admin').forEach(a => { a.hidden = !isAdmin; });

  /* Everyone on a project sees its demos — renderer in ui.js so the
     Overview and every role page say the same thing about the same date. */
  renderUpcomingDemos({
    url: PM_DEMOS_LIST_URL, token: session.token,
    panel: 'demoPanel', list: 'demoList', count: 'demoCount'
  });
  applyRoleView();
  loadProjects();
  route();
}

/* What this page means depends on who is looking at it.

   A designer is looking at their own work: the board opens on what is
   assigned to them, and this is the only place they can file leave.

   An admin is not a designer. The backend will not let a design task be
   assigned to one, so "Assigned to me" is permanently empty and "Take
   this on" is refused every time — both were on screen doing nothing but
   producing an error. An admin is here to oversee, so the board opens on
   everyone's work and the possessives come off the headings.

   Leave goes altogether: the Overview already carries it for staff, with
   the approvals half this page has no room for. Two places to request
   leave, one of which cannot approve any, is worse than one. */
function applyRoleView(){
  // The rate card is company policy about how long work takes, so only
  // an admin edits it — everyone else just gets estimated by it.
  document.getElementById('ratesNavLink').hidden = !isAdmin;
  if (!isAdmin) return;

  const retitle = (sel, html, sub) => {
    const sec = document.querySelector(sel);
    sec.querySelector('h1').innerHTML = html;
    sec.querySelector('.sub').textContent = sub;
  };
  retitle('#page-work', 'Design <em>work</em>',
    'Every design task across every project. Unfinished work first, nearest deadline at the top.');
  retitle('#page-projects', 'Design <em>progress</em>',
    'Every project, and how far the design work on each has got.');
  retitle('#page-questions', 'Project <em>questions</em>',
    'Every question raised across every project, and what came back.');

  /* Both of these are "what is on my desk" pages, and an admin has no
     desk here: no design task and no bug can be assigned to one. Leave
     is on the Overview for them, and every bug is on the QA board. */
  ['leave', 'bugs'].forEach(nav => {
    document.querySelector('[data-nav="' + nav + '"]').hidden = true;
    const page = document.getElementById('page-' + nav);
    if (page) page.remove();
  });

  const scope = document.getElementById('designScopeFilter');
  const mine  = scope.querySelector('[value="mine"]');
  if (mine) mine.remove();
  scope.value = 'all';
}
signOutBtn.addEventListener('click', () => {
  clearSession();
  location.href = 'login.html?m=out';
});

/* ── Router ──────────────────────────────────────────── */
function route(){
  if (!readSession()) { showSignedOut(); return; }
  let page = (location.hash || '#/work').replace(/^#\//, '') || 'work';
  if (!['work','bugs','projects','questions','leave','rates'].includes(page)) page = 'work';
  // An admin has neither of these pages here — see applyRoleView. A stale
  // bookmark lands on the board rather than a section that was removed.
  if ((page === 'leave' || page === 'bugs') && isAdmin) page = 'work';
  // And the rate card is theirs alone.
  if (page === 'rates' && !isAdmin) page = 'work';

  pages.forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  navLinks.forEach(a => a.classList.toggle('on', a.dataset.nav === page));

  if (page === 'work')      renderDesigns();
  if (page === 'bugs')      renderBugs();
  if (page === 'rates')     renderRates();
  if (page === 'projects')  renderProjects();
  if (page === 'questions') renderQuestions();
  if (page === 'leave')     renderLeave();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* The project and designer pickers are filled once — an account's
   assigned set only changes when an admin edits it, not while they
   are working. */
async function loadProjects(){
  try {
    const [projects, designers] = await Promise.all([
      api(PM_DESIGN_PROJECTS_URL),
      api(PM_DESIGNERS_LIST_URL).catch(() => [])
    ]);
    myProjects = projects;
    allDesigners = designers;

    /* The rate card fills the deliverable picker. Tolerated if it fails
       — migration 009 may not be in yet, and not having an estimate must
       not stop design work being created with a hand-set date. */
    loadRates().catch(() => {
      document.getElementById('dDeliverable').innerHTML =
        '<option value="">Rate card unavailable — set the date by hand</option>';
    });

    const sel = document.getElementById('dProject');
    // An admin sees every project, so an empty list means none exist —
    // not that nobody has assigned them any.
    sel.innerHTML = myProjects.length
      ? '<option value="">Select a project…</option>' +
        myProjects.map(p => '<option value="' + p.project_id + '">' + esc(p.project_name) + '</option>').join('')
      : '<option value="">' + (isAdmin ? 'No projects exist yet' : 'No projects assigned to you yet') + '</option>';

    document.getElementById('dAssignee').innerHTML =
      '<option value="">Nobody yet</option>' +
      allDesigners.map(d => '<option value="' + d.designer_id + '">' + esc(d.full_name) + '</option>').join('');
  } catch (err) {
    toast('Could not load your projects: ' + err.message, 'err');
  }
}

/* ════════════════════════════════════════════════════
   The rate card
   ────────────────────────────────────────────────────
   Rates are stored as hours for one unit, because the
   source sheet writes them both ways round — "2 Screens
   / Hour" and "1 Screen / 2 Hours" are the same axis
   read from opposite ends, and only one of them can be
   multiplied by a quantity. The familiar phrasing is
   rebuilt for display.

   The date preview here mirrors designTargetDate() in
   auth.php. The server recomputes on save and its answer
   is the one stored — this is a preview, so that picking
   "worst case" visibly moves the date before anyone
   commits to it.
   ════════════════════════════════════════════════════ */
/* rateText / hoursText / targetDateFrom / CASE_COLS live in ui.js — the
   Projects rate card needs the same four and two copies would drift. */
async function loadRates(){
  const data = await api(PM_RATES_LIST_URL + '?discipline=DESIGN' + (isAdmin ? '&all=1' : ''));
  allRates = data.estimates || [];
  setEstimateHoursPerDay(data.hours_per_day);   // ui.js keeps the shared value
  fillDeliverablePicker();
  return allRates;
}

/* Two dependent selects over one flat list: the deliverable narrows the
   complexities, because not every deliverable has all three. */
function fillDeliverablePicker(){
  const dSel = document.getElementById('dDeliverable');
  if (!dSel) return;
  const usable = allRates.filter(r => r.is_active);
  const names = [...new Set(usable.map(r => r.deliverable))];
  dSel.innerHTML = names.length
    ? '<option value="">No estimate — set the date by hand</option>' +
      names.map(n => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('')
    : '<option value="">Rate card is empty</option>';
  fillComplexityPicker();
}

function fillComplexityPicker(){
  const name = document.getElementById('dDeliverable').value;
  const cSel = document.getElementById('dComplexity');
  const rows = allRates.filter(r => r.is_active && r.deliverable === name);
  cSel.innerHTML = rows.length
    ? rows.map(r => '<option value="' + r.estimate_id + '">' +
        esc(r.complexity.charAt(0) + r.complexity.slice(1).toLowerCase()) +
        (r.definition ? ' — ' + esc(r.definition) : '') + '</option>').join('')
    : '<option value="">—</option>';
  refreshEstimate();
}

function currentRate(){
  const id = Number(document.getElementById('dComplexity').value);
  return allRates.find(r => Number(r.estimate_id) === id) || null;
}

/* Recomputed on every change to anything it depends on, so the sentence
   under the form always describes what is about to be saved. */
function refreshEstimate(){
  const note = document.getElementById('dEstimateNote');
  const rate = currentRate();
  const unitLabel = document.getElementById('dUnitLabel');

  if (!rate) {
    unitLabel.textContent = 'units';
    note.className = 'estimate-note';
    note.textContent = 'No estimate — set the due date by hand.';
    return;
  }

  unitLabel.textContent = (rate.unit || 'Screen').toLowerCase() + 's';
  const qty   = Number(document.getElementById('dQuantity').value) || 0;
  const frd   = document.getElementById('dFrd').value;
  const kase  = document.getElementById('dCase').value;
  const per   = Number(rate[CASE_COLS[frd + ':' + kase]]);
  const hours = Math.round(per * qty * 100) / 100;
  const start = document.getElementById('dStart').value;
  const target = targetDateFrom(hours, start);

  note.className = 'estimate-note on';
  note.innerHTML = qty > 0
    ? '<b>' + esc(hoursText(hours)) + '</b> — ' + esc(rateText(per, rate.unit)) +
      ' × ' + qty + ' ' + esc((rate.unit || 'unit').toLowerCase()) + (qty === 1 ? '' : 's') +
      (target ? '. Target <b>' + esc(fmtDay(target)) + '</b>' +
                ', unless you set a due date below.' : '.')
    : 'Enter how many ' + esc((rate.unit || 'unit').toLowerCase()) + 's to get an estimate.';
}

['dDeliverable'].forEach(id =>
  document.getElementById(id).addEventListener('change', fillComplexityPicker));
['dComplexity', 'dQuantity', 'dFrd', 'dCase', 'dStart'].forEach(id =>
  document.getElementById(id).addEventListener('input', refreshEstimate));

/* ════════════════════════════════════════════════════
   My work — the design task board
   ════════════════════════════════════════════════════ */
document.getElementById('newDesignToggle').addEventListener('click', () => {
  document.getElementById('newDesignForm').classList.toggle('open');
});
document.getElementById('designCancelBtn').addEventListener('click', () => {
  document.getElementById('newDesignForm').classList.remove('open');
});

/* Who a task belongs to is decided by the server, from the token — the
   browser session holds an email, a token and a role, and never a
   numeric id, so "assigned to me" cannot be worked out here. Changing
   the scope therefore costs a request; the search box and the status
   filter are applied to what came back. */
const SCOPE_QUERY = { mine: '?mine=1', all: '', unassigned: '?unassigned=1' };

async function renderDesigns(){
  const listEl = document.getElementById('designList');
  listEl.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const scope = document.getElementById('designScopeFilter').value;
    allDesigns = await api(PM_DESIGN_LIST_URL + (SCOPE_QUERY[scope] || ''));
    drawDesigns();
  } catch (err) {
    listEl.innerHTML = '<div class="empty">Could not load design tasks (' + esc(err.message) + ').</div>';
  }
}

function drawDesigns(){
  const listEl = document.getElementById('designList');
  const q      = (document.getElementById('designSearch').value || '').trim().toLowerCase();
  const scope  = document.getElementById('designScopeFilter').value;
  const status = document.getElementById('designStatusFilter').value;

  const rows = allDesigns.filter(d => {
    if (status && d.status !== status) return false;
    if (q && ![d.title, d.project_name, d.assigned_to_name, KIND_LABELS[d.kind]]
        .some(v => String(v || '').toLowerCase().includes(q))) return false;
    return true;
  });

  document.getElementById('designCount').textContent =
    rows.length === allDesigns.length ? String(allDesigns.length)
                                      : rows.length + ' of ' + allDesigns.length;

  if (!allDesigns.length) {
    const scopeNote = {
      mine:       'Nothing is assigned to you right now.',
      unassigned: 'Nothing is waiting to be picked up.',
      all:        'No design tasks yet.'
    }[scope] || 'No design tasks yet.';
    const next = myProjects.length
      ? ' Use “+ New design task” above.'
      : (isAdmin ? ' No projects exist yet to attach design work to.'
                 : ' No projects are assigned to you yet — ask an admin.');
    listEl.innerHTML = '<div class="empty">' + scopeNote + next + '</div>';
    return;
  }
  if (!rows.length) {
    listEl.innerHTML = '<div class="empty">Nothing matches that filter.</div>';
    return;
  }
  listEl.innerHTML = rows.map(designRow).join('');
  wireDesignRows(listEl);
}

function designRow(d){
  return '<div class="task-row" data-design-row="' + d.design_id + '">' +
    '<div class="tinfo">' +
      '<div class="ttitle">' + esc(d.title) + '</div>' +
      '<div class="tmeta">' +
        '<span class="kindchip">' + esc(KIND_LABELS[d.kind] || d.kind) + '</span>' +
        '<span>' + esc(d.project_name) + '</span>' +
        '<span>' + (d.assigned_to_name ? esc(d.assigned_to_name) : 'Unassigned') + '</span>' +
        // What the estimate was, and under which conditions — so a date
        // that looks wrong can be argued with rather than just missed.
        (d.estimated_hours > 0
          ? '<span title="' + esc((d.estimate_deliverable || '') + ' · ' +
              (d.estimate_complexity || '').toLowerCase() + ' · ' +
              (d.has_frd == 1 ? 'with FRD' : 'without FRD') + ' · ' +
              String(d.estimate_case || '').toLowerCase() + ' case') + '">' +
            'Est. ' + esc(hoursText(Number(d.estimated_hours))) + '</span>'
          : '') +
        dueNote(d.due_date) +
        // safeUrl (ui.js): an escaped "javascript:…" is still a live
        // javascript: URL, so only http(s) is rendered as a link at all.
        (safeUrl(d.link)
          ? '<a href="' + esc(safeUrl(d.link)) + '" target="_blank" rel="noopener">Open the work ↗</a>'
          : '') +
      '</div>' +
      (d.brief ? '<div class="tdesc">' + esc(d.brief) + '</div>' : '') +
    '</div>' +
    '<div class="tactions">' +
      badge(d.status) +
      '<select class="status-select" data-design-status="' + d.design_id + '" aria-label="Status">' +
        STATUSES.map(s => '<option value="' + s + '"' + (d.status === s ? ' selected' : '') + '>' +
          esc(statusLabel(s)) + '</option>').join('') +
      '</select>' +
      // Only a designer can be an assignee, so only a designer is offered
      // the one-click way to become one.
      (isAdmin ? '' : '<button type="button" class="icon-btn" data-design-take="' + d.design_id + '">Take</button>') +
      '<button type="button" class="icon-btn" data-design-extend="' + d.design_id + '">Extend</button>' +
      '<button type="button" class="icon-btn danger" data-design-del="' + d.design_id + '">Delete</button>' +
    '</div>' +
  '</div>';
}

function wireDesignRows(root){
  root.querySelectorAll('[data-design-status]').forEach(sel => {
    sel.addEventListener('change', async () => {
      const id = Number(sel.dataset.designStatus);
      sel.disabled = true;
      try {
        await api(PM_DESIGN_UPDATE_URL, { method:'POST', body:{ design_id:id, status:sel.value } });
        await renderDesigns();
      } catch (err) {
        toast('Could not update: ' + err.message, 'err');
        sel.disabled = false;
      }
    });
  });

  // "Take" is the one-click version of assigning yourself — the common
  // move on a shared board, and otherwise a trip through an edit form.
  root.querySelectorAll('[data-design-take]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.designTake);
      btn.disabled = true;
      try {
        // 'me' is resolved from the token server-side; see SCOPE_QUERY above.
        await api(PM_DESIGN_UPDATE_URL, { method:'POST', body:{ design_id:id, assigned_to:'me' } });
        await renderDesigns();
      } catch (err) {
        toast('Could not take this on: ' + err.message, 'err');
        btn.disabled = false;
      }
    });
  });

  /* Moving a due date needs a reason and is recorded — extendDueDate in
     ui.js asks for both and writes them together. */
  root.querySelectorAll('[data-design-extend]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.designExtend);
      const d  = allDesigns.find(x => Number(x.design_id) === id);
      if (await extendDueDate(
        { type:'DESIGN', id, name: d && d.title, due: d && d.due_date }, session.token
      )) renderDesigns();
    });
  });

  root.querySelectorAll('[data-design-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.designDel);
      const row = allDesigns.find(d => Number(d.design_id) === id);
      if (!await confirmDialog({
        title: 'Delete “' + (row ? row.title : 'this task') + '”?',
        body: 'The design task and its brief are removed. This cannot be undone.',
        confirmLabel: 'Delete task',
        danger: true
      })) return;
      btn.disabled = true;
      try {
        await api(PM_DESIGN_DELETE_URL, { method:'POST', body:{ design_id:id } });
        await renderDesigns();
      } catch (err) {
        toast('Could not delete: ' + err.message, 'err');
        btn.disabled = false;
      }
    });
  });
}

// Scope is a different question to the server; the other two are not.
document.getElementById('designScopeFilter').addEventListener('change', renderDesigns);
['designSearch', 'designStatusFilter'].forEach(id => {
  document.getElementById(id).addEventListener('input', drawDesigns);
});

document.getElementById('newDesignForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const rate = currentRate();
  const body = {
    project_id:  Number(document.getElementById('dProject').value),
    title:       document.getElementById('dTitle').value.trim(),
    brief:       document.getElementById('dBrief').value.trim(),
    kind:        document.getElementById('dKind').value,
    link:        document.getElementById('dLink').value.trim(),
    // Blank means "use the estimate" — the server fills it in.
    due_date:    document.getElementById('dDue').value,
    assigned_to: document.getElementById('dAssignee').value,
    estimate_id:   rate ? rate.estimate_id : '',
    quantity:      Number(document.getElementById('dQuantity').value) || 1,
    has_frd:       document.getElementById('dFrd').value === '1' ? 1 : 0,
    estimate_case: document.getElementById('dCase').value,
    start_date:    document.getElementById('dStart').value
  };
  if (!body.project_id || !body.title) return;
  try {
    const res = await api(PM_DESIGN_CREATE_URL, { method:'POST', body });
    e.target.reset();
    e.target.classList.remove('open');
    // The assignee may have just been put on the project — see
    // grantProjectAccess in auth.php. Say so, do not let it be silent.
    if (res && res.granted_access) {
      toast('Design task added — and the designer was put on this project.', 'ok');
    }
    renderDesigns();
  } catch (err) {
    toast('Could not create the design task: ' + err.message, 'err');
  }
});

/* ════════════════════════════════════════════════════
   Rate card admin
   ────────────────────────────────────────────────────
   Admin-only, enforced on the server too. A rate that
   nothing has used is deleted; one that tasks reference
   is retired instead, so their estimates keep the row
   that explains where the number came from.
   ════════════════════════════════════════════════════ */
function rateFormReset(){
  const f = document.getElementById('newRateForm');
  f.reset();
  document.getElementById('rEstimateId').value = '';
  document.getElementById('rSubmitBtn').textContent = 'Add rate';
}

document.getElementById('newRateToggle').addEventListener('click', () => {
  const f = document.getElementById('newRateForm');
  if (f.classList.contains('open') && document.getElementById('rEstimateId').value) rateFormReset();
  f.classList.toggle('open');
});
document.getElementById('rateCancelBtn').addEventListener('click', () => {
  rateFormReset();
  document.getElementById('newRateForm').classList.remove('open');
});
document.getElementById('rateSearch').addEventListener('input', drawRates);

async function renderRates(){
  const listEl = document.getElementById('ratesList');
  listEl.innerHTML = '<div class="empty">Loading…</div>';
  try {
    await loadRates();
    drawRates();
  } catch (err) {
    listEl.innerHTML = '<div class="empty">Could not load the rate card (' + esc(err.message) + ').</div>';
  }
}

function drawRates(){
  const listEl = document.getElementById('ratesList');
  const q = (document.getElementById('rateSearch').value || '').trim().toLowerCase();
  const rows = q
    ? allRates.filter(r => [r.deliverable, r.definition, r.complexity]
        .some(v => String(v || '').toLowerCase().includes(q)))
    : allRates;

  document.getElementById('rateCount').textContent =
    q ? rows.length + ' of ' + allRates.length : String(allRates.length);

  if (!rows.length) {
    listEl.innerHTML = '<div class="empty">' +
      (allRates.length ? 'Nothing matches that.' : 'The rate card is empty. Import migration 009 to seed it, or add rates by hand.') +
      '</div>';
    return;
  }

  listEl.innerHTML =
    '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      '<th>Deliverable</th><th>Complexity</th>' +
      '<th>FRD best</th><th>FRD worst</th><th>No FRD best</th><th>No FRD worst</th><th></th>' +
    '</tr></thead><tbody>' +
    rows.map(r =>
      '<tr' + (r.is_active ? '' : ' class="retired"') + '>' +
        '<td><div class="ttitle">' + esc(r.deliverable) +
          (r.is_active ? '' : '<span class="gapflag">retired</span>') + '</div>' +
          (r.definition ? '<div class="tsub">' + esc(r.definition) + '</div>' : '') +
          '<div class="tsub">per ' + esc(r.unit.toLowerCase()) + '</div></td>' +
        '<td>' + esc(r.complexity.charAt(0) + r.complexity.slice(1).toLowerCase()) + '</td>' +
        '<td class="nowrap"><div class="tsub">' + esc(rateText(r.frd_best, r.unit)) + '</div></td>' +
        '<td class="nowrap"><div class="tsub">' + esc(rateText(r.frd_worst, r.unit)) + '</div></td>' +
        '<td class="nowrap"><div class="tsub">' + esc(rateText(r.nofrd_best, r.unit)) + '</div></td>' +
        '<td class="nowrap"><div class="tsub">' + esc(rateText(r.nofrd_worst, r.unit)) + '</div></td>' +
        '<td class="actions-cell">' +
          '<button type="button" class="icon-btn" data-rate-edit="' + r.estimate_id + '">Edit</button>' +
          '<button type="button" class="icon-btn danger" data-rate-del="' + r.estimate_id + '">Delete</button>' +
        '</td></tr>').join('') +
    '</tbody></table></div>';

  listEl.querySelectorAll('[data-rate-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = allRates.find(x => Number(x.estimate_id) === Number(btn.dataset.rateEdit));
      if (!r) return;
      document.getElementById('rEstimateId').value = r.estimate_id;
      document.getElementById('rDeliverable').value = r.deliverable;
      document.getElementById('rComplexity').value  = r.complexity;
      document.getElementById('rUnit').value        = r.unit;
      document.getElementById('rSort').value        = r.sort_order;
      document.getElementById('rDefinition').value  = r.definition || '';
      document.getElementById('rFrdBest').value     = r.frd_best;
      document.getElementById('rFrdWorst').value    = r.frd_worst;
      document.getElementById('rNoFrdBest').value   = r.nofrd_best;
      document.getElementById('rNoFrdWorst').value  = r.nofrd_worst;
      document.getElementById('rSubmitBtn').textContent = 'Save changes';
      document.getElementById('newRateForm').classList.add('open');
      window.scrollTo(0, 0);
    });
  });

  listEl.querySelectorAll('[data-rate-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const r = allRates.find(x => Number(x.estimate_id) === Number(btn.dataset.rateDel));
      if (!await confirmDialog({
        title: 'Delete this rate?',
        body: (r ? r.deliverable + ' · ' + r.complexity.toLowerCase() + '. ' : '') +
              'If any design task was estimated from it, it is retired instead of deleted so those estimates keep their source.',
        confirmLabel: 'Delete rate',
        danger: true
      })) return;
      btn.disabled = true;
      try {
        const res = await api(PM_RATES_DELETE_URL, { method:'POST', body:{ estimate_id: Number(btn.dataset.rateDel) } });
        toast(res.message || 'Rate deleted.', 'ok', !!res.retired);
        renderRates();
      } catch (err) {
        toast('Could not delete: ' + err.message, 'err');
        btn.disabled = false;
      }
    });
  });
}

document.getElementById('newRateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    estimate_id: document.getElementById('rEstimateId').value || 0,
    deliverable: document.getElementById('rDeliverable').value.trim(),
    complexity:  document.getElementById('rComplexity').value,
    unit:        document.getElementById('rUnit').value,
    sort_order:  Number(document.getElementById('rSort').value) || 0,
    definition:  document.getElementById('rDefinition').value.trim(),
    frd_best:    Number(document.getElementById('rFrdBest').value),
    frd_worst:   Number(document.getElementById('rFrdWorst').value),
    nofrd_best:  Number(document.getElementById('rNoFrdBest').value),
    nofrd_worst: Number(document.getElementById('rNoFrdWorst').value),
    is_active:   1,
    discipline:  'DESIGN'   // this card is the design half of the table
  };
  if (!body.deliverable) return;
  try {
    await api(PM_RATES_SAVE_URL, { method:'POST', body });
    rateFormReset();
    e.target.classList.remove('open');
    toast('Rate card updated.', 'ok');
    renderRates();
  } catch (err) {
    toast('Could not save the rate: ' + err.message, 'err');
  }
});

/* ════════════════════════════════════════════════════
   Bugs assigned to me
   ────────────────────────────────────────────────────
   ?mine=1 rather than the whole project's bug list: a
   designer can reach every bug on their projects, but
   this page is about what is on their own desk. The
   server resolves "me" from the token, as everywhere
   else here — the session carries no numeric id.
   ════════════════════════════════════════════════════ */
const BUG_STATUSES = ['OPEN','IN_PROGRESS','FIXED','VERIFIED','CLOSED','REOPENED'];

async function renderBugs(){
  const listEl = document.getElementById('bugsList');
  listEl.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const bugs = await api(PM_BUGS_LIST_URL + '?mine=1');
    document.getElementById('bugCount').textContent = String(bugs.length);
    listEl.innerHTML = bugs.length
      ? '<div class="table-wrap"><table class="data-table"><thead><tr>' +
          '<th>Bug</th><th>Project</th><th>Severity</th><th>Status</th><th>Raised by</th><th></th>' +
        '</tr></thead><tbody>' + bugs.map(bugRow).join('') + '</tbody></table></div>'
      : '<div class="empty">Nothing assigned to you. Bugs show up here when QA puts one on your desk.</div>';
    wireBugRows(listEl);
  } catch (err) {
    listEl.innerHTML = '<div class="empty">Could not load bugs (' + esc(err.message) + ').</div>';
  }
}

function bugRow(b){
  const opts = BUG_STATUSES.filter(s => s !== b.status)
    .map(s => '<option value="' + s + '">' + esc(statusLabel(s)) + '</option>').join('');
  return '<tr>' +
    '<td><div class="ttitle">' + esc(b.title) + '</div>' +
      (b.steps ? '<div class="tsub">' + esc(b.steps) + '</div>' : '') +
      (safeUrl(b.link)
        ? '<div class="tsub"><a class="evidence" href="' + esc(safeUrl(b.link)) +
          '" target="_blank" rel="noopener">Screenshot / recording ↗</a></div>'
        : '') + '</td>' +
    '<td>' + esc(b.project_name || '—') + '</td>' +
    '<td><span class="status-badge prio-' + esc(String(b.severity || '').toLowerCase()) + '">' +
      esc(statusLabel(b.severity)) + '</span></td>' +
    '<td>' + badge(b.status) + '</td>' +
    '<td class="nowrap"><div class="tsub">' + esc(b.reported_by_name || '') + '</div>' +
      '<div class="tsub">' + esc(fmtDate(b.created_at)) + '</div></td>' +
    '<td class="actions-cell">' +
      '<select class="status-select" data-bug-status="' + b.bug_id + '">' +
        '<option value="">Move to…</option>' + opts + '</select>' +
    '</td></tr>';
}

function wireBugRows(root){
  root.querySelectorAll('[data-bug-status]').forEach(sel => {
    sel.addEventListener('change', async () => {
      if (!sel.value) return;
      sel.disabled = true;
      try {
        await api(PM_BUGS_UPDATE_URL, { method:'POST',
          body:{ bug_id: Number(sel.dataset.bugStatus), status: sel.value } });
        renderBugs();
      } catch (err) {
        toast('Could not update the bug: ' + err.message, 'err');
        sel.disabled = false; sel.value = '';
      }
    });
  });
}

/* ════════════════════════════════════════════════════
   Projects — where the design work on each has got to
   ════════════════════════════════════════════════════ */
async function renderProjects(){
  const listEl  = document.getElementById('projectList');
  const statsEl = document.getElementById('designStats');
  listEl.innerHTML = '<div class="empty">Loading…</div>';
  try {
    myProjects = await api(PM_DESIGN_PROJECTS_URL);

    const total    = myProjects.reduce((n, p) => n + p.design_total, 0);
    const done     = myProjects.reduce((n, p) => n + p.design_done, 0);
    const review   = myProjects.reduce((n, p) => n + p.design_in_review, 0);
    const changes  = myProjects.reduce((n, p) => n + p.design_changes, 0);
    /* statTiles (ui.js). The three work counts open the board already
       filtered to what they are counting, so the number and the list you
       land on always agree. */
    statsEl.innerHTML = statTiles([
      { num: myProjects.length, lbl: '📁 Projects' },
      { num: total - done,      lbl: '✏️ Open tasks',    href: '#/work' },
      { num: review,            lbl: '👀 In review',     href: '#/work' },
      { num: changes,           lbl: '↩️ Changes asked', href: '#/work' }
    ]);

    document.getElementById('projectCount').textContent = String(myProjects.length);
    listEl.innerHTML = myProjects.length
      ? myProjects.map(projectRow).join('')
      : '<div class="empty">' + (isAdmin
          ? 'No projects exist yet.'
          : 'No projects are assigned to you yet — ask an admin to add you to one.') + '</div>';
  } catch (err) {
    statsEl.innerHTML = '';
    listEl.innerHTML = '<div class="empty">Could not load projects (' + esc(err.message) + ').</div>';
  }
}

function projectRow(p){
  const pct = p.design_total ? Math.round((p.design_done / p.design_total) * 100) : 0;
  return '<div class="task-row">' +
    '<div class="tinfo">' +
      '<div class="ttitle">' + esc(p.project_name) + '</div>' +
      '<div class="tmeta">' +
        (p.client_name ? '<span>' + esc(p.client_name) + '</span>' : '') +
        '<span>' + p.design_total + ' design task' + (p.design_total === 1 ? '' : 's') + '</span>' +
        (p.design_in_review ? '<span>' + p.design_in_review + ' in review</span>' : '') +
        (p.design_changes ? '<span>' + p.design_changes + ' need changes</span>' : '') +
        (p.due_date ? dueNote(p.due_date) : '') +
      '</div>' +
      '<div class="progress-track" role="img" aria-label="' + pct + '% approved">' +
        '<div class="progress-fill" style="width:' + pct + '%"></div>' +
      '</div>' +
    '</div>' +
    '<div class="tactions">' + badge(p.status) + '<span class="pctlabel">' + pct + '%</span></div>' +
  '</div>';
}

/* ════════════════════════════════════════════════════
   Questions
   ────────────────────────────────────────────────────
   Questions hang off a developer task, not off design
   work — that is how the table is shaped. A designer
   asks about any task on a project assigned to them.
   ════════════════════════════════════════════════════ */
async function renderQuestions(){
  const listEl = document.getElementById('questionsList');
  listEl.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const [questions, tasks] = await Promise.all([
      api(PM_QUESTIONS_LIST_URL),
      api(PM_TASKS_LIST_URL).catch(() => [])
    ]);

    const sel = document.getElementById('qTaskSelect');
    sel.innerHTML = tasks.length
      ? '<option value="">Select a task…</option>' +
        tasks.map(t => '<option value="' + t.task_id + '">' + esc(t.task_name) +
          ' — ' + esc(t.project_name) + '</option>').join('')
      : '<option value="">No tasks on your projects yet</option>';

    document.getElementById('questionCount').textContent = String(questions.length);
    listEl.innerHTML = questions.length
      ? questions.map(questionCard).join('')
      : '<div class="empty">Nothing asked yet on your projects.</div>';
  } catch (err) {
    listEl.innerHTML = '<div class="empty">Could not load questions (' + esc(err.message) + ').</div>';
  }
}

function questionCard(q){
  return '<div class="question-card">' +
    '<div class="qmeta">' + badge(q.status) +
      '<span>' + esc(q.task_name || '') +
        (q.project_name ? ' — ' + esc(q.project_name) : '') + '</span>' +
      '<span>' + esc(fmtDate(q.created_at)) + '</span></div>' +
    '<p class="qtext">' + esc(q.question) + '</p>' +
    (q.status === 'ANSWERED' || q.answer
      ? '<div class="answer-block"><div class="aby">Answer</div><span>' + esc(q.answer) + '</span></div>'
      : '<div class="answer-block"><span>Waiting on an answer.</span></div>') +
  '</div>';
}

document.getElementById('newQuestionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const task_id  = document.getElementById('qTaskSelect').value;
  const question = document.getElementById('qText').value.trim();
  if (!task_id || !question) return;
  try {
    await api(PM_QUESTIONS_CREATE_URL, { method:'POST', body:{ task_id:Number(task_id), question } });
    e.target.reset();
    renderQuestions();
  } catch (err) {
    toast('Could not send question: ' + err.message, 'err');
  }
});

/* ════════════════════════════════════════════════════
   Leave
   ════════════════════════════════════════════════════ */
async function loadApprovers(){
  const box = document.getElementById('leaveApprovers');
  if (box.dataset.loaded) return;
  try {
    const rows = await api(PM_APPROVERS_LIST_URL);
    box.innerHTML = rows.map(m =>
      '<label class="check"><input type="checkbox" value="' + m.manager_id + '" data-approver />' +
      '<span>' + esc(m.full_name) + '</span></label>').join('') ||
      '<span class="hint">No approvers found.</span>';
    box.dataset.loaded = '1';
  } catch (_) {
    box.innerHTML = '<span class="hint">Could not load the approver list.</span>';
  }
}

async function renderLeave(){
  const mineEl = document.getElementById('myLeaveList');
  const teamEl = document.getElementById('teamLeaveList');
  mineEl.innerHTML = '<div class="empty">Loading…</div>';
  teamEl.innerHTML = '<div class="empty">Loading…</div>';
  loadApprovers();
  try {
    const [mine, everyone] = await Promise.all([
      api(PM_LEAVE_LIST_URL + '?mine=1'),
      api(PM_LEAVE_LIST_URL)
    ]);
    document.getElementById('myLeaveCount').textContent = String(mine.length);
    mineEl.innerHTML = mine.length
      ? mine.map(leaveRow).join('')
      : '<div class="empty">No leave requests yet — use the form above.</div>';

    const others = everyone.filter(r => r.status === 'APPROVED');
    document.getElementById('teamLeaveCount').textContent = String(others.length);
    teamEl.innerHTML = others.length
      ? others.map(leaveRow).join('')
      : '<div class="empty">No one is currently on approved leave.</div>';
  } catch (err) {
    mineEl.innerHTML = '<div class="empty">Could not load leave (' + esc(err.message) + ').</div>';
    teamEl.innerHTML = '';
  }
}

function leaveRow(r){
  return '<div class="leave-row">' +
    '<div class="linfo"><div class="ltitle">' + esc(r.employee_name) + '</div>' +
      '<div class="lmeta">' +
        '<span>' + esc(fmtDay(r.start_date)) + ' – ' + esc(fmtDay(r.end_date)) + '</span>' +
        (r.reason ? '<span>' + esc(r.reason) + '</span>' : '') +
        (r.approver_names ? '<span>To ' + esc(r.approver_names) + '</span>' : '') +
        (r.reviewed_by_name ? '<span>Reviewed by ' + esc(r.reviewed_by_name) + '</span>' : '') +
      '</div></div>' +
    '<div class="tactions">' + badge(r.status) + '</div>' +
  '</div>';
}

/* Single-day leave is the common case — picking the start date fills the
   end date to match, so it takes one click instead of two calendars. */
(function wireLeaveDates(){
  const start = document.getElementById('leaveStart');
  const end   = document.getElementById('leaveEnd');
  start.addEventListener('change', () => {
    end.min = start.value;
    if (!end.value || end.value < start.value) end.value = start.value;
  });
})();

document.getElementById('newLeaveForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const start_date = document.getElementById('leaveStart').value;
  const end_date   = document.getElementById('leaveEnd').value;
  const reason     = document.getElementById('leaveReason').value.trim();
  const approver_ids = [...document.querySelectorAll('#leaveApprovers [data-approver]:checked')]
    .map(cb => Number(cb.value));
  if (!start_date || !end_date) return;
  if (!approver_ids.length) { toast('Pick at least one approver to send this to.', 'err'); return; }
  try {
    await api(PM_LEAVE_CREATE_URL, { method:'POST', body:{ start_date, end_date, reason, approver_ids } });
    e.target.reset();
    renderLeave();
  } catch (err) {
    toast('Could not submit leave request: ' + err.message, 'err');
  }
});

/* ════════════════════════════════════════════════════
   Boot
   ════════════════════════════════════════════════════ */
session = readSession();
if (session) showApp(); else showSignedOut();
