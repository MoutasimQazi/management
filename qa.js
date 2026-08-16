/* ════════════════════════════════════════════════════
   QA / software-tester module
   ────────────────────────────────────────────────────
   Same shared session + PHP backend as the rest of the
   workspace. A QA account only ever sees the projects an
   admin assigned it (qa_assignments); ADMIN sees all and
   managers see their own. The backend enforces that —
   this file just renders what comes back.
   ════════════════════════════════════════════════════ */
const SESSION_KEY = "fireflies.session";
const PM_API_BASE = "https://management.moveneticsdigital.com/pm-backend-php/";

const PM_QA_PROJECTS_URL    = PM_API_BASE + "pm-qa-projects-list.php";
const PM_BUGS_LIST_URL      = PM_API_BASE + "pm-bugs-list.php";
const PM_BUGS_CREATE_URL    = PM_API_BASE + "pm-bugs-create.php";
const PM_BUGS_UPDATE_URL    = PM_API_BASE + "pm-bugs-update.php";
const PM_BUGS_DELETE_URL    = PM_API_BASE + "pm-bugs-delete.php";
const PM_CASES_LIST_URL     = PM_API_BASE + "pm-testcases-list.php";
const PM_CASES_CREATE_URL   = PM_API_BASE + "pm-testcases-create.php";
const PM_CASES_DELETE_URL   = PM_API_BASE + "pm-testcases-delete.php";
const PM_RUNS_CREATE_URL    = PM_API_BASE + "pm-testruns-create.php";
const PM_BUG_ASSIGNEES_URL  = PM_API_BASE + "pm-bug-assignees-list.php";
const PM_DEMOS_LIST_URL       = PM_API_BASE + "pm-demos-list.php";

/* ── DOM references ─────────────────────────────────── */
const pmSignedOut = document.getElementById('pmSignedOut');
const appView     = document.getElementById('appView');
const whoEmail    = document.getElementById('whoEmail');
const roleBadge   = document.getElementById('roleBadge');
const signOutBtn  = document.getElementById('signOut');
const navLinks    = document.querySelectorAll('nav.subnav a');
const pages       = document.querySelectorAll('.page');

let session  = null;
let isAdmin  = false;
let myProjects = [];
let allBugs    = [];
let allCases   = [];
let allAssignees = [];   // developers + QA + designers + BAs, for the bug picker

/* An assignee is a (kind, id) pair because developers live in `employees`
   and everyone else in `managers` — the two can share an id. A <select>
   holds one string, so the pair is packed into one and unpacked on the
   way back out. */
