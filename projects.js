/* ════════════════════════════════════════════════════
   Project Management module
   ────────────────────────────────────────────────────
   Independent from the Fireflies app — the ONLY thing
   shared is the login session read from the same
   localStorage/sessionStorage key ("fireflies.session").

   Backend: n8n workflow "Project Management.json",
   backed by the movenetics_n8n MySQL database:
     managers   manager_id, full_name, email, role(ADMIN|MANAGER), is_active
     employees  employee_id, manager_id, name, department, designation, status
     projects   project_id, manager_id, project_name, client_name, description,
                start_date, due_date, status(PLANNING|ACTIVE|ON_HOLD|COMPLETED|CANCELLED), priority
     tasks      task_id, project_id, employee_id, task_name, description, eta,
                priority, status(TODO|IN_PROGRESS|BLOCKED|COMPLETED|CANCELLED), progress_percentage
     questions  question_id, task_id, manager_id, question, answer, status(OPEN|ANSWERED|CLOSED)

   Task lifecycle: whoever owns the task (its manager, or Yusuf) moves it
   directly between TODO / IN_PROGRESS / BLOCKED / COMPLETED / CANCELLED —
   no separate approval/sign-off step.
   ════════════════════════════════════════════════════ */
const SESSION_KEY = "fireflies.session";
// Same-origin PHP backend (pm-backend-php/), deployed as a subfolder of
// this same site — no CORS to worry about.
const PM_API_BASE = "https://management.moveneticsdigital.com/pm-backend-php/";

/* Read-only here. The roster is created and corrected in HR › People;
   this page only needs the names to fill its assignee menus. */
const PM_EMPLOYEES_LIST_URL   = PM_API_BASE + "pm-employees-list.php";
/* No delete here on purpose. Removing a person — and with it their login —
   belongs to HR and admins, on HR › People. A BA can add someone to the
   roster and correct their details, but not take them out of the system. */
const PM_PROJECTS_LIST_URL    = PM_API_BASE + "pm-projects-list.php";
const PM_TEAM_OVERVIEW_URL    = PM_API_BASE + "pm-team-overview.php";
const PM_PROJECTS_CREATE_URL  = PM_API_BASE + "pm-projects-create.php";
const PM_PROJECTS_UPDATE_URL  = PM_API_BASE + "pm-projects-update.php";
const PM_PROJECTS_DELETE_URL  = PM_API_BASE + "pm-projects-delete.php";
const PM_TASKS_LIST_URL       = PM_API_BASE + "pm-tasks-list.php";
const PM_TASKS_CREATE_URL     = PM_API_BASE + "pm-tasks-create.php";
const PM_TASKS_UPDATE_URL     = PM_API_BASE + "pm-tasks-update.php";
const PM_TASKS_DELETE_URL     = PM_API_BASE + "pm-tasks-delete.php";
const PM_TASKS_STATUS_URL     = PM_API_BASE + "pm-tasks-status.php";
const PM_QUESTIONS_LIST_URL   = PM_API_BASE + "pm-questions-list.php";
const PM_QUESTIONS_CREATE_URL = PM_API_BASE + "pm-questions-create.php";
const PM_QUESTIONS_ANSWER_URL = PM_API_BASE + "pm-questions-answer.php";
const PM_DEMOS_LIST_URL       = PM_API_BASE + "pm-demos-list.php";
const PM_DEMOS_SAVE_URL       = PM_API_BASE + "pm-demos-save.php";
const PM_DEMOS_DELETE_URL     = PM_API_BASE + "pm-demos-delete.php";
const PM_RATES_LIST_URL       = PM_API_BASE + "pm-design-estimates-list.php";
const PM_RATES_SAVE_URL       = PM_API_BASE + "pm-design-estimates-save.php";
const PM_RATES_DELETE_URL     = PM_API_BASE + "pm-design-estimates-delete.php";

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
let allEmployees = [];
let allProjects  = [];
let allRates     = [];   // the DEV half of the shared rate card

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
/* MANAGER is the stored role; the team calls them business analysts. Only
   the label changes — see the note in fireflies.js. */
const ROLE_LABELS = { ADMIN:'Admin', MANAGER:'Business Analyst', HR:'HR',
                      MARKETING:'Marketing', QA:'QA', EMPLOYEE:'Developer' };
function roleLabel(role){
  return ROLE_LABELS[String(role || '').toUpperCase()] || statusLabel(role);
}
function roleBadgeLabel(role){
  return String(role || '').toUpperCase() === 'MANAGER' ? 'BA' : roleLabel(role);
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
  roleBadge.textContent = roleBadgeLabel(session.role || 'MANAGER');
  roleBadge.className = 'role-badge' + (isAdmin ? '' : ' manager');
  document.querySelectorAll('.nav-admin').forEach(a => { a.hidden = !isAdmin; });
  // The rate card sets company-wide expectations about how long work
  // takes, so only an admin edits it — a BA is estimated by it.
  document.getElementById('ratesNavLink').hidden = !isAdmin;
  route();
}
signOutBtn.addEventListener('click', () => {
  clearSession();
  location.href = 'login.html?m=out';
});

/* ── Router ──────────────────────────────────────────── */

