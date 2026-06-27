// Nutrition tracker — Nutrition tab UI controller (Stage 6).
// Views: diary | add | weekly | targets
//
// 60 / 30 / 10:
//   60% — macro/micro sums, net carbs, weekly split: calc.js (pure, tested).
//   30% — day-type selection + carb-cycle target switching: _resolveDayType().
//   10% — meal-scan photo estimate only: copy-to-Claude (free) or API-key path.
// The AI estimates foods + portions; the 60% engine sums every number.

import * as db   from './db.js';
import * as calc from './calc.js';

// ── Constants ──────────────────────────────────────────────────────────────

const SLOTS    = ['breakfast', 'lunch', 'dinner', 'snacks'];
const SLOT_LBL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// In-memory defaults — never written to the DB unless the user saves Targets.
// Editable placeholders, not clinical thresholds.
const DEFAULT_TARGETS = {
  trainingDay: { kcal: 2200, protein: 185, carbs: 230, fat: 60 },
  restDay:     { kcal: 1850, protein: 185, carbs: 120, fat: 65 },
  refeed:      { kcal: 2500, protein: 180, carbs: 320, fat: 55 },
};
const DEFAULT_WATER_OZ = 100;
const DEFAULT_FAST      = '16:8';

const DAYTYPE_TO_KEY = { training: 'trainingDay', rest: 'restDay', refeed: 'refeed' };
const DAYTYPE_LBL    = { training: 'Training Day', rest: 'Rest Day', refeed: 'Refeed' };

const MICROS = [
  { key: 'sodium',    label: 'Sodium',    unit: 'mg' },
  { key: 'fiber',     label: 'Fiber',     unit: 'g'  },
  { key: 'sugar',     label: 'Sugar',     unit: 'g'  },
  { key: 'potassium', label: 'Potassium', unit: 'mg' },
];

const OFF_FIELDS = 'product_name,brands,code,serving_size,serving_quantity,nutriments';

const SCAN_PROMPT =
  'You are a nutrition estimator. Identify the foods in this meal photo and estimate ' +
  'the portion of each. Respond with ONLY a JSON array, no prose, no markdown fences. ' +
  'Each element: {"name": string, "servings": number, "kcal": number, "protein": number, ' +
  '"carbs": number, "fat": number, "fiber": number, "sugar": number, "sodium": number, ' +
  '"potassium": number}. Macros are the TOTAL for the estimated portion (servings=1 unless ' +
  'the item is naturally counted, e.g. 2 eggs). Sodium and potassium in milligrams; ' +
  'everything else in grams except kcal. If unsure, give your best estimate.';

// ── State ──────────────────────────────────────────────────────────────────

let _view      = 'diary';
let _date      = _todayStr();
let _settings  = null;          // merged: raw record + in-memory target defaults
let _addMethod = 'search';
let _addSlot   = 'breakfast';
let _searchResults = [];
let _searchBusy    = false;
let _searchError   = false;     // true only when remote lookup failed AND nothing to show
let _svState       = {};        // per-result serving control: i → { amount, unit }
let _detailFood    = null;      // food open in the detail screen
let _detail        = null;      // { slot, amount, unit, qty }
let _detailDayType = null;      // resolved day type for the % preview
let _detailTargets = null;      // active targets for the % preview
let _scanItems     = [];        // review list from photo scan
let _scanImage     = null;      // { dataUrl, mediaType, b64 }
let _recog         = null;      // SpeechRecognition instance
let _cam           = null;      // { stream, reader, raf }
let _fastTickId    = null;
let _activeFast    = null;      // open fasting session record (cached)

// ── Init ─────────────────────────────────────────────────────────────────────

export async function initNutrition() {
  await _loadSettings();

  const screen = document.getElementById('screen-nutrition');
  if (!screen) return;
  screen.addEventListener('click',  _onClick);
  screen.addEventListener('input',  _onInput);
  screen.addEventListener('change', _onChange);

  window.addEventListener('peak:screen:nutrition', () => { _date = _todayStr(); _view = 'diary'; _render(); });
  window.addEventListener('peak:import:done', () => _renderHomeFuel());

  _render();
  _renderHomeFuel();
}

async function _loadSettings() {
  const raw = (await db.get('settings', 'user')) || { id: 'user' };
  _settings = {
    ...raw,
    targets: {
      trainingDay: raw.targets?.trainingDay || { ...DEFAULT_TARGETS.trainingDay },
      restDay:     raw.targets?.restDay     || { ...DEFAULT_TARGETS.restDay },
      refeed:      raw.targets?.refeed      || { ...DEFAULT_TARGETS.refeed },
    },
    waterTargetOz:    raw.waterTargetOz    ?? DEFAULT_WATER_OZ,
    fastingProtocol:  raw.fastingProtocol  || DEFAULT_FAST,
    exerciseCalories: raw.exerciseCalories || 'none',
    apiKey:           raw.apiKey || '',
    usdaApiKey:       raw.usdaApiKey || '',
  };
}

// ── 30% rules — day-type selection ───────────────────────────────────────────

async function _resolveDayType(date) {
  const ndRows = await db.getByDateRange('nutritionDays', 'date', date, date);
  const override = ndRows[0]?.dayTypeOverride;
  if (override) return override;

  const workouts = await db.getByDateRange('workouts', 'date', date, date);
  if (workouts.some(w => w.durationSec != null)) return 'training';

  const weekday   = WEEKDAYS[new Date(date + 'T12:00:00').getDay()];
  const templates = await db.getAll('templates');
  if (templates.some(t => (t.scheduleDays || []).includes(weekday))) return 'training';

  return 'rest';
}

function _targetsFor(dayType) {
  return _settings.targets[DAYTYPE_TO_KEY[dayType]] || _settings.targets.restDay;
}

// ── Event delegation ──────────────────────────────────────────────────────────

function _onClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const a = btn.dataset;

  switch (a.action) {
    // Navigation
    case 'nu-nav':          _view = a.view; _render(); break;
    case 'nu-date-prev':    _date = _offset(_date, -1); _render(); break;
    case 'nu-date-next':    _date = _offset(_date, +1); _render(); break;
    case 'nu-date-today':   _date = _todayStr(); _render(); break;

    // Day type
    case 'nu-set-daytype':  _setDayType(a.type); break;

    // Logging hub
    case 'nu-open-add':     _openAdd(a.slot || _addSlot); break;
    case 'nu-method':       _addMethod = a.method; _resetMethodState(); _render(); break;
    case 'nu-set-slot':     _addSlot = a.slot; _render(); break;

    // Search / lookup results → log
    case 'nu-search-run':   _runSearch(); break;
    case 'nu-log-result':   _logResult(+a.i); break;
    case 'nu-sv-step':      _stepServing(+a.i, +a.dir); break;
    case 'nu-open-detail':  _openDetail(+a.i); break;

    // Food detail screen
    case 'nu-detail-back':     _view = 'add'; _detailFood = null; _detail = null; _render(); break;
    case 'nu-detail-slot':     _detail.slot = a.slot; _addSlot = a.slot; _render(); break;
    case 'nu-detail-preset':   _applyDetailPreset(+a.idx); break;
    case 'nu-detail-qty-step': _detailQtyStep(+a.dir); break;
    case 'nu-detail-add':      _detailAdd(); break;

    // Barcode
    case 'nu-barcode-lookup': _barcodeLookup(); break;
    case 'nu-scan-start':     _startCamera(); break;
    case 'nu-scan-stop':      _stopCamera(); break;

    // Voice
    case 'nu-voice-start':    _startVoice(); break;
    case 'nu-voice-stop':     _stopVoice(); break;

    // Photo / AI
    case 'nu-photo-ai':       _scanWithAI(); break;
    case 'nu-photo-copy':     _copyScanPrompt(); break;
    case 'nu-photo-open':     window.open('https://claude.ai/new', '_blank'); break;
    case 'nu-photo-parse':    _parsePastedScan(); break;
    case 'nu-scan-log':       _logScanItem(+a.i); break;
    case 'nu-scan-log-all':   _logAllScanItems(); break;
    case 'nu-scan-drop':      _scanItems.splice(+a.i, 1); _renderMethodPanel(); break;

    // Custom / quick / favorites
    case 'nu-custom-save':    _saveCustomFood(a.then); break;
    case 'nu-quick-add':      _quickAdd(); break;
    case 'nu-fav-log':        _logFavorite(a.id); break;
    case 'nu-fav-toggle':     _toggleFavorite(a.id); break;

    // Diary item ops
    case 'nu-del-entry':      _deleteEntry(a.mid, a.eid); break;
    case 'nu-copy-day':       _copyDayForward(); break;

    // Water
    case 'nu-water-add':      _addWater(+a.oz); break;

    // Fasting
    case 'nu-fast-start':     _startFast(); break;
    case 'nu-fast-end':       _endFast(); break;

    // Targets
    case 'nu-targets-save':   _saveTargets(); break;
  }
}

function _onInput(e) {
  const el = e.target;
  if (el.id === 'nu-search-input') {
    clearTimeout(_searchDebounce);
    _searchDebounce = setTimeout(() => _runSearch(), 450);
  } else if (el.id && el.id.startsWith('nu-amt-')) {
    _onAmountInput(el);
  } else if (el.id === 'nu-detail-amt') {
    _detail.amount = parseFloat(el.value);
    el.step = _unitStep(_detail.unit);
    _syncPresetChips();
    _refreshDetailPreview();
  } else if (el.id === 'nu-detail-qty') {
    _detail.qty = parseFloat(el.value);
    _refreshDetailPreview();
  }
}
let _searchDebounce = null;

function _onChange(e) {
  const el = e.target;
  if (el.id === 'nu-photo-file') _onPhotoPicked(el.files[0]);
  else if (el.id && el.id.startsWith('nu-unit-')) _onUnitChange(el);
}

// ── Render dispatch ────────────────────────────────────────────────────────────

function _render() {
  const root = document.getElementById('nutrition-root');
  if (!root) return;
  // Tear down any live capture when leaving a panel.
  if (_view !== 'add' || _addMethod !== 'barcode') _stopCamera();
  if (_view !== 'add' || _addMethod !== 'voice')   _stopVoice();
  if (_view !== 'diary') _stopFastTick();

  switch (_view) {
    case 'diary':   _renderDiary();   break;
    case 'add':     _renderAdd();     break;
    case 'detail':  _renderDetail();  break;
    case 'weekly':  _renderWeekly();  break;
    case 'targets': root.innerHTML = _targetsHTML(); break;
  }
  _renderHomeFuel();
}

function _tabs() {
  const t = [['diary', 'Today'], ['weekly', 'Weekly'], ['targets', 'Targets']];
  return `<div class="nu-tabs">${t.map(([v, l]) =>
    `<button class="nu-tab ${_view === v ? 'nu-tab--on' : ''}" data-action="nu-nav" data-view="${v}">${l}</button>`
  ).join('')}</div>`;
}

// ── DIARY ──────────────────────────────────────────────────────────────────────

