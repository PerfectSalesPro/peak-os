// Stage 5 — Training analytics: 1RM, volume, PRs, heat map, calendar, exercise browser.
// Pure UI module. Renders into #train-root. No DB writes except creating custom exercises.

import * as db   from './db.js';
import * as calc from './calc.js';

// ── Module state ──────────────────────────────────────────────────────────────

let _back        = null;    // callback to return to training home
let _view        = 'home';  // 'home' | 'exercise' | 'browser'
let _calYear     = 0;
let _calMonth    = 0;
let _selExId     = null;
let _range       = '3M';    // exercise chart range: '1M'|'3M'|'6M'|'1Y'|'All'
let _homeRange   = '1W';    // home volume range: '1W'|'1M'|'3M'|'6M'|'1Y'|'All'
let _chartTab    = 'volume';// 'volume'|'1rm'|'bestset'
let _workouts    = [];
let _exMap       = {};
let _browserSearch = '';
let _createMode  = false;   // inline custom exercise form in browser
let _createForm  = { name: '', muscle: '', equip: 'Other' };
let _rpeMode     = false;   // RPE-adjusted 1RM toggle

// ── Entry point ───────────────────────────────────────────────────────────────

export async function openAnalytics(backFn) {
  _back  = backFn;
  _view  = 'home';
  const now = new Date();
  _calYear  = now.getFullYear();
  _calMonth = now.getMonth(); // 0-based

  await _loadData();
  _render();
}

async function _loadData() {
  const [workouts, exList] = await Promise.all([
    db.getAll('workouts'),
    db.getAll('exercises'),
  ]);
  _workouts = workouts.filter(w => w.durationSec != null).sort((a, b) => a.date.localeCompare(b.date));
  _exMap = Object.fromEntries(exList.map(e => [e.id, e]));
}

function _render() {
  const root = document.getElementById('train-root');
  if (!root) return;
  // addEventListener deduplicates on same fn ref — safe to call on every render
  root.addEventListener('click', _onClick);
  root.addEventListener('input', _onInput);
  switch (_view) {
    case 'home':     root.innerHTML = _homeHTML();     break;
    case 'exercise': root.innerHTML = _exerciseHTML(); break;
    case 'browser':  root.innerHTML = _browserHTML();  break;
  }
}

// ── Event handling ────────────────────────────────────────────────────────────

function _onClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action } = btn.dataset;
  switch (action) {
    case 'an-back':         _back?.(); break;
    case 'an-ex-back':      _view = 'home'; _render(); break;
    case 'an-browser-back': _view = 'home'; _render(); break;
    case 'an-cal-prev':     _calMonth--; if (_calMonth < 0) { _calMonth = 11; _calYear--; } _render(); break;
    case 'an-cal-next':     _calMonth++; if (_calMonth > 11) { _calMonth = 0; _calYear++; } _render(); break;
    case 'an-open-browser': _browserSearch = ''; _createMode = false; _view = 'browser'; _render(); break;
    case 'an-open-exercise': _selExId = btn.dataset.id; _chartTab = 'volume'; _view = 'exercise'; _render(); break;
    case 'an-range':        _range = btn.dataset.range; _render(); break;
    case 'an-chart':        _chartTab = btn.dataset.chart; _render(); break;
    case 'an-home-range':   _homeRange = btn.dataset.range; _render(); break;
    case 'an-rpe-toggle':   _rpeMode = !_rpeMode; _render(); break;
    case 'an-browser-create': _createMode = true; _createForm = { name: '', muscle: 'Chest', equip: 'Barbell' }; _render(); break;
    case 'an-browser-cancel': _createMode = false; _render(); break;
    case 'an-browser-save':  _saveCustomExercise(); break;
  }
}

function _onInput(e) {
  const el = e.target;
  if (el.id === 'an-browser-search') { _browserSearch = el.value; _renderBrowserList(); }
  if (el.id === 'an-create-name')    _createForm.name   = el.value;
  if (el.id === 'an-create-muscle')  _createForm.muscle = el.value;
  if (el.id === 'an-create-equip')   _createForm.equip  = el.value;
}