function route(){
  if (!readSession()) { showSignedOut(); return; }
  const hash  = location.hash || '#/dashboard';
  const parts = hash.replace(/^#\//, '').split('/');
  let page    = parts[0] || 'dashboard';
  if (!['dashboard','projects','project','tasks','questions','rates'].includes(page)) page = 'dashboard';
  // The rate card is company policy about how long work takes — admins only.
  if (page === 'rates' && !isAdmin) page = 'dashboard';

  pages.forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  // "Dashboard" in the nav now always means the Fireflies+Projects combined
  // view on index.html; this app's own #/dashboard landing route highlights
  // the "Projects" tab instead, since there's no longer a separate nav item for it.
  const navTarget = (page === 'project' || page === 'dashboard') ? 'projects' : page;
  navLinks.forEach(a => a.classList.toggle('on', a.dataset.nav === navTarget));

  if (page === 'dashboard') renderDashboard();
  if (page === 'projects')  renderProjects();
  if (page === 'project')   renderProjectDetail(Number(parts[1]));
  if (page === 'tasks')     renderTasks();
  if (page === 'questions') renderQuestions();
  if (page === 'rates')     renderRates();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* ── Shared data loaders ─────────────────────────────── */
async function loadEmployees(){
  allEmployees = await api(PM_EMPLOYEES_LIST_URL);
  return allEmployees;
}
async function loadProjects(){
  allProjects = await api(PM_PROJECTS_LIST_URL);
  return allProjects;
}

/* ════════════════════════════════════════════════════
   Dashboard
   ════════════════════════════════════════════════════ */
function displayName(){
  const local = String(session.email || '').split('@')[0];
  const first = local.split(/[._-]/)[0];
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : 'there';
}

async function renderDashboard(){
  const statsEl = document.getElementById('dashStats');
  const qPanel  = document.getElementById('dashQuestionsList');
  const recentEl = document.getElementById('dashRecentProjects');
  document.getElementById('dashGreeting').textContent = 'Welcome back, ' + displayName();
  statsEl.innerHTML = '<div class="empty">Loading…</div>';
  qPanel.innerHTML = '';

  /* Admins get the allocation panel here, on the view this section lands
     on — the same one the Overview carries, rendered by ui.js so the two
     cannot drift. It is deliberately not on #/projects: that route is
     reached by clicking a sub-nav item that is already highlighted while
     the dashboard is showing, so a panel there is one click away from
     someone with no reason to click. */
  if (isAdmin) {
    renderTeamOverview({
      url:   PM_TEAM_OVERVIEW_URL,
      token: session.token,
      panel: 'teamPanel',
      list:  'teamList',
      count: 'teamCount',
      gaps:  'teamGaps'
    });
  }

  try {
    // Each call fails independently so one bad call doesn't blank the whole page.
    const [projectsR, tasksR, questionsR] = await Promise.allSettled([
      api(PM_PROJECTS_LIST_URL),
      api(PM_TASKS_LIST_URL),
      api(PM_QUESTIONS_LIST_URL)
    ]);

    const errors = [];
    const val = (r, label) => {
      if (r.status === 'fulfilled') return r.value;
      errors.push(label + ': ' + r.reason.message);
      return [];
    };
    const projects  = val(projectsR, 'Projects');
    const tasks     = val(tasksR, 'Tasks');
    const questions = val(questionsR, 'Questions');
    allProjects = projects;

    const openTasks = tasks.filter(t => !['COMPLETED','CANCELLED'].includes(t.status));
    const openQuestions = questions.filter(q => q.status === 'OPEN');

    const tiles = [
      { num: projects.length, lbl: isAdmin ? 'All projects' : 'My projects', icon: '📁' },
      { num: openTasks.length, lbl: isAdmin ? 'Open tasks (all)' : 'My open tasks', icon: '✓' },
      { num: openQuestions.length, lbl: isAdmin ? 'Open questions' : 'My open questions', icon: '?' }
    ];

    statsEl.innerHTML =
      (errors.length ? '<div class="empty" style="grid-column:1/-1">Some data failed to load — ' + esc(errors.join(' · ')) + '</div>' : '') +
      tiles.map(t =>
        '<div class="stat"><div class="stat-icon">' + t.icon + '</div><div class="num">' + t.num + '</div><div class="lbl">' + esc(t.lbl) + '</div></div>').join('');

    qPanel.innerHTML = openQuestions.length
      ? openQuestions.slice(0, 5).map(questionCard).join('')
      : '<div class="empty">No open questions.</div>';
    wireQuestionForms(qPanel);

    recentEl.innerHTML = projects.length
      ? projectsTable(projects.slice(0, 3))
      : '<div class="empty">No projects yet. <a class="xref" href="#/projects">Create your first one →</a></div>';
    wireProjectRowClicks(recentEl);
  } catch (err) {
    statsEl.innerHTML = '<div class="empty">Could not load dashboard (' + esc(err.message) + ').</div>';
  }
}

/* ════════════════════════════════════════════════════
   Developers
   ────────────────────────────────────────────────────
   This page used to carry a "Manage developers" panel —
   the roster with an add form and inline editing. It
   was a second door to something HR › People already
   owns, which meant two screens could disagree about
   the same record. The roster is still loaded here,
   but only to fill the assignee menus.
   ════════════════════════════════════════════════════ */
function populateEmployeeSelects(){
  document.querySelectorAll('select[data-role="employee-select"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select developer…</option>' +
      allEmployees.map(e => '<option value="' + e.employee_id + '">' + esc(e.name) +
        (e.designation ? ' — ' + esc(e.designation) : '') + '</option>').join('');
  });
}

/* ════════════════════════════════════════════════════
   Projects
   ════════════════════════════════════════════════════ */
async function renderProjects(){
  const grid = document.getElementById('projectsGrid');
  grid.innerHTML = '<div class="empty">Loading…</div>';

  try {
    await Promise.all([loadEmployees(), loadProjects()]);
    grid.innerHTML = allProjects.length ? projectsTable(allProjects)
      : '<div class="empty">No projects yet. Create your first one above.</div>';
    wireProjectRowClicks(grid);
  } catch (err) {
    grid.innerHTML = '<div class="empty">Could not load projects (' + esc(err.message) + ').</div>';
  }
}

function projectsTable(rows){
  return '<div class="table-wrap"><table class="data-table"><thead><tr>' +
    '<th>Project</th><th>Client</th><th>Status</th><th>Priority</th><th>Due</th>' +
    '</tr></thead><tbody>' +
    rows.map(projectRow).join('') +
    '</tbody></table></div>';
}
function projectRow(p){
  return '<tr class="clickable" data-project-row="' + p.project_id + '">' +
    '<td><div class="ttitle">' + esc(p.project_name) + '</div>' +
      (p.description ? '<div class="tsub">' + esc(p.description) + '</div>' : '') + '</td>' +
    '<td>' + esc(p.client_name || '—') + '</td>' +
    '<td>' + badge(p.status) + '</td>' +
    '<td>' + prioBadge(p.priority) + '</td>' +
    '<td class="nowrap">' + (p.due_date ? esc(fmtDay(p.due_date)) : '—') + '</td>' +
  '</tr>';
}
function wireProjectRowClicks(root){
  root.querySelectorAll('tr[data-project-row]').forEach(tr => {
    tr.addEventListener('click', () => { location.hash = '#/project/' + tr.dataset.projectRow; });
  });
}

document.getElementById('newProjectToggle').addEventListener('click', () => {
  document.getElementById('newProjectForm').classList.toggle('open');
});
document.getElementById('projectCancelBtn').addEventListener('click', () => {
  document.getElementById('newProjectForm').classList.remove('open');
});
document.getElementById('newProjectForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const project_name = document.getElementById('projName').value.trim();
  const client_name  = document.getElementById('projClient').value.trim();
  const description  = document.getElementById('projDescription').value.trim();
  const priority     = document.getElementById('projPriority').value;
  const due_date     = document.getElementById('projDue').value || null;
  if (!project_name) return;
  try {
    await api(PM_PROJECTS_CREATE_URL, { method: 'POST',
      body: { project_name, client_name, description, priority, due_date } });
    e.target.reset();
    e.target.classList.remove('open');
    await loadProjects();
    const grid = document.getElementById('projectsGrid');
    grid.innerHTML = allProjects.length ? projectsTable(allProjects) : '<div class="empty">No projects yet. Create your first one above.</div>';
    wireProjectRowClicks(grid);
  } catch (err) {
    toast('Could not create project: ' + err.message, 'err');
  }
});

