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

const PM_EMPLOYEES_LIST_URL   = PM_API_BASE + "pm-employees-list.php";
const PM_EMPLOYEES_CREATE_URL = PM_API_BASE + "pm-employees-create.php";
const PM_EMPLOYEES_UPDATE_URL = PM_API_BASE + "pm-employees-update.php";
const PM_EMPLOYEES_DELETE_URL = PM_API_BASE + "pm-employees-delete.php";
const PM_PROJECTS_LIST_URL    = PM_API_BASE + "pm-projects-list.php";
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

/* ── DOM references ─────────────────────────────────── */
const pmSignedOut = document.getElementById('pmSignedOut');
const appView     = document.getElementById('appView');
const whoEmail    = document.getElementById('whoEmail');
const roleBadge   = document.getElementById('roleBadge');
const signOutBtn  = document.getElementById('signOut');
const navLinks    = document.querySelectorAll('nav.tabs a');
const pages       = document.querySelectorAll('.page');

let session  = null;
let isAdmin  = false;
let allEmployees = [];
let allProjects  = [];

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
function prioBadge(p){
  if (!p) return '';
  return '<span class="status-badge prio-' + esc(String(p).toLowerCase()) + '">' +
    esc(statusLabel(p)) + '</span>';
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
  whoEmail.textContent = session.email || 'signed in';
  roleBadge.textContent = isAdmin ? 'Admin' : 'Manager';
  roleBadge.className = 'role-badge' + (isAdmin ? '' : ' manager');
  document.querySelectorAll('.nav-admin').forEach(a => { a.hidden = !isAdmin; });
  route();
}
signOutBtn.addEventListener('click', () => {
  clearSession();
  location.href = 'index.html';
});

/* ── Router ──────────────────────────────────────────── */
const PAGE_LABELS = {
  projects: 'Projects', tasks: 'Tasks', questions: 'Questions'
};

function renderBreadcrumb(page, projectId){
  const el = document.getElementById('breadcrumb');
  // The nav's "Projects" tab is this app's root — "Dashboard" in the nav
  // is a different, cross-page destination (the Fireflies overview).
  const crumbs = [{ label: 'Projects', hash: '#/projects' }];
  if (page === 'project') {
    const p = allProjects.find(pr => pr.project_id === projectId);
    crumbs.push({ label: p ? p.project_name : 'Project', hash: null });
  } else if (page !== 'dashboard' && page !== 'projects') {
    crumbs.push({ label: PAGE_LABELS[page] || page, hash: null });
  }
  // A single crumb just repeats the already-highlighted "Projects" nav tab —
  // no wayfinding value, so skip rendering it at all.
  if (crumbs.length < 2) { el.innerHTML = ''; return; }
  el.innerHTML = crumbs.map((c, i) => {
    const isLast = i === crumbs.length - 1;
    const text = esc(c.label);
    return (i > 0 ? '<span class="crumb-sep">›</span>' : '') +
      (c.hash && !isLast ? '<a href="' + c.hash + '">' + text + '</a>' : '<span class="crumb-here">' + text + '</span>');
  }).join('');
}

function route(){
  if (!readSession()) { showSignedOut(); return; }
  const hash  = location.hash || '#/dashboard';
  const parts = hash.replace(/^#\//, '').split('/');
  let page    = parts[0] || 'dashboard';
  if (!['dashboard','projects','project','tasks','questions'].includes(page)) page = 'dashboard';

  pages.forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  // "Dashboard" in the nav now always means the Fireflies+Projects combined
  // view on index.html; this app's own #/dashboard landing route highlights
  // the "Projects" tab instead, since there's no longer a separate nav item for it.
  const navTarget = (page === 'project' || page === 'dashboard') ? 'projects' : page;
  navLinks.forEach(a => a.classList.toggle('on', a.dataset.nav === navTarget));
  renderBreadcrumb(page, Number(parts[1]));

  if (page === 'dashboard') renderDashboard();
  if (page === 'projects')  renderProjects();
  if (page === 'project')   renderProjectDetail(Number(parts[1]));
  if (page === 'tasks')     renderTasks();
  if (page === 'questions') renderQuestions();
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
   Employees (supporting panel on the Projects page)
   ════════════════════════════════════════════════════ */
function renderEmployeesPanel(){
  const listEl = document.getElementById('employeesList');
  listEl.innerHTML = allEmployees.length
    ? allEmployees.map(employeeRow).join('')
    : '<div class="empty">No employees yet — add one below.</div>';
  wireEmployeeRows(listEl);
}

function employeeRow(e){
  return '<div class="task-row" data-emp-row="' + e.employee_id + '">' +
    '<div class="tinfo"><div class="ttitle">' + esc(e.name) + '</div>' +
    '<div class="tmeta">' +
      (e.designation ? '<span>' + esc(e.designation) + '</span>' : '') +
      (e.department ? '<span>' + esc(e.department) + '</span>' : '') +
      (!e.designation && !e.department ? '<span>No details</span>' : '') +
    '</div></div>' +
    '<div class="tactions">' +
      '<button type="button" class="icon-btn" data-emp-edit="' + e.employee_id + '">Edit</button>' +
      '<button type="button" class="icon-btn danger" data-emp-delete="' + e.employee_id + '">Delete</button>' +
    '</div></div>';
}

function employeeEditForm(e){
  return '<div class="task-row edit-row" data-emp-row="' + e.employee_id + '">' +
    '<div class="row" style="flex:1">' +
      '<div class="field"><input value="' + esc(e.name) + '" data-emp-field="name" placeholder="Name" /></div>' +
      '<div class="field"><input value="' + esc(e.designation || '') + '" data-emp-field="designation" placeholder="Designation" /></div>' +
      '<div class="field" style="grid-column:1/-1"><input value="' + esc(e.department || '') + '" data-emp-field="department" placeholder="Department" /></div>' +
    '</div>' +
    '<div class="tactions">' +
      '<button type="button" class="icon-btn" data-emp-save="' + e.employee_id + '">Save</button>' +
      '<button type="button" class="icon-btn" data-emp-cancel="' + e.employee_id + '">Cancel</button>' +
    '</div></div>';
}

function wireEmployeeRows(root){
  root.querySelectorAll('[data-emp-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.empEdit);
      const emp = allEmployees.find(e => e.employee_id === id);
      const rowEl = root.querySelector('[data-emp-row="' + id + '"]');
      rowEl.outerHTML = employeeEditForm(emp);
      wireEmployeeRows(root);
    });
  });
  root.querySelectorAll('[data-emp-cancel]').forEach(btn => {
    btn.addEventListener('click', () => renderEmployeesPanel());
  });
  root.querySelectorAll('[data-emp-save]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.empSave);
      const rowEl = root.querySelector('[data-emp-row="' + id + '"]');
      const name = rowEl.querySelector('[data-emp-field="name"]').value.trim();
      const designation = rowEl.querySelector('[data-emp-field="designation"]').value.trim();
      const department = rowEl.querySelector('[data-emp-field="department"]').value.trim();
      if (!name) return;
      btn.disabled = true;
      try {
        await api(PM_EMPLOYEES_UPDATE_URL, { method: 'POST', body: { employee_id: id, name, designation, department } });
        await loadEmployees();
        renderEmployeesPanel();
        populateEmployeeSelects();
      } catch (err) {
        alert('Could not save employee: ' + err.message);
        btn.disabled = false;
      }
    });
  });
  root.querySelectorAll('[data-emp-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.empDelete);
      const emp = allEmployees.find(e => e.employee_id === id);
      if (!confirm('Delete ' + (emp ? emp.name : 'this employee') + '? This cannot be undone.')) return;
      btn.disabled = true;
      try {
        await api(PM_EMPLOYEES_DELETE_URL, { method: 'POST', body: { employee_id: id } });
        await loadEmployees();
        renderEmployeesPanel();
        populateEmployeeSelects();
      } catch (err) {
        alert('Could not delete employee: ' + err.message);
        btn.disabled = false;
      }
    });
  });
}