async function _renderDiary() {
  const root = document.getElementById('nutrition-root');
  const [meals, dayType, nd, fast] = await Promise.all([
    db.getByDateRange('meals', 'date', _date, _date),
    _resolveDayType(_date),
    db.getByDateRange('nutritionDays', 'date', _date, _date),
    _getActiveFast(),
  ]);

  const targets = _targetsFor(dayType);
  const totals  = calc.dayTotals(meals);
  const water   = nd[0]?.waterOz || 0;

  root.innerHTML = [
    _tabs(),
    _dateBar(dayType),
    _summaryCard(totals, targets),
    _waterCard(water),
    _fastCard(fast),
    _mealsHTML(meals),
    _diaryFooter(),
  ].join('');

  if (fast) _startFastTick();
}

function _dateBar(dayType) {
  const isToday = _date === _todayStr();
  return `
    <div class="nu-datebar">
      <button class="nu-arrow" data-action="nu-date-prev" aria-label="Previous day">‹</button>
      <div class="nu-date-center">
        <button class="nu-date-label" data-action="nu-date-today">${_fmtDate(_date)}</button>
        <div class="nu-daytype-row">
          ${_dayTypePill(dayType)}
          <div class="nu-daytype-set">
            ${['training', 'rest', 'refeed'].map(t =>
              `<button class="nu-dt-btn ${dayType === t ? 'nu-dt-btn--on' : ''}" data-action="nu-set-daytype" data-type="${t}">${t === 'refeed' ? 'Refeed' : t[0].toUpperCase() + t.slice(1)}</button>`
            ).join('')}
          </div>
        </div>
      </div>
      <button class="nu-arrow ${isToday ? 'nu-arrow--off' : ''}" data-action="nu-date-next" aria-label="Next day" ${isToday ? 'disabled' : ''}>›</button>
    </div>`;
}

function _dayTypePill(dayType) {
  const cls = dayType === 'rest' ? 'p-dim' : dayType === 'refeed' ? 'p-amber' : 'p-lime';
  const dot = dayType === 'rest' ? '' : `<span class="dot ${dayType === 'refeed' ? 'dot-amber' : 'dot-lime'}"></span>`;
  return `<span class="pill ${cls}" style="margin:0">${dot}${DAYTYPE_LBL[dayType]}</span>`;
}

function _summaryCard(totals, targets) {
  const kcalLeft = Math.round((targets.kcal || 0) - totals.kcal);
  const net      = calc.netCarbs(totals.carbs, totals.fiber);
  const macros = [
    { k: 'protein', l: 'Protein', c: 'lime',  v: totals.protein, t: targets.protein },
    { k: 'carbs',   l: 'Carbs',   c: 'blue',  v: totals.carbs,   t: targets.carbs },
    { k: 'fat',     l: 'Fat',     c: 'amber', v: totals.fat,     t: targets.fat },
  ];
  const kcalPct = targets.kcal ? Math.min(100, (totals.kcal / targets.kcal) * 100) : 0;

  return `
    <div class="card" style="animation-delay:0ms">
      <div class="nu-cal-head">
        <div>
          <div class="sec">Calories</div>
          <div><span class="num-hero">${Math.round(totals.kcal)}</span><span class="num-unit">/ ${Math.round(targets.kcal || 0)} kcal</span></div>
        </div>
        <div class="nu-cal-left">
          <div class="num-lg" style="color:${kcalLeft < 0 ? 'var(--red)' : 'var(--lime)'}">${kcalLeft >= 0 ? kcalLeft : kcalLeft}</div>
          <div class="sec">${kcalLeft >= 0 ? 'Remaining' : 'Over'}</div>
        </div>
      </div>
      <div class="bar-track" style="margin:6px 0 14px"><div class="bar-fill bf-lime" style="width:${kcalPct}%"></div></div>

      <div class="nu-macro-grid">
        ${macros.map(m => _macroBar(m)).join('')}
      </div>

      <div class="nu-micro-row">
        <div class="nu-micro"><span class="nu-micro-v">${Math.round(net)}</span><span class="nu-micro-l">Net Carbs g</span></div>
        ${MICROS.map(mi => `<div class="nu-micro"><span class="nu-micro-v">${Math.round(totals[mi.key])}</span><span class="nu-micro-l">${mi.label} ${mi.unit}</span></div>`).join('')}
      </div>
    </div>`;
}

function _macroBar(m) {
  const pct  = m.t ? Math.min(100, (m.v / m.t) * 100) : 0;
  return `
    <div class="nu-macro">
      <div class="nu-macro-top">
        <span class="nu-macro-lbl">${m.l}</span>
        <span class="nu-macro-val"><b>${Math.round(m.v)}</b> / ${Math.round(m.t || 0)}g</span>
      </div>
      <div class="bar-track"><div class="bar-fill bf-${m.c}" style="width:${pct}%"></div></div>
    </div>`;
}

function _waterCard(oz) {
  const target = _settings.waterTargetOz || DEFAULT_WATER_OZ;
  const pct    = target ? Math.min(100, (oz / target) * 100) : 0;
  return `
    <div class="card" style="animation-delay:40ms">
      <div class="nu-row-between">
        <div class="sec" style="color:var(--blue)">Water</div>
        <div><span class="num-md" style="color:var(--blue)">${oz}</span><span class="num-unit">/ ${target} oz</span></div>
      </div>
      <div class="bar-track" style="margin:8px 0"><div class="bar-fill bf-blue" style="width:${pct}%"></div></div>
      <div class="nu-water-btns">
        <button class="nu-chip" data-action="nu-water-add" data-oz="-8">− 8</button>
        <button class="nu-chip nu-chip--blue" data-action="nu-water-add" data-oz="8">+ 8 oz</button>
        <button class="nu-chip nu-chip--blue" data-action="nu-water-add" data-oz="16">+ 16 oz</button>
      </div>
    </div>`;
}

function _fastCard(fast) {
  if (!fast) {
    return `
      <div class="card" style="animation-delay:60ms">
        <div class="nu-row-between">
          <div class="sec" style="color:var(--blue)">Fasting · ${_settings.fastingProtocol}</div>
          <span class="pill p-dim" style="margin:0">Not fasting</span>
        </div>
        <button class="btn-primary" style="margin-top:10px" data-action="nu-fast-start">Start Fast</button>
      </div>`;
  }
  const hours    = (Date.now() - new Date(fast.startedAt).getTime()) / 3.6e6;
  const target   = fast.targetHours || 16;
  const pct      = Math.min(100, (hours / target) * 100);
  const done     = hours >= target;
  return `
    <div class="card" style="animation-delay:60ms">
      <div class="nu-row-between">
        <div class="sec" style="color:var(--blue)">Fasting · ${fast.targetHours}:${24 - fast.targetHours}</div>
        <span class="pill ${done ? 'p-lime' : 'p-blue'}" style="margin:0">${done ? 'Goal reached' : 'Fasting'}</span>
      </div>
      <div class="nu-fast-time"><span class="num-hero" id="nu-fast-elapsed" style="color:var(--blue)">${_fmtDur(hours)}</span><span class="num-unit">/ ${target}h</span></div>
      <div class="bar-track" style="margin:4px 0 12px"><div class="bar-fill bf-blue" id="nu-fast-bar" style="width:${pct}%"></div></div>
      <button class="btn-primary" data-action="nu-fast-end">End Fast</button>
    </div>`;
}

function _mealsHTML(meals) {
  const bySlot = {};
  for (const m of meals) (bySlot[m.slot] = bySlot[m.slot] || []).push(m);

  return SLOTS.map(slot => {
    const recs    = bySlot[slot] || [];
    const entries = recs.flatMap(r => (r.entries || []).map(e => ({ ...e, _mid: r.id })));
    const sub     = calc.sumMacros(entries.map(e => e.computedMacros));
    return `
      <div class="card nu-meal" style="animation-delay:80ms">
        <div class="nu-meal-head">
          <span class="nu-meal-name">${SLOT_LBL[slot]}</span>
          <span class="nu-meal-sub">${Math.round(sub.kcal)} kcal · ${Math.round(sub.protein)}P ${Math.round(sub.carbs)}C ${Math.round(sub.fat)}F</span>
        </div>
        ${entries.length ? entries.map(e => _entryRow(e)).join('') : '<div class="nu-meal-empty">No items</div>'}
        <button class="nu-add-slot" data-action="nu-open-add" data-slot="${slot}">+ Add to ${SLOT_LBL[slot]}</button>
      </div>`;
  }).join('');
}

function _entryRow(e) {
  const cm = e.computedMacros;
  const name = e.foodSnapshot?.name || 'Item';
  const sv   = e.servings === 1 ? '' : `<span class="nu-entry-sv">×${_trim(e.servings)}</span>`;
  return `
    <div class="nu-entry">
      <div class="nu-entry-main">
        <div class="nu-entry-name">${_esc(name)} ${sv}</div>
        <div class="nu-entry-meta">${Math.round(cm.kcal)} kcal · ${Math.round(cm.protein)}P ${Math.round(cm.carbs)}C ${Math.round(cm.fat)}F · ${_fmtTime(e.loggedAt)}</div>
      </div>
      <button class="nu-entry-del" data-action="nu-del-entry" data-mid="${e._mid}" data-eid="${e.id}" aria-label="Remove ${_esc(name)}">✕</button>
    </div>`;
}

function _diaryFooter() {
  return `
    <div class="nu-foot">
      <button class="btn-primary" data-action="nu-open-add" data-slot="${_addSlot}">+ Log Food</button>
      <button class="nu-text-btn" data-action="nu-copy-day">Copy this day → tomorrow</button>
    </div>`;
}

// ── ADD HUB ────────────────────────────────────────────────────────────────────

function _openAdd(slot) {
  _addSlot = slot || _addSlot;
  _view = 'add';
  _resetMethodState();
  _render();
}

function _resetMethodState() {
  _searchResults = [];
  _searchError = false;
  _svState = {};
  _detailFood = null;
  _detail = null;
  _scanItems = [];
  _scanImage = null;
  _stopCamera();
  _stopVoice();
}

function _renderAdd() {
  const root = document.getElementById('nutrition-root');
  const methods = [
    ['search', 'Search'], ['barcode', 'Barcode'], ['voice', 'Voice'],
    ['photo', 'Photo'], ['custom', 'Custom'], ['favorites', 'Favorites'], ['quick', 'Quick'],
  ];
  root.innerHTML = `
    <div class="nu-add-head">
      <button class="nu-back" data-action="nu-nav" data-view="diary">‹ Diary</button>
      <span class="sec">Log Food</span>
    </div>
    <div class="nu-slotsel">
      ${SLOTS.map(s => `<button class="nu-slot-btn ${_addSlot === s ? 'nu-slot-btn--on' : ''}" data-action="nu-set-slot" data-slot="${s}">${SLOT_LBL[s]}</button>`).join('')}
    </div>
    <div class="nu-method-tabs">
      ${methods.map(([m, l]) => `<button class="nu-method ${_addMethod === m ? 'nu-method--on' : ''}" data-action="nu-method" data-method="${m}">${l}</button>`).join('')}
    </div>
    <div id="nu-method-panel"></div>`;
  _renderMethodPanel();
}

