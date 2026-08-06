/* ════════════════════════════════════════════════════
   Developer self-service module
   ────────────────────────────────────────────────────
   Same session as the rest of the workspace ("fireflies.session"),
   same PHP backend (pm-backend-php/). A developer's token only ever
   returns their own tasks/questions — the backend enforces that, this
   file just renders what comes back.
   ════════════════════════════════════════════════════ */
const SESSION_KEY = "fireflies.session";
const PM_API_BASE = "https://management.moveneticsdigital.com/pm-backend-php/";

const PM_TASKS_LIST_URL       = PM_API_BASE + "pm-tasks-list.php";
const PM_TASKS_STATUS_URL     = PM_API_BASE + "pm-tasks-status.php";
const PM_QUESTIONS_LIST_URL   = PM_API_BASE + "pm-questions-list.php";
const PM_QUESTIONS_CREATE_URL = PM_API_BASE + "pm-questions-create.php";
const PM_LEAVE_LIST_URL       = PM_API_BASE + "pm-leave-list.php";
const PM_LEAVE_CREATE_URL     = PM_API_BASE + "pm-leave-create.php";
const PM_APPROVERS_LIST_URL   = PM_API_BASE + "pm-approvers-list.php";

/* ── DOM references ─────────────────────────────────── */
const pmSignedOut = document.getElementById('pmSignedOut');
const appView     = document.getElementById('appView');
const whoEmail    = document.getElementById('whoEmail');
const signOutBtn  = document.getElementById('signOut');
const navLinks    = document.querySelectorAll('nav.subnav a');
const pages       = document.querySelectorAll('.page');

let session = null;
let myTasks = [];

/* ── Helpers (same shapes as projects.js) ────────────── */
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
function prioBadge(p){
  if (!p) return '';
  return '<span class="status-badge prio-' + esc(String(p).toLowerCase()) + '">' +
    esc(statusLabel(p)) + '</span>';
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
  route();
}
signOutBtn.addEventListener('click', () => {
  clearSession();
  location.href = 'login.html?m=out';
});

/* ── Router ──────────────────────────────────────────── */
function route(){
  if (!readSession()) { showSignedOut(); return; }
  const hash  = location.hash || '#/tasks';
  let page    = hash.replace(/^#\//, '') || 'tasks';
  if (!['tasks','questions','leave'].includes(page)) page = 'tasks';

  pages.forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  navLinks.forEach(a => a.classList.toggle('on', a.dataset.nav === page));

  if (page === 'tasks')     renderTasks();
  if (page === 'questions') renderQuestions();
  if (page === 'leave')     renderLeave();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* ════════════════════════════════════════════════════
   My tasks
   ════════════════════════════════════════════════════ */
async function renderTasks(){
  const listEl = document.getElementById('tasksList');
  listEl.innerHTML = '<div class="empty">Loading…</div>';
  try {
    myTasks = await api(PM_TASKS_LIST_URL);
    listEl.innerHTML = myTasks.length ? tasksTable(myTasks)
      : '<div class="empty">No tasks assigned to you yet.</div>';
    wireTaskRows(listEl);
  } catch (err) {
    listEl.innerHTML = '<div class="empty">Could not load your tasks (' + esc(err.message) + ').</div>';
  }
}

function tasksTable(rows){
  return '<div class="table-wrap"><table class="data-table"><thead><tr>' +
    '<th>Task</th><th>Project</th><th>Est.</th><th>Progress</th><th>Priority</th><th>Status</th><th></th>' +
    '</tr></thead><tbody>' + rows.map(taskRow).join('') + '</tbody></table></div>';
}
function taskRow(t){
  const options = ['TODO','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED']
    .filter(s => s !== t.status)
    .map(s => '<option value="' + s + '">' + statusLabel(s) + '</option>');
  const selectHtml =
    '<select class="status-select" data-task-id="' + t.task_id + '">' +
      '<option value="">Move to…</option>' + options.join('') + '</select>';
  return '<tr data-task-row="' + t.task_id + '">' +
    '<td><div class="ttitle">' + esc(t.task_name) + '</div>' +
      (t.description ? '<div class="tsub">' + esc(t.description) + '</div>' : '') + '</td>' +
    '<td>' + esc(t.project_name || '—') + '</td>' +
    '<td class="nowrap">' + (t.eta_hours != null ? esc(t.eta_hours) + 'h' : '—') + '</td>' +
    '<td class="nowrap">' + (t.progress_percentage != null ? t.progress_percentage + '%' : '—') + '</td>' +
    '<td>' + prioBadge(t.priority) + '</td>' +
    '<td>' + badge(t.status) + '</td>' +
    '<td class="actions-cell">' + selectHtml +
      '<input type="number" min="0" max="100" step="5" placeholder="%" style="width:60px" data-progress-input="' + t.task_id + '" />' +
      '<button type="button" class="icon-btn" data-progress-save="' + t.task_id + '">Save %</button>' +
    '</td></tr>';
}

function wireTaskRows(root){
  root.querySelectorAll('select[data-task-id]').forEach(sel => {
    sel.addEventListener('change', async () => {
      const status = sel.value;
      if (!status) return;
      const taskId = Number(sel.dataset.taskId);
      sel.disabled = true;
      try {
        await api(PM_TASKS_STATUS_URL, { method: 'POST', body: { task_id: taskId, status } });
        renderTasks();
      } catch (err) {
        toast('Could not update task: ' + err.message, 'err');
        sel.disabled = false;
        sel.value = '';
      }
    });
  });
  root.querySelectorAll('[data-progress-save]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.progressSave);
      const input = root.querySelector('[data-progress-input="' + id + '"]');
      const progress = input.value;
      if (progress === '') return;
      const t = myTasks.find(x => x.task_id === id);
      btn.disabled = true;
      try {
        await api(PM_TASKS_STATUS_URL, { method: 'POST',
          body: { task_id: id, status: t ? t.status : 'IN_PROGRESS', progress: Number(progress) } });
        renderTasks();
      } catch (err) {
        toast('Could not update progress: ' + err.message, 'err');
        btn.disabled = false;
      }
    });
  });
}