/* ════════════════════════════════════════════════════
   Project detail (tasks within one project)
   ════════════════════════════════════════════════════ */
async function renderProjectDetail(projectId){
  const el = document.getElementById('projectDetailContent');
  el.innerHTML = '<div class="empty">Loading…</div>';
  try {
    await Promise.all([loadEmployees(), allProjects.length ? Promise.resolve(allProjects) : loadProjects()]);
    const project = allProjects.find(p => p.project_id === projectId);
    const tasksForProject = await api(PM_TASKS_LIST_URL + qs({ project_id: projectId }));

    if (!project) {
      el.innerHTML = '<div class="empty">Project not found.</div>';
      return;
    }


    el.innerHTML =
      '<div class="detail-hero">' +
        '<div class="hero-top">' +
          '<h1>' + esc(project.project_name) + '</h1>' +
          '<div class="hero-actions">' +
            '<button type="button" class="btn-sm hero-btn" id="editProjectToggle">Edit</button>' +
            '<button type="button" class="btn-sm hero-btn danger" id="deleteProjectBtn">Delete</button>' +
          '</div>' +
        '</div>' +
        '<div class="meta">' + badge(project.status) + prioBadge(project.priority) +
        (project.client_name ? '<span class="chip">' + esc(project.client_name) + '</span>' : '') +
        (project.due_date ? '<span class="chip">Due ' + esc(fmtDay(project.due_date)) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<form id="editProjectForm" class="inline-form">' +
        '<div class="row">' +
          '<div class="field"><label>Project name</label><input id="editProjName" value="' + esc(project.project_name) + '" required /></div>' +
          '<div class="field"><label>Client</label><input id="editProjClient" value="' + esc(project.client_name || '') + '" /></div>' +
        '</div>' +
        '<div class="row">' +
          '<div class="field"><label>Priority</label><select id="editProjPriority">' +
            ['LOW','MEDIUM','HIGH','CRITICAL'].map(p => '<option value="' + p + '"' + (project.priority === p ? ' selected' : '') + '>' + statusLabel(p) + '</option>').join('') +
          '</select></div>' +
          '<div class="field"><label>Status</label><select id="editProjStatus">' +
            ['PLANNING','ACTIVE','ON_HOLD','COMPLETED','CANCELLED'].map(s => '<option value="' + s + '"' + (project.status === s ? ' selected' : '') + '>' + statusLabel(s) + '</option>').join('') +
          '</select></div>' +
        '</div>' +
        '<div class="row">' +
          '<div class="field"><label>Due date</label><input id="editProjDue" type="date" value="' + esc(project.due_date ? String(project.due_date).slice(0,10) : '') + '" /></div>' +
          '<div class="field"><label>Description</label><input id="editProjDescription" value="' + esc(project.description || '') + '" /></div>' +
        '</div>' +
        '<div class="actions"><button type="submit">Save changes</button>' +
          '<button type="button" class="secondary" id="editProjectCancelBtn">Cancel</button></div>' +
      '</form>' +
      (project.description ? '<div class="sect full" style="margin-bottom:16px"><h4>Description</h4><p>' + esc(project.description) + '</p></div>' : '') +
      '<div class="panel-head"><h2>Tasks</h2><span class="count">' + tasksForProject.length + '</span>' +
        '<span class="spacer"></span>' +
        '<button type="button" class="btn-sm" id="newTaskToggle" style="border:none">+ New task</button></div>' +
      '<form id="newTaskForm" class="inline-form">' +
        '<div class="row">' +
          '<div class="field"><label>Task name</label><input id="taskName" required placeholder="Task name" /></div>' +
          '<div class="field"><label>Assign to</label><select id="taskEmployee" data-role="employee-select" required></select></div>' +
        '</div>' +
        /* The rate card fills the estimate in. Anything typed into the
           hours field still wins — see pm-tasks-create.php. */
        '<div class="row">' +
          '<div class="field"><label>Deliverable <span class="opt">— from the rate card</span></label><select id="taskDeliverable"></select></div>' +
          '<div class="field"><label>Complexity</label><select id="taskComplexity"></select></div>' +
        '</div>' +
        '<div class="row">' +
          '<div class="field"><label>How many <span class="opt" id="taskUnitLabel">units</span></label><input id="taskQuantity" type="number" min="0.5" step="0.5" value="1" /></div>' +
          '<div class="field"><label>FRD</label><select id="taskFrd">' +
            '<option value="1" selected>With a proper FRD</option>' +
            '<option value="0">Without a proper FRD</option>' +
          '</select></div>' +
        '</div>' +
        '<div class="row">' +
          '<div class="field"><label>Case</label><select id="taskCase">' +
            '<option value="BEST" selected>Best case</option>' +
            '<option value="WORST">Worst case</option>' +
          '</select></div>' +
          '<div class="field"><label>Start date <span class="opt">— defaults to today</span></label><input id="taskStart" type="date" /></div>' +
        '</div>' +
        '<div class="estimate-note" id="taskEstimateNote">Pick a deliverable to get an estimate.</div>' +
        '<div class="row">' +
          '<div class="field"><label>Estimate (hours) <span class="opt">— blank uses the rate card</span></label><input id="taskEta" type="number" min="0" step="0.5" placeholder="from the rate card" /></div>' +
          '<div class="field"><label>Priority</label><select id="taskPriority">' +
            '<option value="LOW">Low</option><option value="MEDIUM" selected>Medium</option>' +
            '<option value="HIGH">High</option><option value="CRITICAL">Critical</option>' +
          '</select></div>' +
        '</div>' +
        '<div class="field"><label>Due date <span class="opt">— blank uses the estimate</span></label><input id="taskDue" type="date" /></div>' +
        '<div class="field"><label>Description <span class="opt">— optional</span></label><input id="taskDescription" placeholder="Details" /></div>' +
        '<div class="actions"><button type="submit">Add task</button>' +
          '<button type="button" class="secondary" id="taskCancelBtn">Cancel</button></div>' +
      '</form>' +
      '<div id="projectTasksList"></div>' +

      /* Demo dates. Set here by whoever runs the project; visible to
         everyone on it, wherever they work — see pm-demos-list.php. */
      '<div class="panel-head" style="margin-top:26px">' +
        '<h2>Demos</h2><span class="count" id="demoCount">0</span>' +
        '<span class="spacer"></span>' +
        '<button type="button" class="btn-sm" id="newDemoToggle" style="border:none">+ Add demo</button>' +
      '</div>' +
      '<form id="newDemoForm" class="inline-form">' +
        '<input type="hidden" id="demoId" value="" />' +
        '<div class="row">' +
          '<div class="field"><label>Type</label><select id="demoType">' +
            '<option value="INTERNAL" selected>Internal demo</option>' +
            '<option value="CLIENT">Client demo</option>' +
            '<option value="STAKEHOLDER">Stakeholder demo</option>' +
            '<option value="DRY_RUN">Dry run</option>' +
            '<option value="OTHER">Other</option>' +
          '</select></div>' +
          '<div class="field"><label>Status</label><select id="demoStatus">' +
            '<option value="PLANNED" selected>Planned</option>' +
            '<option value="DONE">Done</option>' +
            '<option value="CANCELLED">Cancelled</option>' +
          '</select></div>' +
        '</div>' +
        '<div class="row">' +
          '<div class="field"><label>Date</label><input id="demoDate" type="date" required /></div>' +
          '<div class="field"><label>Time <span class="opt">— optional</span></label><input id="demoTime" type="time" /></div>' +
        '</div>' +
        '<div class="field"><label>Title <span class="opt">— optional</span></label><input id="demoTitle" placeholder="e.g. Checkout walkthrough" /></div>' +
        '<div class="field"><label>Notes <span class="opt">— optional</span></label><input id="demoNotes" placeholder="Anything the team should know" /></div>' +
        '<div class="actions"><button type="submit" id="demoSubmitBtn">Add demo</button>' +
          '<button type="button" class="secondary" id="demoCancelBtn">Cancel</button></div>' +
      '</form>' +
      '<div id="projectDemosList"></div>';

    populateEmployeeSelects();
    wireTaskEstimate();
    wireDemos(projectId);
    renderDemos(projectId);

    document.getElementById('editProjectToggle').addEventListener('click', () => {
      document.getElementById('editProjectForm').classList.toggle('open');
    });
    document.getElementById('editProjectCancelBtn').addEventListener('click', () => {
      document.getElementById('editProjectForm').classList.remove('open');
    });
    document.getElementById('editProjectForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const project_name = document.getElementById('editProjName').value.trim();
      const client_name = document.getElementById('editProjClient').value.trim();
      const description = document.getElementById('editProjDescription').value.trim();
      const priority = document.getElementById('editProjPriority').value;
      const status = document.getElementById('editProjStatus').value;
      const due_date = document.getElementById('editProjDue').value || null;
      if (!project_name) return;
      try {
        await api(PM_PROJECTS_UPDATE_URL, { method: 'POST',
          body: { project_id: projectId, project_name, client_name, description, priority, status, due_date } });
        allProjects = [];
        renderProjectDetail(projectId);
      } catch (err) {
        toast('Could not save project: ' + err.message, 'err');
      }
    });
    document.getElementById('deleteProjectBtn').addEventListener('click', async () => {
      if (!await confirmDialog({
        title: 'Delete “' + project.project_name + '”?',
        body: 'Every task and question under this project is permanently deleted with it. This cannot be undone.',
        confirmLabel: 'Delete project',
        danger: true
      })) return;
      try {
        await api(PM_PROJECTS_DELETE_URL, { method: 'POST', body: { project_id: projectId } });
        allProjects = [];
        location.hash = '#/projects';
      } catch (err) {
        toast('Could not delete project: ' + err.message, 'err');
      }
    });

    document.getElementById('newTaskToggle').addEventListener('click', () => {
      document.getElementById('newTaskForm').classList.toggle('open');
    });
    document.getElementById('taskCancelBtn').addEventListener('click', () => {
      document.getElementById('newTaskForm').classList.remove('open');
    });
    document.getElementById('newTaskForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const task_name = document.getElementById('taskName').value.trim();
      const employee_id = document.getElementById('taskEmployee').value;
      const eta_hours = document.getElementById('taskEta').value || null;
      const priority = document.getElementById('taskPriority').value;
      const description = document.getElementById('taskDescription').value.trim();
      if (!task_name || !employee_id) return;
      const rate = currentTaskRate();
      try {
        await api(PM_TASKS_CREATE_URL, { method: 'POST',
          body: {
            project_id: projectId, employee_id: Number(employee_id),
            task_name, description, eta_hours, priority,
            estimate_id:   rate ? rate.estimate_id : '',
            quantity:      Number(document.getElementById('taskQuantity').value) || 1,
            has_frd:       document.getElementById('taskFrd').value === '1' ? 1 : 0,
            estimate_case: document.getElementById('taskCase').value,
            start_date:    document.getElementById('taskStart').value,
            due_date:      document.getElementById('taskDue').value
          } });
        e.target.reset();
        e.target.classList.remove('open');
        renderProjectDetail(projectId);
      } catch (err) {
        toast('Could not create task: ' + err.message, 'err');
      }
    });

    window.__pmProjectTasks = tasksForProject;
    const listEl = document.getElementById('projectTasksList');
    listEl.innerHTML = tasksForProject.length
      ? tasksTable(tasksForProject, { showProject: false })
      : '<div class="empty">No tasks yet. Add the first one above.</div>';
    wireTaskRows(listEl, () => renderProjectDetail(projectId), { showProject: false });
  } catch (err) {
    el.innerHTML = '<div class="empty">Could not load project (' + esc(err.message) + ').</div>';
  }
}