function _renderMethodPanel() {
  const el = document.getElementById('nu-method-panel');
  if (!el) return;
  switch (_addMethod) {
    case 'search':    el.innerHTML = _searchPanel();    break;
    case 'barcode':   el.innerHTML = _barcodePanel();   break;
    case 'voice':     el.innerHTML = _voicePanel();     break;
    case 'photo':     el.innerHTML = _photoPanel();     break;
    case 'custom':    el.innerHTML = _customPanel();    break;
    case 'favorites': el.innerHTML = _favoritesPanel(); _fillFavorites(); break;
    case 'quick':     el.innerHTML = _quickPanel();     break;
  }
}

// ── Search ─────────────────────────────────────────────────────────────────────

function _searchPanel() {
  return `
    <div class="card">
      <div class="nu-search-row">
        <input id="nu-search-input" class="field-input" placeholder="Search foods…" autocomplete="off" inputmode="search" aria-label="Search foods">
        <button class="nu-chip nu-chip--lime" data-action="nu-search-run">Go</button>
      </div>
      <p class="card-hint">${_settings.usdaApiKey ? 'USDA + Open Food Facts' : 'Open Food Facts'} + your custom foods. Best match first.</p>
    </div>
    <div id="nu-results">${_resultsHTML()}</div>`;
}

let _searchToken = 0;     // invalidates older/overlapping searches so a slow source can't clobber a newer query
let _loadingToast = null; // sticky "Loading more results…" toast during a background OFF retry

async function _runSearch() {
  const inp = document.getElementById('nu-search-input');
  const q = (inp?.value || '').trim();
  _svState = {};
  const token = ++_searchToken;     // every call supersedes any in-flight one
  _loadingToast?.dismissToast?.(); _loadingToast = null;   // drop any stale background-retry toast
  if (q.length < 2) { _searchResults = []; _searchError = false; _searchBusy = false; _fillResults(); return; }

  _searchBusy = true; _searchError = false; _searchResults = []; _fillResults();

  // Local custom foods first (fast, offline).
  let local = [];
  try { local = await _searchLocal(q); }
  catch (err) { console.warn('[Peak OS] local food search failed', err); }
  if (token !== _searchToken) return;   // a newer search started while we awaited

  const useUSDA = !!_settings.usdaApiKey;   // USDA only when the user has set a key
  const whole   = _isWholeFoodQuery(q);

  // Each remote source resolves independently. We re-paint as results arrive so a
  // slow/dead source (OFF's cgi is intermittently very slow) can never hold the
  // fast one — or the spinner — hostage. Both fetches are timeout-bounded below.
  let off = [], usda = [], offFailed = false, usdaFailed = false, offDone = false, usdaDone = !useUSDA;

  const paint = () => {
    if (token !== _searchToken) return;
    _searchResults = _rankResults(local, off, usda, whole);
    const allDone    = offDone && usdaDone;
    const allFailed  = offFailed && (!useUSDA || usdaFailed);
    _searchBusy  = !allDone && _searchResults.length === 0;   // spinner only until something shows / all settle
    _searchError = allDone && allFailed && _searchResults.length === 0;
    _fillResults();
  };

  const tasks = [
    _searchOFF(q)
      .then(r => { off = r; })
      .catch(e => { offFailed = true; console.warn('[Peak OS] Open Food Facts search failed', e); })
      .finally(() => { offDone = true; paint(); }),
  ];
  if (useUSDA) tasks.push(
    _searchUSDA(q)
      .then(r => { usda = r; })
      .catch(e => { usdaFailed = true; console.warn('[Peak OS] USDA search failed', e); })
      .finally(() => { usdaDone = true; paint(); })
  );

  await Promise.all(tasks);             // .catch on each → never rejects
  if (token !== _searchToken) return;

  // One toast summarizing any outage, after both sources have settled.
  const allFailed = offFailed && (!useUSDA || usdaFailed);
  if (allFailed) {
    _toast(_searchResults.length
      ? 'Showing your foods — food databases are unavailable'
      : 'Search failed — food databases are unavailable', _searchResults.length ? 'amber' : 'red');
  } else if (offFailed) {
    // OFF stumbled but USDA (or local) already gave us results. Don't surface a
    // failure — quietly try OFF once more in the background and merge it in if it
    // recovers. Only the final amber toast (if the retry also fails) tells the user.
    _retryOFFInBackground(q, token, local, usda, whole);
  } else if (usdaFailed) {
    _toast('Open Food Facts shown — USDA is unavailable (check key)', 'amber');
  }
}

// OFF failed its first pass but USDA carried the search. Wait a beat, try OFF once
// more, and if it recovers merge its results into what's already on screen — in
// ranked order, no clear, no spinner. A sticky "Loading more results…" toast marks
// the attempt; it's removed on success, or replaced with the amber notice on failure.
async function _retryOFFInBackground(q, token, local, usda, whole) {
  _loadingToast = _toast('Loading more results…', 'blue', { sticky: true });
  await _sleep(5000);
  if (token !== _searchToken) { _loadingToast?.dismissToast?.(); _loadingToast = null; return; }

  let off;
  try {
    off = await _searchOFF(q, 1);     // a single quiet attempt
  } catch (err) {
    console.warn('[Peak OS] Open Food Facts background retry failed', err);
    _loadingToast = null;             // replaced by the amber toast below
    if (token === _searchToken) _toast('USDA results shown — Open Food Facts is unavailable', 'amber');
    return;
  }
  if (token !== _searchToken) { _loadingToast?.dismissToast?.(); _loadingToast = null; return; }

  // Merge OFF in alongside the already-shown USDA + local results, re-ranked.
  _searchResults = _rankResults(local, off, usda, whole);
  _searchError = false;
  _fillResults();
  _loadingToast?.dismissToast?.(); _loadingToast = null;
}

