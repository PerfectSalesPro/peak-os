// Training tracker — Train tab UI controller.
// Views: home | active | editor | calcs | csv | picker
import * as db   from './db.js';
import * as calc from './calc.js';
import { seedExercises, getAllExercises, getPrevSets, checkPR, updateBestSet } from './training-data.js';
import { openAnalytics } from './training-analytics.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const SET_TYPES = ['working', 'warmup', 'drop', 'failure'];
const TYPE_LBL  = { working: 'WK', warmup: 'W', drop: 'D', failure: 'F' };
const TYPE_CSS  = { working: 'lime', warmup: 'red', drop: 'purple', failure: 'amber' };
const DEFAULT_REST = 90;

// ── State ─────────────────────────────────────────────────────────────────────

let _exMap     = {};    // id -> exercise record
let _templates = [];
let _session   = null;  // live workout
let _view      = 'home';
let _prevView  = 'home';
let _calYear   = new Date().getFullYear();
let _calMonth  = new Date().getMonth(); // 0-based, for home calendar
let _editTpl   = null;  // template being built/edited
let _sessionTimerId = null;
let _restTimers     = {};   // exIdx -> { end, totalSec, timerId }
let _pickerCallback   = null;
let _pickerSearch     = '';
let _pickerCreateMode = false;
let _pickerCreateForm = { name: '', muscle: 'Chest', equip: 'Barbell' };
let _history        = [];   // cached finished workouts (sorted desc)
let _historyWorkout = null; // workout being viewed in detail
let _openSwipeCard  = null; // currently revealed hist-card element
let _pendingDeleteId = null; // workout id awaiting confirm

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initTrainingTracker() {
  await seedExercises();
  await _reload();

  const screen = document.getElementById('screen-train');
  screen.addEventListener('click',  _onClick);
  screen.addEventListener('input',  _onInput);
  screen.addEventListener('change', _onChange);

  window.addEventListener('peak:screen:train', () => _render());
  _render();
}

async function _reload() {
  const exList = await getAllExercises();
  _exMap     = Object.fromEntries(exList.map(e => [e.id, e]));
  _templates = await db.getAll('templates');
}

// ── Event delegation ──────────────────────────────────────────────────────────

function _onClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action } = btn.dataset;

  switch (action) {
    // ── Home ──
    case 'start-empty':   _startWorkout(null); break;
    case 'start-tpl':     _startWorkout(btn.dataset.id); break;
    case 'repeat-workout':_repeatWorkout(btn.dataset.id); break;
    case 'edit-tpl':      _openEditor(btn.dataset.id); break;
    case 'delete-tpl':    _deleteTemplate(btn.dataset.id); break;
    case 'new-tpl':       _openEditor(null); break;
    case 'show-calcs':      _nav('calcs'); break;
    case 'show-csv':        _nav('csv'); break;
    case 'show-analytics':  _openAnalytics(); break;
    case 'back-home':       _navHome(); break;
    case 'back-active':     _view = 'active'; _render(); break;
    case 'show-history':    _navHistory(); break;
    case 'home-cal-prev':   _calMonth--; if (_calMonth < 0) { _calMonth = 11; _calYear--; } _render(); break;
    case 'home-cal-next':   _calMonth++; if (_calMonth > 11) { _calMonth = 0; _calYear++; } _render(); break;
    case 'view-session':         _viewSession(btn.dataset.id); break;
    case 'back-history':         _view = 'history'; _render(); break;
    case 'delete-workout':       _confirmDeleteWorkout(btn.dataset.id); break;
    case 'confirm-delete-yes':   _deleteWorkout(_pendingDeleteId); break;
    case 'confirm-delete-cancel':_closeDeleteConfirm(); break;

    // ── Active workout ──
    case 'finish-workout': _finishWorkout(); break;
    case 'discard-workout':
      if (confirm('Discard this workout? Progress will be lost.')) _discardWorkout();
      break;
    case 'add-exercise':  _openPicker(id => _addExerciseToSession(id)); break;
    case 'add-set':       _addSet(+btn.dataset.ex); break;
    case 'remove-set':    _removeSet(+btn.dataset.ex, +btn.dataset.si); break;
    case 'check-set':     _checkSet(+btn.dataset.ex, +btn.dataset.si); break;
    case 'cycle-type':    _cycleType(+btn.dataset.ex, +btn.dataset.si); break;
    case 'edit-rest':     _editRest(+btn.dataset.ex); break;
    case 'cancel-rest':   _cancelRestTimer(+btn.dataset.ex); break;

    // ── Template editor ──
    case 'save-tpl':        _saveTemplate(); break;
    case 'add-tpl-ex':      _openPicker(id => _addExToEditor(id)); break;
    case 'remove-tpl-ex':   _removeTplEx(+btn.dataset.i); break;
    case 'add-tpl-set':     _addTplSet(+btn.dataset.i); break;
    case 'remove-tpl-set':  _removeTplSet(+btn.dataset.i, +btn.dataset.si); break;
    case 'toggle-superset': _toggleSuperset(+btn.dataset.i); break;
    case 'toggle-day':      _toggleDay(btn.dataset.day); break;
    case 'move-ex-up':      _moveEx(+btn.dataset.i, -1); break;
    case 'move-ex-down':    _moveEx(+btn.dataset.i, +1); break;

    // ── Exercise picker ──
    case 'pick-exercise':     _pickExercise(btn.dataset.id); break;
    case 'close-picker':      _closePicker(); break;
    case 'create-custom':     _pickerCreateMode = true; _pickerCreateForm = { name: '', muscle: 'Chest', equip: 'Barbell' }; _render(); break;
    case 'cancel-custom':     _pickerCreateMode = false; _render(); break;
    case 'save-custom':       _saveCustomExercise(); break;

    // ── Calculators ──
    case 'calc-plates':  _calcPlates(); break;
    case 'calc-warmup':  _calcWarmup(); break;

    // ── CSV import ──
    case 'csv-import':   _runCSV(); break;
  }
}

function _onInput(e) {
  const el = e.target;
  // Live session set inputs
  if (el.dataset.action === 'set-weight') {
    const { ex, si } = el.dataset;
    _session.exercises[+ex].sets[+si].weight = parseFloat(el.value) || null;
  }
  if (el.dataset.action === 'set-reps') {
    const { ex, si } = el.dataset;
    _session.exercises[+ex].sets[+si].reps = parseInt(el.value, 10) || null;
  }
  if (el.dataset.action === 'ex-notes') {
    const exIdx = +el.dataset.ex;
    if (_session?.exercises[exIdx]) _session.exercises[exIdx].notes = el.value;
  }
  // Picker search
  if (el.id === 'picker-search')        { _pickerSearch = el.value; _renderPickerList(); }
  if (el.id === 'picker-create-name')   _pickerCreateForm.name   = el.value;
  if (el.id === 'picker-create-muscle') _pickerCreateForm.muscle = el.value;
  if (el.id === 'picker-create-equip')  _pickerCreateForm.equip  = el.value;
}

