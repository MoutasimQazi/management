/* ════════════════════════════════════════════════════
   Sign-in
   ────────────────────────────────────────────────────
   The only page that talks to the login endpoints. It
   was part of index.html, which meant the dashboard
   carried a login form it could not use and the login
   form carried a dashboard it could not see; the two
   are now separate documents.

   Everything else in the workspace is signed-in-only
   and sends you here when there is no session:

     login.html?m=out       after Sign out
     login.html?m=expired   after a 401 from any page

   Shared session helpers come from fireflies.js, which
   must load first.
   ════════════════════════════════════════════════════ */

const loginForm   = document.getElementById('loginForm');
const loginBtn    = document.getElementById('loginBtn');
const loginStatus = document.getElementById('loginStatus');
const pwToggle    = document.getElementById('pwToggle');
const emailEl     = document.getElementById('email');
const passwordEl  = document.getElementById('password');

const SUPPORT_LINK = 'Need access or a password reset? Email <a href="mailto:' +
  SUPPORT_EMAIL + '?subject=Fireflies%20dispatch%20access">' + SUPPORT_EMAIL + '</a>.';

/* Where a successful sign-in lands: HR / Marketing / QA / Employee each
   have their own section, everyone else gets the Overview dashboard. */
function landingFor(role){
  return roleHome(role) || 'index.html';
}

/* ── Already signed in? ──────────────────────────────
   Straight through — no reason to show a form to someone who is holding
   a valid token. replace() rather than assign() so Back does not bounce
   between here and the dashboard. */
(function skipIfSignedIn(){
  const existing = readSession();
  if (existing) location.replace(landingFor(existing.role));
})();

/* ── Why you are here ────────────────────────────────
   A page that turns you away says so in the URL, and this is where the
   sentence for it lives — the other pages should not each carry their
   own wording for the same two situations. */
const REASONS = {
  out:     ['',    'Signed out.'],
  expired: ['err', 'Your session expired. Please sign in again.'],
  denied:  ['err', 'That account cannot open this page. Sign in with one that can.']
};

(function explainRedirect(){
  const reason = REASONS[new URLSearchParams(location.search).get('m')];
  if (reason) setStatus(loginStatus, reason[0], reason[1]);
  // Drop the marker so a refresh does not repeat a message about
  // something that happened one navigation ago.
  if (location.search) history.replaceState(null, '', location.pathname);
})();

/* ── Password visibility ─────────────────────────────── */
pwToggle.addEventListener('click', () => {
  const showing = passwordEl.type === 'text';
  passwordEl.type = showing ? 'password' : 'text';
  pwToggle.textContent = showing ? '👁' : '🙈';
  pwToggle.classList.toggle('showing', !showing);
  passwordEl.focus();
});

/* ── Sign in ─────────────────────────────────────────
   Tries one endpoint; returns {ok:false} on a plain auth rejection
   (401/403) so the caller can fall through to the next one, but throws
   on anything else — a real outage should not read as "wrong password". */
async function attemptLogin(url, email, password){
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (res.status === 401 || res.status === 403) return { ok: false };
  if (!res.ok) throw new Error('Login endpoint responded with ' + res.status + '.');
  const data  = await res.json().catch(() => ({}));
  const token = data.token || data.jwt || data.access_token;
  if (!token) throw new Error('Login succeeded but no token came back.');
  return { ok: true, data, token };
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email    = emailEl.value.trim();
  const password = passwordEl.value;
  const remember = document.getElementById('remember').checked;

  loginBtn.disabled = true;
  loginBtn.classList.add('busy');
  loginBtn.querySelector('.btn-label').textContent = 'Signing in…';
  setStatus(loginStatus, 'busy', 'Checking your credentials…');

  try {
    // The 6 original managers authenticate through n8n exactly as before.
    // HR / Marketing / QA / Employee accounts don't exist in n8n's
    // credential list, so a 401/403 there falls through to the DB-backed
    // PHP login instead.
    let result = await attemptLogin(LOGIN_URL, email, password);
    if (!result.ok) result = await attemptLogin(PM_LOGIN_URL, email, password);
    if (!result.ok) throw new Error('That email and password combination was rejected. ' + SUPPORT_LINK);

    const { data, token } = result;
    const session = { email: data.email || email, token, role: data.role || 'MANAGER' };
    writeSession(session, remember);
    loginForm.reset();

    setStatus(loginStatus, 'ok', 'Signed in. Taking you through…');
    location.href = landingFor(session.role);
  } catch (err) {
    setStatus(loginStatus, 'err', err.message);
    passwordEl.value = '';
    passwordEl.focus();
    const shell = document.querySelector('.shell');
    shell.classList.remove('shake');
    void shell.offsetWidth;        // restart the animation if it fires twice in a row
    shell.classList.add('shake');
  } finally {
    loginBtn.disabled = false;
    loginBtn.classList.remove('busy');
    loginBtn.querySelector('.btn-label').textContent = 'Sign in';
  }
});

// Land on the first empty field rather than always the top one, so a
// returning browser that autofilled the email goes straight to password.
(function focusFirstGap(){
  (emailEl.value ? passwordEl : emailEl).focus();
})();