async function _saveCustomExercise() {
  const name = _createForm.name.trim();
  if (!name) return;
  const rec = await db.put('exercises', {
    name, primaryMuscle: _createForm.muscle || 'Other',
    secondaryMuscles: [], equipment: _createForm.equip || 'Other',
    isCustom: true, bestSet: null,
  });
  await _loadData();
  _createMode = false;
  _selExId = rec.id;
  _chartTab = 'volume';
  _view = 'exercise';
  _render();
}

// ── HOME VIEW ─────────────────────────────────────────────────────────────────

const HOME_RANGES = ['1W','1M','3M','6M','1Y','All'];

const RANGE_LABEL = {
  '1W':  "This Week's Volume",
  '1M':  "This Month's Volume",
  '3M':  'Last 3 Months',
  '6M':  'Last 6 Months',
  '1Y':  'Past Year',
  'All': 'All-Time Volume',
};

function _homeHTML() {
  const workoutDates = new Set(_workouts.map(w => w.date));
  const { current, previous } = _volumeForRange(_homeRange);

  const rangePills = HOME_RANGES.map(r =>
    `<button class="an-range-pill ${_homeRange === r ? 'an-range-pill--active' : ''}"
      data-action="an-home-range" data-range="${r}">${r}</button>`
  ).join('');

  return `
    <div class="train-view an-home">
      <div class="train-screen-header">
        <button class="btn-back" data-action="an-back" aria-label="Back to training">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="section-label">Analytics</span>
        <button class="an-browser-btn" data-action="an-open-browser" aria-label="Browse exercises">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          Exercises
        </button>
      </div>

      <div class="card" style="animation-delay:0ms">
        <div class="an-cal-header">
          <button class="an-cal-nav" data-action="an-cal-prev" aria-label="Previous month">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="sec">${_monthLabel(_calYear, _calMonth)}</span>
          <button class="an-cal-nav" data-action="an-cal-next" aria-label="Next month">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        ${_calendarHTML(_calYear, _calMonth, workoutDates)}
      </div>

      <div class="an-section-row">
        <span class="sec">${RANGE_LABEL[_homeRange]}</span>
      </div>
      <div class="an-range-row" style="margin-bottom:6px">${rangePills}</div>
      ${_muscleVolumeHTML(current, previous)}

      <div class="an-section-row" style="margin-top:16px">
        <span class="sec">Volume Heatmap</span>
      </div>
      ${_heatMapHTML(current)}
    </div>`;
}

// ── CALENDAR ──────────────────────────────────────────────────────────────────

function _monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
}