function _onChange(e) {
  const el = e.target;
  if (el.dataset.action === 'workout-notes') {
    _session.notes = el.value;
  }
  if (el.dataset.action === 'tpl-set-rest') {
    const { i, si } = el.dataset;
    _editTpl.exercises[+i].plannedSets[+si].restSec = parseInt(el.value, 10) || DEFAULT_REST;
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────

function _nav(view) { _prevView = _view; _view = view; _render(); }

function _navHome() {
  _stopAllRestTimers();
  _pickerCallback = null;
  _view = 'home';
  _render();
}

async function _openAnalytics() {
  await openAnalytics(() => { _view = 'home'; _render(); });
}

// ── View renderer ─────────────────────────────────────────────────────────────

function _render() {
  const root = document.getElementById('train-root');
  if (!root) return;
  switch (_view) {
    case 'home':           root.innerHTML = _homeHTML(); _refreshCalendarDots(); break;
    case 'active':         root.innerHTML = _activeHTML(); _startSessionTimer(); break;
    case 'editor':         root.innerHTML = _editorHTML();         break;
    case 'calcs':          root.innerHTML = _calcsHTML();          break;
    case 'csv':            root.innerHTML = _csvHTML();            break;
    case 'picker':         root.innerHTML = _pickerHTML();         break;
    case 'history':        root.innerHTML = _historyHTML(); _attachHistorySwipe(); break;
    case 'session-detail': root.innerHTML = _sessionDetailHTML();  break;
  }
}

// ── ─────────────────────────────────────────────────────────────────────────
// HOME CALENDAR HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function _monthLabelHome(year, month) {
  return new Date(year, month, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
}

async function _getWorkoutDates() {
  const all = await db.getAll('workouts');
  return new Set(all.filter(w => w.durationSec != null).map(w => w.date));
}

function _homeCalendarHTML(year, month) {
  const dayNames = ['M','T','W','T','F','S','S'];
  const firstDay = new Date(year, month, 1).getDay();
  const offset   = (firstDay + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);

  let cells = `<div class="cal-grid">`;
  dayNames.forEach(d => { cells += `<div class="cal-day-name">${d}</div>`; });
  for (let i = 0; i < offset; i++) cells += `<div class="cal-cell cal-empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    // Workout presence is checked asynchronously — we store a data-date for JS post-render update
    const isToday = iso === today;
    cells += `<div class="cal-cell ${isToday ? 'cal-cell--today' : ''}" data-cal-date="${iso}">
      <span class="cal-cell-num">${d}</span>
    </div>`;
  }

  cells += `</div>`;
  return cells;
}

// Called after render to colour-in workout days without a full re-render
async function _refreshCalendarDots() {
  const dates = await _getWorkoutDates();
  document.querySelectorAll('[data-cal-date]').forEach(el => {
    const iso = el.dataset.calDate;
    if (dates.has(iso) && !el.querySelector('.cal-dot')) {
      el.classList.add('cal-cell--worked');
      const dot = document.createElement('span');
      dot.className = 'cal-dot';
      dot.setAttribute('aria-hidden', 'true');
      el.appendChild(dot);
    }
  });
}

// ── ─────────────────────────────────────────────────────────────────────────
// HOME VIEW
// ─────────────────────────────────────────────────────────────────────────────

function _homeHTML() {
  const tplCards = _templates.length
    ? _templates.map(t => _tplCardHTML(t)).join('')
    : `<div class="train-empty">No templates yet. Create one to get started.</div>`;

  const resumeBanner = _session
    ? `<div class="resume-banner card" style="animation-delay:0ms">
        <div class="resume-left">
          <div class="resume-label sec">Active Workout</div>
          <div class="resume-name">${_esc(_session.name)}</div>
          <div class="resume-timer" id="resume-timer">${_fmtDuration((Date.now() - _session.startedAt) / 1000)}</div>
        </div>
        <button class="btn-resume" data-action="back-active" aria-label="Resume workout">Resume</button>
      </div>`
    : '';

  return `
    <div class="train-view">
      <div class="train-screen-header">
        <span class="section-label">Training</span>
        <button class="btn-new-tpl" data-action="new-tpl" aria-label="New template">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
            <line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>
          </svg>
          Template
        </button>
      </div>

      ${resumeBanner}

      <button class="btn-primary train-start-btn" data-action="start-empty" style="margin-bottom:20px">
        Start Workout
      </button>

      <div class="train-section-row">
        <span class="sec">Templates</span>
      </div>
      <div class="template-list">${tplCards}</div>

      <div class="an-section-row" style="margin-top:20px">
        <div class="an-cal-header" style="width:100%">
          <button class="an-cal-nav" data-action="home-cal-prev" aria-label="Previous month">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="sec">${_monthLabelHome(_calYear, _calMonth)}</span>
          <button class="an-cal-nav" data-action="home-cal-next" aria-label="Next month">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
      <div class="card" style="animation-delay:60ms;padding:10px 12px 12px">
        ${_homeCalendarHTML(_calYear, _calMonth)}
      </div>

      <div class="train-section-row" style="margin-top:16px">
        <span class="sec">Tools</span>
      </div>
      <div class="tools-row">
        <button class="tool-card" data-action="show-analytics">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          Analytics
        </button>
        <button class="tool-card" data-action="show-history">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          History
        </button>
        <button class="tool-card" data-action="show-calcs">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="4" y="2" width="16" height="20" rx="2"/>
            <line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/>
            <line x1="8" y1="16" x2="12" y2="16"/>
          </svg>
          Calcs
        </button>
        <button class="tool-card" data-action="show-csv">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
            <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
          </svg>
          Import
        </button>
      </div>
    </div>`;
}

function _tplCardHTML(t) {
  const days = (t.scheduleDays || []).join(' · ') || 'No days set';
  const exCount = (t.exercises || []).length;
  return `
    <div class="template-card card" style="animation-delay:0ms">
      <div class="tpl-card-main">
        <div class="tpl-name">${_esc(t.name)}</div>
        <div class="tpl-meta">${_esc(t.focus || '')}${t.focus && days ? ' · ' : ''}${days}</div>
        <div class="tpl-ex-count">${exCount} exercise${exCount !== 1 ? 's' : ''}</div>
      </div>
      <div class="tpl-card-actions">
        <button class="btn-start-tpl" data-action="start-tpl" data-id="${t.id}" aria-label="Start ${_esc(t.name)}">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <polygon points="4,2 14,8 4,14"/>
          </svg>
          Start
        </button>
        <button class="btn-icon-sm" data-action="edit-tpl" data-id="${t.id}" aria-label="Edit template">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn-icon-sm btn-icon-danger" data-action="delete-tpl" data-id="${t.id}" aria-label="Delete template">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
          </svg>
        </button>
      </div>
    </div>`;
}

// ── ─────────────────────────────────────────────────────────────────────────
// ACTIVE WORKOUT VIEW
// ─────────────────────────────────────────────────────────────────────────────

function _activeHTML() {
  const exBlocks = _session.exercises.map((ex, i) => _exBlockHTML(ex, i)).join('');
  return `
    <div class="train-view train-active-view">
      <div class="session-bar" id="session-bar">
        <button class="session-back-btn" data-action="back-home" aria-label="Go to home">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div class="session-bar-center">
          <div class="session-name">${_esc(_session.name)}</div>
          <div class="session-timer" id="session-timer">${_fmtDuration((Date.now() - _session.startedAt) / 1000)}</div>
        </div>
        <button class="session-finish-btn" data-action="finish-workout">Finish</button>
      </div>

      <div class="global-rest-banner" id="global-rest-banner" hidden>
        <div class="grb-left">
          <span class="grb-label sec">REST</span>
          <span class="grb-ex" id="grb-ex-name"></span>
        </div>
        <span class="grb-countdown" id="grb-countdown">0:00</span>
        <button class="grb-skip-btn" id="grb-skip-btn" aria-label="Skip rest">Skip</button>
      </div>

      <div class="workout-notes-row">
        <textarea class="workout-notes-input" rows="1" placeholder="Workout notes…"
          data-action="workout-notes" aria-label="Workout notes">${_esc(_session.notes)}</textarea>
      </div>

      <div id="exercise-list">${exBlocks}</div>

      <button class="btn-add-exercise" data-action="add-exercise">+ Add Exercise</button>

      <div class="session-footer">
        <button class="btn-primary" data-action="finish-workout">Finish Workout</button>
        <button class="btn-discard" data-action="discard-workout">Discard Workout</button>
      </div>
    </div>`;
}

function _exBlockHTML(ex, i) {
  const exDef  = _exMap[ex.exerciseId] || {};
  const inGroup = _sessionSupersetGroup(i);
  const groupLabel = inGroup
    ? `<span class="ss-badge pill p-purple">Superset</span>`
    : '';

  const setHeaderHTML = `
    <div class="set-header">
      <span class="sh-num">#</span>
      <span class="sh-type"></span>
      <span class="sh-prev">PREV</span>
      <span class="sh-weight">LBS</span>
      <span class="sh-reps">REPS</span>
      <span class="sh-check"></span>
    </div>`;

  const prevSets = ex.prevSets || [];
  const setRows  = ex.sets.map((s, si) => _setRowHTML(s, si, prevSets[si], i)).join('');

  return `
    <div class="exercise-block" id="ex-block-${i}" data-ex-index="${i}">
      <div class="exercise-header">
        <div class="ex-title-group">
          ${groupLabel}
          <div class="ex-name">${_esc(exDef.name || ex.exerciseName || '—')}</div>
          <div class="ex-meta">${_esc(exDef.primaryMuscle || '')} · ${_esc(exDef.equipment || '')}</div>
        </div>
        <div class="ex-header-right">
          <div class="ex-volume" id="ex-vol-${i}">
            <span class="ex-vol-label sec">Vol</span>
            <span class="ex-vol-val">${_exVolumeStr(ex)}</span>
          </div>
          <button class="ex-rest-btn" data-action="edit-rest" data-ex="${i}" aria-label="Edit rest time">
            <span class="sec">REST</span>
            <span class="ex-rest-val" id="ex-rest-val-${i}">${ex.restSec || DEFAULT_REST}s</span>
          </button>
        </div>
      </div>

      <div class="ex-rest-timer" id="ex-rest-timer-${i}" hidden>
        <div class="ert-row">
          <span class="ert-label sec">Resting</span>
          <span class="ert-countdown" id="ert-count-${i}">1:30</span>
          <button class="ert-skip-btn" data-action="cancel-rest" data-ex="${i}" aria-label="Skip rest">Skip</button>
        </div>
        <div class="ert-track"><div class="ert-fill" id="ert-fill-${i}"></div></div>
      </div>

      ${setHeaderHTML}
      <div class="set-rows" id="set-rows-${i}">${setRows}</div>
      <button class="btn-add-set" data-action="add-set" data-ex="${i}">+ Set</button>

      <textarea class="ex-notes-input" rows="1" placeholder="Exercise notes…"
        data-action="ex-notes" data-ex="${i}"
        aria-label="Exercise notes">${_esc(ex.notes || '')}</textarea>
    </div>`;
}

function _setRowHTML(set, si, prev, ei) {
  const typeColor = TYPE_CSS[set.type] || 'lime';
  const doneClass = set.completed ? 'set-row--done' : '';
  const prClass   = set.isPR      ? 'set-row--pr'   : '';
  const prBadge   = set.isPR
    ? `<span class="pr-badge" title="New personal record">PR</span>`
    : '';
  const prevLbl = (prev?.weight != null && prev?.reps != null)
    ? `${prev.weight}×${prev.reps}`
    : '—';
  const wVal = set.weight != null ? set.weight : '';
  const rVal = set.reps   != null ? set.reps   : '';

  return `
    <div class="set-row ${doneClass} ${prClass}" id="set-row-${ei}-${si}" data-ei="${ei}" data-si="${si}">
      <span class="set-num">${si + 1}</span>
      <button class="set-type-btn stype-${typeColor}" data-action="cycle-type"
        data-ex="${ei}" data-si="${si}" aria-label="Set type: ${set.type}">${TYPE_LBL[set.type]}</button>
      <span class="set-prev-lbl">${prevLbl}</span>
      <input class="set-input" type="number" inputmode="decimal" step="2.5" min="0"
        value="${wVal}"
        data-action="set-weight" data-ex="${ei}" data-si="${si}" aria-label="Weight">
      <input class="set-input set-input-reps" type="number" inputmode="numeric" min="0"
        value="${rVal}"
        data-action="set-reps" data-ex="${ei}" data-si="${si}" aria-label="Reps">
      <button class="set-check-btn ${set.completed ? 'set-check--done' : ''}"
        data-action="check-set" data-ex="${ei}" data-si="${si}"
        aria-label="Complete set" aria-pressed="${set.completed}">
        ${set.completed ? `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="2 8 6 12 14 4"/></svg>` : ''}
      </button>
      ${prBadge}
    </div>`;
}

// ── ─────────────────────────────────────────────────────────────────────────
// WORKOUT ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

async function _startWorkout(templateId) {
  const tpl = templateId ? _templates.find(t => t.id === templateId) : null;
  const today = new Date().toISOString().slice(0, 10);
  const name  = tpl ? tpl.name : `Workout ${_fmtDate(today)}`;

  const exercises = [];
  if (tpl) {
    for (const te of (tpl.exercises || [])) {
      const prev = await getPrevSets(te.exerciseId);
      exercises.push({
        exerciseId:   te.exerciseId,
        exerciseName: _exMap[te.exerciseId]?.name || 'Unknown',
        restSec: (te.plannedSets?.[0]?.restSec) || DEFAULT_REST,
        sets: (te.plannedSets || [{ type: 'working' }]).map(ps => ({
          type: ps.type || 'working',
          weight: ps.weight || null,
          reps:   ps.reps   || null,
          rpe:    null,
          completed: false,
          isPR: false,
        })),
        prevSets: prev,
        notes: '',
      });
    }
  }

  const record = await db.put('workouts', {
    date: today,
    templateId: templateId || null,
    name,
    durationSec: null,
    notes: '',
    dayType: 'training',
    exercises,
  });

  _session = {
    workoutId:    record.id,
    startedAt:    Date.now(),
    name,
    notes:        '',
    templateId:   templateId || null,
    supersetGroups: tpl?.supersetGroups || [],
    exercises,
  };

  _restTimers = {};
  await _requestNotifPermission();
  _view = 'active';
  _render();
}

async function _repeatWorkout(workoutId) {
  const w = await db.get('workouts', workoutId);
  if (!w) return;
  for (const ex of w.exercises) {
    ex.sets = ex.sets.map(s => ({ ...s, completed: false, isPR: false }));
    ex.prevSets = ex.sets; // treat repeat workout as ghost values
    ex.notes    = '';
  }
  const today  = new Date().toISOString().slice(0, 10);
  const record = await db.put('workouts', {
    date: today, templateId: w.templateId,
    name: w.name, durationSec: null, notes: '', dayType: 'training',
    exercises: w.exercises,
  });
  _session = {
    workoutId: record.id, startedAt: Date.now(),
    name: w.name, notes: '', templateId: w.templateId,
    supersetGroups: w.supersetGroups || [],
    exercises: w.exercises,
  };
  _restTimers = {};
  await _requestNotifPermission();
  _view = 'active';
  _render();
}

async function _finishWorkout() {
  if (!_session) return;
  _stopAllRestTimers();
  _stopSessionTimer();
  const durationSec = Math.round((Date.now() - _session.startedAt) / 1000);
  await db.put('workouts', {
    id: _session.workoutId,
    date: new Date().toISOString().slice(0, 10),
    templateId: _session.templateId,
    name: _session.name,
    durationSec,
    notes: _session.notes,
    dayType: 'training',
    exercises: _session.exercises,
  });
  _session = null;
  _view = 'home';
  await _reload();
  _render();
  window.peakShowToast?.('Workout saved', 'lime');
}

function _discardWorkout() {
  _stopAllRestTimers();
  _stopSessionTimer();
  if (_session?.workoutId) db.remove('workouts', _session.workoutId);
  _session = null;
  _view = 'home';
  _render();
}

async function _addExerciseToSession(exerciseId) {
  const prev = await getPrevSets(exerciseId, _session.workoutId);
  _session.exercises.push({
    exerciseId,
    exerciseName: _exMap[exerciseId]?.name || 'Unknown',
    restSec: DEFAULT_REST,
    sets: [{ type: 'working', weight: null, reps: null, rpe: null, completed: false, isPR: false }],
    prevSets: prev,
    notes: '',
  });
  await _saveSessionToDB();
  _view = 'active';
  _render();
}

function _addSet(exIdx) {
  const ex  = _session.exercises[exIdx];
  const last = ex.sets[ex.sets.length - 1];
  ex.sets.push({ type: last?.type || 'working', weight: null, reps: null, rpe: null, completed: false, isPR: false });
  const container = document.getElementById(`set-rows-${exIdx}`);
  if (container) {
    const si  = ex.sets.length - 1;
    const prev = ex.prevSets?.[si] || null;
    const div  = document.createElement('div');
    div.innerHTML = _setRowHTML(ex.sets[si], si, prev, exIdx);
    container.appendChild(div.firstElementChild);
    _updateExVolume(exIdx);
  }
}

function _removeSet(exIdx, si) {
  const ex = _session.exercises[exIdx];
  if (ex.sets.length <= 1) return;
  ex.sets.splice(si, 1);
  const row = document.getElementById(`set-row-${exIdx}-${si}`);
  row?.remove();
  // Renumber remaining rows
  const container = document.getElementById(`set-rows-${exIdx}`);
  if (container) {
    container.querySelectorAll('.set-row').forEach((el, i) => {
      el.id = `set-row-${exIdx}-${i}`;
      el.querySelectorAll('[data-si]').forEach(c => { c.dataset.si = i; });
      const numEl = el.querySelector('.set-num');
      if (numEl) numEl.textContent = i + 1;
    });
  }
  _updateExVolume(exIdx);
}

async function _checkSet(exIdx, si) {
  const ex  = _session.exercises[exIdx];
  const set = ex.sets[si];
  if (set.completed) return; // already done

  // Read latest values from state (kept up-to-date by _onInput)
  const weight = set.weight;
  const reps   = set.reps;
  const rpe    = set.rpe;

  if (!weight || !reps) {
    _flashRow(`set-row-${exIdx}-${si}`);
    return;
  }

  set.completed = true;

  // PR check for working sets
  if (set.type === 'working') {
    const { isPR, estimated1RM } = await checkPR(ex.exerciseId, weight, reps, rpe);
    set.isPR = isPR;
    if (isPR) await updateBestSet(ex.exerciseId, weight, reps, rpe);
  }

  await _saveSessionToDB();

  // Update this row in DOM
  _patchSetRow(exIdx, si);
  _updateExVolume(exIdx);

  // Rest timer: only fires if this exercise is "last in superset group" (or not in group)
  if (_shouldStartRest(exIdx)) {
    _startRestTimer(exIdx);
  }
}

function _cycleType(exIdx, si) {
  const set = _session.exercises[exIdx].sets[si];
  const idx = SET_TYPES.indexOf(set.type);
  set.type  = SET_TYPES[(idx + 1) % SET_TYPES.length];
  const btn = document.querySelector(`[data-action="cycle-type"][data-ex="${exIdx}"][data-si="${si}"]`);
  if (btn) {
    btn.textContent = TYPE_LBL[set.type];
    btn.className   = `set-type-btn stype-${TYPE_CSS[set.type]}`;
  }
}

function _editRest(exIdx) {
  const ex      = _session.exercises[exIdx];
  const current = ex.restSec || DEFAULT_REST;
  const val     = prompt(`Rest duration for ${_exMap[ex.exerciseId]?.name || 'exercise'} (seconds):`, current);
  if (val === null) return;
  const parsed = parseInt(val, 10);
  if (isNaN(parsed) || parsed < 0) return;
  ex.restSec = parsed;
  const label = document.getElementById(`ex-rest-val-${exIdx}`);
  if (label) label.textContent = `${parsed}s`;
}

// ── ─────────────────────────────────────────────────────────────────────────
// SESSION TIMER
// ─────────────────────────────────────────────────────────────────────────────

function _startSessionTimer() {
  _stopSessionTimer();
  _sessionTimerId = setInterval(() => {
    if (!_session) { _stopSessionTimer(); return; }
    const el = document.getElementById('session-timer');
    if (el) el.textContent = _fmtDuration((Date.now() - _session.startedAt) / 1000);
  }, 1000);
}

function _stopSessionTimer() {
  clearInterval(_sessionTimerId);
  _sessionTimerId = null;
}

// ── ─────────────────────────────────────────────────────────────────────────
// REST TIMER
// ─────────────────────────────────────────────────────────────────────────────

function _shouldStartRest(exIdx) {
  const ex = _session.exercises[exIdx];
  for (const group of _session.supersetGroups) {
    if (group.includes(ex.exerciseId)) {
      return group[group.length - 1] === ex.exerciseId;
    }
  }
  return true;
}

function _sessionSupersetGroup(exIdx) {
  const exId = _session?.exercises[exIdx]?.exerciseId;
  if (!exId) return false;
  return _session.supersetGroups.some(g => g.includes(exId));
}

function _startRestTimer(exIdx) {
  const ex       = _session.exercises[exIdx];
  const restSec  = ex.restSec || DEFAULT_REST;
  const end      = Date.now() + restSec * 1000;

  _cancelRestTimer(exIdx); // clear any existing

  _restTimers[exIdx] = {
    end,
    totalSec: restSec,
    timerId: setInterval(() => _tickRestTimer(exIdx), 250),
  };

  // Show the inline timer
  const timerEl = document.getElementById(`ex-rest-timer-${exIdx}`);
  if (timerEl) timerEl.hidden = false;

  // Show/update global rest banner
  _updateGlobalBanner(exIdx, restSec);
}

function _tickRestTimer(exIdx) {
  const timer = _restTimers[exIdx];
  if (!timer) return;

  const remaining = Math.max(0, (timer.end - Date.now()) / 1000);
  const pct = 1 - remaining / timer.totalSec;

  // Inline timer
  const countEl = document.getElementById(`ert-count-${exIdx}`);
  const fillEl  = document.getElementById(`ert-fill-${exIdx}`);
  if (countEl) countEl.textContent = _fmtTimer(remaining);
  if (fillEl)  fillEl.style.width  = `${Math.min(100, pct * 100)}%`;

  // Global banner
  const gbCountEl = document.getElementById('grb-countdown');
  if (gbCountEl && gbCountEl.dataset.exIdx === String(exIdx)) {
    gbCountEl.textContent = _fmtTimer(remaining);
  }

  if (remaining <= 0) {
    _cancelRestTimer(exIdx);
    _fireRestNotification(exIdx);
  }
}

function _cancelRestTimer(exIdx) {
  const timer = _restTimers[exIdx];
  if (!timer) return;
  clearInterval(timer.timerId);
  delete _restTimers[exIdx];

  const timerEl = document.getElementById(`ex-rest-timer-${exIdx}`);
  if (timerEl) timerEl.hidden = true;

  // Hide global banner if it was for this exercise
  const banner = document.getElementById('global-rest-banner');
  if (banner && banner.dataset.activeEx === String(exIdx)) {
    banner.hidden = true;
    banner.removeAttribute('data-active-ex');
  }
}

function _stopAllRestTimers() {
  Object.keys(_restTimers).forEach(i => _cancelRestTimer(+i));
}

function _updateGlobalBanner(exIdx, remaining) {
  const banner = document.getElementById('global-rest-banner');
  if (!banner) return;
  const ex   = _session.exercises[exIdx];
  const name = _exMap[ex.exerciseId]?.name || ex.exerciseName || 'Exercise';
  banner.hidden = false;
  banner.dataset.activeEx = exIdx;
  const exNameEl = document.getElementById('grb-ex-name');
  const countEl  = document.getElementById('grb-countdown');
  const skipBtn  = document.getElementById('grb-skip-btn');
  if (exNameEl) exNameEl.textContent = name;
  if (countEl) { countEl.textContent = _fmtTimer(remaining); countEl.dataset.exIdx = exIdx; }
  if (skipBtn) { skipBtn.dataset.action = 'cancel-rest'; skipBtn.dataset.ex = exIdx; }
}

function _fireRestNotification(exIdx) {
  const ex   = _session?.exercises[exIdx];
  const name = _exMap[ex?.exerciseId]?.name || 'next set';
  navigator.vibrate?.([200, 100, 200]);
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Rest done — go!', {
      body: `Time to start: ${name}`,
      icon: '/icons/icon-192.svg',
      tag: 'peak-rest',
      silent: false,
    });
  }
}

async function _requestNotifPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

// ── ─────────────────────────────────────────────────────────────────────────
// VOLUME HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function _exVolumeStr(ex) {
  const total = ex.sets
    .filter(s => s.completed && (!s.setKind || s.setKind === 'weighted') && s.weight > 0 && s.reps > 0)
    .reduce((sum, s) => sum + s.weight * s.reps, 0);
  if (total === 0) return '—';
  return total >= 1000 ? `${(total / 1000).toFixed(1)}k` : `${total}`;
}

function _updateExVolume(exIdx) {
  const el = document.getElementById(`ex-vol-${exIdx}`);
  if (!el) return;
  const valEl = el.querySelector('.ex-vol-val');
  if (valEl) valEl.textContent = _exVolumeStr(_session.exercises[exIdx]);
}

// ── ─────────────────────────────────────────────────────────────────────────
// DOM PATCH HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function _patchSetRow(exIdx, si) {
  const row = document.getElementById(`set-row-${exIdx}-${si}`);
  if (!row) return;
  const set  = _session.exercises[exIdx].sets[si];
  const prev = _session.exercises[exIdx].prevSets?.[si] || null;
  const temp = document.createElement('div');
  temp.innerHTML = _setRowHTML(set, si, prev, exIdx);
  row.replaceWith(temp.firstElementChild);
}

function _flashRow(id) {
  const row = document.getElementById(id);
  if (!row) return;
  row.classList.add('set-row--flash');
  setTimeout(() => row.classList.remove('set-row--flash'), 600);
}

// ── ─────────────────────────────────────────────────────────────────────────
// TEMPLATE EDITOR
// ─────────────────────────────────────────────────────────────────────────────

function _openEditor(templateId) {
  if (templateId) {
    const tpl   = _templates.find(t => t.id === templateId);
    _editTpl = tpl ? JSON.parse(JSON.stringify(tpl)) : _blankTpl();
  } else {
    _editTpl = _blankTpl();
  }
  _view = 'editor';
  _render();
}

function _blankTpl() {
  return { id: undefined, name: '', focus: '', exercises: [], supersetGroups: [], scheduleDays: [] };
}

function _editorHTML() {
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const dayBtns = days.map(d => {
    const active = (_editTpl.scheduleDays || []).includes(d);
    return `<button class="day-btn ${active ? 'day-btn--active' : ''}"
      data-action="toggle-day" data-day="${d}" aria-pressed="${active}">${d}</button>`;
  }).join('');

  const exRows = (_editTpl.exercises || []).map((te, i) => {
    const exDef = _exMap[te.exerciseId] || {};
    const isLast  = i === _editTpl.exercises.length - 1;
    const inSS    = _editTpl.supersetGroups?.some(g => g.includes(te.exerciseId));
    const nextInSS = !isLast && _editTpl.supersetGroups?.some(g => {
      const idx = g.indexOf(te.exerciseId);
      return idx !== -1 && g[idx + 1] === _editTpl.exercises[i + 1]?.exerciseId;
    });
    const setRows = te.plannedSets.map((ps, si) => `
      <div class="tpl-set-row">
        <select class="tpl-set-type" data-action="tpl-set-type" data-i="${i}" data-si="${si}" aria-label="Set type">
          ${SET_TYPES.map(t => `<option value="${t}" ${ps.type === t ? 'selected' : ''}>${TYPE_LBL[t]}</option>`).join('')}
        </select>
        <input type="number" class="set-input" placeholder="Wt" value="${ps.weight || ''}"
          data-action="tpl-set-weight" data-i="${i}" data-si="${si}" aria-label="Target weight" inputmode="decimal">
        <input type="number" class="set-input set-input-reps" placeholder="Reps" value="${ps.reps || ''}"
          data-action="tpl-set-reps" data-i="${i}" data-si="${si}" aria-label="Target reps" inputmode="numeric">
        <span class="tpl-set-rest-label">Rest</span>
        <input type="number" class="set-input set-input-rpe" placeholder="${DEFAULT_REST}" value="${ps.restSec || ''}"
          data-action="tpl-set-rest" data-i="${i}" data-si="${si}" aria-label="Rest seconds" inputmode="numeric">
        <span class="tpl-set-rest-unit">s</span>
        <button class="btn-icon-sm btn-icon-danger" data-action="remove-tpl-set" data-i="${i}" data-si="${si}" aria-label="Remove set">×</button>
      </div>`).join('');

    return `
      <div class="tpl-ex-row card-xs">
        <div class="tpl-ex-row-header">
          <div class="tpl-ex-info">
            <div class="tpl-ex-name">${_esc(exDef.name || 'Unknown')}</div>
            <div class="tpl-ex-meta">${_esc(exDef.primaryMuscle || '')} · ${_esc(exDef.equipment || '')}</div>
          </div>
          <div class="tpl-ex-row-actions">
            ${i > 0 ? `<button class="btn-icon-sm" data-action="move-ex-up" data-i="${i}" aria-label="Move up">↑</button>` : ''}
            ${!isLast ? `<button class="btn-icon-sm" data-action="move-ex-down" data-i="${i}" aria-label="Move down">↓</button>` : ''}
            <button class="btn-icon-sm btn-icon-danger" data-action="remove-tpl-ex" data-i="${i}" aria-label="Remove exercise">×</button>
          </div>
        </div>
        <div class="tpl-set-rows">${setRows}</div>
        <div class="tpl-ex-footer">
          <button class="btn-add-set" data-action="add-tpl-set" data-i="${i}">+ Set</button>
          ${!isLast ? `<button class="ss-toggle-btn ${nextInSS ? 'ss-toggle-btn--active' : ''}"
            data-action="toggle-superset" data-i="${i}" aria-pressed="${nextInSS}">
            ⇄ Superset with next</button>` : ''}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="train-view">
      <div class="train-screen-header">
        <button class="btn-back" data-action="back-home" aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span class="section-label">${_editTpl.id ? 'Edit Template' : 'New Template'}</span>
        <button class="btn-save-tpl" data-action="save-tpl" aria-label="Save template">Save</button>
      </div>

      <div class="card" style="animation-delay:0ms">
        <div class="form-row">
          <div class="field field-full">
            <label class="field-label" for="tpl-name">Template Name</label>
            <input type="text" id="tpl-name" class="field-input" placeholder="Push Day A"
              value="${_esc(_editTpl.name || '')}" data-action="tpl-name" aria-label="Template name">
          </div>
        </div>
        <div class="form-row">
          <div class="field field-full">
            <label class="field-label" for="tpl-focus">Focus (optional)</label>
            <input type="text" id="tpl-focus" class="field-input" placeholder="Chest / Shoulders / Triceps"
              value="${_esc(_editTpl.focus || '')}" data-action="tpl-focus" aria-label="Workout focus">
          </div>
        </div>
        <div class="field-label" style="margin-bottom:8px">Schedule Days</div>
        <div class="day-picker" role="group" aria-label="Schedule days">${dayBtns}</div>
      </div>

      <div class="train-section-row" style="margin-top:4px">
        <span class="sec">Exercises</span>
        <button class="btn-icon-text" data-action="add-tpl-ex" aria-label="Add exercise">+ Add</button>
      </div>

      <div id="tpl-ex-list">${exRows || '<div class="train-empty">No exercises yet.</div>'}</div>

      <button class="btn-primary" data-action="save-tpl" style="margin-top:16px">Save Template</button>
    </div>`;
}

// Editor input changes (not yet in _onInput since they use data-action differently)
document.addEventListener('input', e => {
  const el = e.target;
  if (!_editTpl) return;
  if (el.dataset.action === 'tpl-name')         _editTpl.name  = el.value;
  if (el.dataset.action === 'tpl-focus')        _editTpl.focus = el.value;
  if (el.dataset.action === 'tpl-set-weight') {
    const { i, si } = el.dataset;
    if (_editTpl.exercises[+i]) _editTpl.exercises[+i].plannedSets[+si].weight = parseFloat(el.value) || null;
  }
  if (el.dataset.action === 'tpl-set-reps') {
    const { i, si } = el.dataset;
    if (_editTpl.exercises[+i]) _editTpl.exercises[+i].plannedSets[+si].reps = parseInt(el.value, 10) || null;
  }
  if (el.dataset.action === 'tpl-set-rest') {
    const { i, si } = el.dataset;
    if (_editTpl.exercises[+i]) _editTpl.exercises[+i].plannedSets[+si].restSec = parseInt(el.value, 10) || DEFAULT_REST;
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (!_editTpl) return;
  if (el.dataset.action === 'tpl-set-type') {
    const { i, si } = el.dataset;
    if (_editTpl.exercises[+i]) _editTpl.exercises[+i].plannedSets[+si].type = el.value;
  }
});

function _addExToEditor(exerciseId) {
  _editTpl.exercises.push({
    exerciseId,
    plannedSets: [{ type: 'working', weight: null, reps: null, restSec: DEFAULT_REST }],
  });
  _view = 'editor';
  _render();
}

function _removeTplEx(i) {
  const removedId = _editTpl.exercises[i]?.exerciseId;
  _editTpl.exercises.splice(i, 1);
  if (removedId) {
    _editTpl.supersetGroups = (_editTpl.supersetGroups || [])
      .map(g => g.filter(id => id !== removedId))
      .filter(g => g.length > 1);
  }
  _view = 'editor';
  _render();
}

function _addTplSet(i) {
  const ex   = _editTpl.exercises[i];
  const last = ex.plannedSets[ex.plannedSets.length - 1];
  ex.plannedSets.push({ type: last?.type || 'working', weight: null, reps: null, restSec: last?.restSec || DEFAULT_REST });
  _view = 'editor';
  _render();
}

function _removeTplSet(i, si) {
  const ex = _editTpl.exercises[i];
  if (ex.plannedSets.length <= 1) return;
  ex.plannedSets.splice(si, 1);
  _view = 'editor';
  _render();
}

function _toggleSuperset(i) {
  const exA = _editTpl.exercises[i]?.exerciseId;
  const exB = _editTpl.exercises[i + 1]?.exerciseId;
  if (!exA || !exB) return;

  _editTpl.supersetGroups = _editTpl.supersetGroups || [];
  // Check if already paired
  const existingGroup = _editTpl.supersetGroups.find(g => g.includes(exA) && g.includes(exB));
  if (existingGroup) {
    // Remove this pair from the group
    _editTpl.supersetGroups = _editTpl.supersetGroups
      .map(g => (g === existingGroup ? g.filter(id => id !== exA && id !== exB) : g))
      .filter(g => g.length > 1);
  } else {
    // Find a group that contains either — extend it — or create new
    const gA = _editTpl.supersetGroups.find(g => g.includes(exA));
    const gB = _editTpl.supersetGroups.find(g => g.includes(exB));
    if (gA && gB && gA === gB) return; // already in same group
    if (gA) { if (!gA.includes(exB)) gA.push(exB); }
    else if (gB) { if (!gB.includes(exA)) gB.unshift(exA); }
    else _editTpl.supersetGroups.push([exA, exB]);
  }
  _view = 'editor';
  _render();
}

function _toggleDay(day) {
  const days = _editTpl.scheduleDays || [];
  const idx  = days.indexOf(day);
  if (idx === -1) days.push(day);
  else days.splice(idx, 1);
  _editTpl.scheduleDays = days;
  _view = 'editor';
  _render();
}

function _moveEx(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= _editTpl.exercises.length) return;
  [_editTpl.exercises[i], _editTpl.exercises[j]] = [_editTpl.exercises[j], _editTpl.exercises[i]];
  _view = 'editor';
  _render();
}

async function _saveTemplate() {
  if (!_editTpl.name.trim()) {
    alert('Template name is required.');
    return;
  }
  const record = await db.put('templates', {
    ..._editTpl,
    supersetGroups: _editTpl.supersetGroups || [],
  });
  await _reloadTemplates();
  _view = 'home';
  _render();
  window.peakShowToast?.('Template saved', 'lime');
}

async function _deleteTemplate(id) {
  if (!confirm('Delete this template?')) return;
  await db.remove('templates', id);
  await _reloadTemplates();
  _render();
}

// ── ─────────────────────────────────────────────────────────────────────────
// EXERCISE PICKER
// ─────────────────────────────────────────────────────────────────────────────

function _openPicker(callback) {
  _pickerCallback = callback;
  _pickerSearch   = '';
  _prevView = _view;
  _view = 'picker';
  _render();
}

function _closePicker() {
  _view = _prevView;
  _pickerCallback = null;
  _render();
}

function _pickExercise(id) {
  const cb = _pickerCallback;
  _closePicker();
  cb?.(id);
}

const PICKER_MUSCLES = ['Back','Biceps','Calves','Chest','Core','Glutes','Hamstrings','Other','Quads','Shoulders','Triceps'];
const PICKER_EQUIPS  = ['Barbell','Bodyweight','Cable','Dumbbell','Machine','Other'];

function _pickerHTML() {
  const createForm = _pickerCreateMode ? `
    <div class="an-create-form card" style="animation-delay:0ms;margin:0 0 8px">
      <div class="sec" style="margin-bottom:10px">New Exercise</div>
      <div class="form-row">
        <div class="field field-full">
          <label class="field-label" for="picker-create-name">Name</label>
          <input type="text" id="picker-create-name" class="field-input" placeholder="Exercise name"
            value="${_esc(_pickerCreateForm.name)}" autocomplete="off" aria-label="Exercise name">
        </div>
      </div>
      <div class="form-row form-row-2col">
        <div class="field">
          <label class="field-label" for="picker-create-muscle">Muscle</label>
          <select id="picker-create-muscle" class="field-input an-select">
            ${PICKER_MUSCLES.map(m => `<option value="${m}" ${_pickerCreateForm.muscle === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="picker-create-equip">Equipment</label>
          <select id="picker-create-equip" class="field-input an-select">
            ${PICKER_EQUIPS.map(eq => `<option value="${eq}" ${_pickerCreateForm.equip === eq ? 'selected' : ''}>${eq}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="an-create-actions">
        <button class="btn-primary" data-action="save-custom" style="margin-bottom:0">Save</button>
        <button class="btn-discard" data-action="cancel-custom">Cancel</button>
      </div>
    </div>` : '';

  return `
    <div class="train-view picker-view">
      <div class="train-screen-header">
        <button class="btn-back" data-action="close-picker" aria-label="Close picker">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span class="section-label">Add Exercise</span>
        ${!_pickerCreateMode ? `<button class="btn-icon-text" data-action="create-custom" aria-label="Create custom exercise">+ Custom</button>` : '<span></span>'}
      </div>
      ${createForm}
      <input type="search" id="picker-search" class="picker-search-input"
        placeholder="Search exercises…" value="${_esc(_pickerSearch)}"
        autocomplete="off" aria-label="Search exercises">
      <div id="picker-list">${_pickerListHTML()}</div>
    </div>`;
}

function _pickerListHTML() {
  const q  = _pickerSearch.toLowerCase();
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
      ${exs.map(ex => `
        <button class="picker-ex-row" data-action="pick-exercise" data-id="${ex.id}">
          <div class="picker-ex-name">${_esc(ex.name)}</div>
          <div class="picker-ex-meta">${_esc(ex.equipment)}${ex.bestSet ? ` · Best: ${ex.bestSet.weight}×${ex.bestSet.reps}` : ''}</div>
        </button>`).join('')}
    </div>`).join('');
}

function _renderPickerList() {
  const container = document.getElementById('picker-list');
  if (container) container.innerHTML = _pickerListHTML();
}

async function _saveCustomExercise() {
  const name = _pickerCreateForm.name.trim();
  if (!name) return;
  const record = await db.put('exercises', {
    name,
    primaryMuscle: _pickerCreateForm.muscle || 'Other',
    secondaryMuscles: [],
    equipment: _pickerCreateForm.equip || 'Other',
    isCustom: true,
    bestSet: null,
  });
  await _reloadExercises();
  _pickerCreateMode = false;
  _pickExercise(record.id);
}

// ── ─────────────────────────────────────────────────────────────────────────
// CALCULATORS
// ─────────────────────────────────────────────────────────────────────────────

function _calcsHTML() {
  return `
    <div class="train-view">
      <div class="train-screen-header">
        <button class="btn-back" data-action="back-home" aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span class="section-label">Calculators</span>
        <span></span>
      </div>

      <div class="card" style="animation-delay:0ms">
        <div class="sec" style="margin-bottom:10px">Plate Calculator</div>
        <div class="form-row form-row-2col">
          <div class="field">
            <label class="field-label" for="calc-bar">Bar <span class="field-unit">lbs</span></label>
            <input type="number" id="calc-bar" class="field-input" value="45" inputmode="decimal" aria-label="Bar weight">
          </div>
          <div class="field">
            <label class="field-label" for="calc-target">Target <span class="field-unit">lbs</span></label>
            <input type="number" id="calc-target" class="field-input" placeholder="225" inputmode="decimal" aria-label="Target weight">
          </div>
        </div>
        <button class="btn-primary" data-action="calc-plates">Calculate</button>
        <div id="plate-result" class="calc-result" hidden></div>
      </div>

      <div class="card" style="animation-delay:40ms">
        <div class="sec" style="margin-bottom:10px">Warm-up Ramp</div>
        <div class="form-row">
          <div class="field field-full">
            <label class="field-label" for="calc-working">Working Weight <span class="field-unit">lbs</span></label>
            <input type="number" id="calc-working" class="field-input" placeholder="225" inputmode="decimal" aria-label="Working weight">
          </div>
        </div>
        <button class="btn-primary" data-action="calc-warmup">Calculate</button>
        <div id="warmup-result" class="calc-result" hidden></div>
      </div>
    </div>`;
}

function _calcPlates() {
  const barEl    = document.getElementById('calc-bar');
  const targetEl = document.getElementById('calc-target');
  const result   = document.getElementById('plate-result');
  const bar      = parseFloat(barEl?.value) || 45;
  const target   = parseFloat(targetEl?.value);
  if (!target || isNaN(target)) { result.hidden = true; return; }

  const { perSide, total, achievable } = calc.plateSolution(target, bar);
  const plateHTML = perSide.length
    ? perSide.map(p => `<span class="plate-chip plate-${p >= 45 ? 'heavy' : p >= 25 ? 'mid' : 'light'}">${p}</span>`).join('')
    : '<span class="calc-note">Bar only</span>';

  result.hidden = false;
  result.innerHTML = `
    <div class="calc-plates-row">${plateHTML}</div>
    <div class="calc-total ${achievable ? '' : 'calc-note'}">
      ${achievable ? `Total: <strong>${total} lbs</strong> per side: ${perSide.join(' + ') || 'none'}` : `Can't achieve ${target} lbs exactly (nearest: ${total} lbs)`}
    </div>`;
}

function _calcWarmup() {
  const workingEl = document.getElementById('calc-working');
  const result    = document.getElementById('warmup-result');
  const working   = parseFloat(workingEl?.value);
  if (!working || isNaN(working)) { result.hidden = true; return; }

  const sets = calc.warmupSets(working);
  result.hidden = false;
  result.innerHTML = `
    <div class="warmup-list">
      ${sets.map((s, i) => `
        <div class="warmup-row">
          <span class="warmup-set sec">Set ${i + 1}</span>
          <span class="warmup-weight big-num num-md">${Math.round(s.weight)}</span>
          <span class="num-unit">lbs</span>
          <span class="warmup-sep">×</span>
          <span class="warmup-reps big-num num-md">${s.reps}</span>
          <span class="num-unit">reps</span>
          <span class="warmup-pct">${Math.round(s.pct * 100)}%</span>
        </div>`).join('')}
    </div>`;
}

// ── ─────────────────────────────────────────────────────────────────────────
// WORKOUT HISTORY
// ─────────────────────────────────────────────────────────────────────────────

// ── History swipe-to-delete ───────────────────────────────────────────────────

function _attachHistorySwipe() {
  const DELETE_W  = 76;
  const THRESHOLD = 28;

  document.querySelectorAll('#train-root .hist-item').forEach(item => {
    const card = item.querySelector('.hist-card');
    if (!card) return;

    let startX = 0, startY = 0, dragging = false, currentDx = 0;

    function isOpen() { return card.classList.contains('hist-card--open'); }

    function snapTo(x, instant = false) {
      card.style.transition = instant ? 'none' : 'transform 220ms cubic-bezier(0.25, 0.8, 0.25, 1)';
      card.style.transform  = `translateX(${x}px)`;
      if (x < -10) {
        card.classList.add('hist-card--open');
        _openSwipeCard = card;
      } else {
        card.classList.remove('hist-card--open');
        if (_openSwipeCard === card) _openSwipeCard = null;
      }
    }

    card.addEventListener('touchstart', e => {
      // Close any other open card first
      if (_openSwipeCard && _openSwipeCard !== card) {
        const prev = _openSwipeCard;
        prev.style.transition = 'transform 220ms cubic-bezier(0.25, 0.8, 0.25, 1)';
        prev.style.transform  = 'translateX(0)';
        prev.classList.remove('hist-card--open');
        _openSwipeCard = null;
      }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dragging  = false;
      currentDx = 0;
      card.style.transition = 'none';
    }, { passive: true });

    card.addEventListener('touchmove', e => {
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!dragging) {
        if (Math.abs(dy) > Math.abs(dx)) return; // vertical wins
        if (Math.abs(dx) > 6) dragging = true;
      }
      if (!dragging) return;
      currentDx = dx;
      const base    = isOpen() ? -DELETE_W : 0;
      const clamped = Math.max(-DELETE_W, Math.min(0, base + dx));
      card.style.transform = `translateX(${clamped}px)`;
    }, { passive: true });

    card.addEventListener('touchend', () => {
      if (!dragging) return;
      dragging = false;
      const base  = isOpen() ? -DELETE_W : 0;
      const final = Math.max(-DELETE_W, Math.min(0, base + currentDx));
      if (!isOpen() && final < -THRESHOLD)          snapTo(-DELETE_W);
      else if (isOpen() && final > -(DELETE_W - THRESHOLD)) snapTo(0);
      else if (isOpen())                             snapTo(-DELETE_W);
      else                                           snapTo(0);
    });

    // Suppress navigation tap when card is open; snap it shut instead
    card.addEventListener('click', e => {
      if (isOpen()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        snapTo(0);
      }
    });
  });
}

function _confirmDeleteWorkout(id) {
  _pendingDeleteId = id;
  // Snap open card shut before showing modal
  if (_openSwipeCard) {
    _openSwipeCard.style.transition = 'transform 220ms cubic-bezier(0.25, 0.8, 0.25, 1)';
    _openSwipeCard.style.transform  = 'translateX(0)';
    _openSwipeCard.classList.remove('hist-card--open');
    _openSwipeCard = null;
  }
  document.getElementById('delete-confirm-modal')?.remove();
  const modal = document.createElement('div');
  modal.id        = 'delete-confirm-modal';
  modal.className = 'delete-confirm-overlay';
  modal.innerHTML = `
    <div class="delete-confirm-sheet">
      <div class="delete-confirm-handle"></div>
      <div class="delete-confirm-title">Delete Workout?</div>
      <div class="delete-confirm-body sec">This cannot be undone.</div>
      <div class="delete-confirm-actions">
        <button class="delete-confirm-cancel-btn" data-action="confirm-delete-cancel">Cancel</button>
        <button class="delete-confirm-delete-btn" data-action="confirm-delete-yes">Delete</button>
      </div>
    </div>`;
  document.getElementById('screen-train').appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('delete-confirm-overlay--show'));
}

function _closeDeleteConfirm() {
  const modal = document.getElementById('delete-confirm-modal');
  if (!modal) return;
  modal.classList.remove('delete-confirm-overlay--show');
  modal.addEventListener('transitionend', () => modal.remove(), { once: true });
  _pendingDeleteId = null;
}

async function _deleteWorkout(id) {
  _closeDeleteConfirm();
  // Workout ids are string UUIDs assigned by db.put — never coerce to number.
  if (typeof id !== 'string' || !id) {
    console.warn('[training-tracker] _deleteWorkout aborted: invalid workout id', id);
    return;
  }
  await db.remove('workouts', id);
  _history       = _history.filter(w => w.id !== id);
  _openSwipeCard = null;
  if (_view === 'session-detail') {
    _historyWorkout = null;
    _view = 'history';
  }
  _render();
}

async function _navHistory() {
  const all = await db.getAll('workouts');
  _history = all
    .filter(w => w.durationSec != null)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
  _view = 'history';
  _render();
}

function _viewSession(id) {
  _historyWorkout = _history.find(w => w.id == id) || null;
  if (_historyWorkout) { _view = 'session-detail'; _render(); }
}

function _historyHTML() {
  if (!_history.length) {
    return `
      <div class="train-view">
        <div class="train-screen-header">
          <button class="btn-back" data-action="back-home" aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span class="section-label">History</span>
          <span></span>
        </div>
        <div class="train-empty">No completed workouts yet. Finish a session to see it here.</div>
      </div>`;
  }

  const cards = _history.map((w, delay) => {
    const vol   = _workoutVolume(w);
    const exCnt = (w.exercises || []).length;
    return `
      <div class="hist-item" style="animation:fadeUp 0.3s ease both;animation-delay:${delay * 20}ms">
        <div class="hist-delete-bg">
          <button class="hist-delete-btn" data-action="delete-workout" data-id="${w.id}" aria-label="Delete ${_esc(w.name)}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            Delete
          </button>
        </div>
        <button class="hist-card" data-action="view-session" data-id="${w.id}"
          aria-label="View ${_esc(w.name)}">
          <div class="hist-card-left">
            <div class="hist-date">${_fmtHistDate(w.date)}</div>
            <div class="hist-name">${_esc(w.name)}</div>
            <div class="hist-meta">${_fmtDurShort(w.durationSec)} · ${exCnt} exercise${exCnt !== 1 ? 's' : ''}</div>
          </div>
          <div class="hist-card-right">
            <div class="hist-vol">${_fmtVol(vol)}</div>
            <div class="hist-vol-unit sec">lbs</div>
            <svg class="hist-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </button>
      </div>`;
  }).join('');

  return `
    <div class="train-view">
      <div class="train-screen-header">
        <button class="btn-back" data-action="back-home" aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span class="section-label">History</span>
        <span></span>
      </div>
      <div class="hist-list">${cards}</div>
    </div>`;
}

function _sessionDetailHTML() {
  const w = _historyWorkout;
  if (!w) return '<div class="train-view"><div class="train-empty">Session not found.</div></div>';

  const totalVol  = _workoutVolume(w);
  const exBlocks  = (w.exercises || []).map(ex => _detailExBlockHTML(ex)).join('');

  return `
    <div class="train-view">
      <div class="train-screen-header">
        <button class="btn-back" data-action="back-history" aria-label="Back to history">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span class="section-label" style="font-size:14px">${_esc(w.name)}</span>
        <div class="session-detail-actions">
          <button class="btn-repeat-session" data-action="repeat-workout" data-id="${w.id}"
            aria-label="Repeat this workout">Repeat</button>
          <button class="btn-icon-sm btn-icon-danger btn-delete-session" data-action="delete-workout" data-id="${w.id}"
            aria-label="Delete this workout">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="session-detail-meta card" style="animation-delay:0ms">
        <div class="sdm-row">
          <span class="sdm-label sec">Date</span>
          <span class="sdm-val">${_fmtHistDateFull(w.date)}</span>
        </div>
        <div class="sdm-row">
          <span class="sdm-label sec">Duration</span>
          <span class="sdm-val">${_fmtDurShort(w.durationSec)}</span>
        </div>
        <div class="sdm-row">
          <span class="sdm-label sec">Total Volume</span>
          <span class="sdm-val sdm-vol">${totalVol > 0 ? totalVol.toLocaleString() + ' lbs' : '—'}</span>
        </div>
        ${w.notes ? `<div class="sdm-row sdm-notes"><span class="sdm-label sec">Notes</span><span class="sdm-val">${_esc(w.notes)}</span></div>` : ''}
      </div>

      <div class="detail-ex-list">${exBlocks}</div>
    </div>`;
}

function _detailExBlockHTML(ex) {
  const exDef  = _exMap[ex.exerciseId] || {};
  const name   = _esc(exDef.name || ex.exerciseName || '—');
  const muscle = _esc(exDef.primaryMuscle || '');
  const exVol  = (ex.sets || [])
    .filter(s => s.completed && (!s.setKind || s.setKind === 'weighted') && s.weight > 0 && s.reps > 0)
    .reduce((t, s) => t + s.weight * s.reps, 0);

  const setRows = (ex.sets || []).map((s, si) => {
    const typeColor = TYPE_CSS[s.type] || 'lime';
    const doneClass = s.completed ? 'dsr--done' : 'dsr--skipped';
    const prBadge   = s.isPR ? `<span class="pr-badge" title="PR">PR</span>` : '';
    const rpeStr    = s.rpe  ? `<span class="dsr-rpe sec">RPE ${s.rpe}</span>` : '';
    const dataStr   = _detailSetStr(s);

    return `
      <div class="detail-set-row ${doneClass}">
        <span class="dsr-num">${si + 1}</span>
        <span class="dsr-type stype-${typeColor}">${TYPE_LBL[s.type] || 'WK'}</span>
        <span class="dsr-data">${dataStr}</span>
        ${rpeStr}
        ${prBadge}
      </div>`;
  }).join('');

  const notesRow = ex.notes
    ? `<div class="detail-ex-notes"><span class="sec">Notes</span> ${_esc(ex.notes)}</div>`
    : '';

  return `
    <div class="detail-ex-block">
      <div class="detail-ex-header">
        <div class="detail-ex-info">
          <div class="detail-ex-name">${name}</div>
          ${muscle ? `<div class="detail-ex-muscle sec">${muscle}</div>` : ''}
        </div>
        ${exVol > 0 ? `<div class="detail-ex-vol"><span class="ex-vol-val">${_fmtVol(exVol)}</span><span class="sec"> lbs</span></div>` : ''}
      </div>
      <div class="detail-set-rows">${setRows}</div>
      ${notesRow}
    </div>`;
}

// ── History helpers ──

function _workoutVolume(workout) {
  let total = 0;
  for (const ex of (workout.exercises || [])) {
    for (const s of (ex.sets || [])) {
      if (s.completed && (!s.setKind || s.setKind === 'weighted') && s.weight > 0 && s.reps > 0)
        total += s.weight * s.reps;
    }
  }
  return total;
}

function _fmtVol(n) {
  if (!n) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

function _fmtDurShort(sec) {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function _fmtHistDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function _fmtHistDateFull(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}

// ── ─────────────────────────────────────────────────────────────────────────
// CSV IMPORT (Strong export format)
// ─────────────────────────────────────────────────────────────────────────────

function _csvHTML() {
  return `
    <div class="train-view">
      <div class="train-screen-header">
        <button class="btn-back" data-action="back-home" aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span class="section-label">Import from Strong</span>
        <span></span>
      </div>
      <div class="card" style="animation-delay:0ms">
        <div class="sec" style="margin-bottom:8px">Strong CSV Export</div>
        <p class="card-hint">In Strong → Profile → Export Workout Data. Select the exported CSV below.</p>
        <label class="csv-upload-label" for="csv-file-input">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
            <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
          </svg>
          <span>Select CSV file</span>
          <input type="file" id="csv-file-input" accept=".csv" style="display:none" aria-label="CSV file">
        </label>
        <button class="btn-primary" data-action="csv-import" style="margin-top:10px">Import</button>
      </div>
      <div id="csv-result" class="card" style="animation-delay:40ms;display:none"></div>
    </div>`;
}

async function _runCSV() {
  const fileInput = document.getElementById('csv-file-input');
  const resultEl  = document.getElementById('csv-result');
  if (!fileInput?.files?.length) {
    resultEl.style.display = 'block';
    resultEl.innerHTML = '<p class="form-feedback fb-error" style="margin:0">Select a CSV file first.</p>';
    return;
  }
  const text = await fileInput.files[0].text();
  try {
    const { workoutsImported, exercisesCreated } = await _parseStrongCSV(text);
    resultEl.style.display = 'block';
    resultEl.innerHTML = `
      <div class="form-feedback fb-success" style="margin:0">
        Imported ${workoutsImported} workout${workoutsImported !== 1 ? 's' : ''} · ${exercisesCreated} new exercise${exercisesCreated !== 1 ? 's' : ''} created.
      </div>`;
    await _reload();
  } catch (err) {
    resultEl.style.display = 'block';
    resultEl.innerHTML = `<div class="form-feedback fb-error" style="margin:0">Import failed: ${_esc(err.message)}</div>`;
  }
}

async function _parseStrongCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  const idx = {
    date:     headers.indexOf('Date'),
    wName:    headers.indexOf('Workout Name'),
    dur:      headers.indexOf('Duration'),
    exName:   headers.indexOf('Exercise Name'),
    setOrd:   headers.indexOf('Set Order'),
    weight:   headers.indexOf('Weight'),
    reps:     headers.indexOf('Reps'),
    distance: headers.indexOf('Distance'),
    seconds:  headers.indexOf('Seconds'),
    notes:    headers.indexOf('Notes'),
    wNotes:   headers.indexOf('Workout Notes'),
    wNum:     headers.indexOf('Workout #'),
    rpe:      headers.indexOf('RPE'),
  };

  const rows = lines.slice(1).map(l => _csvParseLine(l));

  // Group by Workout # (or date+name). Skip rows with all-zero data fields.
  const wMap = new Map();
  for (const row of rows) {
    if (row.length < 4) continue;
    const w = parseFloat(row[idx.weight])   || 0;
    const r = parseFloat(row[idx.reps])     || 0;
    const d = parseFloat(row[idx.distance]) || 0;
    const s = parseFloat(row[idx.seconds])  || 0;
    if (w === 0 && r === 0 && d === 0 && s === 0) continue;  // fully empty row
    if (s > 0  && w === 0 && r === 0 && d === 0) continue;  // rest timer artifact
    const key = (idx.wNum >= 0 && row[idx.wNum])
      ? row[idx.wNum]
      : `${row[idx.date]}__${row[idx.wName]}`;
    if (!wMap.has(key)) wMap.set(key, []);
    wMap.get(key).push(row);
  }

  let workoutsImported = 0;
  let exercisesCreated = 0;

  for (const [, wRows] of wMap) {
    const first   = wRows[0];
    const date    = _parseCSVDate(first[idx.date]);
    const wName   = first[idx.wName] || 'Imported Workout';
    const durSec  = _parseCSVDuration(first[idx.dur] || '');
    const wkNotes = (idx.wNotes >= 0 ? wRows.map(r => (r[idx.wNotes] || '').trim()).filter(Boolean)[0] : '') || '';

    const exByName = {};
    for (const row of wRows) {
      const name = row[idx.exName];
      if (!name) continue;
      if (!exByName[name]) exByName[name] = [];
      exByName[name].push(row);
    }

    const exercises = [];
    for (const [exName, exRows] of Object.entries(exByName)) {
      let exId = Object.values(_exMap).find(e => e.name.toLowerCase() === exName.toLowerCase())?.id;
      if (!exId) {
        const rec = await db.put('exercises', {
          name: exName, primaryMuscle: 'Other', secondaryMuscles: [], equipment: 'Other',
          isCustom: true, bestSet: null,
        });
        exId = rec.id;
        exercisesCreated++;
        await _reloadExercises();
      }

      const sets = exRows.map(row => {
        const w   = parseFloat(row[idx.weight])   || 0;
        const r   = parseInt(row[idx.reps], 10)   || 0;
        const d   = parseFloat(row[idx.distance]) || 0;
        const s   = parseFloat(row[idx.seconds])  || 0;
        const rpe = (idx.rpe >= 0 && row[idx.rpe]) ? parseFloat(row[idx.rpe]) || null : null;

        let setKind;
        if (d > 0 || (s > 0 && w === 0 && r === 0))  setKind = 'cardio';
        else if (s > 0 && w > 0)                       setKind = 'duration';
        else if (w === 0 && r > 0)                     setKind = 'reps_only';
        else                                            setKind = 'weighted';

        return {
          type: 'working', setKind,
          weight:   w || null,
          reps:     r || null,
          distance: d || null,
          seconds:  s || null,
          rpe,
          completed: true, isPR: false,
        };
      });

      if (!sets.length) continue;

      const exNotes = exRows.map(r => (r[idx.notes] || '').trim()).filter(Boolean).join('; ');
      exercises.push({ exerciseId: exId, exerciseName: exName, sets, notes: exNotes });

      for (const set of sets) {
        if (set.setKind === 'weighted' && set.weight > 0 && set.reps > 0) {
          await updateBestSet(exId, set.weight, set.reps, null);
        }
      }
    }

    if (!exercises.length) continue;
    await db.put('workouts', {
      date, templateId: null, name: wName, durationSec: durSec,
      notes: wkNotes, dayType: 'training', exercises,
    });
    workoutsImported++;
  }

  return { workoutsImported, exercisesCreated };
}

function _csvParseLine(line) {
  const cols = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cols.push(cur.trim());
  return cols;
}

function _parseCSVDate(str) {
  // Strong exports "2024-01-15 10:30:00" or "2024-01-15"
  return (str || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
}

function _parseCSVDuration(str) {
  // "1h 23m" or "83 mins" or "01:23:00"
  const hm = str.match(/(\d+)h\s*(\d+)m/i);
  if (hm) return parseInt(hm[1]) * 3600 + parseInt(hm[2]) * 60;
  const m  = str.match(/(\d+)\s*min/i);
  if (m)  return parseInt(m[1]) * 60;
  const ts = str.match(/(\d+):(\d+):(\d+)/);
  if (ts) return parseInt(ts[1]) * 3600 + parseInt(ts[2]) * 60 + parseInt(ts[3]);
  return 0;
}

// ── ─────────────────────────────────────────────────────────────────────────
// DB HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function _saveSessionToDB() {
  if (!_session) return;
  await db.put('workouts', {
    id: _session.workoutId,
    date: new Date().toISOString().slice(0, 10),
    templateId: _session.templateId,
    name: _session.name,
    durationSec: null,
    notes: _session.notes,
    dayType: 'training',
    exercises: _session.exercises,
  });
}

async function _reloadExercises() {
  const exList = await getAllExercises();
  _exMap = Object.fromEntries(exList.map(e => [e.id, e]));
}

async function _reloadTemplates() {
  _templates = await db.getAll('templates');
}

// ── ─────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function _fmtSecs(sec) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? (s > 0 ? `${m}m ${s}s` : `${m}m`) : `${s}s`;
}

function _detailSetStr(s) {
  switch (s.setKind) {
    case 'cardio':
      if (s.distance > 0 && s.seconds > 0) return `${s.distance} mi · ${_fmtSecs(s.seconds)}`;
      if (s.distance > 0) return `${s.distance} mi`;
      return _fmtSecs(s.seconds);
    case 'duration':
      return `${s.weight} lbs · ${_fmtSecs(s.seconds)}`;
    case 'reps_only':
      return `${s.reps} reps`;
    default: // weighted
      return (s.weight > 0 && s.reps > 0) ? `${s.weight} × ${s.reps}` : '—';
  }
}

function _fmtDuration(totalSec) {
  const s = Math.floor(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function _fmtTimer(sec) {
  const s = Math.ceil(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2,'0')}`;
}

function _fmtDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function _esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