// A "whole-food" query is a short, all-letters phrase ("chicken breast", "white
// rice") — the kind USDA Foundation/SR Legacy describes best. Numbers or long
// phrases usually mean a branded/packaged product, where OFF wins.
function _isWholeFoodQuery(q) {
  const words = q.trim().split(/\s+/);
  if (words.length > 3 || /\d/.test(q)) return false;
  return /^[a-zA-Z\s'-]+$/.test(q);
}

// Order the four buckets by query type, then dedupe by name+brand and cap at 30.
// Local custom foods always lead so the user's own entries win.
function _rankResults(local, off, usda, whole) {
  const isWhole   = f => f.usdaType === 'Foundation' || f.usdaType === 'SR Legacy';
  const usdaWhole = usda.filter(isWhole);
  const usdaOther = usda.filter(f => !isWhole(f));
  const ordered = whole
    ? [...local, ...usdaWhole, ...off, ...usdaOther]
    : [...local, ...off, ...usdaOther, ...usdaWhole];

  const seen = new Set();
  return ordered.filter(f => {
    const k = (f.name + '|' + (f.brand || '')).toLowerCase();
    if (seen.has(k)) return false; seen.add(k); return true;
  }).slice(0, 30);
}

async function _searchLocal(q) {
  const foods = await db.getAll('foods');
  const ql = q.toLowerCase();
  return foods.filter(f => (f.name || '').toLowerCase().includes(ql));
}

// Bound every food-API fetch. OFF's cgi endpoint intermittently stalls ~12s before
// failing; without this an attempt hangs that long. On timeout the request aborts
// with an AbortError, which the retry loops below treat like any other network drop.
const FETCH_TIMEOUT_MS = 5000;
function _fetchTimeout(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

// Open Food Facts full-text search. The cgi/search.pl endpoint gives the best
// relevance ranking and serves CORS `*`, but it's rate-limited and intermittently
// returns 503 (or, when the error page omits CORS, a hard fetch rejection). We retry
// transient failures with a short backoff; a 4xx or exhausted retries is a real error.
// (The newer /api/v2/search is steadier but ignores free-text relevance; Search-a-licious
//  ranks well but sends no Access-Control-Allow-Origin, so it's unusable from the browser.)
const OFF_SEARCH_ATTEMPTS = 3;

async function _searchOFF(q, attempts = OFF_SEARCH_ATTEMPTS) {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}` +
              `&search_simple=1&action=process&json=1&page_size=25&fields=${OFF_FIELDS}`;
  let lastErr;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt) await _sleep(300 * attempt);   // 0, 300, 600, 900ms
    let res;
    try {
      res = await _fetchTimeout(url);
    } catch (err) {
      lastErr = err;            // network drop, timeout, or CORS-less 5xx → retry
      continue;
    }
    if (res.status >= 500) { lastErr = new Error('OFF ' + res.status); continue; }  // transient → retry
    if (!res.ok) throw new Error('OFF ' + res.status);                              // 4xx → don't retry
    const data = await res.json();
    return (data.products || []).map(_foodFromOFF).filter(Boolean);
  }
  throw lastErr || new Error('OFF unavailable');
}

// USDA FoodData Central full-text search. Needs the user's free API key. Same
// retry-with-backoff posture as OFF: 5xx and 429 (rate limit) are transient and
// retried; a 403 (bad/over-quota key) or other 4xx is a real error and stops.
// Foundation + SR Legacy give the cleanest whole-food data; Branded rounds it out.
const USDA_SEARCH_ATTEMPTS = 4;

async function _searchUSDA(q) {
  const key = _settings.usdaApiKey;
  if (!key) return [];
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}` +
              `&query=${encodeURIComponent(q)}&pageSize=25` +
              `&dataType=${encodeURIComponent('Foundation,SR Legacy,Branded')}`;
  let lastErr;
  for (let attempt = 0; attempt < USDA_SEARCH_ATTEMPTS; attempt++) {
    if (attempt) await _sleep(300 * attempt);   // 0, 300, 600, 900ms
    let res;
    try {
      res = await _fetchTimeout(url);
    } catch (err) {
      lastErr = err;            // network drop or timeout → retry
      continue;
    }
    if (res.status >= 500 || res.status === 429) { lastErr = new Error('USDA ' + res.status); continue; }
    if (!res.ok) throw new Error('USDA ' + res.status);   // 403 bad key / other 4xx → don't retry
    const data = await res.json();
    return (data.foods || []).map(_foodFromUSDA).filter(Boolean);
  }
  throw lastErr || new Error('USDA unavailable');
}

function _resultsHTML() {
  if (_searchBusy)    return `<div class="card"><p class="nu-empty">Searching…</p></div>`;
  if (_searchError) {
    return `
      <div class="card nu-search-err">
        <p class="nu-empty" style="color:var(--amber)">Couldn’t reach the food databases.</p>
        <p class="card-hint" style="text-align:center">Check your connection — your custom foods still work offline.</p>
        <button class="nu-chip nu-chip--lime" style="width:100%;margin-top:8px" data-action="nu-search-run">Retry</button>
      </div>`;
  }
  if (!_searchResults.length) return `<div class="card"><p class="nu-empty">No results yet.</p></div>`;
  return `<div class="card nu-list">${_searchResults.map((f, i) => _resultRow(f, i)).join('')}</div>`;
}

function _resultRow(f, i) {
  const ps = f.perServing;
  const src = f.source === 'custom'        ? '<span class="nu-tag">custom</span>'
            : f.source === 'usda'          ? '<span class="nu-tag nu-tag--usda">USDA</span>'
            : f.source === 'openfoodfacts' ? '<span class="nu-tag nu-tag--off">OFF</span>'
            : '';
  return `
    <div class="nu-result nu-result--col">
      <button class="nu-result-tap" data-action="nu-open-detail" data-i="${i}" aria-label="Open ${_esc(f.name)} detail">
        <span class="nu-result-texts">
          <span class="nu-result-name">${_esc(f.name)} ${src}</span>
          <span class="nu-result-meta">${f.brand ? _esc(f.brand) + ' · ' : ''}${Math.round(ps.kcal)} kcal · ${Math.round(ps.protein)}P ${Math.round(ps.carbs)}C ${Math.round(ps.fat)}F · ${_esc(f.servingUnit)}</span>
        </span>
        <span class="nu-result-chev">›</span>
      </button>
      ${_servingControlHTML(f, i)}
    </div>`;
}

function _fillResults() { const el = document.getElementById('nu-results'); if (el) el.innerHTML = _resultsHTML(); }

async function _logResult(i) {
  const f = _searchResults[i];
  if (!f) return;
  const model = _servingModel(f);
  const st    = _ensureSv(i);
  const servings = _servingsFor(model, st);
  if (!servings || servings <= 0) { _toast('Enter an amount', 'amber'); return; }
  await _logFood(f, servings);
}

// ── Serving control — custom amount + unit, live macro recalc ───────────────────
//
// A food's macros (perServing) describe one native serving = `qty unit`
// (e.g. 240 ml, 100 g, or a generic "serving"). The control lets the user type
// any amount, optionally in an alternate unit of the same dimension, and recompute
// proportionally. We convert everything back to a fractional `servings` multiplier
// so the existing log pipeline (scaleMacros) is untouched.

// Canonical: mass → grams, volume → millilitres. `canon` converts 1 unit → canonical.
const UNIT_DEFS = {
  g:    { dim: 'mass',   canon: 1,       label: 'g'     },
  mg:   { dim: 'mass',   canon: 0.001,   label: 'mg'    },
  kg:   { dim: 'mass',   canon: 1000,    label: 'kg'    },
  oz:   { dim: 'mass',   canon: 28.3495, label: 'oz'    },
  lb:   { dim: 'mass',   canon: 453.592, label: 'lb'    },
  ml:   { dim: 'volume', canon: 1,       label: 'ml'    },
  cl:   { dim: 'volume', canon: 10,      label: 'cl'    },
  l:    { dim: 'volume', canon: 1000,    label: 'L'     },
  floz: { dim: 'volume', canon: 29.5735, label: 'fl oz' },
  cup:  { dim: 'volume', canon: 236.588, label: 'cup'   },
};
const MASS_PICK = ['g', 'oz'];
const VOL_PICK  = ['ml', 'floz', 'cup'];

// Alias patterns to find the number that sits next to a unit (e.g. the "28" in
// "1 serving (28 g)") rather than the leading count.
const UNIT_ALIASES = {
  g:    'g|gram',           mg:  'mg|milligram',  kg:  'kg|kilogram',
  oz:   'oz|ounce',         lb:  'lbs?|pound',
  ml:   'ml|millilit',      cl:  'cl',            l:   'l|liter|litre',
  floz: 'fl\\.?\\s*oz|fluid\\s*ounce',            cup: 'cup',
};

function _parseUnitToken(s) {
  const str = String(s || '').toLowerCase();
  if (/fl\.?\s*oz|fluid\s*ounce/.test(str)) return 'floz';
  if (/\bcups?\b/.test(str))                return 'cup';
  if (/\boz\b|ounce/.test(str))             return 'oz';
  if (/\bml\b|millilit/.test(str))          return 'ml';
  if (/\bcl\b/.test(str))                    return 'cl';
  if (/\b(l|liter|litre)\b/.test(str))       return 'l';
  if (/\bkg\b|kilogram/.test(str))           return 'kg';
  if (/\bmg\b|milligram/.test(str))          return 'mg';
  if (/\b(lbs?|pound)\b/.test(str))          return 'lb';
  if (/\bg\b|gram/.test(str))                return 'g';
  return null;   // generic / countable serving
}

// Build the serving model: selectable units + the default amount/unit.
function _servingModel(food) {
  const unitStr = food.servingUnit || '';
  const token   = _parseUnitToken(unitStr);
  // Prefer the number adjacent to the unit, then servingSize, then any number.
  let qty = NaN;
  if (token && UNIT_ALIASES[token]) {
    const adj = String(unitStr).match(new RegExp('([\\d.]+)\\s*(?:' + UNIT_ALIASES[token] + ')\\b', 'i'));
    if (adj) qty = parseFloat(adj[1]);
  }
  if (!isFinite(qty) || qty <= 0) qty = parseFloat(food.servingSize) || NaN;
  if (!isFinite(qty) || qty <= 0) { const m = String(unitStr).match(/[\d.]+/); qty = m ? parseFloat(m[0]) : 1; }
  if (!isFinite(qty) || qty <= 0) qty = 1;

  if (!token) {
    // No measurable unit — only whole/fractional servings make sense.
    return {
      canonicalQty: 1,
      units: [{ value: 'serving', label: (unitStr || 'serving'), factor: 1 }],
      def:   { amount: 1, unit: 'serving' },
    };
  }

  const def          = UNIT_DEFS[token];
  const canonicalQty = qty * def.canon;                 // grams or ml in one native serving
  const pick         = def.dim === 'mass' ? MASS_PICK : VOL_PICK;
  const units        = pick.map(u => ({ value: u, label: UNIT_DEFS[u].label, factor: UNIT_DEFS[u].canon }));
  units.push({ value: 'serving', label: '1 serving', factor: canonicalQty });

  const defUnit   = pick.includes(token) ? token : pick[0];
  const defAmount = canonicalQty / UNIT_DEFS[defUnit].canon;
  return { canonicalQty, units, def: { amount: +defAmount.toFixed(2), unit: defUnit } };
}

// Serving-size presets for the detail screen: the package serving plus the
// canonical units that apply to the food's dimension, then "1 serving".
function _servingPresets(food) {
  const model      = _servingModel(food);
  const nativeUnit = model.def.unit;
  const presets    = [{ amount: model.def.amount, unit: nativeUnit, label: _packageLabel(food) }];

  if (nativeUnit !== 'serving') {
    const dim = UNIT_DEFS[nativeUnit]?.dim;
    if (dim === 'mass') {
      presets.push({ amount: 1, unit: 'g', label: '1 g' });
      presets.push({ amount: 100, unit: 'g', label: '100 g' });
      presets.push({ amount: 1, unit: 'oz', label: '1 oz' });
    } else if (dim === 'volume') {
      presets.push({ amount: 1, unit: 'ml', label: '1 ml' });
      presets.push({ amount: 100, unit: 'ml', label: '100 ml' });
      presets.push({ amount: 1, unit: 'floz', label: '1 fl oz' });
      presets.push({ amount: 1, unit: 'cup', label: '1 cup' });
    }
    presets.push({ amount: 1, unit: 'serving', label: '1 serving' });
  }

  // Dedupe by amount+unit (package serving may coincide with a canonical chip).
  const seen = new Set();
  const deduped = presets.filter(p => {
    const k = p.amount + '|' + p.unit;
    if (seen.has(k)) return false; seen.add(k); return true;
  });
  return { model, presets: deduped, isGeneric: nativeUnit === 'serving' };
}

function _packageLabel(food) {
  return String(food.servingUnit || '').trim() || 'Serving';
}

function _unitLabel(unit) {
  if (unit === 'serving') return 'serving';
  return (UNIT_DEFS[unit] && UNIT_DEFS[unit].label) || unit;
}

// Fractional servings for the current {amount, unit}. Uniform across all units:
// each unit's `factor` is its size in canonical units, and the "serving" pseudo-unit
// has factor = canonicalQty, so amount×factor/canonicalQty collapses to amount.
function _servingsFor(model, st) {
  const u   = model.units.find(x => x.value === st.unit) || model.units[0];
  const amt = Number(st.amount);
  if (!isFinite(amt) || amt <= 0) return 0;
  return (amt * u.factor) / model.canonicalQty;
}

function _ensureSv(i) {
  if (!_svState[i]) _svState[i] = { ..._servingModel(_searchResults[i]).def };
  return _svState[i];
}

function _unitStep(unit) {
  return { g: 5, mg: 50, kg: 0.1, oz: 0.5, lb: 0.1, ml: 10, cl: 1, l: 0.1, floz: 1, cup: 0.25, serving: 0.25 }[unit] || 1;
}

function _servingControlHTML(food, i) {
  const model = _servingModel(food);
  const st    = _ensureSv(i);
  const cm    = calc.scaleMacros(food.perServing, _servingsFor(model, st));
  const multi = model.units.length > 1;
  return `
    <div class="nu-serv">
      <div class="nu-serv-ctrl">
        <button class="nu-step" data-action="nu-sv-step" data-i="${i}" data-dir="-1" aria-label="Decrease amount">−</button>
        <input class="nu-amt-input" id="nu-amt-${i}" type="number" inputmode="decimal" min="0" step="${_unitStep(st.unit)}" value="${_trim(st.amount)}" aria-label="Amount">
        <button class="nu-step" data-action="nu-sv-step" data-i="${i}" data-dir="1" aria-label="Increase amount">+</button>
        ${multi
          ? `<select class="nu-unit-sel" id="nu-unit-${i}" aria-label="Unit">
               ${model.units.map(u => `<option value="${u.value}" ${u.value === st.unit ? 'selected' : ''}>${_esc(u.label)}</option>`).join('')}
             </select>`
          : `<span class="nu-unit-fixed">${_esc(model.units[0].label)}</span>`}
      </div>
      <div class="nu-serv-bottom">
        <div class="nu-serv-out" id="nu-serv-out-${i}">${_servingMacroLine(cm)}</div>
        <button class="nu-chip nu-chip--lime nu-serv-add" data-action="nu-log-result" data-i="${i}">Add</button>
      </div>
    </div>`;
}

function _servingMacroLine(cm) {
  return `<b>${Math.round(cm.kcal)}</b> kcal · ${Math.round(cm.protein)}P ${Math.round(cm.carbs)}C ${Math.round(cm.fat)}F`;
}

function _refreshServingOut(i) {
  const food  = _searchResults[i];
  if (!food) return;
  const model = _servingModel(food);
  const cm    = calc.scaleMacros(food.perServing, _servingsFor(model, _ensureSv(i)));
  const out   = document.getElementById('nu-serv-out-' + i);
  if (out) out.innerHTML = _servingMacroLine(cm);
}

function _stepServing(i, dir) {
  const st   = _ensureSv(i);
  const step = _unitStep(st.unit);
  st.amount  = Math.max(0, +(((parseFloat(st.amount) || 0) + dir * step)).toFixed(2));
  const inp  = document.getElementById('nu-amt-' + i);
  if (inp) inp.value = _trim(st.amount);
  _refreshServingOut(i);
}

function _onAmountInput(el) {
  const i  = +el.id.slice('nu-amt-'.length);
  const st = _ensureSv(i);
  st.amount = parseFloat(el.value);
  _refreshServingOut(i);
}

// Switching units keeps the actual food quantity constant (macros unchanged) by
// converting the displayed amount, so the user can then round or edit it.
function _onUnitChange(el) {
  const i     = +el.id.slice('nu-unit-'.length);
  const model = _servingModel(_searchResults[i]);
  const st    = _ensureSv(i);
  const oldU  = model.units.find(u => u.value === st.unit)  || model.units[0];
  const newU  = model.units.find(u => u.value === el.value) || model.units[0];
  const amt   = Number(st.amount);
  st.amount = isFinite(amt) && amt > 0 ? +((amt * oldU.factor) / newU.factor).toFixed(2) : amt;
  st.unit   = newU.value;
  const inp  = document.getElementById('nu-amt-' + i);
  if (inp) { inp.value = _trim(st.amount); inp.step = _unitStep(st.unit); }
  _refreshServingOut(i);
}

// ── FOOD DETAIL SCREEN (MyFitnessPal-style) ─────────────────────────────────────

function _openDetail(i) {
  const f = _searchResults[i];
  if (!f) return;
  _detailFood = f;
  const { model } = _servingPresets(f);
  _detail = { slot: _addSlot, amount: model.def.amount, unit: model.def.unit, qty: 1 };
  _view = 'detail';
  _render();
}

async function _renderDetail() {
  const root = document.getElementById('nutrition-root');
  const f = _detailFood;
  if (!f || !_detail) { _view = 'add'; _render(); return; }

  _detailDayType = await _resolveDayType(_date);
  _detailTargets = _targetsFor(_detailDayType);

  const { presets } = _servingPresets(f);
  const src = f.source === 'custom' ? 'Custom'
            : f.source === 'usda' ? 'USDA FoodData Central' + (f.usdaType ? ' · ' + f.usdaType : '')
            : f.source === 'openfoodfacts' ? 'Open Food Facts'
            : (f.source || '');

  root.innerHTML = `
    <div class="nu-add-head">
      <button class="nu-back" data-action="nu-detail-back">‹ Back</button>
      <span class="sec">Food Detail</span>
    </div>

    <div class="card nu-detail">
      <div class="nu-detail-title">${_esc(f.name)}</div>
      <div class="nu-detail-sub">${f.brand ? _esc(f.brand) + ' · ' : ''}${_esc(src)}</div>
    </div>

    <div class="card">
      <div class="sec" style="margin-bottom:8px">Meal</div>
      <div class="nu-slotsel" style="padding:0">
        ${SLOTS.map(s => `<button class="nu-slot-btn ${_detail.slot === s ? 'nu-slot-btn--on' : ''}" data-action="nu-detail-slot" data-slot="${s}">${SLOT_LBL[s]}</button>`).join('')}
      </div>
    </div>

    <div class="card">
      <div class="sec" style="margin-bottom:8px">Serving Size</div>
      <div class="nu-chip-wrap">
        ${presets.map((p, idx) => `<button class="nu-szchip ${_isActivePreset(p) ? 'nu-szchip--on' : ''}" data-action="nu-detail-preset" data-idx="${idx}">${_esc(p.label)}</button>`).join('')}
      </div>
      <div class="nu-detail-amt-row">
        <input class="nu-amt-input" id="nu-detail-amt" type="number" inputmode="decimal" min="0" step="${_unitStep(_detail.unit)}" value="${_trim(_detail.amount)}" aria-label="Serving amount">
        <span class="nu-unit-fixed">${_esc(_unitLabel(_detail.unit))}</span>
      </div>
    </div>

    <div class="card">
      <div class="sec" style="margin-bottom:8px">Quantity</div>
      <div class="nu-serv-ctrl">
        <button class="nu-step" data-action="nu-detail-qty-step" data-dir="-1" aria-label="Decrease quantity">−</button>
        <input class="nu-amt-input" id="nu-detail-qty" type="number" inputmode="decimal" min="0" step="0.5" value="${_trim(_detail.qty)}" aria-label="Quantity">
        <button class="nu-step" data-action="nu-detail-qty-step" data-dir="1" aria-label="Increase quantity">+</button>
      </div>
    </div>

    <div class="card nu-detail-preview" id="nu-detail-preview">${_detailPreviewHTML()}</div>

    <div class="nu-detail-foot">
      <button class="btn-primary" id="nu-detail-add-btn" data-action="nu-detail-add">Add to ${SLOT_LBL[_detail.slot]}</button>
    </div>`;
}

function _detailServings() {
  const { model } = _servingPresets(_detailFood);
  const base = _servingsFor(model, { amount: _detail.amount, unit: _detail.unit });
  return base * (Number(_detail.qty) || 0);
}

function _detailPreviewHTML() {
  const cm = calc.scaleMacros(_detailFood.perServing, _detailServings());
  const t  = _detailTargets || {};
  const dtLabel = DAYTYPE_LBL[_detailDayType] || '';
  const cls = _detailDayType === 'rest' ? 'p-dim' : _detailDayType === 'refeed' ? 'p-amber' : 'p-lime';
  const kcalPct = t.kcal ? Math.round((cm.kcal / t.kcal) * 100) : null;
  const macros = [
    { l: 'Protein', v: cm.protein, t: t.protein, c: 'lime'  },
    { l: 'Carbs',   v: cm.carbs,   t: t.carbs,   c: 'blue'  },
    { l: 'Fat',     v: cm.fat,     t: t.fat,     c: 'amber' },
  ];
  return `
    <div class="nu-row-between" style="margin-bottom:10px">
      <div class="sec">Macro Preview</div>
      <span class="pill ${cls}" style="margin:0">${dtLabel} target</span>
    </div>
    <div class="nu-prev-hero">
      <div><span class="num-hero">${Math.round(cm.kcal)}</span><span class="num-unit">/ ${Math.round(t.kcal || 0)} kcal</span></div>
      <div class="nu-prev-pct">${kcalPct != null ? kcalPct + '% of target' : '—'}</div>
    </div>
    <div class="nu-prev-grid">
      ${macros.map(m => {
        const pct = m.t ? Math.round((m.v / m.t) * 100) : null;
        return `
        <div class="nu-prev-cell">
          <div class="nu-prev-val" style="color:var(--${m.c})">${Math.round(m.v)}<span class="nu-prev-unit">g</span></div>
          <div class="nu-prev-lbl">${m.l}</div>
          <div class="nu-prev-pct">${pct != null ? pct + '%' : '—'}</div>
        </div>`;
      }).join('')}
    </div>`;
}

function _isActivePreset(p) {
  if (!_detail) return false;
  return _detail.unit === p.unit && Math.abs((Number(_detail.amount) || 0) - p.amount) < 1e-6;
}

function _refreshDetailPreview() {
  const el = document.getElementById('nu-detail-preview');
  if (el) el.innerHTML = _detailPreviewHTML();
}

function _syncPresetChips() {
  const { presets } = _servingPresets(_detailFood);
  document.querySelectorAll('.nu-szchip').forEach((el, idx) => {
    if (presets[idx]) el.classList.toggle('nu-szchip--on', _isActivePreset(presets[idx]));
  });
}

function _applyDetailPreset(idx) {
  const { presets } = _servingPresets(_detailFood);
  const p = presets[idx];
  if (!p) return;
  _detail.amount = p.amount;
  _detail.unit   = p.unit;
  _render();   // re-render to update unit label, step, chip highlight, preview
}

function _detailQtyStep(dir) {
  if (!_detail) return;
  _detail.qty = Math.max(0, +(((parseFloat(_detail.qty) || 0) + dir * 0.5)).toFixed(2));
  const inp = document.getElementById('nu-detail-qty');
  if (inp) inp.value = _trim(_detail.qty);
  _refreshDetailPreview();
}

async function _detailAdd() {
  if (!_detailFood || !_detail) return;
  const servings = _detailServings();
  if (!servings || servings <= 0) { _toast('Enter a serving amount', 'amber'); return; }
  _addSlot = _detail.slot;
  const food = _detailFood;
  _detailFood = null; _detail = null;
  await _logFood(food, servings);   // logs to _addSlot, toasts, returns to diary
}

// ── Barcode ────────────────────────────────────────────────────────────────────

function _barcodePanel() {
  return `
    <div class="card">
      <div class="sec" style="margin-bottom:8px">Barcode</div>
      <div class="nu-search-row">
        <input id="nu-barcode-input" class="field-input" placeholder="Enter barcode number" inputmode="numeric" autocomplete="off" aria-label="Barcode">
        <button class="nu-chip nu-chip--lime" data-action="nu-barcode-lookup">Look up</button>
      </div>
      <p class="card-hint">Type the number, or scan with the camera below.</p>
      <button class="btn-primary" style="margin-top:8px" data-action="nu-scan-start">📷 Scan with camera</button>
      <div id="nu-cam-wrap"></div>
    </div>
    <div id="nu-results">${_resultsHTML()}</div>`;
}

async function _barcodeLookup(code) {
  const bc = code || (document.getElementById('nu-barcode-input')?.value || '').trim();
  if (!bc) return;
  _svState = {};
  _searchError = false;
  _searchBusy = true; _fillResults();
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(bc)}.json?fields=${OFF_FIELDS}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 1 && data.product) {
      const f = _foodFromOFF(data.product);
      _searchResults = f ? [f] : [];
      if (!f) _toast('Product has no nutrition data', 'amber');
    } else {
      _searchResults = [];
      _toast('Barcode not found in Open Food Facts', 'amber');
    }
  } catch (err) {
    console.warn(err); _searchResults = []; _toast('Lookup failed — check connection', 'red');
  }
  _searchBusy = false; _fillResults();
}

