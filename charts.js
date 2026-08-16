/* ════════════════════════════════════════════════════
   Charts
   ────────────────────────────────────────────────────
   Inline SVG, no library. The workspace ships as static
   files with no build step, and a charting library would
   be the largest thing on the page by an order of
   magnitude to draw four small figures.

   ── The palette ──
   Three categorical slots, validated against this site's
   real surfaces (#ffffff light, #17171b dark) rather
   than assumed: lightness band, chroma floor, CVD
   separation, normal-vision separation and contrast all
   pass in both modes. Worst adjacent CVD ΔE 9.2 light /
   9.4 dark against a target of 8.

   Aqua sits at 2.82:1 on white, under the 3:1 bar. That
   is a documented relief case and it is paid for here:
   every series is direct-labelled at its last point and
   every chart has a table underneath, so identity is
   never carried by colour alone.

   The dark steps are chosen for the dark surface, not
   flipped from the light ones.
   ════════════════════════════════════════════════════ */
const CHART_PALETTE = {
  light: ['#2a78d6', '#eb6834', '#1baf7a'],
  dark:  ['#3987e5', '#d95926', '#199e70']
};

function chartMode(){
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}
function seriesColor(i){
  const p = CHART_PALETTE[chartMode()];
  return p[i % p.length];
}
function chartInk(kind){
  // Text wears text tokens, never a series colour.
  return getComputedStyle(document.documentElement)
    .getPropertyValue(kind === 'muted' ? '--muted' : '--ink-2').trim() || '#666';
}

function svgEsc(s){
  return String(s == null ? '' : s)
    .replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
}

/* A short label for a week starting on this Monday. */
function weekLabel(iso){
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? iso
    : d.toLocaleDateString('en-IN', { day:'numeric', month:'short' });
}

/* Every chart ships a table as well. It is the relief for the sub-3:1
   slot, the answer for a screen reader, and the thing anyone actually
   uses when they want the number rather than the shape. */