/* ════════════════════════════════════════════════════
   Tasks (cross-project)
   ════════════════════════════════════════════════════ */
async function renderTasks(){
  const listEl = document.getElementById('tasksList');
  listEl.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const [tasks] = await Promise.all([
      api(PM_TASKS_LIST_URL),
      allEmployees.length ? Promise.resolve(allEmployees) : loadEmployees()
    ]);
    window.__pmAllTasks = tasks;
    applyTasksFilter();
  } catch (err) {
    listEl.innerHTML = '<div class="empty">Could not load tasks (' + esc(err.message) + ').</div>';
  }
}
function applyTasksFilter(){
  const listEl = document.getElementById('tasksList');
  const filter = document.getElementById('tasksFilter').value;
  const tasks = window.__pmAllTasks || [];
  const rows = filter ? tasks.filter(t => t.status === filter) : tasks;
  listEl.innerHTML = rows.length
    ? tasksTable(rows, { showProject: true })
    : '<div class="empty">No tasks match this filter.</div>';
  wireTaskRows(listEl, renderTasks, { showProject: true });
}
document.getElementById('tasksFilter').addEventListener('change', applyTasksFilter);

function tasksTable(rows, opts){
  opts = opts || {};
  return '<div class="table-wrap"><table class="data-table"><thead><tr>' +
    '<th>Task</th><th>Assignee</th>' + (opts.showProject ? '<th>Project</th>' : '') +
    '<th>Est.</th><th>Progress</th><th>Priority</th><th>Status</th><th></th>' +
    '</tr></thead><tbody>' +
    rows.map(t => taskRow(t, opts)).join('') +
    '</tbody></table></div>';
}
function taskRow(t, opts){
  opts = opts || {};
  // "Move to…" moves the task directly between all working statuses — no
  // sign-off step, whoever owns the task (their manager, or Yusuf) decides.
  const options = ['TODO','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED']
    .filter(s => s !== t.status)
    .map(s => '<option value="' + s + '">' + statusLabel(s) + '</option>');
  const selectHtml =
    '<select class="status-select" data-task-id="' + t.task_id + '">' +
      '<option value="">Move to…</option>' + options.join('') + '</select>';
  return '<tr data-task-row="' + t.task_id + '">' +
    '<td><div class="ttitle">' + esc(t.task_name) + '</div>' +
      (t.description ? '<div class="tsub">' + esc(t.description) + '</div>' : '') + '</td>' +
    '<td>' + esc(t.employee_name || 'Unassigned') + '</td>' +
    (opts.showProject
      ? '<td>' + (t.project_id ? '<a class="xref" href="#/project/' + t.project_id + '">' + esc(t.project_name || '') + '</a>' : '—') + '</td>'
      : '') +
    '<td class="nowrap">' + (t.eta_hours != null ? esc(t.eta_hours) + 'h' : '—') + '</td>' +
    '<td class="nowrap">' + (t.progress_percentage != null ? t.progress_percentage + '%' : '—') + '</td>' +
    '<td>' + prioBadge(t.priority) + '</td>' +
    '<td>' + badge(t.status) + '</td>' +
    '<td class="actions-cell">' + selectHtml +
      '<button type="button" class="icon-btn" data-task-edit="' + t.task_id + '">Edit</button>' +
      '<button type="button" class="icon-btn danger" data-task-delete="' + t.task_id + '">Delete</button>' +
    '</td></tr>';
}
function taskEditForm(t, opts){
  const empOptions = allEmployees.map(e =>
    '<option value="' + e.employee_id + '"' + (e.employee_id === t.employee_id ? ' selected' : '') + '>' + esc(e.name) + '</option>').join('');
  const colspan = (opts && opts.showProject) ? 8 : 7;
  return '<tr data-task-row="' + t.task_id + '"><td colspan="' + colspan + '" class="edit-row-cell">' +
    '<div class="row">' +
      '<input value="' + esc(t.task_name) + '" data-task-field="task_name" placeholder="Task name" />' +
      '<select data-task-field="employee_id">' + empOptions + '</select>' +
      '<input type="number" min="0" step="0.5" placeholder="Est. hours" value="' + esc(t.eta_hours != null ? t.eta_hours : '') + '" data-task-field="eta_hours" />' +
      '<select data-task-field="priority">' +
        ['LOW','MEDIUM','HIGH','CRITICAL'].map(p => '<option value="' + p + '"' + (t.priority === p ? ' selected' : '') + '>' + statusLabel(p) + '</option>').join('') +
      '</select>' +
      '<input value="' + esc(t.description || '') + '" data-task-field="description" placeholder="Description" />' +
    '</div>' +
    '<div class="actions">' +
      '<button type="button" class="icon-btn" data-task-save="' + t.task_id + '">Save</button>' +
      '<button type="button" class="icon-btn" data-task-cancel="' + t.task_id + '">Cancel</button>' +
    '</div></td></tr>';
}
function wireTaskRows(root, onChanged, opts){
  root.querySelectorAll('select[data-task-id]').forEach(sel => {
    sel.addEventListener('change', async () => {
      const status = sel.value;
      if (!status) return;
      const taskId = Number(sel.dataset.taskId);
      sel.disabled = true;
      try {
        await api(PM_TASKS_STATUS_URL, { method: 'POST', body: { task_id: taskId, status } });
        onChanged();
      } catch (err) {
        toast('Could not update task: ' + err.message, 'err');
        sel.disabled = false;
        sel.value = '';
      }
    });
  });
  root.querySelectorAll('[data-task-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.taskEdit);
      const t = (window.__pmAllTasks || []).find(x => x.task_id === id) ||
                (window.__pmProjectTasks || []).find(x => x.task_id === id);
      if (!t) return;
      const rowEl = root.querySelector('[data-task-row="' + id + '"]');
      rowEl.outerHTML = taskEditForm(t, opts);
      wireTaskRows(root, onChanged, opts);
    });
  });
  root.querySelectorAll('[data-task-cancel]').forEach(btn => {
    btn.addEventListener('click', () => onChanged());
  });
  root.querySelectorAll('[data-task-save]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.taskSave);
      const rowEl = root.querySelector('[data-task-row="' + id + '"]');
      const task_name = rowEl.querySelector('[data-task-field="task_name"]').value.trim();
      const employee_id = rowEl.querySelector('[data-task-field="employee_id"]').value;
      const eta_hours = rowEl.querySelector('[data-task-field="eta_hours"]').value || null;
      const priority = rowEl.querySelector('[data-task-field="priority"]').value;
      const description = rowEl.querySelector('[data-task-field="description"]').value.trim();
      if (!task_name || !employee_id) return;
      btn.disabled = true;
      try {
        await api(PM_TASKS_UPDATE_URL, { method: 'POST',
          body: { task_id: id, task_name, employee_id: Number(employee_id), eta_hours, priority, description } });
        onChanged();
      } catch (err) {
        toast('Could not save task: ' + err.message, 'err');
        btn.disabled = false;
      }
    });
  });
  root.querySelectorAll('[data-task-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.taskDelete);
      if (!await confirmDialog({
        title: 'Delete this task?',
        body: 'Its questions are removed with it. This cannot be undone.',
        confirmLabel: 'Delete task',
        danger: true
      })) return;
      btn.disabled = true;
      try {
        await api(PM_TASKS_DELETE_URL, { method: 'POST', body: { task_id: id } });
        onChanged();
      } catch (err) {
        toast('Could not delete task: ' + err.message, 'err');
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
  const formWrap = document.getElementById('newQuestionWrap');
  formWrap.style.display = isAdmin ? 'none' : '';
  listEl.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const [questions, tasks] = await Promise.all([
      api(PM_QUESTIONS_LIST_URL),
      isAdmin ? Promise.resolve([]) : api(PM_TASKS_LIST_URL)
    ]);
    if (!isAdmin) {
      const sel = document.getElementById('qTaskSelect');
      sel.innerHTML = '<option value="">Select a task…</option>' +
        tasks.map(t => '<option value="' + t.task_id + '">' + esc(t.task_name) + ' — ' + esc(t.project_name) + '</option>').join('');
    }
    listEl.innerHTML = questions.length
      ? questions.map(questionCard).join('')
      : '<div class="empty">No questions yet.</div>';
    wireQuestionForms(listEl);
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
  const taskRef = q.project_id
    ? '<a class="xref" href="#/project/' + q.project_id + '">' + esc(q.task_name || '') +
      (q.project_name ? ' — ' + esc(q.project_name) : '') + '</a>'
    : '<span>' + esc(q.task_name || '') + '</span>';
  const askedBy = q.asked_by_employee || q.asked_by_manager;
  return '<div class="question-card">' +
    '<div class="qmeta">' + badge(q.status) + taskRef +
      (askedBy ? '<span class="who">' + esc(askedBy) + '</span>' : '') +
      '<span>' + esc(fmtDate(q.created_at)) + '</span></div>' +
    '<p class="qtext">' + esc(q.question) + '</p>' +
    (q.status === 'ANSWERED' || q.answer
      ? '<div class="answer-block"><div class="aby">Yusuf’s answer</div><span>' + esc(q.answer) + '</span></div>'
      : (isAdmin
          ? '<div class="answer-form"><textarea placeholder="Write an answer…" data-answer-for="' + q.question_id + '"></textarea>' +
            '<button type="button" data-answer-submit="' + q.question_id + '">Send answer</button></div>'
          : '<div class="answer-block"><span>Waiting on Yusuf.</span></div>')) +
  '</div>';
}
function wireQuestionForms(root){
  root.querySelectorAll('[data-answer-submit]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const questionId = Number(btn.dataset.answerSubmit);
      const answer = root.querySelector('[data-answer-for="' + questionId + '"]').value.trim();
      if (!answer) return;
      btn.disabled = true;
      try {
        await api(PM_QUESTIONS_ANSWER_URL, { method: 'POST', body: { question_id: questionId, answer } });
        renderQuestions();
        if (document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
      } catch (err) {
        toast('Could not send answer: ' + err.message, 'err');
        btn.disabled = false;
      }
    });
  });
}

