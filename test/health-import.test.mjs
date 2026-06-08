// Unit tests for health-import.js (pure functions only — no IndexedDB).
// Run with: node test/health-import.test.mjs

import { validatePayload, parsePayload, decodeImportParam } from '../js/health-import.js';

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

function check(label, actual, expected, tol = 0.0001) {
  const ok = Math.abs(actual - expected) < tol;
  if (ok) { console.log(`  ✓  ${label}`); passed++; }
  else {
    console.log(`  ✗  ${label}`);
    console.log(`       expected: ${expected}`);
    console.log(`       received: ${actual}`);
    failed++;
  }
}

function checkTrue(label, cond) {
  if (cond) { console.log(`  ✓  ${label}`); passed++; }
  else       { console.log(`  ✗  ${label}`); failed++; }
}

function checkFalse(label, cond) {
  checkTrue(label, !cond);
}

function checkNull(label, val) {
  checkTrue(label, val === null);
}

function checkUndefined(label, val) {
  checkTrue(label, val === undefined);
}

function checkEqual(label, actual, expected) {
  const ok = actual === expected;
  if (ok) { console.log(`  ✓  ${label}`); passed++; }
  else {
    console.log(`  ✗  ${label}`);
    console.log(`       expected: ${JSON.stringify(expected)}`);
    console.log(`       received: ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── Sample payload ────────────────────────────────────────────────────────────

const FULL_PAYLOAD = {
  schema: 'peakos.health.v1',
  date:   '2026-06-03',
  body: {
    weightLbs:  168.0,
    bodyFatPct: 16.2,
    hume: {
      muscleMassLbs:  126.4,
      visceralFatLevel: 6,
      bodyWaterPct:   58.4,
      boneMassLbs:    7.8,
      softLeanMassLbs: 133.6,
      waistHipRatio:  0.84,
    },
  },
  health: {
    hrvMs:         58,
    restingHr:     54,
    sleepHours:    7.4,
    activeCalories: 612,
    steps:         8400,
  },
};

// ── validatePayload ───────────────────────────────────────────────────────────
console.log('\n── validatePayload ──');

checkTrue('valid full payload', validatePayload(FULL_PAYLOAD).ok);

checkFalse('null input', validatePayload(null).ok);
checkFalse('number input', validatePayload(42).ok);
checkFalse('string input', validatePayload('{}').ok);

checkFalse('wrong schema', validatePayload({ schema: 'other.v1', date: '2026-06-03' }).ok);
checkFalse('missing schema', validatePayload({ date: '2026-06-03' }).ok);

checkFalse('missing date', validatePayload({ schema: 'peakos.health.v1' }).ok);
checkFalse('invalid date format MM-DD-YYYY',
  validatePayload({ schema: 'peakos.health.v1', date: '06-03-2026' }).ok);
checkFalse('invalid date format YYYY/MM/DD',
  validatePayload({ schema: 'peakos.health.v1', date: '2026/06/03' }).ok);

checkTrue('payload with no body block is valid (fields optional)',
  validatePayload({ schema: 'peakos.health.v1', date: '2026-06-03' }).ok);
checkTrue('payload with no health block is valid',
  validatePayload({ schema: 'peakos.health.v1', date: '2026-06-03', body: {} }).ok);

// Error messages
checkTrue('wrong schema error mentions expected schema',
  validatePayload({ schema: 'bad', date: '2026-06-03' }).error.includes('peakos.health.v1'));

// ── parsePayload ──────────────────────────────────────────────────────────────
console.log('\n── parsePayload (full payload) ──');

const { bodyEntry, healthEntry } = parsePayload(FULL_PAYLOAD);

checkEqual('bodyEntry.date',       bodyEntry.date, '2026-06-03');
checkEqual('bodyEntry.source',     bodyEntry.source, 'shortcut');
check('bodyEntry.weightLbs',       bodyEntry.weightLbs,  168.0);
check('bodyEntry.bodyFatPct',      bodyEntry.bodyFatPct, 16.2);

// leanMass = 168 × (1 − 0.162) = 168 × 0.838 = 140.784
check('bodyEntry.leanMassLbs recomputed',
  bodyEntry.leanMassLbs, 168 * (1 - 16.2 / 100), 0.01);
// fatMass  = 168 × 0.162 = 27.216
check('bodyEntry.fatMassLbs recomputed',
  bodyEntry.fatMassLbs, 168 * (16.2 / 100), 0.01);

// leanMass + fatMass must sum to weight
check('leanMass + fatMass = weight',
  bodyEntry.leanMassLbs + bodyEntry.fatMassLbs, 168.0, 0.01);

// Hume fields
check('hume.muscleMassLbs',      bodyEntry.hume.muscleMassLbs,   126.4);
check('hume.visceralFatLevel',   bodyEntry.hume.visceralFatLevel, 6);
check('hume.bodyWaterPct',       bodyEntry.hume.bodyWaterPct,    58.4);
check('hume.boneMassLbs',        bodyEntry.hume.boneMassLbs,      7.8);
check('hume.softLeanMassLbs',    bodyEntry.hume.softLeanMassLbs, 133.6);
check('hume.waistHipRatio',      bodyEntry.hume.waistHipRatio,    0.84, 0.001);

// Health entry
checkEqual('healthEntry.date',   healthEntry.date, '2026-06-03');
checkEqual('healthEntry.source', healthEntry.source, 'shortcut');
check('healthEntry.hrvMs',       healthEntry.hrvMs,         58);
check('healthEntry.restingHr',   healthEntry.restingHr,     54);
check('healthEntry.sleepHours',  healthEntry.sleepHours,    7.4);
check('healthEntry.activeCalories', healthEntry.activeCalories, 612);
check('healthEntry.steps',       healthEntry.steps,        8400);

// ── parsePayload — missing optional fields ────────────────────────────────────
console.log('\n── parsePayload (missing optional fields) ──');

const minPayload = { schema: 'peakos.health.v1', date: '2026-06-04' };
const { bodyEntry: bMin, healthEntry: hMin } = parsePayload(minPayload);

checkEqual('min: date stored', bMin.date, '2026-06-04');
checkUndefined('min: no weightLbs', bMin.weightLbs);
checkUndefined('min: no bodyFatPct', bMin.bodyFatPct);
checkUndefined('min: no leanMassLbs', bMin.leanMassLbs);
checkUndefined('min: no fatMassLbs', bMin.fatMassLbs);
checkUndefined('min: no hume block', bMin.hume);
checkUndefined('min: no hrvMs', hMin.hrvMs);
checkUndefined('min: no steps', hMin.steps);

// Weight but no BF → no lean/fat computed
const weightOnly = { schema: 'peakos.health.v1', date: '2026-06-04', body: { weightLbs: 170 } };
const { bodyEntry: bWO } = parsePayload(weightOnly);
check('weight-only: weightLbs stored', bWO.weightLbs, 170);
checkUndefined('weight-only: no leanMassLbs (BF missing)', bWO.leanMassLbs);

// Partial hume: only some fields present
const partialHume = {
  schema: 'peakos.health.v1',
  date:   '2026-06-04',
  body:   { weightLbs: 168, bodyFatPct: 16, hume: { muscleMassLbs: 126.5 } },
};
const { bodyEntry: bPH } = parsePayload(partialHume);
check('partial hume: muscleMassLbs stored', bPH.hume.muscleMassLbs, 126.5);
checkUndefined('partial hume: missing boneMassLbs not set', bPH.hume.boneMassLbs);

// ── parsePayload — source override ───────────────────────────────────────────
console.log('\n── parsePayload (source) ──');

const { bodyEntry: bSrc } = parsePayload(FULL_PAYLOAD, 'import');
checkEqual('source=import stored on bodyEntry', bSrc.source, 'import');

const { healthEntry: hSrc } = parsePayload(FULL_PAYLOAD, 'manual');
checkEqual('source=manual stored on healthEntry', hSrc.source, 'manual');

// ── decodeImportParam ─────────────────────────────────────────────────────────
console.log('\n── decodeImportParam ──');

// Encode a known payload and round-trip it
const encoded = Buffer.from(JSON.stringify(FULL_PAYLOAD)).toString('base64');
const decoded = decodeImportParam(encoded);
checkTrue('round-trip: schema preserved', decoded?.schema === 'peakos.health.v1');
checkTrue('round-trip: date preserved',   decoded?.date   === '2026-06-03');
checkTrue('round-trip: weightLbs preserved', decoded?.body?.weightLbs === 168);

// URL-safe base64 (replace + → - and / → _)
const urlSafe = encoded.replace(/\+/g, '-').replace(/\//g, '_');
const decodedSafe = decodeImportParam(urlSafe);
checkTrue('URL-safe base64: round-trip ok', decodedSafe?.schema === 'peakos.health.v1');

// Corrupt input → null (no throw)
checkNull('corrupt input → null', decodeImportParam('!!!not-base64!!!'));
checkNull('empty string → null', decodeImportParam(''));

// ── Summary ───────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n── Results ──────────────────────────────────`);
console.log(`   ${total} tests   ${passed} passed   ${failed} failed`);
if (failed > 0) {
  console.log('\n  FAILED — see above for details.');
  process.exit(1);
} else {
  console.log('\n  All tests passed ✓');
}
