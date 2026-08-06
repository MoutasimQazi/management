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

  document.querySelector('[data-nav="leave"]').hidden = true;
  const leavePage = document.getElementById('page-leave');
  if (leavePage) leavePage.remove();

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
  if (!['work','projects','questions','leave'].includes(page)) page = 'work';
  // An admin has no Leave page here — a stale bookmark lands on the board.
  if (page === 'leave' && isAdmin) page = 'work';

  pages.forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  navLinks.forEach(a => a.classList.toggle('on', a.dataset.nav === page));

  if (page === 'work')      renderDesigns();
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
  const body = {
    project_id:  Number(document.getElementById('dProject').value),
    title:       document.getElementById('dTitle').value.trim(),
    brief:       document.getElementById('dBrief').value.trim(),
    kind:        document.getElementById('dKind').value,
    link:        document.getElementById('dLink').value.trim(),
    due_date:    document.getElementById('dDue').value,
    assigned_to: document.getElementById('dAssignee').value
  };
  if (!body.project_id || !body.title) return;
  try {
    await api(PM_DESIGN_CREATE_URL, { method:'POST', body });
    e.target.reset();
    e.target.classList.remove('open');
    renderDesigns();
  } catch (err) {
    toast('Could not create the design task: ' + err.message, 'err');
  }
});

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
    statsEl.innerHTML = [
      { num: myProjects.length, lbl: '📁 Projects' },
      { num: total - done,      lbl: '✏️ Open tasks' },
      { num: review,            lbl: '👀 In review' },
      { num: changes,           lbl: '↩️ Changes asked' }
    ].map(t => '<div class="stat"><div class="num">' + t.num + '</div>' +
               '<div class="lbl">' + esc(t.lbl) + '</div></div>').join('');

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