async function _startCamera() {
  const wrap = document.getElementById('nu-cam-wrap');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="nu-cam">
      <video id="nu-video" playsinline muted></video>
      <button class="nu-chip" style="margin-top:8px" data-action="nu-scan-stop">Stop camera</button>
    </div>`;
  const video = document.getElementById('nu-video');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    _cam = { stream, reader: null, raf: null };
    video.srcObject = stream;
    await video.play();

    if ('BarcodeDetector' in window) {
      const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
      const scan = async () => {
        if (!_cam) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length) { _onBarcodeDecoded(codes[0].rawValue); return; }
        } catch (_) {}
        _cam.raf = requestAnimationFrame(scan);
      };
      _cam.raf = requestAnimationFrame(scan);
    } else {
      // Fall back to ZXing, loaded lazily (only runs while online — OFF needs net too).
      try {
        const mod = await import('https://esm.run/@zxing/browser');
        const reader = new mod.BrowserMultiFormatReader();
        _cam.reader = reader;
        reader.decodeFromVideoElement(video, (result) => { if (result) _onBarcodeDecoded(result.getText()); });
      } catch (err) {
        console.warn('[Peak OS] ZXing load failed', err);
        wrap.insertAdjacentHTML('beforeend', `<p class="card-hint" style="color:var(--amber)">Live scanning isn't available here — type the barcode number above instead.</p>`);
      }
    }
  } catch (err) {
    console.warn('[Peak OS] camera denied', err);
    wrap.innerHTML = `<p class="card-hint" style="color:var(--amber)">Camera unavailable — type the barcode number above.</p>`;
  }
}

function _onBarcodeDecoded(code) {
  _stopCamera();
  const inp = document.getElementById('nu-barcode-input');
  if (inp) inp.value = code;
  _toast('Scanned ' + code, 'lime');
  _barcodeLookup(code);
}

