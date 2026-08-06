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
