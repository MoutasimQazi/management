/* ════════════════════════════════════════════════════
   Shared dialogs
   ────────────────────────────────────────────────────
   Replaces window.confirm() and window.prompt().

   The native ones are drawn by the browser, not the
   page: they arrive titled "management.moveneticsdigital
   .com says", ignore the theme entirely (a white slab on
   a dark screen), put the destructive choice under a
   button labelled "OK", and freeze the tab while they
   are open. For a dialog whose whole job is to make
   someone stop and read, that is the wrong set of
   properties.

   These return a Promise instead of blocking, so a call
   site reads the same as the one it replaced:

     if (!await confirmDialog({ ... })) return;

   Load before the page's own script. Styling lives in
   style.css under "Dialogs".
   ════════════════════════════════════════════════════ */

/* ── Links to somewhere else ──────────────────────────
   Bugs, test cases and design tasks all store a URL pointing at where the
   real thing lives — a screenshot, a recording, a Figma file. The value
   comes from a user and goes straight into an href, so it cannot be
   trusted: escaping it stops it breaking out of the attribute but leaves
   "javascript:…" perfectly intact, which would then run on click for
   whoever opens the list next.

   Only http(s) survives. Anything else returns '' and the caller renders
   no link at all. */
function safeUrl(v){
  const url = String(v == null ? '' : v).trim();
  return /^https?:\/\//i.test(url) ? url : '';
}

/* ── Date fields ──────────────────────────────────────
   A date input only opens its calendar from a ~20px glyph in the corner.
   Click anywhere else and you get a text cursor in a segment, which is
   why picking a date feels like fighting the control: the obvious target
   is the field, and the field does nothing.

   showPicker() opens it from anywhere in the field. It must be called
   from a real user gesture, which a click handler is. Not every browser
   has it — where it is missing this does nothing and the glyph still
   works, so nobody is worse off than before.

   Typing is left alone: a click that lands on a segment while the field
   already has focus is someone editing, not someone reaching for the
   calendar. */
document.addEventListener('click', (e) => {
  const el = e.target.closest && e.target.closest('input[type="date"]');
  if (!el || el.disabled || el.readOnly) return;
  if (typeof el.showPicker !== 'function') return;
  if (document.activeElement === el && el.value) return;
  try { el.showPicker(); } catch (_) {}   // throws if not user-activated
});

/* One host reused for every dialog — building and tearing down the
   backdrop each time made the blur flicker between two dialogs in a row. */
function dialogHost(){
  let host = document.getElementById('dialogHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'dialogHost';
    host.className = 'dialog-host';
    document.body.appendChild(host);
  }
  return host;
}

/* The one implementation. `field` turns it into a prompt; without it the
   promise resolves true/false, with it the entered string or null. */
