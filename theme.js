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

  /* logo.png is the dark wordmark on transparent pixels, so on a dark bar
     it needs either a light plate behind it — which reads as a white box —
     or a light version of the mark. logo-light.png is that: generated from
     logo.png with only the neutral wordmark flipped, the brand mark copied
     through untouched. Both are transparent, so neither needs a plate.

     Scoped to the topbar and the signed-out card. The sign-in panel's logo
     sits on the orange gradient in BOTH themes, so it keeps the dark mark
     on its white plate and must not be swapped. */
  var LOGO_SEL   = '.topbar .logochip img, .pm-signedout .logochip img';
  var LOGO_LIGHT = 'logo.png';        // dark mark, for light backgrounds
  var LOGO_DARK  = 'logo-light.png';  // light mark, for dark backgrounds

  function swapLogos(theme) {
    var wanted = theme === 'dark' ? LOGO_DARK : LOGO_LIGHT;
    var imgs = document.querySelectorAll(LOGO_SEL);
    for (var i = 0; i < imgs.length; i++) {
      // Compare the filename, not the full URL — src reads back absolute.
      var current = (imgs[i].getAttribute('src') || '').split('?')[0];
      if (current !== wanted) imgs[i].setAttribute('src', wanted);
    }
  }

  var LABEL = {
    auto:  { icon: '🌗', text: 'Theme: auto',  title: 'Theme follows your system — click for light' },
    light: { icon: '☀️', text: 'Theme: light', title: 'Light theme — click for dark' },
    dark:  { icon: '🌙', text: 'Theme: dark',  title: 'Dark theme — click to follow your system' }
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
    /* A page with no topbar says where the button goes by putting an empty
       element with data-theme-slot wherever it wants it — the sign-in page
       uses one beside its heading. This replaced a hard-coded selector for
       that page: the mount point belongs in the page's own markup, next to
       the layout that has to accommodate it, not in a list here.
       data-theme-slot="inline" asks for the text version instead. */
    var slots = document.querySelectorAll('[data-theme-slot]');
    for (var j = 0; j < slots.length; j++) {
      if (slots[j].querySelector('.theme-toggle')) continue;
      slots[j].appendChild(makeButton(slots[j].getAttribute('data-theme-slot') === 'inline'));
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