function assigneeValue(kind, id){
  return (kind && id) ? kind + ':' + id : '';
}
function assigneeOptions(selectedKind, selectedId){
  const sel = assigneeValue(selectedKind, selectedId);
  return '<option value="">Nobody yet</option>' +
    allAssignees.map(a => {
      const v = assigneeValue(a.kind, a.id);
      return '<option value="' + v + '"' + (v === sel ? ' selected' : '') + '>' +
        esc(a.name) + ' — ' + esc(a.role) + '</option>';
    }).join('');
}
function assigneeBody(value){
  const [kind, id] = String(value || '').split(':');
  return { assignee_kind: kind || '', assignee_id: id || '' };
}

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
function statusLabel(s){
  return String(s || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function badge(status){
  if (!status) return '';
  return '<span class="status-badge ' + esc(String(status).toLowerCase()) + '">' +
    esc(statusLabel(status)) + '</span>';
}
/* The stored URL points at where the evidence actually lives — a
   screenshot, a screen recording, the spec a case came from. Nothing is
   uploaded here, so nothing has to be kept in step with Drive or Loom.
   safeUrl (ui.js) refuses anything that is not http(s): an escaped
   "javascript:…" is still a live javascript: URL. */
function evidenceLink(link, label){
  const url = safeUrl(link);
  if (!url) return '';
  return '<div class="tsub"><a class="evidence" href="' + esc(url) +
    '" target="_blank" rel="noopener">' + esc(label) + ' ↗</a></div>';
}

function sevBadge(s){
  if (!s) return '';
  return '<span class="status-badge prio-' + esc(String(s).toLowerCase()) + '">' +
    esc(statusLabel(s)) + '</span>';
}

/* Non-blocking notification, replacing alert(). Sticky toasts stay until
   dismissed — used for generated passwords, which need time to copy. */
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
  roleBadge.textContent = isAdmin ? 'Admin' : 'QA';
  roleBadge.className = 'role-badge' + (isAdmin ? '' : ' manager');
  document.querySelectorAll('.nav-admin').forEach(a => { a.hidden = !isAdmin; });

  /* Everyone on a project sees its demos — renderer in ui.js so the
     Overview and every role page say the same thing about the same date. */
  renderUpcomingDemos({
    url: PM_DEMOS_LIST_URL, token: session.token,
    panel: 'demoPanel', list: 'demoList', count: 'demoCount'
  });
  loadProjects();
  route();
}
signOutBtn.addEventListener('click', () => {
  clearSession();
  location.href = 'login.html?m=out';
});

/* ── Router ──────────────────────────────────────────── */
function route(){
  if (!readSession()) { showSignedOut(); return; }
  let page = (location.hash || '#/bugs').replace(/^#\//, '') || 'bugs';
  if (!['bugs','cases','projects'].includes(page)) page = 'bugs';

  pages.forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  navLinks.forEach(a => a.classList.toggle('on', a.dataset.nav === page));

  if (page === 'bugs')     renderBugs();
  if (page === 'cases')    renderCases();
  if (page === 'projects') renderQaProjects();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* Project pickers are populated once — a QA account's assigned set only
   changes when an admin edits it, not while they're working. */
/* Fetched once and remembered as a promise, because two things need it:
   the form's picker, filled as soon as it lands, and every row's picker,
   which is drawn by a separate request that could easily finish first
   and leave the list empty. Anyone who needs the names awaits this. */
let assigneesReady = null;
function loadAssignees(){
  if (assigneesReady) return assigneesReady;
  const fill = html => {
    const sel = document.getElementById('bugAssignee');
    if (sel) sel.innerHTML = html;
  };
  assigneesReady = api(PM_BUG_ASSIGNEES_URL)
    .then(rows => { allAssignees = rows; fill(assigneeOptions()); })
    // Not being able to name someone must not stop a bug being filed.
    .catch(() => { fill('<option value="">Could not load the list</option>'); });
  return assigneesReady;
}

async function loadProjects(){
  try {
    loadAssignees();
    myProjects = await api(PM_QA_PROJECTS_URL);
    const opts = myProjects.length
      ? myProjects.map(p => '<option value="' + p.project_id + '">' + esc(p.project_name) + '</option>').join('')
      : '';
    ['bugProject', 'caseProject'].forEach(id => {
      const sel = document.getElementById(id);
      sel.innerHTML = myProjects.length
        ? '<option value="">Select a project…</option>' + opts
        : '<option value="">No projects assigned to you yet</option>';
    });
  } catch (err) {
    toast('Could not load your projects: ' + err.message, 'err');
  }
}

/* ════════════════════════════════════════════════════
   Bugs
   ════════════════════════════════════════════════════ */
async function renderBugs(){
  const listEl = document.getElementById('bugsList');
  listEl.innerHTML = '<div class="empty">Loading…</div>';
  try {
    // Both, or the row pickers draw before the names exist.
    [allBugs] = await Promise.all([api(PM_BUGS_LIST_URL), loadAssignees()]);
    drawBugs();
  } catch (err) {
    listEl.innerHTML = '<div class="empty">Could not load bugs (' + esc(err.message) + ').</div>';
  }
}
function drawBugs(){
  const listEl = document.getElementById('bugsList');
  const q = (document.getElementById('bugSearch').value || '').trim().toLowerCase();
  const status = document.getElementById('bugStatusFilter').value;
  const rows = allBugs.filter(b =>
    (!status || b.status === status) &&
    (!q || [b.title, b.project_name, b.task_name].some(v => String(v || '').toLowerCase().includes(q))));

  document.getElementById('bugCount').textContent =
    (q || status) ? rows.length + ' of ' + allBugs.length : String(allBugs.length);

  if (!allBugs.length) {
    listEl.innerHTML = '<div class="empty">No bugs reported yet.' +
      (myProjects.length ? ' Use “+ Report bug” above.' : ' No projects are assigned to you yet — ask an admin.') +
      '</div>';
    return;
  }
  if (!rows.length) { listEl.innerHTML = '<div class="empty">No bugs match that filter.</div>'; return; }

  const STATUSES = ['OPEN','IN_PROGRESS','FIXED','VERIFIED','CLOSED','REOPENED'];
  listEl.innerHTML =
    '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      '<th>Bug</th><th>Project</th><th>Severity</th><th>Status</th>' +
      '<th>Assigned to</th><th>Reported</th><th></th>' +
    '</tr></thead><tbody>' +
    rows.map(b => {
      const opts = STATUSES.filter(s => s !== b.status)
        .map(s => '<option value="' + s + '">' + statusLabel(s) + '</option>').join('');
      return '<tr>' +
        '<td><div class="ttitle">' + esc(b.title) + '</div>' +
          (b.steps ? '<div class="tsub">' + esc(b.steps) + '</div>' : '') +
          (b.case_title ? '<div class="tsub">From test: ' + esc(b.case_title) + '</div>' : '') +
          evidenceLink(b.link, 'Screenshot / recording') + '</td>' +
        '<td>' + esc(b.project_name || '—') + '</td>' +
        '<td>' + sevBadge(b.severity) + '</td>' +
        '<td>' + badge(b.status) + '</td>' +
        /* A developer, QA, a designer or a BA — the list does not care
           which table they came from, so neither does this cell. */
        '<td>' +
          '<select class="status-select" data-bug-assign="' + b.bug_id + '" aria-label="Assign this bug">' +
            assigneeOptions(b.assignee_kind, b.assignee_id) +
          '</select>' +
        '</td>' +
        '<td class="nowrap"><div class="tsub">' + esc(b.reported_by_name || '') + '</div>' +
          '<div class="tsub">' + esc(fmtDate(b.created_at)) + '</div></td>' +
        '<td class="actions-cell">' +
          '<select class="status-select" data-bug-status="' + b.bug_id + '">' +
            '<option value="">Move to…</option>' + opts + '</select>' +
          '<button type="button" class="icon-btn" data-bug-extend="' + b.bug_id + '">Extend</button>' +
          '<button type="button" class="icon-btn danger" data-bug-delete="' + b.bug_id + '">Delete</button>' +
        '</td></tr>';
    }).join('') +
    '</tbody></table></div>';

  listEl.querySelectorAll('[data-bug-assign]').forEach(sel => {
    const was = sel.value;
    sel.addEventListener('change', async () => {
      sel.disabled = true;
      try {
        const res = await api(PM_BUGS_UPDATE_URL, { method: 'POST', body: Object.assign(
          { bug_id: Number(sel.dataset.bugAssign) },
          assigneeBody(sel.value)
        )});
        const opt  = sel.options[sel.selectedIndex];
        const name = opt.textContent.split(' — ')[0];
        /* A QA or designer assignee who was not on this project has just
           been added to it — otherwise the bug would be invisible to
           them. Say so rather than letting the access appear silently. */
        toast(!sel.value ? 'Assignee cleared.'
              : res && res.granted_access
                ? 'Assigned to ' + name + ' — and they were added to this project.'
                : 'Assigned to ' + name + '.', 'ok');
        renderBugs();
      } catch (err) {
        toast('Could not assign: ' + err.message, 'err');
        sel.value = was;          // put the old name back, not a blank
        sel.disabled = false;
      }
    });
  });

  listEl.querySelectorAll('[data-bug-status]').forEach(sel => {
    sel.addEventListener('change', async () => {
      if (!sel.value) return;
      sel.disabled = true;
      try {
        await api(PM_BUGS_UPDATE_URL, { method: 'POST',
          body: { bug_id: Number(sel.dataset.bugStatus), status: sel.value } });
        toast('Bug updated.', 'ok');
        renderBugs();
      } catch (err) {
        toast('Could not update bug: ' + err.message, 'err');
        sel.disabled = false; sel.value = '';
      }
    });
  });
  /* A fix promised by Friday slips like anything else — same recorded
     move, same reason, same admin list. extendDueDate is in ui.js. */
  listEl.querySelectorAll('[data-bug-extend]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.bugExtend);
      const b  = allBugs.find(x => Number(x.bug_id) === id);
      if (await extendDueDate(
        { type:'BUG', id, name: b && b.title, due: b && b.due_date }, session.token
      )) renderBugs();
    });
  });

  listEl.querySelectorAll('[data-bug-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!await confirmDialog({
        title: 'Delete this bug?',
        body: 'This cannot be undone.',
        confirmLabel: 'Delete bug',
        danger: true
      })) return;
      btn.disabled = true;
      try {
        await api(PM_BUGS_DELETE_URL, { method: 'POST', body: { bug_id: Number(btn.dataset.bugDelete) } });
        renderBugs();
      } catch (err) {
        toast('Could not delete bug: ' + err.message, 'err');
        btn.disabled = false;
      }
    });
  });
}
document.getElementById('bugSearch').addEventListener('input', drawBugs);
document.getElementById('bugStatusFilter').addEventListener('change', drawBugs);
document.getElementById('newBugToggle').addEventListener('click', () => {
  document.getElementById('newBugForm').classList.toggle('open');
});
document.getElementById('bugCancelBtn').addEventListener('click', () => {
  document.getElementById('newBugForm').classList.remove('open');
});
document.getElementById('newBugForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const project_id = document.getElementById('bugProject').value;
  const title = document.getElementById('bugTitle').value.trim();
  if (!project_id || !title) { toast('Pick a project and give the bug a title.', 'err'); return; }
  try {
    const res = await api(PM_BUGS_CREATE_URL, { method: 'POST', body: {
      project_id: Number(project_id), title,
      steps: document.getElementById('bugSteps').value.trim(),
      link: document.getElementById('bugLink').value.trim(),
      severity: document.getElementById('bugSeverity').value,
      ...assigneeBody(document.getElementById('bugAssignee').value)
    }});
    e.target.reset();
    e.target.classList.remove('open');
    toast(res && res.granted_access
      ? 'Bug reported — and the assignee was added to this project.'
      : 'Bug reported.', 'ok');
    renderBugs();
  } catch (err) {
    toast('Could not report bug: ' + err.message, 'err');
  }
});