/* ════════════════════════════════════════════════════
   Boot
   ════════════════════════════════════════════════════ */
session = readSession();
if (session) {
  isAdmin = String(session.role || 'MANAGER').toUpperCase() === 'ADMIN';
  showApp();
} else {
  showSignedOut();
}

/* ════════════════════════════════════════════════════
   Developer rate card
   ────────────────────────────────────────────────────
   The DEV half of the same table the design board uses
   (migration 010). rateText / hoursText / targetDateFrom
   / CASE_COLS come from ui.js — one copy, two cards.
   ════════════════════════════════════════════════════ */
async function loadRates(){
  const data = await api(PM_RATES_LIST_URL + '?discipline=DEV' + (isAdmin ? '&all=1' : ''));
  allRates = data.estimates || [];
  setEstimateHoursPerDay(data.hours_per_day);
  return allRates;
}

/* ── The estimate block on the add-task form ──────────
   The project detail view rebuilds its form every time it is opened, so
   these are wired after each render rather than once at load. */
function wireTaskEstimate(){
  const dSel = document.getElementById('taskDeliverable');
  if (!dSel) return;

  const fillComplexities = () => {
    const cSel = document.getElementById('taskComplexity');
    const rows = allRates.filter(r => r.is_active && r.deliverable === dSel.value);
    cSel.innerHTML = rows.length
      ? rows.map(r => '<option value="' + r.estimate_id + '">' +
          esc(r.complexity.charAt(0) + r.complexity.slice(1).toLowerCase()) +
          (r.definition ? ' — ' + esc(r.definition) : '') + '</option>').join('')
      : '<option value="">—</option>';
    refreshTaskEstimate();
  };
  const fillDeliverables = () => {
    const names = [...new Set(allRates.filter(r => r.is_active).map(r => r.deliverable))];
    dSel.innerHTML = names.length
      ? '<option value="">No estimate — set the hours by hand</option>' +
        names.map(n => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('')
      : '<option value="">Rate card is empty</option>';
    fillComplexities();
  };

  dSel.addEventListener('change', fillComplexities);
  ['taskComplexity', 'taskQuantity', 'taskFrd', 'taskCase', 'taskStart'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', refreshTaskEstimate);
  });

  // Already loaded when opening a second project; otherwise fetch, and
  // tolerate failure so a missing rate card never blocks creating a task.
  if (allRates.length) fillDeliverables();
  else loadRates().then(fillDeliverables).catch(() => {
    dSel.innerHTML = '<option value="">Rate card unavailable — set the hours by hand</option>';
  });
}

