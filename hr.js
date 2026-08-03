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

/* ── DOM references ─────────────────────────────────── */
const pmSignedOut = document.getElementById('pmSignedOut');
const appView     = document.getElementById('appView');
const whoEmail    = document.getElementById('whoEmail');
const roleBadge   = document.getElementById('roleBadge');
const signOutBtn  = document.getElementById('signOut');
const navLinks    = document.querySelectorAll('nav.tabs a');
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
  roleBadge.textContent = isAdmin ? 'Admin' : 'HR';
  document.getElementById('staffNavLink').style.display = isAdmin ? '' : 'none';
  document.getElementById('adminBackLink').style.display = isAdmin ? '' : 'none';
  route();
}
signOutBtn.addEventListener('click', () => {
  clearSession();
  location.href = 'index.html';
});

/* ── Router ──────────────────────────────────────────── */
const PAGE_LABELS = { openings: 'Openings', leave: 'Leave', employees: 'Employees', staff: 'Staff' };

function renderBreadcrumb(page, openingId){
  const el = document.getElementById('breadcrumb');
  const crumbs = [{ label: 'Openings', hash: '#/openings' }];
  if (page === 'opening') {
    const o = allOpenings.find(x => x.opening_id === openingId);
    crumbs.push({ label: o ? o.title : 'Opening', hash: null });
  } else if (page !== 'openings') {
    crumbs.push({ label: PAGE_LABELS[page] || page, hash: null });
  }
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
  const hash  = location.hash || '#/openings';
  const parts = hash.replace(/^#\//, '').split('/');
  let page    = parts[0] || 'openings';
  if (!['openings','opening','leave','employees','staff'].includes(page)) page = 'openings';
  if (page === 'staff' && !isAdmin) page = 'openings';

  pages.forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  const navTarget = page === 'opening' ? 'openings' : page;
  navLinks.forEach(a => a.classList.toggle('on', a.dataset.nav === navTarget));
  renderBreadcrumb(page, Number(parts[1]));

  if (page === 'openings')  renderOpenings();
  if (page === 'opening')   renderOpeningDetail(Number(parts[1]));
  if (page === 'leave')     renderLeave();
  if (page === 'employees') renderEmployees();
  if (page === 'staff')     renderStaff();
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
    alert('Could not create opening: ' + err.message);
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
    renderBreadcrumb('opening', openingId);

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
      } catch (err) { alert('Could not save: ' + err.message); }
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
      } catch (err) { alert('Could not add candidate: ' + err.message); }
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
        alert('Could not move candidate: ' + err.message);
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
// HR tracks leave — approval itself happens on the manager's side (their
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
      : '<div class="empty">Nothing pending with a manager right now.</div>';

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
   Employees
   ════════════════════════════════════════════════════ */