/* ════════════════════════════════════════════════════
   Test cases
   ════════════════════════════════════════════════════ */
async function renderCases(){
  const listEl = document.getElementById('casesList');
  listEl.innerHTML = '<div class="empty">Loading…</div>';
  try {
    allCases = await api(PM_CASES_LIST_URL);
    drawCases();
  } catch (err) {
    listEl.innerHTML = '<div class="empty">Could not load test cases (' + esc(err.message) + ').</div>';
  }
}
function drawCases(){
  const listEl = document.getElementById('casesList');
  const q = (document.getElementById('caseSearch').value || '').trim().toLowerCase();
  const rows = q
    ? allCases.filter(c => [c.title, c.project_name].some(v => String(v || '').toLowerCase().includes(q)))
    : allCases;

  document.getElementById('caseCount').textContent =
    q ? rows.length + ' of ' + allCases.length : String(allCases.length);

  if (!allCases.length) {
    listEl.innerHTML = '<div class="empty">No test cases yet.' +
      (myProjects.length ? ' Use “+ New test case” above.' : ' No projects are assigned to you yet — ask an admin.') +
      '</div>';
    return;
  }
  if (!rows.length) { listEl.innerHTML = '<div class="empty">No cases match “' + esc(q) + '”.</div>'; return; }

  listEl.innerHTML =
    '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      '<th>Case</th><th>Project</th><th>Last result</th><th>Record result</th><th></th>' +
    '</tr></thead><tbody>' +
    rows.map(c =>
      '<tr>' +
        '<td><div class="ttitle">' + esc(c.title) + '</div>' +
          (c.expected ? '<div class="tsub">Expected: ' + esc(c.expected) + '</div>' : '') +
          evidenceLink(c.link, 'Spec / reference') + '</td>' +
        '<td>' + esc(c.project_name || '—') + '</td>' +
        '<td class="nowrap">' + (c.last_result
            ? badge(c.last_result) + '<div class="tsub">' + esc(fmtDate(c.last_run_at)) + '</div>'
            : '<span class="tsub">Never run</span>') + '</td>' +
        '<td class="actions-cell">' +
          '<select class="status-select" data-run-case="' + c.case_id + '">' +
            '<option value="">Record…</option>' +
            '<option value="PASS">Pass</option>' +
            '<option value="FAIL">Fail</option>' +
            '<option value="BLOCKED">Blocked</option>' +
            '<option value="SKIPPED">Skipped</option>' +
          '</select>' +
        '</td>' +
        '<td class="actions-cell">' +
          '<button type="button" class="icon-btn danger" data-case-delete="' + c.case_id + '">Delete</button>' +
        '</td></tr>').join('') +
    '</tbody></table></div>';

  listEl.querySelectorAll('[data-run-case]').forEach(sel => {
    sel.addEventListener('change', async () => {
      const result = sel.value;
      if (!result) return;
      const caseId = Number(sel.dataset.runCase);
      // A failure almost always means a bug — offer to open one now rather
      // than making the tester retype the whole thing on the Bugs page.
      /* This used to be a confirm() followed by a prompt() — two browser
         popups in a row to answer one question. One dialog asks it, and
         cancelling it records the failure without opening a bug. */
      let raise = false, notes = '';
      if (result === 'FAIL') {
        const answer = await promptDialog({
          title: 'Open a bug for this failure?',
          body: 'The result is recorded either way. Opening a bug also puts it on the Bugs board.',
          label: 'What went wrong?',
          placeholder: 'Optional — what you saw, and what you expected.',
          multiline: true,
          confirmLabel: 'Record and open a bug',
          cancelLabel: 'Just record the failure'
        });
        if (answer !== null) { raise = true; notes = answer; }
      }
      sel.disabled = true;
      try {
        const out = await api(PM_RUNS_CREATE_URL, { method: 'POST',
          body: { case_id: caseId, result, notes, raise_bug: raise } });
        toast(out.bug_id ? 'Result saved and bug opened.' : 'Result saved.', 'ok');
        renderCases();
      } catch (err) {
        toast('Could not save result: ' + err.message, 'err');
        sel.disabled = false; sel.value = '';
      }
    });
  });
  listEl.querySelectorAll('[data-case-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!await confirmDialog({
        title: 'Delete this test case?',
        body: 'Every result recorded against it goes too. Bugs raised from it are kept, but lose the link back.',
        confirmLabel: 'Delete test case',
        danger: true
      })) return;
      btn.disabled = true;
      try {
        await api(PM_CASES_DELETE_URL, { method: 'POST', body: { case_id: Number(btn.dataset.caseDelete) } });
        renderCases();
      } catch (err) {
        toast('Could not delete case: ' + err.message, 'err');
        btn.disabled = false;
      }
    });
  });
}
document.getElementById('caseSearch').addEventListener('input', drawCases);
document.getElementById('newCaseToggle').addEventListener('click', () => {
  document.getElementById('newCaseForm').classList.toggle('open');
});
document.getElementById('caseCancelBtn').addEventListener('click', () => {
  document.getElementById('newCaseForm').classList.remove('open');
});
document.getElementById('newCaseForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const project_id = document.getElementById('caseProject').value;
  const title = document.getElementById('caseTitle').value.trim();
  if (!project_id || !title) { toast('Pick a project and give the case a title.', 'err'); return; }
  try {
    await api(PM_CASES_CREATE_URL, { method: 'POST', body: {
      project_id: Number(project_id), title,
      steps: document.getElementById('caseSteps').value.trim(),
      expected: document.getElementById('caseExpected').value.trim(),
      link: document.getElementById('caseLink').value.trim()
    }});
    e.target.reset();
    e.target.classList.remove('open');
    toast('Test case created.', 'ok');
    renderCases();
  } catch (err) {
    toast('Could not create test case: ' + err.message, 'err');
  }
});

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


