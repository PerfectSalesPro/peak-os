// Stage 3 — Body composition dashboard.
// Renders into #body-dashboard. Read-only: no data writes.
// Refreshes on peak:screen:body and peak:import:done events.

import * as db   from './db.js';
import * as calc from './calc.js';

// Shared range state (days back; 0 = all time)
let _range = 56; // default 8 weeks

export function initBodyDashboard() {
  // Delegate click on screen-body (persists across inner re-renders)
  document.getElementById('screen-body')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-range]');
    if (!btn) return;
    _range = +btn.dataset.range;
    _render();
  });

  window.addEventListener('peak:screen:body', _render);
  window.addEventListener('peak:import:done', _render);
  _render();
}

// ── Main render ───────────────────────────────────────────────────────────────

async function _render() {
  const el = document.getElementById('body-dashboard');
  if (!el) return;

  try {
    const [allBody, allHealth, settings] = await Promise.all([
      db.getAll('bodyEntries'),
      db.getAll('healthEntries'),
      db.get('settings', 'user'),
    ]);

    allBody.sort((a, b) => a.date.localeCompare(b.date));
    allHealth.sort((a, b) => a.date.localeCompare(b.date));

    if (!allBody.length) {
      el.innerHTML = `
        <div class="card" style="animation-delay:0ms">
          <p class="sync-empty" style="text-align:center;padding:24px 0;line-height:1.8">
            No body data yet.<br>Use the import tools below to add your first entry.
          </p>
        </div>`;
      return;
    }

    const cutoff  = _range > 0 ? _offsetDate(_today(), -_range) : '0000-01-01';
    const inRange = allBody.filter(e => e.date >= cutoff);

    el.innerHTML = [
      _statCards(allBody),
      _rangeSelector(),
      _chart(inRange, 'weightLbs',  'lime',  'Weight',    'lbs'),
      _chart(inRange, 'bodyFatPct', 'amber', 'Body Fat',  '%'),
      _chart(inRange, 'leanMassLbs','amber', 'Lean Mass', 'lbs'),
      _humeBlock(allBody),
      _watchBlock(allHealth),
      _projectionStrip(allBody, settings),
    ].join('');

  } catch (err) {
    console.error('[Peak OS] body-dashboard render:', err);
    const el2 = document.getElementById('body-dashboard');
    if (el2) el2.innerHTML =
      `<div class="card"><p class="sync-empty sync-error">Dashboard error — check console.</p></div>`;
  }
}

// ── Stat cards (2 × 2 grid) ───────────────────────────────────────────────────

