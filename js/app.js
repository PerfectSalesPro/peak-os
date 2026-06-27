import * as db   from './db.js';
import * as calc  from './calc.js';
import { ingestPayload, decodeImportParam } from './health-import.js';
import { initBodyScreen } from './health-screen.js';
import { initBodyDashboard } from './body-dashboard.js';
import { initTrainingTracker } from './training-tracker.js';
import { migrateExerciseMuscles } from './training-data.js';
import { initNutrition } from './nutrition-tracker.js';

// Expose for later stages
window.peakDB   = db;
window.peakCalc = calc;

// ── Tab switching ─────────────────────────────────────────────────────────────

const tabs    = document.querySelectorAll('.tab');
const screens = document.querySelectorAll('.screen');

function activateTab(id) {
  tabs.forEach(t => {
    const hit = t.dataset.tab === id;
    t.classList.toggle('active', hit);
    t.setAttribute('aria-selected', hit ? 'true' : 'false');
  });
  screens.forEach(s => {
    s.classList.toggle('active', s.id === `screen-${id}`);
  });
  if (id === 'body')      window.dispatchEvent(new CustomEvent('peak:screen:body'));
  if (id === 'train')     window.dispatchEvent(new CustomEvent('peak:screen:train'));
  if (id === 'nutrition') window.dispatchEvent(new CustomEvent('peak:screen:nutrition'));
}

tabs.forEach(t => t.addEventListener('click', () => activateTab(t.dataset.tab)));

// ── DB init + URL import ──────────────────────────────────────────────────────

db.openDB()
  .then(() => {
    console.log('[Peak OS] DB ready');

    // iOS Shortcut delivers: {app-url}?import={base64url-encoded JSON}
    const params      = new URLSearchParams(location.search);
    const importParam = params.get('import');
    if (importParam) {
      // Clean URL before processing so the param doesn't persist on reload
      history.replaceState(null, '', location.pathname + (location.hash || ''));

      const raw = decodeImportParam(importParam);
      if (raw) {
        ingestPayload(raw, 'shortcut')
          .then(result => {
            showToast(`Synced ${_fmt(new Date())}`, 'blue');
            window.dispatchEvent(new CustomEvent('peak:import:done', { detail: result }));
          })
          .catch(err => showToast(`Import failed: ${err.message}`, 'red'));
      } else {
        showToast('Could not decode import payload.', 'red');
      }
    }

    migrateExerciseMuscles().then(({ assigned, stillOther }) => {
      if (assigned > 0 || stillOther.length > 0) {
        console.log(`[Peak OS] Muscle migration: ${assigned} assigned, ${stillOther.length} still Other`);
        if (stillOther.length) console.log('[Peak OS] Still Other:', stillOther);
      }
      // Init training tracker AFTER migration so analytics _loadData reads fresh muscles
      initTrainingTracker();
    });

    initBodyScreen();
    initBodyDashboard();
    initNutrition();
  })
  .catch(err => console.error('[Peak OS] DB init failed:', err));

// ── Toast notification ────────────────────────────────────────────────────────

function showToast(message, color = 'lime') {
  document.querySelector('.toast')?.remove();

  const el = document.createElement('div');
  el.className = `toast toast-${color}`;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = message;
  document.body.appendChild(el);

  requestAnimationFrame(() => el.classList.add('toast-show'));
  setTimeout(() => {
    el.classList.remove('toast-show');
    setTimeout(() => el.remove(), 300);
  }, 4000);
}

function _fmt(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

window.peakShowToast = showToast;

// ── Volume attribution diagnostic (DevTools: peakDebugVolume()) ───────────────

window.peakDebugVolume = async function(rangeDays = 7) {
  const [exercises, workouts] = await Promise.all([
    db.getAll('exercises'),
    db.getAll('workouts'),
  ]);

  const exMap = Object.fromEntries(exercises.map(e => [e.id, e]));

  const today     = new Date().toISOString().slice(0,10);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (rangeDays - 1));
  const startStr  = startDate.toISOString().slice(0,10);

  const weekWorkouts = workouts.filter(
    w => w.durationSec != null && w.date >= startStr && w.date <= today
  );

  console.log(`\n=== PEAK OS VOLUME AUDIT (${startStr} → ${today}) ===`);
  console.log(`Completed workouts in range: ${weekWorkouts.length}`);
  weekWorkouts.forEach(w => console.log(`  ${w.date} — ${w.name || 'Workout'}`));

  // Per-exercise volume breakdown
  const byExId = {};
  for (const workout of weekWorkouts) {
    for (const ex of workout.exercises || []) {
      const def = exMap[ex.exerciseId];
      if (!def) {
        console.warn(`  ⚠ Orphaned exerciseId ${ex.exerciseId} in workout ${workout.date}`);
        continue;
      }
      let vol = 0;
      for (const set of ex.sets || []) {
        if (set.type !== 'warmup' && set.completed) vol += (set.weight || 0) * (set.reps || 0);
      }
      if (!byExId[ex.exerciseId]) byExId[ex.exerciseId] = { name: def.name, muscle: def.primaryMuscle, vol: 0, isCustom: def.isCustom };
      byExId[ex.exerciseId].vol += vol;
    }
  }

  // Group by muscle
  const byMuscle = {};
  for (const item of Object.values(byExId)) {
    (byMuscle[item.muscle] = byMuscle[item.muscle] || []).push(item);
  }

  console.log('\n--- VOLUME BY MUSCLE ---');
  for (const [muscle, exList] of Object.entries(byMuscle).sort()) {
    const total = exList.reduce((s, e) => s + e.vol, 0);
    const flag  = muscle === 'Other' ? ' ← UNTAGGED' : '';
    console.log(`\n${muscle}: ${total.toLocaleString()} lbs${flag}`);
    exList.sort((a, b) => b.vol - a.vol)
          .forEach(e => console.log(`  ${e.vol > 0 ? e.vol.toLocaleString().padStart(7) : '      —'} lbs  ${e.name}${e.isCustom ? ' [csv]' : ''}`));
  }

  // Exercises with 0 volume (did they exist in this period?)
  const withVol   = Object.values(byExId).filter(e => e.vol > 0).length;
  const withZero  = Object.values(byExId).filter(e => e.vol === 0);
  console.log(`\nExercises with volume: ${withVol}  |  zero-volume logged: ${withZero.length}`);
  if (withZero.length) withZero.forEach(e => console.log(`  0 lbs: ${e.name} [${e.muscle}]`));

  // All exercises still tagged Other in the full exercises store
  const allOther = exercises.filter(e => e.primaryMuscle === 'Other');
  console.log(`\n--- ALL EXERCISES STILL TAGGED "Other" IN DB (${allOther.length}) ---`);
  allOther.forEach(e => console.log(`  [${e.isCustom ? 'csv' : 'builtin'}] ${e.name}`));

  return { weekWorkouts: weekWorkouts.length, byMuscle };
};

// ── Data export / import ──────────────────────────────────────────────────────

document.getElementById('btn-export-db')?.addEventListener('click', async () => {
  try {
    const json = await db.exportDB();
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `peak-os-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported ✓', 'lime');
  } catch (err) {
    showToast('Export failed: ' + err.message, 'red');
  }
});

document.getElementById('import-file-input')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    await db.importDB(text);
    showToast('Data imported ✓ — reloading…', 'lime');
    setTimeout(() => location.reload(), 1500);
  } catch (err) {
    showToast('Import failed: ' + err.message, 'red');
  }
});