function currentTaskRate(){
  const sel = document.getElementById('taskComplexity');
  if (!sel) return null;
  return allRates.find(r => Number(r.estimate_id) === Number(sel.value)) || null;
}

function refreshTaskEstimate(){
  const note = document.getElementById('taskEstimateNote');
  if (!note) return;
  const rate = currentTaskRate();
  const unitLabel = document.getElementById('taskUnitLabel');

  if (!rate) {
    if (unitLabel) unitLabel.textContent = 'units';
    note.className = 'estimate-note';
    note.textContent = 'No estimate — set the hours and the due date by hand.';
    return;
  }
  if (unitLabel) unitLabel.textContent = (rate.unit || 'unit').toLowerCase() + 's';

  const qty    = Number(document.getElementById('taskQuantity').value) || 0;
  const frd    = document.getElementById('taskFrd').value;
  const kase   = document.getElementById('taskCase').value;
  const per    = Number(rate[CASE_COLS[frd + ':' + kase]]);
  const hours  = Math.round(per * qty * 100) / 100;
  const target = targetDateFrom(hours, document.getElementById('taskStart').value);

  note.className = 'estimate-note on';
  note.innerHTML = qty > 0
    ? '<b>' + esc(hoursText(hours)) + '</b> — ' + esc(rateText(per, rate.unit)) +
      ' × ' + qty + ' ' + esc((rate.unit || 'unit').toLowerCase()) + (qty === 1 ? '' : 's') +
      (target ? '. Due <b>' + esc(fmtDay(target)) + '</b> unless you set one below.' : '.')
    : 'Enter how many ' + esc((rate.unit || 'unit').toLowerCase()) + 's to get an estimate.';
}