function _statCards(allBody) {
  const today = _today();
  const thisWk = allBody.filter(e => e.date >= _offsetDate(today, -6));
  const lastWk = allBody.filter(e => e.date >= _offsetDate(today, -13) && e.date <= _offsetDate(today, -7));
  const latest  = allBody[allBody.length - 1];

  const wt = latest.weightLbs  ?? null;
  const bf = latest.bodyFatPct ?? null;
  const lm = latest.leanMassLbs ?? (wt != null && bf != null ? +calc.leanMass(wt, bf).toFixed(2) : null);
  const fm = latest.fatMassLbs  ?? (wt != null && bf != null ? +calc.fatMass(wt, bf).toFixed(2)  : null);

  // Δ = this-week rolling avg − last-week rolling avg
  const wtΔ = _fieldDelta(thisWk, lastWk, 'weightLbs');
  const bfΔ = _fieldDelta(thisWk, lastWk, 'bodyFatPct');
  const lmΔ = _fieldDelta(thisWk, lastWk, 'leanMassLbs');
  const fmΔ = _fieldDelta(thisWk, lastWk, 'fatMassLbs');

  // Semantic color + direction for a cut phase:
  // weight ↓ = good, body fat ↓ = good, lean mass ↑/flat = good, fat mass ↓ = good
  const wtC  = _dirColor(wtΔ, -1);
  const bfC  = _dirColor(bfΔ, -1);
  const lmC  = _dirColor(lmΔ,  1);
  const fmC  = _dirColor(fmΔ, -1);

  const cards = [
    { label: 'Weight',    val: wt,  unit: 'lbs', d: wtΔ, dc: wtC },
    { label: 'Body Fat',  val: bf,  unit: '%',   d: bfΔ, dc: bfC },
    { label: 'Lean Mass', val: lm,  unit: 'lbs', d: lmΔ, dc: lmC },
    { label: 'Fat Mass',  val: fm,  unit: 'lbs', d: fmΔ, dc: fmC },
  ];

  const html = cards.map((c, i) => {
    const valStr = c.val != null ? c.val.toFixed(1) : '—';
    const dStr   = c.d  != null ? `${c.d > 0 ? '+' : ''}${c.d.toFixed(1)}` : null;
    // Arrow + value for accessibility (not color alone)
    const arrow  = c.d  != null ? (c.d > 0 ? '▲' : c.d < 0 ? '▼' : '→') : null;
    const deltaHtml = dStr
      ? `<div class="stat-delta" style="color:var(--${c.dc})" aria-label="${arrow} ${dStr} ${c.unit} this week">
           <span aria-hidden="true">${arrow} ${dStr}</span>
           <span class="stat-delta-unit">wk</span>
         </div>`
      : `<div class="stat-delta" style="color:var(--txt3)" aria-label="No weekly data">— wk</div>`;

    return `<div class="stat-card" style="animation-delay:${i * 30}ms">
      <div class="sec">${c.label.toUpperCase()}</div>
      <div class="stat-num-row">
        <span class="big-num num-lg">${valStr}</span><span class="num-unit">${c.unit}</span>
      </div>
      ${deltaHtml}
    </div>`;
  }).join('');

  return `<div class="stat-grid" role="list" aria-label="Body composition stats">${html}</div>`;
}

// ── Range selector ────────────────────────────────────────────────────────────

function _rangeSelector() {
  const opts = [
    { l: '2W', d: 14 }, { l: '4W', d: 28 }, { l: '8W', d: 56 },
    { l: '12W', d: 84 }, { l: 'ALL', d: 0 },
  ];
  const btns = opts.map(o => {
    const active = _range === o.d;
    return `<button class="range-btn${active ? ' range-active' : ''}" data-range="${o.d}"
      type="button" aria-pressed="${active}" aria-label="${o.l === 'ALL' ? 'All time' : o.l + ' range'}"
    >${o.l}</button>`;
  }).join('');
  return `<div class="range-row" role="group" aria-label="Chart date range">${btns}</div>`;
}

// ── SVG line chart ────────────────────────────────────────────────────────────

function _chart(entries, key, colorName, label, unit) {
  const valid = entries.filter(e => e[key] != null);
  const rangeLabel = _range > 0 ? `${_range / 7}W` : 'All';
  const header = `<div class="card chart-card" style="animation-delay:0ms">
    <div class="chart-title"><span class="sec">${label.toUpperCase()} TREND</span>
    <span class="sec" style="color:var(--txt3)">${rangeLabel}</span></div>`;

  if (valid.length < 2) {
    return `${header}<p class="chart-empty">Not enough data in this range.</p></div>`;
  }

  const vals  = valid.map(e => e[key]);
  const minV  = Math.min(...vals);
  const maxV  = Math.max(...vals);
  const spanV = maxV - minV || 1;
  const n     = valid.length;
  const W = 300, H = 72, px = 1, py = 8;

  const toX = i => +(px + (i / (n - 1)) * (W - 2 * px)).toFixed(2);
  const toY = v => +(py + (1 - (v - minV) / spanV) * (H - 2 * py)).toFixed(2);

  const pts  = valid.map((e, i) => ({ x: toX(i), y: toY(e[key]) }));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join('');
  const fill = `${line}L${pts[n - 1].x},${H}L${pts[0].x},${H}Z`;

  const startFmt = _fmtDate(valid[0].date);
  const endFmt   = _fmtDate(valid[valid.length - 1].date);
  const trend    = minV < maxV ? `${minV.toFixed(1)}–${maxV.toFixed(1)} ${unit}` : `${minV.toFixed(1)} ${unit}`;

  return `${header}
    <svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="100%" height="72"
         preserveAspectRatio="none"
         role="img" aria-label="${label} trend from ${valid[0].date} to ${valid[valid.length-1].date}: ${trend}">
      <path d="${fill}" class="chart-fill chart-fill-${colorName}"/>
      <path d="${line}" class="chart-line chart-line-${colorName}"/>
    </svg>
    <div class="chart-axis">
      <span class="sec">${startFmt}</span>
      <span class="chart-bounds">
        <span class="chart-bound">${minV.toFixed(1)}</span>
        <span class="sec"> – </span>
        <span class="chart-bound">${maxV.toFixed(1)}</span>
        <span class="sec"> ${unit}</span>
      </span>
      <span class="sec">${endFmt}</span>
    </div>
  </div>`;
}

