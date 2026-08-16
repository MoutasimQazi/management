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

  /* Taller than it was: at 200 the three lines sat on top of each other
     and a two-day difference was a hair's width. R leaves room for the
     direct labels, B for the week ticks. */
  const W = 640, H = 280, L = 38, R = 112, T = 18, B = 30;
  const maxRaw = Math.max(1, ...series.flatMap(s => s.values));
  // A round ceiling, so the gridline labels are numbers people recognise.
  const step = Math.pow(10, Math.floor(Math.log10(maxRaw))) * (maxRaw / Math.pow(10, Math.floor(Math.log10(maxRaw))) > 5 ? 2 : 1);
  const max  = Math.ceil(maxRaw / step) * step || 1;

  const x = i => L + (weeks.length === 1 ? 0 : i * (W - L - R) / (weeks.length - 1));
  const y = v => T + (H - T - B) * (1 - v / max);

  // Quarters rather than halves — the extra height earns two more lines.
  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => {
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

  /* Direct labels sit at each series' last point, which collide the
     moment two series finish near each other — and with three flat-ish
     lines that is most of the time. Place them at their true y, then
     push apart to a minimum gap and keep them inside the plot. The dot
     stays on the data; only the text moves, so nothing is misread. */
  const last = weeks.length - 1;
  const GAP = 13;
  const placed = series
    .map((s, si) => ({ si, name: s.name, y: y(s.values[last]) }))
    .sort((a, b) => a.y - b.y);

  /* Clamp to the top edge FIRST, then space downwards. Clamping after
     spacing silently eats the first gap — three series ending on the
     same value came out 8px then 12px apart instead of 13 and 13. */
  if (placed.length) placed[0].y = Math.max(T + 4, placed[0].y);
  for (let i = 1; i < placed.length; i++) {
    placed[i].y = Math.max(placed[i].y, placed[i - 1].y + GAP);
  }
  // If that pushed the stack off the bottom, lift the whole run.
  const overflow = placed.length ? placed[placed.length - 1].y - (H - B) : 0;
  if (overflow > 0) placed.forEach(p => { p.y = Math.max(T + 4, p.y - overflow); });

  const labelY = {};
  placed.forEach(p => { labelY[p.si] = p.y; });

  const lines = series.map((s, si) => {
    const c = seriesColor(si);
    const d = s.values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
    const dotY = y(s.values[last]);
    const ty   = labelY[si];
    // A leader line when the label had to move, so it stays attached to
    // the point it belongs to rather than floating near another series.
    const leader = Math.abs(ty - dotY) > 2
      ? '<line x1="' + (x(last) + 5).toFixed(1) + '" y1="' + dotY.toFixed(1) +
        '" x2="' + (W - R + 4) + '" y2="' + ty.toFixed(1) +
        '" stroke="' + c + '" stroke-width="1" stroke-opacity=".45" />'
      : '';
    return '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="2" ' +
             'stroke-linejoin="round" stroke-linecap="round" />' + leader +
           // A 2px surface ring, so overlapping end points stay separable.
           '<circle cx="' + x(last).toFixed(1) + '" cy="' + dotY.toFixed(1) +
             '" r="4" fill="' + c + '" stroke="var(--surface)" stroke-width="2" />' +
           '<text x="' + (W - R + 8) + '" y="' + (ty + 3.5).toFixed(1) + '" ' +
             'font-size="10.5" font-weight="700" fill="' + chartInk() + '">' +
             svgEsc(s.name) +
             '<tspan font-weight="800" fill="' + chartInk() + '"> ' + s.values[last] + '</tspan>' +
           '</text>';
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

/* ── Columns, for a value per period ──────────────────
   One column per month. Sequential — one hue, taller is more — because
   these are comparable quantities of the same thing, not identities. */
function columnChart(host, rows, opts){
  const el = typeof host === 'string' ? document.getElementById(host) : host;
  if (!el) return;
  opts = opts || {};
  if (!rows || !rows.length) {
    el.innerHTML = '<div class="empty">' + (opts.empty || 'Nothing to show.') + '</div>';
    return;
  }
  const max = Math.max(1, ...rows.map(r => r.value));
  const unit = opts.unit || '';
  el.innerHTML =
    '<div class="collist">' + rows.map(r => {
      // A zero month still gets a visible stub, so the month is not
      // missing from the axis — "none" and "no data" must look different.
      const h = r.value > 0 ? Math.max(4, (r.value / max) * 100) : 0;
      return '<div class="colrow" title="' + svgEsc(r.label + ' — ' + r.value + unit) + '">' +
        '<div class="colval">' + svgEsc(String(r.value)) + '</div>' +
        '<div class="colbarwrap">' +
          (r.value > 0
            ? '<div class="colbar" style="height:' + h.toFixed(1) + '%"></div>'
            : '<div class="colzero"></div>') +
        '</div>' +
        '<div class="collabel">' + svgEsc(r.label) + '</div>' +
      '</div>';
    }).join('') + '</div>' +
    chartTable([opts.nameHeader || 'Month', opts.valueHeader || 'Value'],
      rows.map(r => [r.label, r.value]));
}