/* ── The admin page ───────────────────────────────────
   The same screen as Design › Rate card, pointed at DEV. */
function rateFormReset(){
  document.getElementById('newRateForm').reset();
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
      (allRates.length ? 'Nothing matches that.'
                       : 'No developer rates yet. Import migration 010 to seed them, or add rates by hand.') +
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
      document.getElementById('rEstimateId').value  = r.estimate_id;
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
              'If any task was estimated from it, it is retired instead of deleted so those estimates keep their source.',
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
    discipline:  'DEV'   // this card is the developer half of the table
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
   Demos on a project
   ────────────────────────────────────────────────────
   Several per project — an internal run-through, the
   client one, sometimes a dry run. Set here by whoever
   runs the project; read by everyone on it, including
   developers, who have no other project access.

   Scheduling one reports who is already booked off that
   day, because the useful moment to learn that is while
   choosing the date.
   ════════════════════════════════════════════════════ */
function demoFormReset(){
  const f = document.getElementById('newDemoForm');
  if (!f) return;
  f.reset();
  document.getElementById('demoId').value = '';
  document.getElementById('demoSubmitBtn').textContent = 'Add demo';
}

function wireDemos(projectId){
  const form = document.getElementById('newDemoForm');
  if (!form) return;

  document.getElementById('newDemoToggle').addEventListener('click', () => {
    if (form.classList.contains('open') && document.getElementById('demoId').value) demoFormReset();
    form.classList.toggle('open');
  });
  document.getElementById('demoCancelBtn').addEventListener('click', () => {
    demoFormReset();
    form.classList.remove('open');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      demo_id:    document.getElementById('demoId').value || 0,
      project_id: projectId,
      demo_type:  document.getElementById('demoType').value,
      status:     document.getElementById('demoStatus').value,
      demo_date:  document.getElementById('demoDate').value,
      demo_time:  document.getElementById('demoTime').value,
      title:      document.getElementById('demoTitle').value.trim(),
      notes:      document.getElementById('demoNotes').value.trim()
    };
    if (!body.demo_date) return;
    try {
      const res = await api(PM_DEMOS_SAVE_URL, { method:'POST', body });
      demoFormReset();
      form.classList.remove('open');

      /* Sticky, because it is the one thing worth reading twice: the
         demo is booked on a day somebody is away. */
      const away = Array.isArray(res.away) ? res.away : [];
      if (away.length) {
        toast('Demo saved — but ' + away.map(a => a.person).join(', ') +
              (away.length === 1 ? ' is' : ' are') + ' on leave that day.', 'err', true);
      } else {
        toast('Demo saved.', 'ok');
      }
      renderDemos(projectId);
    } catch (err) {
      toast('Could not save the demo: ' + err.message, 'err');
    }
  });
}

