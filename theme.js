/* ════════════════════════════════════════════════════
   Theme: light / dark / follow the system
   ────────────────────────────────────────────────────
   Loaded in <head> of every page, deliberately without defer: it must
   set data-theme on <html> before the first paint, otherwise a dark-mode
   user gets a white flash on every navigation.

   The choice is stored as one of three values:
     "auto"   follow the operating system  (default)
     "light"  force light
     "dark"   force dark
   …but what lands on <html> is always a concrete "light" or "dark", so
   style.css only needs one dark block rather than a copy inside a
   prefers-color-scheme media query.

   The toggle button and the logo swap are wired up on DOMContentLoaded,
   so this same file covers all seven pages with no markup to keep in
   sync. Sign-in has no topbar, so there it goes under the form instead.
   ════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var KEY  = 'movenetics.theme';
  var root = document.documentElement;
  var ORDER = ['auto', 'light', 'dark'];

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return ORDER.indexOf(v) >= 0 ? v : 'auto';
    } catch (_) { return 'auto'; }   // private mode / blocked storage
  }

  function systemPrefersDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function resolved() {
    var pref = stored();
    if (pref === 'auto') return systemPrefersDark() ? 'dark' : 'light';
    return pref;
  }

  /* Runs immediately — before <body> exists — so the very first paint is
     already the right colour. Everything below waits for the DOM. */
  root.setAttribute('data-theme', resolved());

  var LOGO_LIGHT = 'logo.png';       // dark mark, for light backgrounds
  var LOGO_DARK  = 'logodark.png';   // light mark, for dark backgrounds

  function swapLogos(theme) {
    var wanted = theme === 'dark' ? LOGO_DARK : LOGO_LIGHT;
    var imgs = document.querySelectorAll('.logochip img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      // Compare the filename, not the full URL — src reads back absolute.
      var current = (img.getAttribute('src') || '').split('?')[0];
      if (current !== wanted) img.setAttribute('src', wanted);
    }
  }

  var LABEL = {
    auto:  { icon: '◐', text: 'Theme: auto',  title: 'Theme follows your system — click for light' },
    light: { icon: '☀', text: 'Theme: light', title: 'Light theme — click for dark' },
    dark:  { icon: '☽', text: 'Theme: dark',  title: 'Dark theme — click to follow your system' }
  };

  function paintButtons() {
    var pref = stored();
    var meta = LABEL[pref];
    var btns = document.querySelectorAll('.theme-toggle');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      b.title = meta.title;
      b.setAttribute('aria-label', meta.title);
      b.textContent = b.classList.contains('inline')
        ? meta.icon + '  ' + meta.text
        : meta.icon;
    }
  }

  function apply() {
    var theme = resolved();
    root.setAttribute('data-theme', theme);
    swapLogos(theme);
    paintButtons();
  }

  function cycle() {
    var next = ORDER[(ORDER.indexOf(stored()) + 1) % ORDER.length];
    try { localStorage.setItem(KEY, next); } catch (_) {}
    apply();
  }

  function makeButton(inline) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'theme-toggle' + (inline ? ' inline' : '');
    b.addEventListener('click', cycle);
    return b;
  }

  function mount() {
    // App pages: in the topbar, just before Sign out.
    var bars = document.querySelectorAll('.topbar');
    for (var i = 0; i < bars.length; i++) {
      var bar = bars[i];
      if (bar.querySelector('.theme-toggle')) continue;
      var signOut = bar.querySelector('#signOut');
      bar.insertBefore(makeButton(false), signOut || null);
    }
    // Sign-in page: under the form, next to the support link.
    var help = document.querySelector('#loginView .help-link');
    if (help && !help.parentNode.querySelector('.theme-toggle')) {
      help.parentNode.insertBefore(makeButton(true), help.nextSibling);
    }
    apply();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  /* Only matters while the preference is "auto": if the OS flips (sunset,
     or the user toggling it), follow along without a reload. */
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function () { if (stored() === 'auto') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);   // older Safari
  }

  /* Signed in on two tabs: keep them in step. */
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) apply();
  });
})();