function _calendarHTML(year, month, workoutDates) {
  const dayNames = ['M','T','W','T','F','S','S'];
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const offset   = (firstDay + 6) % 7; // shift to Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);

  let cells = `<div class="cal-grid">`;
  dayNames.forEach(d => { cells += `<div class="cal-day-name">${d}</div>`; });

  for (let i = 0; i < offset; i++) cells += `<div class="cal-cell cal-empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const hasWorkout = workoutDates.has(iso);
    const isToday    = iso === today;
    cells += `<div class="cal-cell ${hasWorkout ? 'cal-cell--worked' : ''} ${isToday ? 'cal-cell--today' : ''}">
      <span class="cal-cell-num">${d}</span>
      ${hasWorkout ? '<span class="cal-dot" aria-hidden="true"></span>' : ''}
    </div>`;
  }

  cells += `</div>`;
  return cells;
}

// ── MUSCLE VOLUME ─────────────────────────────────────────────────────────────

const MUSCLE_ORDER = ['Chest','Back','Shoulders','Quads','Glutes','Hamstrings','Biceps','Triceps','Core','Calves'];

const RANGE_DAYS = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 };

function _volumeForRange(range) {
  const compute = (list) => {
    const vol = {};
    for (const muscle of MUSCLE_ORDER)
      vol[muscle] = calc.muscleVolumeWeekly(list, muscle, _exMap);
    return vol;
  };

  if (range === 'All') {
    return { current: compute(_workouts), previous: Object.fromEntries(MUSCLE_ORDER.map(m => [m, 0])) };
  }

  const today        = new Date().toISOString().slice(0, 10);
  const days         = RANGE_DAYS[range] || 7;
  const currentStart = _offsetDate(today, -(days - 1));
  const prevEnd      = _offsetDate(currentStart, -1);
  const prevStart    = _offsetDate(prevEnd, -(days - 1));

  const currentW = _workouts.filter(w => w.date >= currentStart && w.date <= today);
  const prevW    = _workouts.filter(w => w.date >= prevStart    && w.date <= prevEnd);

  return { current: compute(currentW), previous: compute(prevW) };
}

function _muscleVolumeHTML(thisWeek, lastWeek) {
  const maxVol = Math.max(...Object.values(thisWeek), 1);

  const rows = MUSCLE_ORDER.map(muscle => {
    const vol   = thisWeek[muscle] || 0;
    const prev  = lastWeek[muscle] || 0;
    const delta = vol - prev;
    const pct   = Math.min(100, (vol / maxVol) * 100);

    const deltaStr = delta === 0
      ? ''
      : `<span class="an-vol-delta ${delta > 0 ? 'an-delta--up' : 'an-delta--dn'}">${delta > 0 ? '+' : ''}${_fmtVol(Math.abs(delta))}</span>`;

    return `
      <div class="an-muscle-row">
        <div class="an-muscle-name">${muscle}</div>
        <div class="an-muscle-bar-wrap">
          <div class="bar-track">
            <div class="bar-fill bf-lime an-muscle-bar" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="an-muscle-right">
          <span class="an-vol-val">${_fmtVol(vol)}</span>
          ${deltaStr}
        </div>
      </div>`;
  }).join('');

  return `<div class="an-muscle-list card" style="animation-delay:40ms">${rows}</div>`;
}

// ── HEAT MAP ──────────────────────────────────────────────────────────────────

function _heatMapHTML(muscleVols) {
  const maxVol = Math.max(...Object.values(muscleVols), 1);

  function intensityStyle(muscle) {
    const vol = muscleVols[muscle] || 0;
    if (vol <= 0) return `background:var(--s3);color:var(--txt3)`;
    const alpha = 0.15 + (vol / maxVol) * 0.85;
    return `background:rgba(189,255,0,${alpha.toFixed(2)});color:${alpha > 0.5 ? '#07070A' : 'var(--lime)'}`;
  }

  // Body schematic: front + back, using muscle→position mapping
  const FRONT = [
    { m: 'Shoulders', label: 'SHOULDER', col: 1, row: 1, span: 1 },
    { m: 'Chest',     label: 'CHEST',    col: 2, row: 1, span: 2 },
    { m: 'Shoulders', label: null,       col: 4, row: 1, span: 1 },
    { m: 'Biceps',    label: 'BICEP',    col: 1, row: 2, span: 1 },
    { m: 'Core',      label: 'CORE',     col: 2, row: 2, span: 2 },
    { m: 'Biceps',    label: null,       col: 4, row: 2, span: 1 },
    { m: 'Quads',     label: 'QUAD',     col: 2, row: 3, span: 1 },
    { m: 'Quads',     label: null,       col: 3, row: 3, span: 1 },
    { m: 'Calves',    label: 'CALF',     col: 2, row: 4, span: 1 },
    { m: 'Calves',    label: null,       col: 3, row: 4, span: 1 },
  ];
  const BACK = [
    { m: 'Back',       label: 'BACK',   col: 1, row: 1, span: 2 },
    { m: 'Triceps',    label: 'TRICEP', col: 3, row: 1, span: 1 },
    { m: 'Triceps',    label: null,     col: 4, row: 1, span: 1 },
    { m: 'Back',       label: null,     col: 1, row: 2, span: 2 },
    { m: 'Glutes',     label: 'GLUTE',  col: 1, row: 3, span: 2 },
    { m: 'Hamstrings', label: 'HAMSTR', col: 3, row: 3, span: 2 },
    { m: 'Calves',     label: 'CALF',   col: 3, row: 4, span: 1 },
    { m: 'Calves',     label: null,     col: 4, row: 4, span: 1 },
  ];

  function renderGrid(cells) {
    return `<div class="hm-grid">
      ${cells.map(c => `
        <div class="hm-cell" style="${intensityStyle(c.m)};grid-column:${c.col}/span ${c.span};grid-row:${c.row}"
          aria-label="${c.label || c.m}: ${_fmtVol(muscleVols[c.m] || 0)} lbs">
          ${c.label ? `<span class="hm-label">${c.label}</span>` : ''}
        </div>`).join('')}
    </div>`;
  }

  return `
    <div class="an-heatmap card" style="animation-delay:60ms">
      <div class="hm-panels">
        <div class="hm-panel">
          <div class="hm-panel-label sec">FRONT</div>
          ${renderGrid(FRONT)}
        </div>
        <div class="hm-panel">
          <div class="hm-panel-label sec">BACK</div>
          ${renderGrid(BACK)}
        </div>
      </div>
    </div>`;
}

// ── EXERCISE VIEW ─────────────────────────────────────────────────────────────

function _exerciseHTML() {
  const ex = _exMap[_selExId];
  if (!ex) return `<div class="train-view"><div class="train-empty">Exercise not found.</div></div>`;

  const data    = _buildExData(_selExId);
  const filtered = _filterRange(data);

  const RANGES = ['1M','3M','6M','1Y','All'];
  const rangePills = RANGES.map(r => `
    <button class="an-range-pill ${_range === r ? 'an-range-pill--active' : ''}"
      data-action="an-range" data-range="${r}">${r}</button>`).join('');

  const CHARTS = [
    { id: 'volume', label: 'Volume' },
    { id: '1rm',    label: '1RM' },
    { id: 'bestset',label: 'Best Set' },
  ];
  const chartTabs = CHARTS.map(c => `
    <button class="an-chart-tab ${_chartTab === c.id ? 'an-chart-tab--active' : ''}"
      data-action="an-chart" data-chart="${c.id}">${c.label}</button>`).join('');

  const xrm = _xrmTableHTML(ex);

  const chartPts = filtered.map(p => ({
    x: Date.parse(p.date),
    y: _chartTab === 'volume' ? p.volume : _chartTab === '1rm' ? p.oneRM : p.bestWeight,
    date: p.date,
  })).filter(p => p.y > 0);

  const chartYLabel = _chartTab === 'volume' ? 'Volume (lbs)' : _chartTab === '1rm' ? 'Est. 1RM (lbs)' : 'Best Set (lbs)';
  const chart = _svgLine(chartPts, { label: chartYLabel, unit: 'lbs' });

  const rpeToggle = `
    <label class="an-toggle-label" title="RPE-adjusted 1RM">
      <span class="an-toggle-text sec">RPE</span>
      <button class="an-toggle-btn ${_rpeMode ? 'an-toggle--on' : ''}" data-action="an-rpe-toggle" aria-pressed="${_rpeMode}">
        <span class="an-toggle-knob"></span>
      </button>
    </label>`;

  return `
    <div class="train-view an-ex-view">
      <div class="train-screen-header">
        <button class="btn-back" data-action="an-ex-back" aria-label="Back to analytics">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="section-label" style="font-size:13px">${_esc(ex.name)}</span>
        <span></span>
      </div>

      <div class="an-ex-meta sec">${_esc(ex.primaryMuscle)} · ${_esc(ex.equipment)}</div>

      <div class="card" style="animation-delay:0ms">
        <div class="an-chart-header">
          <div class="an-chart-tabs">${chartTabs}</div>
          <div class="an-chart-toggles">${rpeToggle}</div>
        </div>
        <div class="an-range-row">${rangePills}</div>
        <div class="an-chart-area" role="img" aria-label="${chartYLabel} chart for ${_esc(ex.name)}">
          ${chart}
        </div>
        ${chartPts.length > 0 ? _chartSummary(chartPts, _chartTab) : ''}
      </div>

      <div class="an-section-row" style="margin-top:4px">
        <span class="sec">xRM Table</span>
        <span class="sec" style="text-transform:none;letter-spacing:0">${filtered.length > 0 ? `${filtered.length} session${filtered.length !== 1 ? 's' : ''}` : ''}</span>
      </div>
      ${xrm}
    </div>`;
}

function _chartSummary(pts, tab) {
  if (!pts.length) return '';
  const vals  = pts.map(p => p.y);
  const cur   = vals[vals.length - 1];
  const peak  = Math.max(...vals);
  const first = vals[0];
  const change = cur - first;
  const unit  = 'lbs';

  return `
    <div class="an-chart-summary">
      <div class="an-cs-item">
        <span class="sec">Current</span>
        <span class="an-cs-val">${_fmtVol(cur)} <span class="num-unit">${unit}</span></span>
      </div>
      <div class="an-cs-item">
        <span class="sec">Peak</span>
        <span class="an-cs-val">${_fmtVol(peak)} <span class="num-unit">${unit}</span></span>
      </div>
      <div class="an-cs-item">
        <span class="sec">Change</span>
        <span class="an-cs-val ${change >= 0 ? 'color-lime' : 'color-red'}">${change >= 0 ? '+' : ''}${_fmtVol(change)}</span>
      </div>
    </div>`;
}

function _xrmTableHTML(ex) {
  // Find this exercise's best set from bestSet or from history
  const best = ex.bestSet;
  if (!best || !best.weight || !best.reps) {
    return `<div class="an-xrm-empty sec">No best set recorded yet.</div>`;
  }

  const { oneRM } = calc.estimate1RM(best.weight, best.reps, false, null);
  const repCounts = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];

  const rows = repCounts.map(n => {
    const w = calc.estimateXRM(oneRM, n);
    const isActual = n === best.reps;
    return `
      <div class="xrm-row ${isActual ? 'xrm-row--actual' : ''}">
        <span class="xrm-reps">${n}<span class="num-unit">rep${n !== 1 ? 's' : ''}</span></span>
        <span class="xrm-weight big-num num-md">${Math.round(w)}</span>
        <span class="num-unit">lbs</span>
        ${isActual ? `<span class="xrm-actual-badge pill p-lime" style="margin:0">Actual</span>` : ''}
      </div>`;
  }).join('');

  return `
    <div class="an-xrm-card card" style="animation-delay:40ms">
      <div class="xrm-basis sec" style="margin-bottom:10px">
        Based on best: ${best.weight} lbs × ${best.reps} → Est. 1RM: <strong class="color-lime">${Math.round(oneRM)} lbs</strong>
      </div>
      <div class="xrm-list">${rows}</div>
    </div>`;
}

// ── EXERCISE BROWSER ──────────────────────────────────────────────────────────

const MUSCLES = ['Back','Biceps','Calves','Chest','Core','Glutes','Hamstrings','Other','Quads','Shoulders','Triceps'];
const EQUIPS  = ['Barbell','Bodyweight','Cable','Dumbbell','Machine','Other'];

function _browserHTML() {
  return `
    <div class="train-view picker-view">
      <div class="train-screen-header">
        <button class="btn-back" data-action="an-browser-back" aria-label="Back to analytics">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="section-label">Exercises</span>
        <button class="btn-icon-text" data-action="an-browser-create" aria-label="Add custom exercise">+ Custom</button>
      </div>

      ${_createMode ? _createFormHTML() : ''}

      <input type="search" id="an-browser-search" class="picker-search-input"
        placeholder="Search exercises…" value="${_esc(_browserSearch)}"
        autocomplete="off" aria-label="Search exercises">
      <div id="an-browser-list">${_browserListHTML()}</div>
    </div>`;
}

function _createFormHTML() {
  return `
    <div class="an-create-form card" style="animation-delay:0ms">
      <div class="sec" style="margin-bottom:10px">New Exercise</div>
      <div class="form-row">
        <div class="field field-full">
          <label class="field-label" for="an-create-name">Name</label>
          <input type="text" id="an-create-name" class="field-input" placeholder="Exercise name"
            value="${_esc(_createForm.name)}" autocomplete="off" aria-label="Exercise name">
        </div>
      </div>
      <div class="form-row form-row-2col">
        <div class="field">
          <label class="field-label" for="an-create-muscle">Muscle Group</label>
          <select id="an-create-muscle" class="field-input an-select" aria-label="Primary muscle group">
            ${MUSCLES.map(m => `<option value="${m}" ${_createForm.muscle === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="an-create-equip">Equipment</label>
          <select id="an-create-equip" class="field-input an-select" aria-label="Equipment">
            ${EQUIPS.map(eq => `<option value="${eq}" ${_createForm.equip === eq ? 'selected' : ''}>${eq}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="an-create-actions">
        <button class="btn-primary" data-action="an-browser-save" style="margin-bottom:0">Save Exercise</button>
        <button class="btn-discard" data-action="an-browser-cancel">Cancel</button>
      </div>
    </div>`;
}

function _browserListHTML() {
  const q = _browserSearch.toLowerCase();
  const exercises = Object.values(_exMap)
    .filter(ex => !q || ex.name.toLowerCase().includes(q) || ex.primaryMuscle.toLowerCase().includes(q))
    .sort((a, b) => a.primaryMuscle.localeCompare(b.primaryMuscle) || a.name.localeCompare(b.name));

  if (!exercises.length) return `<div class="train-empty">No exercises found.</div>`;

  const grouped = {};
  for (const ex of exercises) {
    (grouped[ex.primaryMuscle] = grouped[ex.primaryMuscle] || []).push(ex);
  }

  return Object.entries(grouped).map(([muscle, exs]) => `
    <div class="picker-group">
      <div class="picker-group-label sec">${_esc(muscle)}</div>
      ${exs.map(ex => {
        const histCount = _workouts.filter(w => w.exercises?.some(e => e.exerciseId === ex.id)).length;
        const bestStr   = ex.bestSet ? `${ex.bestSet.weight}×${ex.bestSet.reps}` : null;
        return `
          <button class="picker-ex-row an-browser-ex-row" data-action="an-open-exercise" data-id="${ex.id}">
            <div class="picker-ex-name">${_esc(ex.name)}${ex.isCustom ? ' <span class="an-custom-badge">Custom</span>' : ''}</div>
            <div class="picker-ex-meta">
              ${_esc(ex.equipment)}
              ${bestStr ? ` · Best: ${bestStr}` : ''}
              ${histCount > 0 ? ` · ${histCount} session${histCount !== 1 ? 's' : ''}` : ''}
            </div>
          </button>`;
      }).join('')}
    </div>`).join('');
}

function _renderBrowserList() {
  const el = document.getElementById('an-browser-list');
  if (el) el.innerHTML = _browserListHTML();
}

// ── CHART DATA BUILD ──────────────────────────────────────────────────────────

function _buildExData(exId) {
  const ex = _exMap[exId];
  const results = [];

  for (const w of _workouts) {
    const exEntry = w.exercises?.find(e => e.exerciseId == exId);
    if (!exEntry) continue;

    let vol = 0, bestOneRM = 0, bestWeight = 0;

    for (const s of (exEntry.sets || [])) {
      if (!s.completed || s.type === 'warmup') continue;
      const w_ = s.weight || 0;
      const r  = s.reps   || 0;
      if (w_ > 0 && r > 0) {
        vol += w_ * r;
        const { oneRM } = calc.estimate1RM(w_, r, _rpeMode, s.rpe);
        if (oneRM > bestOneRM) { bestOneRM = oneRM; }
        if (w_ > bestWeight)   { bestWeight = w_; }
      }
    }

    if (vol > 0 || bestOneRM > 0) {
      results.push({ date: w.date, volume: vol, oneRM: bestOneRM, bestWeight });
    }
  }

  return results;
}

function _filterRange(data) {
  if (_range === 'All' || !data.length) return data;
  const days = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365 }[_range] || 90;
  const today  = new Date().toISOString().slice(0, 10);
  const cutoff = _offsetDate(today, -days);
  return data.filter(p => p.date >= cutoff);
}

// ── SVG LINE CHART ────────────────────────────────────────────────────────────

function _svgLine(points, { label = '', unit = '' } = {}) {
  if (!points.length) {
    return `<div class="an-chart-empty sec">No data for this range.</div>`;
  }

  const W = 320, H = 100;
  const pad = { t: 8, r: 8, b: 20, l: 50 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const rawMinY = Math.min(...ys), rawMaxY = Math.max(...ys);
  const pad_y   = (rawMaxY - rawMinY) * 0.1 || rawMaxY * 0.1 || 1;
  const minY    = rawMinY - pad_y;
  const maxY    = rawMaxY + pad_y;
  const rangeX  = maxX - minX || 1;
  const rangeY  = maxY - minY || 1;

  const tx = x => pad.l + ((x - minX) / rangeX) * cW;
  const ty = y => pad.t + cH - ((y - minY) / rangeY) * cH;

  // Grid lines (3 horizontal)
  const gridY = [0, 0.5, 1].map(f => {
    const val = minY + f * rangeY;
    const y   = ty(val);
    return `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${W - pad.r}" y2="${y.toFixed(1)}" stroke="#252529" stroke-width="0.5"/>
    <text x="${(pad.l - 4).toFixed(0)}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#2E2E33" font-size="8" font-family="Outfit,sans-serif">${_fmtChartNum(val)}</text>`;
  }).join('');

  // Line
  const polyPts = points.map(p => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ');

  // Area fill
  const areaBase = (pad.t + cH).toFixed(1);
  const areaPts  = `${tx(points[0].x).toFixed(1)},${areaBase} ${polyPts} ${tx(points[points.length - 1].x).toFixed(1)},${areaBase}`;

  // Dots (only if few data points, to avoid clutter)
  const showDots = points.length <= 30;
  const dots = showDots
    ? points.map(p => `<circle cx="${tx(p.x).toFixed(1)}" cy="${ty(p.y).toFixed(1)}" r="2.5" fill="#BDFF00"/>`).join('')
    : '';

  // X-axis labels (first, middle, last)
  const xLabelIdxs = points.length === 1 ? [0] : [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const xLabels = [...new Set(xLabelIdxs)].map(i => {
    const p = points[i];
    return `<text x="${tx(p.x).toFixed(1)}" y="${(pad.t + cH + 14).toFixed(0)}" text-anchor="middle" fill="#2E2E33" font-size="8" font-family="Outfit,sans-serif">${_fmtDateLabel(p.date)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${label}">
    ${gridY}
    <polygon points="${areaPts}" fill="#BDFF00" opacity="0.06"/>
    <polyline points="${polyPts}" fill="none" stroke="#BDFF00" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    ${xLabels}
  </svg>`;
}

function _fmtChartNum(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return Math.round(n).toString();
}

function _fmtDateLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── UTILITIES ─────────────────────────────────────────────────────────────────

function _offsetDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function _fmtVol(n) {
  if (!n) return '—';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000)    return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

function _esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