function chartTable(headers, rows){
  return '<details class="charttable"><summary>Show the numbers</summary>' +
    '<div class="table-wrap"><table class="data-table"><thead><tr>' +
    headers.map(h => '<th>' + svgEsc(h) + '</th>').join('') +
    '</tr></thead><tbody>' +
    rows.map(r => '<tr>' + r.map(c => '<td>' + svgEsc(c) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table></div></details>';
}

/* ── Multi-line, for a trend ──────────────────────────
   One x per week. Series are direct-laballed at their final point and
   also carry a legend, so identity never rests on colour. */
function lineChart(host, opts){
  const el = typeof host === 'string' ? document.getElementById(host) : host;
  if (!el) return;
  const weeks  = opts.weeks || [];
  const series = opts.series || [];
  if (!weeks.length || !series.length) {
    el.innerHTML = '<div class="empty">Nothing recorded in this period.</div>';
    return;
  }

  const W = 640, H = 190, L = 34, R = 96, T = 14, B = 26;
  const maxRaw = Math.max(1, ...series.flatMap(s => s.values));
  // A round ceiling, so the gridline labels are numbers people recognise.
  const step = Math.pow(10, Math.floor(Math.log10(maxRaw))) * (maxRaw / Math.pow(10, Math.floor(Math.log10(maxRaw))) > 5 ? 2 : 1);
  const max  = Math.ceil(maxRaw / step) * step || 1;

  const x = i => L + (weeks.length === 1 ? 0 : i * (W - L - R) / (weeks.length - 1));
  const y = v => T + (H - T - B) * (1 - v / max);

  const grid = [0, 0.5, 1].map(f => {
    const v = max * f, yy = y(v);
    return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy +
             '" stroke="currentColor" stroke-opacity=".12" />' +
           '<text x="' + (L - 7) + '" y="' + (yy + 3.5) + '" text-anchor="end" ' +
             'font-size="9.5" fill="' + chartInk('muted') + '">' + Math.round(v) + '</text>';
  }).join('');

  // Every other week labelled — twelve labels on 640px collide.
  const xlabels = weeks.map((w, i) => (i % 2 || i === weeks.length - 1)
    ? '' : '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="9.5" fill="' +
        chartInk('muted') + '">' + svgEsc(weekLabel(w)) + '</text>').join('');

  const lines = series.map((s, si) => {
    const c = seriesColor(si);
    const d = s.values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
    const last = s.values.length - 1;
    return '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="2" ' +
             'stroke-linejoin="round" stroke-linecap="round" />' +
           // A 2px surface ring, so overlapping end points stay separable.
           '<circle cx="' + x(last).toFixed(1) + '" cy="' + y(s.values[last]).toFixed(1) +
             '" r="4" fill="' + c + '" stroke="var(--surface)" stroke-width="2" />' +
           '<text x="' + (W - R + 8) + '" y="' + (y(s.values[last]) + 3.5).toFixed(1) + '" ' +
             'font-size="10.5" font-weight="700" fill="' + chartInk() + '">' +
             svgEsc(s.name) + '</text>';
  }).join('');

  /* One hover column per week rather than per point: the target is the
     whole slice of the chart, which is far easier to hit than a 4px dot. */
  const hot = weeks.map((w, i) => {
    const tip = weekLabel(w) + ' — ' +
      series.map(s => s.name + ' ' + s.values[i]).join(', ');
    const half = (W - L - R) / Math.max(1, weeks.length - 1) / 2;
    return '<rect class="hotcol" x="' + (x(i) - half).toFixed(1) + '" y="' + T +
      '" width="' + (half * 2).toFixed(1) + '" height="' + (H - T - B) +
      '" fill="transparent"><title>' + svgEsc(tip) + '</title></rect>';
  }).join('');

  const legend = series.map((s, si) =>
    '<span class="lgd"><i style="background:' + seriesColor(si) + '"></i>' +
    svgEsc(s.name) + '</span>').join('');

  el.innerHTML =
    '<div class="chart">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
        svgEsc(opts.alt || 'Trend chart') + '" preserveAspectRatio="xMidYMid meet">' +
        grid + xlabels + lines + hot +
      '</svg>' +
      '<div class="legend">' + legend + '</div>' +
    '</div>' +
    chartTable(['Week'].concat(series.map(s => s.name)),
      weeks.map((w, i) => [weekLabel(w)].concat(series.map(s => s.values[i]))));
}

/* ── Horizontal bars, for magnitude ───────────────────
   One hue, more-is-longer. Sequential is the right job here: these are
   comparable quantities, not distinct identities. */
function barChart(host, rows, opts){
  const el = typeof host === 'string' ? document.getElementById(host) : host;
  if (!el) return;
  opts = opts || {};
  if (!rows || !rows.length) {
    el.innerHTML = '<div class="empty">' + (opts.empty || 'Nothing to show.') + '</div>';
    return;
  }
  const max = Math.max(1, ...rows.map(r => r.value));
  el.innerHTML =
    '<div class="barlist">' + rows.map(r => {
      const pct = Math.max(1.5, (r.value / max) * 100);
      return '<div class="barrow" title="' + svgEsc(r.name + ' — ' + r.label) + '">' +
        '<div class="bname">' + svgEsc(r.name) +
          (r.sub ? '<span class="bsub">' + svgEsc(r.sub) + '</span>' : '') + '</div>' +
        '<div class="btrack"><div class="bfill" style="width:' + pct.toFixed(1) + '%"></div></div>' +
        '<div class="bval">' + svgEsc(r.label) + '</div>' +
      '</div>';
    }).join('') + '</div>' +
    chartTable([opts.nameHeader || 'Name', opts.valueHeader || 'Value'],
      rows.map(r => [r.name + (r.sub ? ' (' + r.sub + ')' : ''), r.label]));
}

/* ── Meters, for a ratio against a limit ──────────────
   Four weeks, each a share of that week's capacity. Over 100% is a
   status colour, not a fourth categorical hue, and it ships with a word
   as well as a colour. */
function meterRows(host, rows){
  const el = typeof host === 'string' ? document.getElementById(host) : host;
  if (!el) return;
  if (!rows || !rows.length) {
    el.innerHTML = '<div class="empty">No capacity data yet.</div>';
    return;
  }
  el.innerHTML =
    '<div class="meterlist">' + rows.map(r => {
      const pct  = r.capacity > 0 ? Math.round((r.committed / r.capacity) * 100) : 0;
      const cls  = pct > 100 ? 'over' : pct >= 85 ? 'tight' : '';
      const word = pct > 100 ? 'over capacity' : pct >= 85 ? 'tight' : 'has room';
      return '<div class="meterrow ' + cls + '">' +
        '<div class="mwhen">' + svgEsc(weekLabel(r.week_start)) + '</div>' +
        '<div class="mtrack"><div class="mfill" style="width:' +
          Math.min(100, pct) + '%"></div></div>' +
        '<div class="mval">' + pct + '%<span class="mword">' + word + '</span></div>' +
      '</div>';
    }).join('') + '</div>' +
    chartTable(['Week', 'Committed', 'Capacity', 'Load'],
      rows.map(r => [weekLabel(r.week_start), r.committed + 'h',
        r.capacity + 'h' + (r.leave_days ? ' (−' + r.leave_days + ' leave days)' : ''),
        (r.capacity > 0 ? Math.round((r.committed / r.capacity) * 100) : 0) + '%']));
}

/* ── Columns with markers, for absence against demos ──
   One column per month. Demos are marks above the column rather than a
   second series: they are a different thing being counted, and two
   y-scales on one chart is the mistake this avoids. */
function columnChart(host, rows, opts){
  const el = typeof host === 'string' ? document.getElementById(host) : host;
  if (!el) return;
  opts = opts || {};
  if (!rows || !rows.length) {
    el.innerHTML = '<div class="empty">' + (opts.empty || 'Nothing to show.') + '</div>';
    return;
  }
  const max = Math.max(1, ...rows.map(r => r.days));
  el.innerHTML =
    '<div class="collist">' + rows.map(r => {
      const h = Math.max(2, (r.days / max) * 100);
      const dots = r.demos
        ? '<div class="coldemos" title="' + svgEsc(r.demos + ' demo' + (r.demos === 1 ? '' : 's') + ' this month') + '">' +
          Array.from({ length: Math.min(r.demos, 6) }, () => '<i></i>').join('') +
          (r.demos > 6 ? '<span>+' + (r.demos - 6) + '</span>' : '') + '</div>'
        : '<div class="coldemos"></div>';
      return '<div class="colrow' + (r.demos && r.days ? ' crunch' : '') +
        '" title="' + svgEsc(r.label + ' — ' + r.days + ' leave days, ' + r.demos + ' demos') + '">' +
        dots +
        '<div class="colbarwrap"><div class="colbar" style="height:' + h.toFixed(1) + '%"></div></div>' +
        '<div class="colval">' + r.days + '</div>' +
        '<div class="collabel">' + svgEsc(r.label) + '</div>' +
      '</div>';
    }).join('') + '</div>' +
    '<p class="hint" style="margin:8px 2px 0">Bars are leave days taken. Dots above are demos ' +
      'that month — a tall bar under a row of dots is a month where people were away and something was being shown.</p>' +
    chartTable(['Month', 'Leave days', 'Demos'], rows.map(r => [r.label, r.days, r.demos]));
}