function _stopCamera() {
  if (!_cam) return;
  try { _cam.raf && cancelAnimationFrame(_cam.raf); } catch (_) {}
  try { _cam.reader && _cam.reader.reset(); } catch (_) {}
  try { _cam.stream && _cam.stream.getTracks().forEach(t => t.stop()); } catch (_) {}
  _cam = null;
  const wrap = document.getElementById('nu-cam-wrap');
  if (wrap) wrap.innerHTML = '';
}

// ── Voice ──────────────────────────────────────────────────────────────────────

function _voicePanel() {
  const supported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  return `
    <div class="card">
      <div class="sec" style="margin-bottom:8px">Voice Log</div>
      ${supported
        ? `<button class="btn-primary" data-action="nu-voice-start">🎙 Start speaking</button>
           <p class="card-hint" id="nu-voice-status">Say a food, e.g. “two eggs and toast”. We’ll search it.</p>`
        : `<p class="card-hint" style="color:var(--amber)">Voice input isn’t supported in this browser. Use Search instead.</p>`}
    </div>
    <div id="nu-results">${_resultsHTML()}</div>`;
}

function _startVoice() {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return;
  _stopVoice();
  _recog = new Ctor();
  _recog.lang = 'en-US';
  _recog.interimResults = false;
  _recog.maxAlternatives = 1;
  const status = document.getElementById('nu-voice-status');
  if (status) status.textContent = 'Listening…';
  _recog.onresult = (ev) => {
    const text = ev.results[0][0].transcript;
    if (status) status.textContent = '“' + text + '”';
    _addMethod = 'search';
    _render();
    setTimeout(() => {
      const inp = document.getElementById('nu-search-input');
      if (inp) { inp.value = text; _runSearch(); }
    }, 60);
  };
  _recog.onerror = () => { if (status) status.textContent = 'Could not capture audio — try again or use Search.'; };
  _recog.onend = () => { _recog = null; };
  try { _recog.start(); } catch (_) {}
}

function _stopVoice() {
  if (_recog) { try { _recog.stop(); } catch (_) {} _recog = null; }
}

// ── Photo / meal scan (10% AI) ──────────────────────────────────────────────────

function _photoPanel() {
  const hasKey = !!_settings.apiKey;
  return `
    <div class="card">
      <div class="sec" style="margin-bottom:8px">Meal Scan</div>
      <label class="nu-file-label" for="nu-photo-file">📸 Choose / take a photo
        <input type="file" id="nu-photo-file" accept="image/*" capture="environment" hidden>
      </label>
      <div id="nu-photo-preview"></div>
      ${hasKey
        ? `<button class="btn-primary" style="margin-top:10px" data-action="nu-photo-ai" id="nu-photo-ai-btn" disabled>Estimate with Claude (API key)</button>`
        : ''}
      <div class="nu-or">${hasKey ? 'or free path' : 'Free path — copy to Claude'}</div>
      <button class="nu-chip nu-chip--lime" data-action="nu-photo-copy" id="nu-photo-copy-btn" disabled style="width:100%">1 · Copy prompt</button>
      <button class="nu-chip" data-action="nu-photo-open" style="width:100%;margin-top:6px">2 · Open Claude.ai (attach photo + paste prompt)</button>
      <textarea id="nu-photo-paste" class="json-textarea" rows="4" placeholder='3 · Paste Claude’s JSON answer here' style="margin-top:6px"></textarea>
      <button class="nu-chip nu-chip--lime" data-action="nu-photo-parse" style="width:100%;margin-top:6px">4 · Review items</button>
    </div>
    <div id="nu-scan-review">${_scanReviewHTML()}</div>`;
}

function _onPhotoPicked(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    _scanImage = { dataUrl, mediaType: file.type || 'image/jpeg', b64: String(dataUrl).split(',')[1] };
    const prev = document.getElementById('nu-photo-preview');
    if (prev) prev.innerHTML = `<img src="${dataUrl}" class="nu-photo-img" alt="Meal photo preview">`;
    const aiBtn = document.getElementById('nu-photo-ai-btn'); if (aiBtn) aiBtn.disabled = false;
    const cpBtn = document.getElementById('nu-photo-copy-btn'); if (cpBtn) cpBtn.disabled = false;
  };
  reader.readAsDataURL(file);
}

async function _copyScanPrompt() {
  try {
    await navigator.clipboard.writeText(SCAN_PROMPT);
    _toast('Prompt copied — paste it into Claude with your photo', 'lime');
  } catch (_) {
    _toast('Copy failed — select the prompt manually', 'amber');
  }
}

async function _scanWithAI() {
  if (!_scanImage || !_settings.apiKey) return;
  const btn = document.getElementById('nu-photo-ai-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Estimating…'; }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': _settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: _scanImage.mediaType, data: _scanImage.b64 } },
            { type: 'text', text: SCAN_PROMPT },
          ],
        }],
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || ('HTTP ' + res.status));
    if (data.stop_reason === 'refusal') throw new Error('The model declined this image.');
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    _scanItems = _parseScanJSON(text);
    if (!_scanItems.length) _toast('No items parsed — try the copy path', 'amber');
  } catch (err) {
    console.warn(err); _toast('AI estimate failed: ' + err.message, 'red');
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Estimate with Claude (API key)'; }
  _refreshScanReview();
}

function _parsePastedScan() {
  const txt = document.getElementById('nu-photo-paste')?.value || '';
  _scanItems = _parseScanJSON(txt);
  if (!_scanItems.length) _toast('Could not read JSON — check the pasted text', 'amber');
  _refreshScanReview();
}

function _parseScanJSON(text) {
  if (!text) return [];
  let t = text.trim().replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = t.indexOf('['); const end = t.lastIndexOf(']');
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1);
  try {
    const arr = JSON.parse(t);
    if (!Array.isArray(arr)) return [];
    return arr.map(o => ({
      name: String(o.name || 'Item'),
      servings: Number(o.servings) || 1,
      kcal: +o.kcal || 0, protein: +o.protein || 0, carbs: +o.carbs || 0, fat: +o.fat || 0,
      fiber: +o.fiber || 0, sugar: +o.sugar || 0, sodium: +o.sodium || 0, potassium: +o.potassium || 0,
    }));
  } catch (_) { return []; }
}

function _scanReviewHTML() {
  if (!_scanItems.length) return '';
  return `
    <div class="card nu-list">
      <div class="sec" style="margin-bottom:8px">Review estimate — edit servings, then log</div>
      ${_scanItems.map((it, i) => `
        <div class="nu-result">
          <div class="nu-result-info">
            <div class="nu-result-name">${_esc(it.name)}</div>
            <div class="nu-result-meta">${Math.round(it.kcal)} kcal · ${Math.round(it.protein)}P ${Math.round(it.carbs)}C ${Math.round(it.fat)}F</div>
          </div>
          <div class="nu-result-add">
            <input class="nu-sv-input" id="nu-scan-sv-${i}" type="number" step="0.25" min="0" value="${_trim(it.servings)}" inputmode="decimal" aria-label="Servings">
            <button class="nu-chip nu-chip--lime" data-action="nu-scan-log" data-i="${i}">Add</button>
            <button class="nu-chip" data-action="nu-scan-drop" data-i="${i}" aria-label="Drop">✕</button>
          </div>
        </div>`).join('')}
      <button class="btn-primary" style="margin-top:10px" data-action="nu-scan-log-all">Log all ${_scanItems.length} items</button>
    </div>`;
}

function _refreshScanReview() { const el = document.getElementById('nu-scan-review'); if (el) el.innerHTML = _scanReviewHTML(); }

function _scanItemToFood(it) {
  return {
    id: null, name: it.name, brand: '', servingSize: 1, servingUnit: 'portion',
    perServing: { kcal: it.kcal, protein: it.protein, carbs: it.carbs, fat: it.fat,
                  fiber: it.fiber, sugar: it.sugar, sodium: it.sodium, potassium: it.potassium },
    source: 'custom', isFavorite: false,
  };
}

async function _logScanItem(i) {
  const it = _scanItems[i]; if (!it) return;
  const sv = parseFloat(document.getElementById('nu-scan-sv-' + i)?.value) || it.servings || 1;
  await _logFood(_scanItemToFood(it), sv, /*silent*/ true);
  _scanItems.splice(i, 1);
  _refreshScanReview();
  _toast('Logged ' + it.name, 'lime');
}

async function _logAllScanItems() {
  for (let i = 0; i < _scanItems.length; i++) {
    const it = _scanItems[i];
    const sv = parseFloat(document.getElementById('nu-scan-sv-' + i)?.value) || it.servings || 1;
    await _logFood(_scanItemToFood(it), sv, true);
  }
  const n = _scanItems.length;
  _scanItems = [];
  _toast(`Logged ${n} items`, 'lime');
  _view = 'diary'; _render();
}

// ── Custom food ──────────────────────────────────────────────────────────────

function _customPanel() {
  const f = (id, lbl, ph, unit = '') => `
    <div class="field">
      <label class="field-label" for="cf-${id}">${lbl}${unit ? ` <span class="field-unit">${unit}</span>` : ''}</label>
      <input id="cf-${id}" class="field-input" type="${id === 'name' || id === 'unit' ? 'text' : 'number'}" inputmode="decimal" placeholder="${ph}">
    </div>`;
  return `
    <div class="card">
      <div class="sec" style="margin-bottom:10px">Create Custom Food</div>
      ${f('name', 'Name', 'Chicken breast')}
      <div class="form-row form-row-2col">${f('size', 'Serving size', '100', 'g')}${f('unit', 'Serving unit', 'g')}</div>
      <div class="form-row form-row-2col">${f('kcal', 'Calories', '165', 'kcal')}${f('protein', 'Protein', '31', 'g')}</div>
      <div class="form-row form-row-2col">${f('carbs', 'Carbs', '0', 'g')}${f('fat', 'Fat', '3.6', 'g')}</div>
      <div class="form-row form-row-2col">${f('fiber', 'Fiber', '0', 'g')}${f('sugar', 'Sugar', '0', 'g')}</div>
      <div class="form-row form-row-2col">${f('sodium', 'Sodium', '74', 'mg')}${f('potassium', 'Potassium', '256', 'mg')}</div>
      <div class="nu-water-btns" style="margin-top:6px">
        <button class="nu-chip" data-action="nu-custom-save" data-then="save">Save only</button>
        <button class="nu-chip nu-chip--lime" data-action="nu-custom-save" data-then="log">Save & log</button>
      </div>
    </div>`;
}

function _readCustomForm() {
  const v = id => document.getElementById('cf-' + id)?.value;
  const name = (v('name') || '').trim();
  if (!name) { _toast('Name is required', 'amber'); return null; }
  return {
    id: null, name, brand: '',
    servingSize: parseFloat(v('size')) || 1,
    servingUnit: (v('unit') || 'serving').trim() || 'serving',
    perServing: {
      kcal: +v('kcal') || 0, protein: +v('protein') || 0, carbs: +v('carbs') || 0, fat: +v('fat') || 0,
      fiber: +v('fiber') || 0, sugar: +v('sugar') || 0, sodium: +v('sodium') || 0, potassium: +v('potassium') || 0,
    },
    source: 'custom', isFavorite: false,
  };
}