document.getElementById('employeesPanelToggle').addEventListener('click', () => {
  document.getElementById('employeesPanel').classList.toggle('open');
});

document.getElementById('empAddForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('empName').value.trim();
  const department = document.getElementById('empDepartment').value.trim();
  const designation = document.getElementById('empDesignation').value.trim();
  if (!name) return;
  try {
    await api(PM_EMPLOYEES_CREATE_URL, { method: 'POST', body: { name, department, designation } });
    document.getElementById('empAddForm').reset();
    await loadEmployees();
    renderEmployeesPanel();
    populateEmployeeSelects();
  } catch (err) {
    alert('Could not add employee: ' + err.message);
  }
});

function populateEmployeeSelects(){
  document.querySelectorAll('select[data-role="employee-select"]').forEach(sel => {
    sel.innerHTML = '<option value="">Select employee…</option>' +
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
    renderEmployeesPanel();
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
    alert('Could not create project: ' + err.message);
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

    renderBreadcrumb('project', projectId);

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
        '<div class="row">' +
          '<div class="field"><label>Estimate (hours) <span class="opt">— optional</span></label><input id="taskEta" type="number" min="0" step="0.5" placeholder="e.g. 4" /></div>' +
          '<div class="field"><label>Priority</label><select id="taskPriority">' +
            '<option value="LOW">Low</option><option value="MEDIUM" selected>Medium</option>' +
            '<option value="HIGH">High</option><option value="CRITICAL">Critical</option>' +
          '</select></div>' +
        '</div>' +
        '<div class="field"><label>Description <span class="opt">— optional</span></label><input id="taskDescription" placeholder="Details" /></div>' +
        '<div class="actions"><button type="submit">Add task</button>' +
          '<button type="button" class="secondary" id="taskCancelBtn">Cancel</button></div>' +
      '</form>' +
      '<div id="projectTasksList"></div>';

    populateEmployeeSelects();

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
        alert('Could not save project: ' + err.message);
      }
    });
    document.getElementById('deleteProjectBtn').addEventListener('click', async () => {
      if (!confirm('Delete "' + project.project_name + '"? This permanently deletes every task and question under it. This cannot be undone.')) return;
      try {
        await api(PM_PROJECTS_DELETE_URL, { method: 'POST', body: { project_id: projectId } });
        allProjects = [];
        location.hash = '#/projects';
      } catch (err) {
        alert('Could not delete project: ' + err.message);
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
      try {
        await api(PM_TASKS_CREATE_URL, { method: 'POST',
          body: { project_id: projectId, employee_id: Number(employee_id), task_name, description, eta_hours, priority } });
        e.target.reset();
        e.target.classList.remove('open');
        renderProjectDetail(projectId);
      } catch (err) {
        alert('Could not create task: ' + err.message);
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
        alert('Could not update task: ' + err.message);
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
        alert('Could not save task: ' + err.message);
        btn.disabled = false;
      }
    });
  });
  root.querySelectorAll('[data-task-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.taskDelete);
      if (!confirm('Delete this task? This also removes its questions. This cannot be undone.')) return;
      btn.disabled = true;
      try {
        await api(PM_TASKS_DELETE_URL, { method: 'POST', body: { task_id: id } });
        onChanged();
      } catch (err) {
        alert('Could not delete task: ' + err.message);
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
    alert('Could not send question: ' + err.message);
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
        alert('Could not send answer: ' + err.message);
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