// ── Hume Body Pod block ───────────────────────────────────────────────────────

function _humeBlock(allBody) {
  const withHume = allBody.filter(e => e.hume && Object.keys(e.hume).length > 0);

  const header = `<div class="card" style="animation-delay:0ms">
    <div class="chart-title">
      <span class="sec">Body Composition Scan</span>`;

  if (!withHume.length) {
    return `${header}<span class="sec" style="color:var(--txt3)">No data</span></div>
      <p class="sync-empty">No Hume scan data yet.</p>
    </div>`;
  }

  const cur  = withHume[withHume.length - 1];
  const prev = withHume.length > 1 ? withHume[withHume.length - 2] : null;

  const fields = [
    { key: 'muscleMassLbs',   label: 'Muscle Mass',  unit: 'lbs', dec: 1, goodDir:  1 },
    { key: 'visceralFatLevel',label: 'Visceral Fat',  unit: 'lvl', dec: 0, goodDir: -1 },
    { key: 'bodyWaterPct',    label: 'Body Water',   unit: '%',   dec: 1, goodDir:  1 },
    { key: 'boneMassLbs',     label: 'Bone Mass',    unit: 'lbs', dec: 1, goodDir:  1 },
    { key: 'softLeanMassLbs', label: 'Soft Lean',    unit: 'lbs', dec: 1, goodDir:  1 },
    { key: 'waistHipRatio',   label: 'Waist-Hip',    unit: '',    dec: 2, goodDir: -1 },
  ];

  const rows = fields.map(f => {
    const v = cur.hume[f.key];
    if (v == null) return '';
    const pv    = prev?.hume?.[f.key];
    const delta = pv != null ? v - pv : null;
    const arrow = delta != null ? (delta > 0 ? '▲' : delta < 0 ? '▼' : '→') : null;
    const color = delta != null ? _dirColor(delta, f.goodDir) : 'txt3';
    const dHtml = delta != null
      ? `<span class="hume-delta" style="color:var(--${color})" aria-label="${arrow} ${Math.abs(delta).toFixed(f.dec)} vs previous scan">
           ${arrow} ${Math.abs(delta).toFixed(f.dec)}
         </span>`
      : '';
    return `<div class="hume-row">
      <span class="hume-label">${f.label}</span>
      <span class="hume-val">
        <span class="big-num num-sm">${f.key === 'visceralFatLevel' ? `Lvl ${v}` : v.toFixed(f.dec)}</span>
        ${f.unit ? `<span class="num-unit">${f.unit}</span>` : ''}
        ${dHtml}
      </span>
    </div>`;
  }).filter(Boolean).join('');

  const scanDate = cur.date;
  const vsStr    = prev ? ` vs ${_fmtDate(prev.date)}` : '';

  return `${header}
      <span class="sec" style="color:var(--blue)">${_fmtDate(scanDate)}${vsStr}</span>
    </div>
    <div class="pill p-blue" style="margin-bottom:10px;font-size:8px">Hume Body Pod</div>
    ${rows || '<p class="sync-empty">No Hume fields present.</p>'}
  </div>`;
}