async function _saveCustomFood(then) {
  const f = _readCustomForm();
  if (!f) return;
  const saved = await db.put('foods', f);
  if (then === 'log') {
    await _logFood(saved, 1);
  } else {
    _toast('Custom food saved', 'lime');
    _renderMethodPanel();
  }
}

// ── Favorites ────────────────────────────────────────────────────────────────

function _favoritesPanel() {
  return `<div id="nu-fav-list"><div class="card"><p class="nu-empty">Loading…</p></div></div>`;
}

async function _fillFavorites() {
  const el = document.getElementById('nu-fav-list');
  if (!el) return;
  const foods = (await db.getAll('foods')).filter(f => f.isFavorite);
  el.innerHTML = foods.length
    ? `<div class="card nu-list">${foods.map(f => `
        <div class="nu-result">
          <div class="nu-result-info">
            <div class="nu-result-name">${_esc(f.name)}</div>
            <div class="nu-result-meta">${Math.round(f.perServing.kcal)} kcal · ${Math.round(f.perServing.protein)}P · ${_esc(f.servingUnit)}</div>
          </div>
          <div class="nu-result-add">
            <button class="nu-chip nu-chip--lime" data-action="nu-fav-log" data-id="${f.id}">Add</button>
          </div>
        </div>`).join('')}</div>`
    : `<div class="card"><p class="nu-empty">No favorites yet. Star a food after logging it from Search.</p></div>`;
}

async function _logFavorite(id) {
  const f = await db.get('foods', id);
  if (f) await _logFood(f, 1);
}

async function _toggleFavorite(id) {
  const f = await db.get('foods', id);
  if (!f) return;
  f.isFavorite = !f.isFavorite;
  await db.put('foods', f);
}

// ── Quick add ────────────────────────────────────────────────────────────────

function _quickPanel() {
  const f = (id, lbl, ph, unit) => `
    <div class="field">
      <label class="field-label" for="qa-${id}">${lbl}${unit ? ` <span class="field-unit">${unit}</span>` : ''}</label>
      <input id="qa-${id}" class="field-input" type="number" inputmode="decimal" placeholder="${ph}">
    </div>`;
  return `
    <div class="card">
      <div class="sec" style="margin-bottom:10px">Quick Add — totals only</div>
      <div class="form-row form-row-2col">${f('kcal', 'Calories', '500', 'kcal')}${f('protein', 'Protein', '30', 'g')}</div>
      <div class="form-row form-row-2col">${f('carbs', 'Carbs', '50', 'g')}${f('fat', 'Fat', '15', 'g')}</div>
      <button class="btn-primary" style="margin-top:6px" data-action="nu-quick-add">Add to ${SLOT_LBL[_addSlot]}</button>
    </div>`;
}

async function _quickAdd() {
  const v = id => +document.getElementById('qa-' + id)?.value || 0;
  const food = {
    id: null, name: 'Quick add', brand: '', servingSize: 1, servingUnit: 'entry',
    perServing: { kcal: v('kcal'), protein: v('protein'), carbs: v('carbs'), fat: v('fat'),
                  fiber: 0, sugar: 0, sodium: 0, potassium: 0 },
    source: 'custom', isFavorite: false,
  };
  if (!food.perServing.kcal && !food.perServing.protein) { _toast('Enter at least calories', 'amber'); return; }
  await _logFood(food, 1);
}

// ── Logging core ─────────────────────────────────────────────────────────────

async function _logFood(food, servings, silent = false) {
  // Cache the food so re-logging and favorites work; reuse id when present.
  let foodId = food.id;
  if (!foodId) {
    const cached = await db.put('foods', { ...food, id: undefined });
    foodId = cached.id;
  } else {
    await db.put('foods', food);
  }

  const computed = calc.scaleMacros(food.perServing, servings);
  const entry = {
    id: crypto.randomUUID(),
    foodId,
    servings,
    loggedAt: new Date().toISOString(),
    computedMacros: computed,
    foodSnapshot: {
      name: food.name, brand: food.brand || '',
      servingSize: food.servingSize, servingUnit: food.servingUnit,
      perServing: food.perServing,
    },
  };

  // One meal record per (date, slot); append into entries[].
  const existing = (await db.getByDateRange('meals', 'date', _date, _date)).find(m => m.slot === _addSlot);
  if (existing) {
    existing.entries = [...(existing.entries || []), entry];
    await db.put('meals', existing);
  } else {
    await db.put('meals', { date: _date, slot: _addSlot, loggedAt: entry.loggedAt, entries: [entry] });
  }

  if (!silent) {
    _toast(`Logged to ${SLOT_LBL[_addSlot]}`, 'lime');
    _view = 'diary';
    _render();
  }
  _renderHomeFuel();
}

async function _deleteEntry(mealId, entryId) {
  const rec = await db.get('meals', mealId);
  if (!rec) return;
  rec.entries = (rec.entries || []).filter(e => e.id !== entryId);
  if (rec.entries.length) await db.put('meals', rec);
  else await db.remove('meals', mealId);
  _render();
}

async function _copyDayForward() {
  const meals = await db.getByDateRange('meals', 'date', _date, _date);
  if (!meals.length) { _toast('Nothing to copy', 'amber'); return; }
  const next = _offset(_date, 1);
  for (const m of meals) {
    const entries = (m.entries || []).map(e => ({ ...e, id: crypto.randomUUID(), loggedAt: new Date().toISOString() }));
    await db.put('meals', { date: next, slot: m.slot, loggedAt: new Date().toISOString(), entries });
  }
  _date = next;
  _toast('Copied to ' + _fmtDate(next), 'lime');
  _render();
}

// ── Water ────────────────────────────────────────────────────────────────────

async function _addWater(delta) {
  const rows = await db.getByDateRange('nutritionDays', 'date', _date, _date);
  const rec = rows[0] || { date: _date, waterOz: 0, dayTypeOverride: null };
  rec.waterOz = Math.max(0, (rec.waterOz || 0) + delta);
  await db.put('nutritionDays', rec);
  _render();
}

async function _setDayType(type) {
  const rows = await db.getByDateRange('nutritionDays', 'date', _date, _date);
  const rec = rows[0] || { date: _date, waterOz: 0, dayTypeOverride: null };
  // Tapping the already-active manual override clears it (back to auto).
  rec.dayTypeOverride = rec.dayTypeOverride === type ? null : type;
  await db.put('nutritionDays', rec);
  _render();
}

// ── Fasting ──────────────────────────────────────────────────────────────────

async function _getActiveFast() {
  const all = await db.getAll('fastingSessions');
  _activeFast = all.find(f => !f.endedAt) || null;
  return _activeFast;
}

async function _startFast() {
  const targetHours = parseInt(_settings.fastingProtocol, 10) || 16;
  await db.put('fastingSessions', { startedAt: new Date().toISOString(), endedAt: null, targetHours });
  _render();
}

async function _endFast() {
  const fast = await _getActiveFast();
  if (!fast) return;
  fast.endedAt = new Date().toISOString();
  await db.put('fastingSessions', fast);
  _stopFastTick();
  _render();
}

function _startFastTick() {
  _stopFastTick();
  _fastTickId = setInterval(_tickFast, 1000);
}
function _stopFastTick() { if (_fastTickId) { clearInterval(_fastTickId); _fastTickId = null; } }

function _tickFast() {
  if (!_activeFast) return;
  const hours = (Date.now() - new Date(_activeFast.startedAt).getTime()) / 3.6e6;
  const target = _activeFast.targetHours || 16;
  const elapsed = document.getElementById('nu-fast-elapsed');
  const bar = document.getElementById('nu-fast-bar');
  if (!elapsed) { _stopFastTick(); return; }
  elapsed.textContent = _fmtDur(hours);
  if (bar) bar.style.width = Math.min(100, (hours / target) * 100) + '%';
}

// ── WEEKLY ─────────────────────────────────────────────────────────────────────

async function _renderWeekly() {
  const root = document.getElementById('nutrition-root');
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const date = _offset(_todayStr(), -i);
    const [meals, dayType] = await Promise.all([
      db.getByDateRange('meals', 'date', date, date),
      _resolveDayType(date),
    ]);
    days.push({ date, dayType, totals: calc.dayTotals(meals), targets: _targetsFor(dayType), logged: meals.length > 0 });
  }

  const training = days.filter(d => d.dayType !== 'rest' && d.logged);
  const rest     = days.filter(d => d.dayType === 'rest' && d.logged);

  root.innerHTML = [
    _tabs(),
    `<div class="nu-add-head"><span class="sec">Last 7 days · training vs rest</span></div>`,
    _splitCard('Training Days', training, 'lime'),
    _splitCard('Rest Days', rest, 'amber'),
    _weekDaysCard(days),
  ].join('');
}

function _splitCard(title, days, color) {
  if (!days.length) {
    return `<div class="card"><div class="sec" style="color:var(--${color})">${title}</div><p class="nu-empty">No logged days yet.</p></div>`;
  }
  const avg = _avgTotals(days.map(d => d.totals));
  const tAvg = _avgTotals(days.map(d => d.targets));
  const proteinRate = calc.proteinHitRate(avg.protein, tAvg.protein);
  const balance = calc.calorieBalance(avg.kcal, tAvg.kcal);
  return `
    <div class="card">
      <div class="nu-row-between">
        <div class="sec" style="color:var(--${color})">${title} · ${days.length}</div>
        <span class="num-md">${Math.round(avg.kcal)}<span class="num-unit">avg kcal</span></span>
      </div>
      <div class="nu-split-stats">
        <div class="nu-split-stat"><div class="num-md">${Math.round(avg.kcal)}<span class="num-unit">/ ${Math.round(tAvg.kcal)}</span></div><div class="sec">Calories</div></div>
        <div class="nu-split-stat"><div class="num-md">${Math.round(avg.protein)}<span class="num-unit">/ ${Math.round(tAvg.protein)}g</span></div><div class="sec">Protein</div></div>
        <div class="nu-split-stat"><div class="num-md" style="color:${balance <= 0 ? 'var(--lime)' : 'var(--red)'}">${balance > 0 ? '+' : ''}${Math.round(balance)}</div><div class="sec">vs target</div></div>
        <div class="nu-split-stat"><div class="num-md">${proteinRate != null ? Math.round(proteinRate * 100) : '—'}<span class="num-unit">%</span></div><div class="sec">Protein hit</div></div>
      </div>
    </div>`;
}

function _weekDaysCard(days) {
  return `
    <div class="card nu-list">
      <div class="sec" style="margin-bottom:8px">By day</div>
      ${days.map(d => {
        const pct = d.targets.kcal ? Math.min(100, (d.totals.kcal / d.targets.kcal) * 100) : 0;
        const wd = WEEKDAYS[new Date(d.date + 'T12:00:00').getDay()];
        const c = d.dayType === 'rest' ? 'amber' : 'lime';
        return `
          <div class="nu-wkday">
            <div class="nu-wkday-name">${wd}<span class="nu-wkday-dt">${d.dayType[0].toUpperCase()}</span></div>
            <div class="nu-wkday-bar"><div class="bar-track"><div class="bar-fill bf-${c}" style="width:${pct}%"></div></div></div>
            <div class="nu-wkday-val">${d.logged ? Math.round(d.totals.kcal) : '—'}</div>
          </div>`;
      }).join('')}
    </div>`;
}