function openDialog(opts){
  const o = opts || {};
  return new Promise(resolve => {
    const host = dialogHost();
    // Whatever had focus gets it back — usually the button just clicked,
    // so a keyboard user does not land back at the top of the document.
    const returnFocus = document.activeElement;

    const card = document.createElement('div');
    card.className = 'dialog' + (o.danger ? ' danger' : '');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');

    const titleEl = document.createElement('h2');
    titleEl.className = 'dtitle';
    titleEl.id = 'dialogTitle';
    titleEl.textContent = o.title || 'Are you sure?';
    card.setAttribute('aria-labelledby', titleEl.id);
    card.appendChild(titleEl);

    if (o.body) {
      const bodyEl = document.createElement('p');
      bodyEl.className = 'dbody';
      bodyEl.textContent = o.body;     // textContent: callers pass names and titles
      card.appendChild(bodyEl);
    }

    let input = null;
    if (o.field) {
      const label = document.createElement('label');
      label.className = 'dlabel';
      label.textContent = o.field.label || '';
      input = document.createElement(o.field.multiline ? 'textarea' : 'input');
      input.className = 'dinput';
      input.placeholder = o.field.placeholder || '';
      input.value = o.field.value || '';
      if (o.field.label) {
        label.htmlFor = input.id = 'dialogField';
        card.appendChild(label);
      }
      card.appendChild(input);
    }

    const actions = document.createElement('div');
    actions.className = 'dactions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'dbtn ghost';
    cancelBtn.textContent = o.cancelLabel || 'Cancel';
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'dbtn' + (o.danger ? ' danger' : '');
    okBtn.textContent = o.confirmLabel || 'Confirm';
    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    card.appendChild(actions);

    host.innerHTML = '';
    host.appendChild(card);
    host.classList.add('open');
    document.body.classList.add('dialog-open');

    let done = false;
    function close(result){
      if (done) return;               // Escape during the closing animation
      done = true;
      host.classList.remove('open');
      document.body.classList.remove('dialog-open');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(() => { if (!host.classList.contains('open')) host.innerHTML = ''; }, 160);
      if (returnFocus && returnFocus.focus) { try { returnFocus.focus(); } catch (_) {} }
      resolve(result);
    }

    const cancelled = () => close(o.field ? null : false);
    const accepted  = () => {
      if (o.field) {
        const v = input.value.trim();
        if (o.field.required && !v) { input.focus(); card.classList.add('shake');
          setTimeout(() => card.classList.remove('shake'), 500); return; }
        close(v);
      } else close(true);
    };

    cancelBtn.addEventListener('click', cancelled);
    okBtn.addEventListener('click', accepted);
    // Clicking the backdrop is a cancel; clicking the card must not be.
    host.addEventListener('mousedown', (e) => { if (e.target === host) cancelled(); });

    function onKey(e){
      if (e.key === 'Escape') { e.preventDefault(); cancelled(); return; }
      if (e.key === 'Enter' && !(o.field && o.field.multiline && e.target === input)) {
        e.preventDefault(); accepted(); return;
      }
      if (e.key !== 'Tab') return;
      // Keep Tab inside the dialog — behind it the whole page is inert.
      const focusable = [input, cancelBtn, okBtn].filter(Boolean);
      const i = focusable.indexOf(document.activeElement);
      const next = e.shiftKey ? i - 1 : i + 1;
      if (i === -1 || next < 0 || next >= focusable.length) {
        e.preventDefault();
        focusable[e.shiftKey ? focusable.length - 1 : 0].focus();
      }
    }
    document.addEventListener('keydown', onKey, true);

    /* A prompt wants the field. Otherwise the safe choice takes focus:
       for a destructive dialog that is Cancel, so Enter and Space cannot
       delete something by reflex. */
    (input || (o.danger ? cancelBtn : okBtn)).focus();
  });
}

/* Yes/no. Resolves true only if the confirm button was chosen. */
function confirmDialog(opts){
  const o = opts || {};
  return openDialog({
    title: o.title,
    body: o.body,
    danger: o.danger,
    confirmLabel: o.confirmLabel || (o.danger ? 'Delete' : 'Confirm'),
    cancelLabel: o.cancelLabel
  });
}

/* ════════════════════════════════════════════════════
   Due-date extensions
   ────────────────────────────────────────────────────
   Work slips. Moving the date is fine; moving it
   silently is not — so a push needs a new date and a
   reason, and both are kept.

   One flow for developer tasks, design tasks and bugs,
   because they slip for the same reasons and the admin
   wants one list. Shared here so all three boards ask
   the same question in the same words.
   ════════════════════════════════════════════════════ */
/* ui.js loads before every page's own script, so PM_API_BASE does not
   exist yet at this point — the base is written out here rather than
   read from a constant that is not there. Same value, same backend. */
const PM_UI_API_BASE        = "https://management.moveneticsdigital.com/pm-backend-php/";
const PM_DUE_EXTEND_URL     = PM_UI_API_BASE + "pm-due-extend.php";
const PM_DUE_EXTENSIONS_URL = PM_UI_API_BASE + "pm-due-extensions-list.php";

/* Asks for the new date and the reason together, then writes both.
   `item` is { type: 'TASK'|'DESIGN'|'BUG', id, name, due }.
   Resolves true when the date moved, so the caller can re-render. */