// ── Apple Watch / Health block ────────────────────────────────────────────────

function _watchBlock(allHealth) {
  const header = `<div class="card" style="animation-delay:0ms">
    <div class="chart-title"><span class="sec">Recovery This Week</span>`;

  if (!allHealth.length) {
    return `${header}<span class="sec" style="color:var(--txt3)">No data</span></div>
      <p class="sync-empty">No Apple Health data. Use Shortcut or paste import.</p>
    </div>`;
  }

  const today = _today();
  const thisWk = allHealth.filter(e => e.date >= _offsetDate(today, -6));
  const lastWk = allHealth.filter(e => e.date >= _offsetDate(today, -13) && e.date <= _offsetDate(today, -7));

  const fields = [
    { key: 'hrvMs',          label: 'HRV',       unit: 'ms',   dec: 0, goodDir:  1 },
    { key: 'restingHr',      label: 'Resting HR', unit: 'bpm',  dec: 0, goodDir: -1 },
    { key: 'sleepHours',     label: 'Sleep',      unit: 'h',    dec: 1, goodDir:  1 },
    { key: 'activeCalories', label: 'Active Cal', unit: 'kcal', dec: 0, goodDir:  1 },
    { key: 'steps',          label: 'Steps',      unit: '',     dec: 0, goodDir:  1 },
  ];

  const rows = fields.map(f => {
    const cur  = _avg(thisWk, f.key);
    if (cur == null) return '';
    const prv  = _avg(lastWk, f.key);
    const delta = prv != null ? cur - prv : null;
    const arrow = delta != null ? (delta > 0 ? '▲' : delta < 0 ? '▼' : '→') : null;
    const color = delta != null ? _dirColor(delta, f.goodDir) : 'txt3';
    const dHtml = delta != null
      ? `<span class="hume-delta" style="color:var(--${color})" aria-label="${arrow} ${Math.abs(delta).toFixed(f.dec)} vs last week">
           ${arrow} ${Math.abs(delta).toFixed(f.dec)}
         </span>`
      : '';
    const valFmt = f.key === 'steps'
      ? Math.round(cur).toLocaleString()
      : cur.toFixed(f.dec);
    return `<div class="hume-row">
      <span class="hume-label">${f.label}</span>
      <span class="hume-val">
        <span class="big-num num-sm">${valFmt}</span>
        ${f.unit ? `<span class="num-unit">${f.unit}</span>` : ''}
        ${dHtml}
      </span>
    </div>`;
  }).filter(Boolean).join('');

  if (!rows) {
    return `${header}</div>
      <p class="sync-empty">No health data for this week yet.</p>
    </div>`;
  }

  return `${header}
      <span class="pill p-blue" style="margin-bottom:0;padding:1px 7px;font-size:8px">${thisWk.length}d</span>
    </div>
    ${rows}
  </div>`;
}

// ── Goal projection strip ─────────────────────────────────────────────────────