/* ════════════════════════════════════════════════════
   Questions
   ════════════════════════════════════════════════════ */
async function renderQuestions(){
  const listEl = document.getElementById('questionsList');
  listEl.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const [questions, tasks] = await Promise.all([
      api(PM_QUESTIONS_LIST_URL),
      myTasks.length ? Promise.resolve(myTasks) : api(PM_TASKS_LIST_URL)
    ]);
    myTasks = tasks;
    const sel = document.getElementById('qTaskSelect');
    sel.innerHTML = '<option value="">Select a task…</option>' +
      myTasks.map(t => '<option value="' + t.task_id + '">' + esc(t.task_name) + ' — ' + esc(t.project_name) + '</option>').join('');

    listEl.innerHTML = questions.length
      ? questions.map(questionCard).join('')
      : '<div class="empty">You haven\'t asked anything yet.</div>';
  } catch (err) {
    listEl.innerHTML = '<div class="empty">Could not load questions (' + esc(err.message) + ').</div>';
  }
}
document.getElementById('newQuestionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const task_id = document.getElementById('qTaskSelect').value;
  const question = document.getElementById('qText').value.trim();
  if (!task_id || !question) return;
  try {
    await api(PM_QUESTIONS_CREATE_URL, { method: 'POST', body: { task_id: Number(task_id), question } });
    e.target.reset();
    renderQuestions();
  } catch (err) {
    toast('Could not send question: ' + err.message, 'err');
  }
});
function questionCard(q){
  return '<div class="question-card">' +
    '<div class="qmeta">' + badge(q.status) + '<span>' + esc(q.task_name || '') +
      (q.project_name ? ' — ' + esc(q.project_name) : '') + '</span>' +
      '<span>' + esc(fmtDate(q.created_at)) + '</span></div>' +
    '<p class="qtext">' + esc(q.question) + '</p>' +
    (q.status === 'ANSWERED' || q.answer
      ? '<div class="answer-block"><div class="aby">Answer</div><span>' + esc(q.answer) + '</span></div>'
      : '<div class="answer-block"><span>Waiting on an answer.</span></div>') +
  '</div>';
}

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
  const end_date = document.getElementById('leaveEnd').value;
  const reason = document.getElementById('leaveReason').value.trim();
  const approver_ids = [...document.querySelectorAll('#leaveApprovers [data-approver]:checked')]
    .map(cb => Number(cb.value));
  if (!start_date || !end_date) return;
  if (!approver_ids.length) { toast('Pick at least one approver to send this to.', 'err'); return; }
  try {
    await api(PM_LEAVE_CREATE_URL, { method: 'POST', body: { start_date, end_date, reason, approver_ids } });
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