async function extendDueDate(item, token){
  const current = item.due ? ' Currently ' + demoDay(item.due) + '.' : ' No date set yet.';

  const newDue = await promptDialog({
    title: 'Move the due date',
    body: (item.name ? '“' + item.name + '”.' : '') + current +
          ' Enter the new date as YYYY-MM-DD.',
    label: 'New due date',
    placeholder: 'YYYY-MM-DD',
    value: item.due || '',
    required: true,
    confirmLabel: 'Next'
  });
  if (newDue === null) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDue)) {
    toast('That date needs to look like 2026-08-31.', 'err');
    return false;
  }

  /* Asked second and separately, so it reads as the point of the
     exercise rather than an optional box beside the date. */
  const reason = await promptDialog({
    title: 'Why is it moving?',
    body: 'This goes on the record and the admin sees it. Say what actually held it up.',
    label: 'Reason',
    placeholder: 'e.g. Client changed the checkout flow after the design was signed off',
    multiline: true,
    required: true,
    confirmLabel: 'Move the date'
  });
  if (reason === null) return false;
  if (reason.length < 10) {
    toast('Give a bit more than that — the admin reads these.', 'err');
    return false;
  }

  try {
    const res = await fetch(PM_DUE_EXTEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        work_type: item.type, work_id: item.id, new_due: newDue, reason
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));

    const n = data.days_moved;
    toast(n === null || n === undefined
      ? 'Due date set.'
      : (n > 0 ? 'Pushed out ' + n + ' day' + (n === 1 ? '' : 's') + '.'
               : 'Pulled forward ' + Math.abs(n) + ' day' + (Math.abs(n) === 1 ? '' : 's') + '.'), 'ok');
    return true;
  } catch (err) {
    toast('Could not move the date: ' + err.message, 'err');
    return false;
  }
}

/* opts: { url, token, panel, list, count, limit, projectId } — element
   ids. The admin sees every project; everyone else sees their own, which
   the endpoint decides, not this. */
async function renderDueExtensions(opts){
  const panel = document.getElementById(opts.panel);
  const list  = document.getElementById(opts.list);
  if (!panel || !list) return;

  try {
    const qs = ['limit=' + (opts.limit || 25)];
    if (opts.projectId) qs.push('project_id=' + opts.projectId);
    const res = await fetch(opts.url + '?' + qs.join('&'),
      { headers: { 'Authorization': 'Bearer ' + opts.token } });
    if (!res.ok) throw new Error('status ' + res.status);
    const rows = await res.json();

    if (!Array.isArray(rows) || !rows.length) { panel.style.display = 'none'; return; }
    panel.style.display = '';

    const countEl = opts.count && document.getElementById(opts.count);
    if (countEl) countEl.textContent = String(rows.length);

    const KIND = { TASK:'Task', DESIGN:'Design', BUG:'Bug' };
    list.innerHTML = rows.map(r => {
      const n = r.days_moved;
      const moved = (n === null || n === undefined) ? 'date set'
        : (n > 0 ? '+' + n + 'd' : n + 'd');
      // A fortnight in one move is the size worth spotting from a distance.
      const heavy = (n !== null && n !== undefined && n >= 14) ? ' heavy' : '';
      return '<div class="ext-row' + heavy + '">' +
        '<div class="ewhen"><span class="emoved">' + uiEsc(moved) + '</span>' +
          '<span class="edate">' + uiEsc(demoDay(r.new_due)) + '</span></div>' +
        '<div class="einfo">' +
          '<div class="etitle"><span class="kindchip">' + uiEsc(KIND[r.work_type] || r.work_type) +
            '</span> ' + uiEsc(r.work_name || ('#' + r.work_id)) + '</div>' +
          '<div class="ereason">' + uiEsc(r.reason) + '</div>' +
          '<div class="emeta">' +
            (r.project_name ? uiEsc(r.project_name) + ' · ' : '') +
            uiEsc(r.extended_by_name || 'Someone') +
            (r.old_due ? ' · was ' + uiEsc(demoDay(r.old_due)) : '') +
          '</div>' +
        '</div></div>';
    }).join('');
  } catch (_) {
    panel.style.display = 'none';   // migration 012 may not be in yet
  }
}

/* ════════════════════════════════════════════════════
   Stat tiles
   ────────────────────────────────────────────────────
   A number on a dashboard is a question — "48 open
   tasks" means "which forty-eight?" — and every one of
   these had the answer on another page with no way to
   get there. They are links now wherever a destination
   exists.

   An <a> rather than a click handler on a <div>: it gets
   middle-click, ctrl-click, the status bar preview and
   keyboard focus for free, none of which a handler does.
   Tiles with genuinely nowhere to go stay <div>s rather
   than becoming links to nothing.
   ════════════════════════════════════════════════════ */