function _projectionStrip(allBody, settings) {
  const latest = allBody[allBody.length - 1];
  const wt = latest.weightLbs  ?? null;
  const bf = latest.bodyFatPct ?? null;
  const lm = latest.leanMassLbs ?? (wt != null && bf != null ? calc.leanMass(wt, bf) : null);
  const fm = latest.fatMassLbs  ?? (wt != null && bf != null ? calc.fatMass(wt, bf)  : null);

  // Rate of loss from all entries (needs weight data)
  const rolEntries = allBody
    .filter(e => e.weightLbs != null)
    .map(e => ({ date: e.date, weightLbs: e.weightLbs }));
  const rate = calc.rateOfLoss(rolEntries);

  // 7-day rolling avg
  const today  = _today();
  const thisWk = allBody.filter(e => e.date >= _offsetDate(today, -6));
  const curAvg = thisWk.length
    ? calc.rollingAvg7Day(thisWk.map(e => ({ date: e.date, weightLbs: e.weightLbs })))
    : wt;

  const rateStr   = rate !== 0 ? `${rate > 0 ? '+' : ''}${rate.toFixed(2)} lbs/wk` : '—';
  const rateColor = rate < 0 ? 'lime' : rate > 0 ? 'red' : 'txt3';

  const goalBf = settings?.goalBodyFatPct ?? null;

  let projHtml;
  if (goalBf == null) {
    projHtml = `<p class="proj-note">No goal body fat % set. Add <code>goalBodyFatPct</code> in Settings.</p>`;
  } else if (lm == null) {
    projHtml = `<p class="proj-note">Log weight + body fat % together to enable the projection.</p>`;
  } else {
    // Goal weight derived from lean-mass-held assumption
    const goalWt = lm / (1 - goalBf / 100);
    const weeks  = rate < 0 && curAvg != null
      ? calc.weeksToGoal(curAvg, goalWt, rate)
      : null;
    const eta = weeks != null && weeks > 0 && isFinite(weeks)
      ? `~${Math.round(weeks)} week${Math.round(weeks) !== 1 ? 's' : ''}`
      : rate >= 0 ? 'Rate stalled — review deficit' : '< 1 week';

    projHtml = `
      <div class="proj-row">
        <span class="proj-label">Goal BF</span>
        <span class="proj-val">
          <span class="big-num num-sm" style="color:var(--lime)">${goalBf.toFixed(1)}</span><span class="num-unit">%</span>
          → <span class="big-num num-sm">${goalWt.toFixed(1)}</span><span class="num-unit"> lbs</span>
        </span>
      </div>
      <div class="proj-row">
        <span class="proj-label">7-day avg</span>
        <span class="proj-val"><span class="big-num num-sm">${curAvg?.toFixed(1) ?? '—'}</span><span class="num-unit"> lbs</span></span>
      </div>
      <div class="proj-row">
        <span class="proj-label">Rate</span>
        <span class="proj-val" style="color:var(--${rateColor})">${rateStr}</span>
      </div>
      <div class="proj-row">
        <span class="proj-label">ETA</span>
        <span class="proj-val proj-eta">${eta}</span>
      </div>
      <p class="proj-assumption">Assumes lean mass held at ${lm.toFixed(1)} lbs</p>`;
  }

  return `<div class="card" style="animation-delay:0ms">
    <div class="chart-title">
      <span class="sec">Goal Projection</span>
      <span class="pill p-lime" style="margin-bottom:0;padding:1px 7px;font-size:8px">Cut</span>
    </div>
    ${projHtml}
  </div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Rolling avg of a field across an entry array (ignores nulls)
function _avg(entries, field) {
  const valid = entries.filter(e => e[field] != null);
  if (!valid.length) return null;
  return valid.reduce((s, e) => s + e[field], 0) / valid.length;
}

// Delta between two weeks' rolling avgs for a field
function _fieldDelta(thisWk, lastWk, field) {
  const a = _avg(thisWk, field);
  const b = _avg(lastWk, field);
  if (a == null || b == null) return null;
  return a - b;
}

// Semantic color name: lime = on-track, amber = watch, txt2 = neutral
// goodDir: +1 means positive delta is good, -1 means negative delta is good
function _dirColor(delta, goodDir) {
  if (delta == null) return 'txt2';
  const isGood = delta * goodDir > 0;
  const isFlat = Math.abs(delta) < 0.05;
  if (isFlat) return 'txt2';
  return isGood ? 'lime' : 'amber';
}

function _today() { return new Date().toISOString().slice(0, 10); }

function _offsetDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// YYYY-MM-DD → M/D
function _fmtDate(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${+m}/${+d}`;
}