// ── TARGETS / SETTINGS ─────────────────────────────────────────────────────────

function _targetsHTML() {
  const t = _settings.targets;
  const grp = (key, label, color) => {
    const v = t[key];
    const f = (k, lbl, unit) => `
      <div class="field">
        <label class="field-label" for="tg-${key}-${k}">${lbl}${unit ? ` <span class="field-unit">${unit}</span>` : ''}</label>
        <input id="tg-${key}-${k}" class="field-input" type="number" inputmode="numeric" value="${v[k] ?? ''}">
      </div>`;
    return `
      <div class="card">
        <div class="sec" style="color:var(--${color});margin-bottom:10px">${label}</div>
        <div class="form-row form-row-2col">${f('kcal', 'Calories', 'kcal')}${f('protein', 'Protein', 'g')}</div>
        <div class="form-row form-row-2col">${f('carbs', 'Carbs', 'g')}${f('fat', 'Fat', 'g')}</div>
      </div>`;
  };
  return [
    _tabs(),
    `<div class="nu-add-head"><span class="sec">Carb-cycle targets</span></div>`,
    grp('trainingDay', 'Training Day', 'lime'),
    grp('restDay', 'Rest Day', 'amber'),
    grp('refeed', 'Refeed Day', 'blue'),
    `<div class="card">
      <div class="sec" style="margin-bottom:10px">Other</div>
      <div class="form-row form-row-2col">
        <div class="field">
          <label class="field-label" for="tg-water">Water target <span class="field-unit">oz</span></label>
          <input id="tg-water" class="field-input" type="number" inputmode="numeric" value="${_settings.waterTargetOz}">
        </div>
        <div class="field">
          <label class="field-label" for="tg-fast">Fasting (16:8…)</label>
          <input id="tg-fast" class="field-input" type="text" value="${_esc(_settings.fastingProtocol)}">
        </div>
      </div>
      <div class="field">
        <label class="field-label" for="tg-exc">Exercise calories</label>
        <select id="tg-exc" class="field-input">
          ${['none', 'partial', 'full'].map(o => `<option value="${o}" ${_settings.exerciseCalories === o ? 'selected' : ''}>Add back: ${o}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field-label" for="tg-key">Claude API key <span class="field-unit">optional — for auto meal scan</span></label>
        <input id="tg-key" class="field-input" type="password" placeholder="sk-ant-… (leave blank for copy-to-Claude)" value="${_esc(_settings.apiKey)}" autocomplete="off">
      </div>
      <p class="card-hint">The key stays on this device, only used to send a meal photo to Claude for an estimate. Leave blank to use the free copy-to-Claude path.</p>
      <div class="field" style="margin-top:12px">
        <label class="field-label" for="tg-usda-key">USDA FoodData Central key <span class="field-unit">optional — better whole-food search</span></label>
        <input id="tg-usda-key" class="field-input" type="password" placeholder="leave blank for Open Food Facts only" value="${_esc(_settings.usdaApiKey)}" autocomplete="off">
      </div>
      <p class="card-hint">Free key from <span style="color:var(--blue)">fdc.nal.usda.gov/api-key-signup</span>. Stored on this device. When set, food search also queries USDA — best for plain foods like “chicken breast” or “white rice.” Blank = Open Food Facts only.</p>
    </div>`,
    `<div style="padding:0 12px"><button class="btn-primary" data-action="nu-targets-save">Save Targets</button></div>`,
  ].join('');
}

async function _saveTargets() {
  const num = id => +document.getElementById(id)?.value || 0;
  const grab = key => ({
    kcal: num(`tg-${key}-kcal`), protein: num(`tg-${key}-protein`),
    carbs: num(`tg-${key}-carbs`), fat: num(`tg-${key}-fat`),
  });
  const raw = (await db.get('settings', 'user')) || { id: 'user' };
  const updated = {
    ...raw, id: 'user',
    targets: { trainingDay: grab('trainingDay'), restDay: grab('restDay'), refeed: grab('refeed') },
    waterTargetOz: num('tg-water') || DEFAULT_WATER_OZ,
    fastingProtocol: (document.getElementById('tg-fast')?.value || DEFAULT_FAST).trim(),
    exerciseCalories: document.getElementById('tg-exc')?.value || 'none',
    apiKey: (document.getElementById('tg-key')?.value || '').trim(),
    usdaApiKey: (document.getElementById('tg-usda-key')?.value || '').trim(),
  };
  await db.put('settings', updated);
  await _loadSettings();
  _toast('Targets saved', 'lime');
  _view = 'diary';
  _render();
}

// ── Home fuel badge (day-type always visible on Home) ───────────────────────────

async function _renderHomeFuel() {
  const el = document.getElementById('home-fuel');
  if (!el) return;
  const today = _todayStr();
  const [meals, dayType] = await Promise.all([
    db.getByDateRange('meals', 'date', today, today),
    _resolveDayType(today),
  ]);
  const totals  = calc.dayTotals(meals);
  const targets = _targetsFor(dayType);
  const kcalPct = targets.kcal ? Math.min(100, (totals.kcal / targets.kcal) * 100) : 0;
  const pPct    = targets.protein ? Math.min(100, (totals.protein / targets.protein) * 100) : 0;

  el.innerHTML = `
    <div class="card" style="animation-delay:40ms">
      <div class="nu-row-between">
        <div class="sec">Today’s Fuel</div>
        ${_dayTypePill(dayType)}
      </div>
      <div style="margin-top:8px">
        <div class="nu-macro-top"><span class="nu-macro-lbl">Calories</span><span class="nu-macro-val"><b>${Math.round(totals.kcal)}</b> / ${Math.round(targets.kcal || 0)}</span></div>
        <div class="bar-track"><div class="bar-fill bf-lime" style="width:${kcalPct}%"></div></div>
      </div>
      <div style="margin-top:8px">
        <div class="nu-macro-top"><span class="nu-macro-lbl">Protein</span><span class="nu-macro-val"><b>${Math.round(totals.protein)}</b> / ${Math.round(targets.protein || 0)}g</span></div>
        <div class="bar-track"><div class="bar-fill bf-lime" style="width:${pPct}%"></div></div>
      </div>
    </div>`;
}

// ── Open Food Facts → food normalizer ──────────────────────────────────────────

function _foodFromOFF(p) {
  const n = p.nutriments || {};
  const name = (p.product_name || '').trim();
  if (!name) return null;

  const num = v => { const x = parseFloat(v); return isFinite(x) ? x : null; };
  const servingQty = num(p.serving_quantity);          // grams in one serving
  const hasServing = servingQty || n['energy-kcal_serving'] != null || n.proteins_serving != null;

  const pick = (base) => {
    const sfx = hasServing ? '_serving' : '_100g';
    let kcal = num(n['energy-kcal' + sfx]);
    if (kcal == null) { const kj = num(n['energy' + sfx]); if (kj != null) kcal = kj / 4.184; }
    let sodium = num(n['sodium' + sfx]);                // grams
    if (sodium == null) { const salt = num(n['salt' + sfx]); if (salt != null) sodium = salt / 2.5; }
    return {
      kcal: Math.round(kcal || 0),
      protein: num(n['proteins' + sfx]) || 0,
      carbs: num(n['carbohydrates' + sfx]) || 0,
      fat: num(n['fat' + sfx]) || 0,
      fiber: num(n['fiber' + sfx]) || 0,
      sugar: num(n['sugars' + sfx]) || 0,
      sodium: Math.round((sodium || 0) * 1000),         // → mg
      potassium: Math.round((num(n['potassium' + sfx]) || 0) * 1000),
    };
  };

  const perServing = pick();
  if (!perServing.kcal && !perServing.protein && !perServing.carbs && !perServing.fat) return null;

  return {
    id: null,
    name,
    brand: (p.brands || '').split(',')[0].trim(),
    barcode: p.code || null,
    servingSize: hasServing ? (servingQty || 1) : 100,
    servingUnit: hasServing ? (p.serving_size || (servingQty ? servingQty + ' g' : 'serving')) : '100 g',
    perServing,
    source: 'openfoodfacts',
    isFavorite: false,
  };
}

// ── USDA FoodData Central → food normalizer ─────────────────────────────────────
// Search-endpoint nutrient values are per 100 g (Foundation/SR Legacy and Branded
// alike), so we normalize to a 100 g basis like OFF's no-serving path. Sodium and
// potassium already arrive in mg here (unlike OFF's grams), so no ×1000.
const USDA_NUTRIENT = { kcal: 1008, kj: 1062, protein: 1003, carbs: 1005, fat: 1004,
                        fiber: 1079, sugarA: 2000, sugarB: 1063, sodium: 1093, potassium: 1092 };

function _foodFromUSDA(p) {
  const name = (p.description || '').trim();
  if (!name) return null;

  const byId = {};
  for (const n of (p.foodNutrients || [])) {
    const id  = n.nutrientId ?? n.nutrient?.id;
    const val = n.value ?? n.amount;
    if (id != null && val != null && byId[id] == null) byId[id] = val;
  }
  const num = v => { const x = parseFloat(v); return isFinite(x) ? x : null; };
  const N = USDA_NUTRIENT;

  let kcal = num(byId[N.kcal]);
  if (kcal == null) { const kj = num(byId[N.kj]); if (kj != null) kcal = kj / 4.184; }

  const perServing = {
    kcal: Math.round(kcal || 0),
    protein: num(byId[N.protein]) || 0,
    carbs: num(byId[N.carbs]) || 0,
    fat: num(byId[N.fat]) || 0,
    fiber: num(byId[N.fiber]) || 0,
    sugar: num(byId[N.sugarA]) ?? num(byId[N.sugarB]) ?? 0,
    sodium: Math.round(num(byId[N.sodium]) || 0),         // already mg
    potassium: Math.round(num(byId[N.potassium]) || 0),   // already mg
  };
  if (!perServing.kcal && !perServing.protein && !perServing.carbs && !perServing.fat) return null;

  return {
    id: null,
    name,
    brand: (p.brandName || p.brandOwner || '').trim(),
    barcode: p.gtinUpc || null,
    servingSize: 100,
    servingUnit: '100 g',
    perServing,
    source: 'usda',
    usdaType: p.dataType || '',
    isFavorite: false,
  };
}

// ── Small utilities ────────────────────────────────────────────────────────────

function _toast(msg, color, opts) { return (window.peakShowToast || function(){})(msg, color, opts); }

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function _todayStr() { return new Date().toISOString().slice(0, 10); }

function _offset(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function _fmtDate(date) {
  if (date === _todayStr()) return 'Today';
  if (date === _offset(_todayStr(), -1)) return 'Yesterday';
  return new Date(date + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function _fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  catch (_) { return ''; }
}

function _fmtDur(hours) {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function _avgTotals(list) {
  const sum = calc.sumMacros(list);
  const out = {};
  for (const k of calc.MACRO_KEYS) out[k] = list.length ? sum[k] / list.length : 0;
  return out;
}

function _trim(n) { return Number.isInteger(n) ? String(n) : String(+(+n).toFixed(2)); }

function _esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