function statTile(t){
  const inner =
    (t.icon ? '<div class="stat-icon">' + uiEsc(t.icon) + '</div>' : '') +
    '<div class="num"' + (t.small ? ' style="font-size:19px; line-height:1.25;"' : '') + '>' +
      uiEsc(String(t.num)) + '</div>' +
    '<div class="lbl">' + uiEsc(t.lbl) + '</div>';

  if (!t.href) return '<div class="stat">' + inner + '</div>';
  return '<a class="stat linked" href="' + uiEsc(t.href) + '"' +
    (t.title ? ' title="' + uiEsc(t.title) + '"' : '') + '>' + inner +
    '<span class="statgo" aria-hidden="true">→</span></a>';
}

function statTiles(list){ return list.map(statTile).join(''); }

/* ════════════════════════════════════════════════════
   Demos
   ────────────────────────────────────────────────────
   A project can have several — an internal run-through,
   the client one, sometimes a dry run. Everyone working
   on the project sees them, which is the whole point:
   the date only helps if the people building the thing
   know about it.
   ════════════════════════════════════════════════════ */
const DEMO_LABELS = {
  INTERNAL:'Internal demo', CLIENT:'Client demo',
  STAKEHOLDER:'Stakeholder demo', DRY_RUN:'Dry run', OTHER:'Demo'
};

function demoLabel(t){ return DEMO_LABELS[t] || 'Demo'; }

function demoDay(iso){
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? String(iso)
    : d.toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short' });
}

/* A date split for the calendar tile. A run of demos reads far faster as
   a column of day numbers than as a column of sentences. */
function demoParts(iso){
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return { day:'—', mon:'', dow:'' };
  return {
    day: String(d.getDate()),
    mon: d.toLocaleDateString('en-IN', { month:'short' }).toUpperCase(),
    dow: d.toLocaleDateString('en-IN', { weekday:'short' })
  };
}

/* One demo, as a card. Shared so the dashboards and the project page
   cannot drift into two different-looking versions of the same thing.
   `actions` is trailing HTML — the project page passes edit/delete. */
function demoCard(d, actions){
  const p = demoParts(d.demo_date);
  const c = demoCountdown(d.demo_date);
  const done = d.status && d.status !== 'PLANNED';
  return '<div class="demo-row ' + (done ? 'done' : c.cls) + '">' +
    '<div class="dcal">' +
      '<span class="dmon">' + uiEsc(p.mon) + '</span>' +
      '<span class="dnum">' + uiEsc(p.day) + '</span>' +
      '<span class="ddow">' + uiEsc(p.dow) + '</span>' +
    '</div>' +
    '<div class="dinfo">' +
      '<div class="dtitle">' +
        '<span class="demochip ' + uiEsc(String(d.demo_type).toLowerCase()) + '">' +
          uiEsc(demoLabel(d.demo_type)) + '</span>' +
        '<span class="dname">' + uiEsc(d.title || d.project_name) + '</span>' +
      '</div>' +
      '<div class="dmeta">' + uiEsc(d.project_name) +
        (d.client_name ? ' · ' + uiEsc(d.client_name) : '') + '</div>' +
      (d.notes ? '<div class="dnotes">' + uiEsc(d.notes) + '</div>' : '') +
    '</div>' +
    '<div class="dside">' +
      (done
        ? '<span class="dstatus">' + uiEsc(String(d.status).toLowerCase()) + '</span>'
        : '<span class="dcount">' + uiEsc(c.text) + '</span>') +
      (d.demo_time ? '<span class="dtime">' + uiEsc(String(d.demo_time).slice(0,5)) + '</span>' : '') +
      (actions ? '<span class="dactions">' + actions + '</span>' : '') +
    '</div>' +
  '</div>';
}

/* How near it is, which is what anyone reading a demo date wants first. */
function demoCountdown(iso){
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return { text:'', cls:'' };
  const days = Math.round((d - new Date().setHours(0,0,0,0)) / 86400000);
  if (days < 0)  return { text: Math.abs(days) + 'd ago', cls:'past' };
  if (days === 0) return { text:'Today', cls:'now' };
  if (days === 1) return { text:'Tomorrow', cls:'now' };
  if (days <= 7)  return { text:'in ' + days + ' days', cls:'soon' };
  return { text:'in ' + days + ' days', cls:'' };
}