/* ════════════════════════════════════════════════════
   My projects
   ────────────────────────────────────────────────────
   QA see only the projects assigned to them, which is
   the single most confusing thing about this page if you
   cannot see what that set is: an empty bug list means
   "nothing to test" and "you are on no projects" and
   there was no way to tell which.

   So the set is a page of its own, with what is
   outstanding on each and who to ask if one is missing.
   ════════════════════════════════════════════════════ */
async function renderQaProjects(){
  const listEl  = document.getElementById('qaProjectList');
  const statsEl = document.getElementById('qaStats');
  listEl.innerHTML = '<div class="empty">Loading…</div>';
  try {
    myProjects = await api(PM_QA_PROJECTS_URL);

    const openBugs = myProjects.reduce((n, p) => n + (p.open_bugs || 0), 0);
    const toVerify = myProjects.reduce((n, p) => n + (p.to_verify || 0), 0);
    const cases    = myProjects.reduce((n, p) => n + (p.cases || 0), 0);
    statsEl.innerHTML = statTiles([
      { num: myProjects.length, lbl: '📁 Projects' },
      { num: openBugs, lbl: '🐞 Open bugs',      href: '#/bugs' },
      { num: toVerify, lbl: '✅ Waiting to verify', href: '#/bugs' },
      { num: cases,    lbl: '🧪 Test cases',     href: '#/cases' }
    ]);

    document.getElementById('qaProjectCount').textContent = String(myProjects.length);
    listEl.innerHTML = myProjects.length
      ? myProjects.map(qaProjectRow).join('')
      : '<div class="empty">No projects are assigned to you yet. An admin, or the ' +
        'business analyst running a project, can add you to it — then its bugs and ' +
        'test cases appear here.</div>';
  } catch (err) {
    statsEl.innerHTML = '';
    listEl.innerHTML = '<div class="empty">Could not load projects (' + esc(err.message) + ').</div>';
  }
}

function qaProjectRow(p){
  return '<div class="task-row">' +
    '<div class="tinfo">' +
      '<div class="ttitle">' + esc(p.project_name) + '</div>' +
      '<div class="tmeta">' +
        (p.client_name ? '<span>' + esc(p.client_name) + '</span>' : '') +
        // Who to chase when something about the project is unclear.
        '<span>' + (p.manager_name ? 'BA · ' + esc(p.manager_name) : 'No BA') + '</span>' +
        '<span>' + p.open_bugs + ' open bug' + (p.open_bugs === 1 ? '' : 's') + '</span>' +
        (p.to_verify ? '<span class="due soon">' + p.to_verify + ' to verify</span>' : '') +
        '<span>' + p.cases + ' test case' + (p.cases === 1 ? '' : 's') + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="tactions">' + badge(p.status) + '</div>' +
  '</div>';
}