async function renderDemos(projectId){
  const listEl = document.getElementById('projectDemosList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const demos = await api(PM_DEMOS_LIST_URL + '?project_id=' + projectId);
    const countEl = document.getElementById('demoCount');
    if (countEl) countEl.textContent = String(demos.length);

    if (!demos.length) {
      listEl.innerHTML = '<div class="empty">No demos scheduled. Everyone on this project sees the dates you add here.</div>';
      return;
    }

    listEl.innerHTML = demos.map(d => {
      const c = demoCountdown(d.demo_date);   // ui.js
      return '<div class="task-row">' +
        '<div class="tinfo">' +
          '<div class="ttitle">' +
            '<span class="demochip ' + esc(String(d.demo_type).toLowerCase()) + '">' +
              esc(demoLabel(d.demo_type)) + '</span> ' +
            esc(d.title || d.project_name) +
          '</div>' +
          '<div class="tmeta">' +
            '<span>' + esc(demoDay(d.demo_date)) + '</span>' +
            (d.demo_time ? '<span>' + esc(String(d.demo_time).slice(0,5)) + '</span>' : '') +
            (d.status === 'PLANNED'
              ? '<span class="due ' + esc(c.cls) + '">' + esc(c.text) + '</span>'
              : '') +
            (d.notes ? '<span>' + esc(d.notes) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="tactions">' + badge(d.status) +
          '<button type="button" class="icon-btn" data-demo-edit="' + d.demo_id + '">Edit</button>' +
          '<button type="button" class="icon-btn danger" data-demo-del="' + d.demo_id + '">Delete</button>' +
        '</div></div>';
    }).join('');

    listEl.querySelectorAll('[data-demo-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = demos.find(x => Number(x.demo_id) === Number(btn.dataset.demoEdit));
        if (!d) return;
        document.getElementById('demoId').value     = d.demo_id;
        document.getElementById('demoType').value   = d.demo_type;
        document.getElementById('demoStatus').value = d.status;
        document.getElementById('demoDate').value   = d.demo_date;
        document.getElementById('demoTime').value   = d.demo_time ? String(d.demo_time).slice(0,5) : '';
        document.getElementById('demoTitle').value  = d.title || '';
        document.getElementById('demoNotes').value  = d.notes || '';
        document.getElementById('demoSubmitBtn').textContent = 'Save changes';
        document.getElementById('newDemoForm').classList.add('open');
      });
    });

    listEl.querySelectorAll('[data-demo-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const d = demos.find(x => Number(x.demo_id) === Number(btn.dataset.demoDel));
        if (!await confirmDialog({
          title: 'Delete this demo?',
          body: (d ? demoLabel(d.demo_type) + ' on ' + demoDay(d.demo_date) + '. ' : '') +
                'Everyone on the project stops seeing the date.',
          confirmLabel: 'Delete demo',
          danger: true
        })) return;
        btn.disabled = true;
        try {
          await api(PM_DEMOS_DELETE_URL, { method:'POST', body:{ demo_id: Number(btn.dataset.demoDel) } });
          renderDemos(projectId);
        } catch (err) {
          toast('Could not delete: ' + err.message, 'err');
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    // Migration 011 may not be imported yet.
    listEl.innerHTML = '<div class="empty">Could not load demos (' + esc(err.message) + ').</div>';
  }
}