/* opts: { url, token, panel, list, count, projectId } — element ids.
   Used by the Overview and by every role page whose people work on
   projects, so all of them say the same thing about the same date. */
async function renderUpcomingDemos(opts){
  const panel = document.getElementById(opts.panel);
  const list  = document.getElementById(opts.list);
  if (!panel || !list) return;

  try {
    const url = opts.url + '?upcoming=1' + (opts.projectId ? '&project_id=' + opts.projectId : '');
    const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + opts.token } });
    if (!res.ok) throw new Error('status ' + res.status);
    const demos = await res.json();

    // Nothing coming up is not worth a panel taking space on a dashboard.
    if (!Array.isArray(demos) || !demos.length) { panel.style.display = 'none'; return; }

    panel.style.display = '';
    const countEl = opts.count && document.getElementById(opts.count);
    if (countEl) countEl.textContent = String(demos.length);

    list.innerHTML = demos.map(d => demoCard(d)).join('');
  } catch (_) {
    // Migration 011 may not be in yet — a dashboard should not shout
    // about a feature nobody has installed.
    panel.style.display = 'none';
  }
}

/* The warning that matters: this leave lands on a demo for a project the
   person is working on. Rendered next to a pending request for whoever is
   approving it, and on the requester's own list so they see it first. */
function demoClashNote(r){
  const clashes = Array.isArray(r.demo_clashes) ? r.demo_clashes : [];
  if (!clashes.length) return '';
  return '<div class="clashnote">⚠ <b>Clashes with ' +
    (clashes.length === 1 ? 'a demo' : clashes.length + ' demos') + '</b> · ' +
    clashes.map(c =>
      uiEsc(demoLabel(c.demo_type)) + ' on ' + uiEsc(demoDay(c.demo_date)) +
      ' — ' + uiEsc(c.project_name)).join(' · ') +
  '</div>';
}

/* ════════════════════════════════════════════════════
   Estimates
   ────────────────────────────────────────────────────
   Shared by the Design and Projects rate cards, which
   read the same table and do the same arithmetic.

   The date preview mirrors designTargetDate() in
   auth.php. The server recomputes on save and its answer
   is what gets stored — this exists so that switching to
   worst case visibly moves the date before anyone
   commits to it.
   ════════════════════════════════════════════════════ */
const CASE_COLS = {
  '1:BEST':  'frd_best',   '1:WORST':  'frd_worst',
  '0:BEST':  'nofrd_best', '0:WORST':  'nofrd_worst'
};

// 0.5 → "2 Screens / hour"; 2 → "1 Screen / 2 hours".
function rateText(hours, unit){
  const h = Number(hours);
  if (!(h > 0)) return '—';
  const u = unit || 'Screen';
  if (h < 1) {
    const per = Math.round(1 / h);
    return per + ' ' + u + 's / hour';
  }
  return '1 ' + u + ' / ' + (h % 1 ? h.toFixed(2).replace(/0+$/, '') : h) +
    (h === 1 ? ' hour' : ' hours');
}

function hoursText(h){
  const n = Number(h);
  if (!(n > 0)) return '—';
  if (n < 8) return n + (n === 1 ? ' hour' : ' hours');
  const days = Math.ceil(n / estimateHoursPerDay);
  return n + ' hours (' + days + ' working day' + (days === 1 ? '' : 's') + ')';
}

/* Same rule as the server: whole working days at estimateHoursPerDay each, day
   one being the start date, weekends skipped. Holidays are not modelled
   in either place. */
function targetDateFrom(hours, startISO){
  if (!(hours > 0)) return null;
  const d = startISO ? new Date(startISO + 'T00:00:00') : new Date();
  d.setHours(0, 0, 0, 0);
  const days = Math.ceil(hours / estimateHoursPerDay);
  const skip = () => { while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); };
  skip();
  for (let i = 1; i < days; i++) { d.setDate(d.getDate() + 1); skip(); }
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}


/* Set from what the server sends, so the page and the backend cannot
   disagree about the length of a working day. */
let estimateHoursPerDay = 8;
function setEstimateHoursPerDay(h){ if (h > 0) estimateHoursPerDay = Number(h); }