async function renderEmployees(){
  const listEl = document.getElementById('employeesList');
  listEl.innerHTML = '<div class="empty">Loading…</div>';
  try {
    allEmployees = await api(PM_EMPLOYEES_LIST_URL);
    listEl.innerHTML = allEmployees.length
      ? allEmployees.map(employeeRow).join('')
      : '<div class="empty">No employees yet — add one above.</div>';
    wireEmployeeRows(listEl);
  } catch (err) {
    listEl.innerHTML = '<div class="empty">Could not load employees (' + esc(err.message) + ').</div>';
  }
}
function employeeRow(e){
  return '<div class="task-row" data-emp-row="' + e.employee_id + '">' +
    '<div class="tinfo"><div class="ttitle">' + esc(e.name) + '</div>' +
    '<div class="tmeta">' +
      (e.designation ? '<span>' + esc(e.designation) + '</span>' : '') +
      (e.department ? '<span>' + esc(e.department) + '</span>' : '') +
      (e.email ? '<span>' + esc(e.email) + '</span>' : '') +
      '<span>' + (e.has_login == 1 ? 'Has login' : 'No login yet') + '</span>' +
      (e.temp_password ? '<span>Password: <strong>' + esc(e.temp_password) + '</strong></span>' : '') +
    '</div></div>' +
    '<div class="tactions">' +
      '<button type="button" class="icon-btn" data-emp-edit="' + e.employee_id + '">Edit</button>' +
      (e.has_login == 1
        ? '<button type="button" class="icon-btn" data-emp-reset-pw="' + e.employee_id + '">Reset password</button>'
        : '') +
      '<button type="button" class="icon-btn danger" data-emp-delete="' + e.employee_id + '">Delete</button>' +
    '</div></div>';
}
function employeeEditForm(e){
  return '<div class="task-row edit-row" data-emp-row="' + e.employee_id + '">' +
    '<div class="row" style="flex:1">' +
      '<div class="field"><input value="' + esc(e.name) + '" data-emp-field="name" placeholder="Name" /></div>' +
      '<div class="field"><input value="' + esc(e.designation || '') + '" data-emp-field="designation" placeholder="Designation" /></div>' +
      '<div class="field"><input value="' + esc(e.department || '') + '" data-emp-field="department" placeholder="Department" /></div>' +
      '<div class="field"><input value="' + esc(e.email || '') + '" data-emp-field="email" type="email" placeholder="Email — grants login" /></div>' +
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
    btn.addEventListener('click', () => renderEmployees());
  });
  root.querySelectorAll('[data-emp-save]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.empSave);
      const rowEl = root.querySelector('[data-emp-row="' + id + '"]');
      const name = rowEl.querySelector('[data-emp-field="name"]').value.trim();
      const designation = rowEl.querySelector('[data-emp-field="designation"]').value.trim();
      const department = rowEl.querySelector('[data-emp-field="department"]').value.trim();
      const email = rowEl.querySelector('[data-emp-field="email"]').value.trim();
      if (!name) return;
      btn.disabled = true;
      try {
        const result = await api(PM_EMPLOYEES_UPDATE_URL, { method: 'POST',
          body: { employee_id: id, name, designation, department, email } });
        if (result.temp_password) {
          alert('Login created for ' + result.login_email + '.\nTemporary password: ' + result.temp_password + '\n\nAlso visible any time in the list below.');
        }
        renderEmployees();
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
        renderEmployees();
      } catch (err) {
        alert('Could not delete employee: ' + err.message);
        btn.disabled = false;
      }
    });
  });
  root.querySelectorAll('[data-emp-reset-pw]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.empResetPw);
      btn.disabled = true;
      try {
        await api(PM_EMPLOYEES_RESET_PW_URL, { method: 'POST', body: { employee_id: id } });
        renderEmployees();
      } catch (err) {
        alert('Could not reset password: ' + err.message);
        btn.disabled = false;
      }
    });
  });
}
document.getElementById('empAddForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('empName').value.trim();
  const department = document.getElementById('empDepartment').value.trim();
  const designation = document.getElementById('empDesignation').value.trim();
  const email = document.getElementById('empEmail').value.trim();
  if (!name) return;
  try {
    const result = await api(PM_EMPLOYEES_CREATE_URL, { method: 'POST', body: { name, department, designation, email } });
    document.getElementById('empAddForm').reset();
    if (result.temp_password) {
      alert('Login created for ' + result.login_email + '.\nTemporary password: ' + result.temp_password + '\n\nAlso visible any time in the list below.');
    }
    renderEmployees();
  } catch (err) {
    alert('Could not add employee: ' + err.message);
  }
});

/* ════════════════════════════════════════════════════
   Staff accounts (ADMIN only)
   ════════════════════════════════════════════════════ */
async function renderStaff(){
  if (!isAdmin) return;
  const listEl = document.getElementById('staffList');
  listEl.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const rows = await api(PM_MANAGERS_LIST_URL);
    listEl.innerHTML = rows.length
      ? rows.map(m =>
          '<div class="task-row" data-mgr-row="' + m.manager_id + '"><div class="tinfo"><div class="ttitle">' + esc(m.full_name) + '</div>' +
          '<div class="tmeta"><span>' + esc(m.email) + '</span><span>' + (m.has_login == 1 ? 'Has login' : 'No login yet') + '</span>' +
          (!m.is_active ? '<span>Deactivated</span>' : '') +
          (m.temp_password ? '<span>Password: <strong>' + esc(m.temp_password) + '</strong></span>' : '') +
          '</div></div>' +
          '<div class="tactions">' + badge(m.role) +
          (m.has_login == 1 ? '<button type="button" class="icon-btn" data-mgr-reset-pw="' + m.manager_id + '">Reset password</button>' : '') +
          '</div></div>').join('')
      : '<div class="empty">No staff accounts yet.</div>';
    listEl.querySelectorAll('[data-mgr-reset-pw]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.mgrResetPw);
        btn.disabled = true;
        try {
          await api(PM_MANAGERS_RESET_PW_URL, { method: 'POST', body: { manager_id: id } });
          renderStaff();
        } catch (err) {
          alert('Could not reset password: ' + err.message);
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    listEl.innerHTML = '<div class="empty">Could not load staff accounts (' + esc(err.message) + ').</div>';
  }
}
document.getElementById('newStaffForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const full_name = document.getElementById('staffName').value.trim();
  const email = document.getElementById('staffEmail').value.trim();
  const role = document.getElementById('staffRole').value;
  if (!full_name || !email) return;
  try {
    const result = await api(PM_MANAGERS_CREATE_URL, { method: 'POST', body: { full_name, email, role } });
    e.target.reset();
    document.getElementById('staffCreatedNotice').innerHTML =
      '<div class="empty">Account created for ' + esc(result.login_email) + '. Temporary password: <strong>' +
      esc(result.temp_password) + '</strong> — also visible any time in the list below.</div>';
    renderStaff();
  } catch (err) {
    alert('Could not create account: ' + err.message);
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