/* ════════════════════════════════════════════════════
   "Who is on what"
   ────────────────────────────────────────────────────
   Every project with the people on it. Shown to admins
   on both the Overview and the Projects page — which is
   why it lives here and not in either of them.

   Its own escaper: the pages that use this each define
   their own esc(), and a second top-level function of
   that name here would quietly replace or be replaced by
   one of them depending on script order.
   ════════════════════════════════════════════════════ */
function uiEsc(s){
  return String(s == null ? '' : s)
    .replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
}

function teamGapsFor(p, modules){
  const gaps = [];
  if (!p.manager_name) gaps.push('BA');
  if (!p.developers.length) gaps.push('Dev');
  // Only a role this database can actually staff counts as missing — a
  // workspace without migration 006 is not "missing designers".
  if (modules.qa && !p.qa.length) gaps.push('QA');
  if (modules.design && !p.designers.length) gaps.push('Design');
  return gaps;
}

function teamCrewLine(label, names, isGap){
  return '<span class="crewgroup' + (isGap ? ' gap' : '') + '">' +
    '<b>' + label + '</b>' +
    (names.length ? uiEsc(names.join(', ')) : 'nobody yet') + '</span>';
}

function teamRow(p, modules){
  const devs = p.developers.map(d => d.name + ' (' + d.open_tasks + ')');
  const gaps = teamGapsFor(p, modules);
  return '<div class="task-row">' +
    '<div class="tinfo">' +
      '<div class="ttitle">' + uiEsc(p.project_name) +
        (gaps.length ? '<span class="gapflag">no ' + uiEsc(gaps.join(', ')) + '</span>' : '') +
      '</div>' +
      '<div class="tmeta">' +
        '<span>' + (p.manager_name ? uiEsc(p.manager_name) + ' · BA' : 'No business analyst') + '</span>' +
        (p.client_name ? '<span>' + uiEsc(p.client_name) + '</span>' : '') +
        '<span>' + p.open_tasks + ' open task' + (p.open_tasks === 1 ? '' : 's') + '</span>' +
      '</div>' +
      '<div class="crew">' +
        teamCrewLine('Dev', devs, !devs.length) +
        (modules.qa ? teamCrewLine('QA', p.qa, !p.qa.length) : '') +
        (modules.design ? teamCrewLine('Design', p.designers, !p.designers.length) : '') +
      '</div>' +
    '</div>' +
    '<div class="tactions"><span class="status-badge ' +
      uiEsc(String(p.status || '').toLowerCase()) + '">' +
      uiEsc(String(p.status || '').replace(/_/g, ' ')) + '</span></div>' +
  '</div>';
}

/* opts: { url, token, panel, list, count, gaps } — the last four are
   element ids, so a page only has to supply its own markup. */
async function renderTeamOverview(opts){
  const panel = document.getElementById(opts.panel);
  const list  = document.getElementById(opts.list);
  if (!panel || !list) return;

  panel.style.display = '';
  list.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const res = await fetch(opts.url, { headers: { 'Authorization': 'Bearer ' + opts.token } });
    if (!res.ok) throw new Error('status ' + res.status);
    const data     = await res.json();
    const projects = Array.isArray(data.projects) ? data.projects : [];
    const modules  = data.modules || {};

    if (!projects.length) { panel.style.display = 'none'; return; }

    const countEl = opts.count && document.getElementById(opts.count);
    if (countEl) countEl.textContent = String(projects.length);

    const gapsEl = opts.gaps && document.getElementById(opts.gaps);
    if (gapsEl) {
      const n = projects.filter(p => teamGapsFor(p, modules).length).length;
      gapsEl.textContent = n
        ? n + ' project' + (n === 1 ? '' : 's') + ' missing a role'
        : 'Every project is covered';
    }

    list.innerHTML = projects.map(p => teamRow(p, modules)).join('');
  } catch (err) {
    list.innerHTML = '<div class="empty">Could not load the team view (' +
      uiEsc(err.message) + ').</div>';
  }
}

/* Ask for a line of text. Resolves the trimmed string, or null if
   cancelled — note that "" is a real answer when required is false. */
function promptDialog(opts){
  const o = opts || {};
  return openDialog({
    title: o.title,
    body: o.body,
    danger: o.danger,
    confirmLabel: o.confirmLabel || 'Save',
    cancelLabel: o.cancelLabel,
    field: {
      label: o.label,
      placeholder: o.placeholder,
      value: o.value,
      required: o.required,
      multiline: o.multiline
    }
  });
}
