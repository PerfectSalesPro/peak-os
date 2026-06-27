// Unit tests for calc.js — run with: node test/calc.test.mjs
// All inputs and expected outputs are hard-coded known values.

import {
  leanMass, fatMass, rollingAvg7Day, weeklyDelta, rateOfLoss,
  projectedWeight, projectedBodyFatPct, weeksToGoal,
  estimate1RM, estimateXRM,
  setVolume, sessionVolume, muscleVolumeWeekly, volumeDelta,
  plateSolution, warmupSets,
  reconstitutionConcentration, unitsToDraw, halfLifeDecay, adherencePct,
  scaleMacros, sumMacros, netCarbs, dayTotals, proteinHitRate, calorieBalance,
} from '../js/calc.js';

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

function check(label, actual, expected, tol = 0.0001) {
  const ok = Math.abs(actual - expected) < tol;
  if (ok) { console.log(`  ✓  ${label}`); passed++; }
  else    {
    console.log(`  ✗  ${label}`);
    console.log(`       expected: ${expected}`);
    console.log(`       received: ${actual}`);
    failed++;
  }
}

function checkNull(label, actual) {
  if (actual === null) { console.log(`  ✓  ${label}`); passed++; }
  else { console.log(`  ✗  ${label} — expected null, got ${actual}`); failed++; }
}

function checkDeep(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log(`  ✓  ${label}`); passed++; }
  else {
    console.log(`  ✗  ${label}`);
    console.log(`       expected: ${JSON.stringify(expected)}`);
    console.log(`       received: ${JSON.stringify(actual)}`);
    failed++;
  }
}

function checkTrue(label, cond) {
  if (cond) { console.log(`  ✓  ${label}`); passed++; }
  else      { console.log(`  ✗  ${label}`); failed++; }
}

// Fixed date anchor so tests are deterministic regardless of when they run.
function d(offsetDays) {
  const base = new Date('2026-06-03T12:00:00Z');
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}

// ── Body composition ─────────────────────────────────────────────────────────
console.log('\n── Body composition ──');

check('leanMass(200, 20) = 160',    leanMass(200, 20),  160);
check('fatMass(200, 20) = 40',      fatMass(200, 20),    40);
check('leanMass(190, 15) = 161.5',  leanMass(190, 15), 161.5);
check('fatMass(190, 15) = 28.5',    fatMass(190, 15),   28.5);
check('leanMass + fatMass = weight', leanMass(185, 17) + fatMass(185, 17), 185, 0.0001);

// ── Rolling 7-day average ─────────────────────────────────────────────────────
console.log('\n── Rolling 7-day average ──');

const full7 = Array.from({ length: 7 }, (_, i) => ({ date: d(-i), weightLbs: 200 }));
check('7 entries all 200 → avg 200', rollingAvg7Day(full7), 200);

const sparse = [
  { date: d(0),  weightLbs: 204 },
  { date: d(-2), weightLbs: 202 },
  { date: d(-4), weightLbs: 200 },
];
check('3 entries {204, 202, 200} → avg 202', rollingAvg7Day(sparse), 202);

// Entry older than 7 days is excluded
const withOld = [
  { date: d(0),  weightLbs: 200 },
  { date: d(-8), weightLbs: 999 }, // outside 7-day window
];
check('Entry 8 days old is excluded from avg', rollingAvg7Day(withOld), 200);

checkNull('Empty entries → null', rollingAvg7Day([]));

// ── Weekly delta ──────────────────────────────────────────────────────────────
console.log('\n── Weekly delta ──');

check('200 this week vs 202 last week → delta -2',
  weeklyDelta([{ date: d(0), weightLbs: 200 }], [{ date: d(-7), weightLbs: 202 }]), -2);
check('Flat → delta 0',
  weeklyDelta([{ date: d(0), weightLbs: 200 }], [{ date: d(-7), weightLbs: 200 }]), 0);

// ── Rate of loss (linear regression over 4 weekly rolling avgs) ───────────────
console.log('\n── Rate of loss ──');

// 4 non-overlapping weeks: week 0 = 200 lbs, week 1 ago = 201, week 2 = 202, week 3 = 203
// Expected slope: exactly -1 lbs/week
const trendEntries = [];
for (let w = 0; w < 4; w++) {
  for (let day = 0; day < 7; day++) {
    trendEntries.push({ date: d(-(w * 7 + day)), weightLbs: 200 + w });
  }
}
check('Perfect -1 lb/week trend → rateOfLoss = -1', rateOfLoss(trendEntries), -1, 0.0001);

const flatEntries = Array.from({ length: 28 }, (_, i) => ({ date: d(-i), weightLbs: 200 }));
check('Flat 200 lbs for 28 days → rateOfLoss = 0', rateOfLoss(flatEntries), 0, 0.0001);

// ── Projections ───────────────────────────────────────────────────────────────
console.log('\n── Projections ──');

check('projectedWeight(200, -1, 4) = 196', projectedWeight(200, -1, 4), 196);
check('projectedWeight(200, -1, 0) = 200', projectedWeight(200, -1, 0), 200);
check('projectedWeight(200,  0, 10) = 200 (no loss)', projectedWeight(200, 0, 10), 200);

// 200 lb at 20% BF → fatMass=40, leanMass=160. Target 190 lb:
// fatAtTarget = 40 − (200−190) = 30; BF% = 30/190 × 100 ≈ 15.789
check('projectedBodyFatPct(40, 200, 190) ≈ 15.789%',
  projectedBodyFatPct(40, 200, 190), (30 / 190) * 100, 0.001);

check('weeksToGoal(200, 180, -1) = 20', weeksToGoal(200, 180, -1),  20);
check('weeksToGoal(200, 180, -2) = 10', weeksToGoal(200, 180, -2),  10);
check('weeksToGoal(200, 190, -0.5) = 20', weeksToGoal(200, 190, -0.5), 20);

// ── Strength — Brzycki & Epley ────────────────────────────────────────────────
console.log('\n── Strength (1RM) ──');

// Brzycki: weight × 36 / (37 − reps), reps ≤ 10
// 225 × 5: 225 × 36 / 32 = 253.125
check('Brzycki: 225 lb × 5 reps → 1RM = 253.125', estimate1RM(225, 5).oneRM, 253.125);
checkTrue('Brzycki formula label', estimate1RM(225, 5).formula === 'Brzycki');

// 135 × 10: 135 × 36 / 27 = 180
check('Brzycki: 135 lb × 10 reps → 1RM = 180', estimate1RM(135, 10).oneRM, 180);

// Epley: weight × (1 + reps/30), reps > 10
// 135 × 12: 135 × 1.4 = 189
check('Epley: 135 lb × 12 reps → 1RM = 189', estimate1RM(135, 12).oneRM, 189);
checkTrue('Epley formula label', estimate1RM(135, 12).formula === 'Epley');

// RPE-adjusted: 135 × 8 @ RPE 8 → RIR=2 → effectiveReps=10 → Brzycki: 135×36/27 = 180
check('RPE-adj: 135 lb × 8 @ RPE 8 → eff. 10 reps → 1RM = 180',
  estimate1RM(135, 8, true, 8).oneRM, 180);
checkTrue('RPE-adj formula = Brzycki (effectiveReps = 10)',
  estimate1RM(135, 8, true, 8).formula === 'Brzycki');

// ── xRM (Epley inversion) ─────────────────────────────────────────────────────
console.log('\n── xRM ──');

// estimateXRM(189, 12) = 189 / (1 + 12/30) = 189 / 1.4 = 135
check('estimateXRM(189, 12) = 135', estimateXRM(189, 12), 135);
// estimateXRM(180, 10) = 180 / (1 + 10/30) = 180 / 1.333… = 135
check('estimateXRM(180, 10) = 135', estimateXRM(180, 10), 135, 0.001);

// ── Training volume ───────────────────────────────────────────────────────────
console.log('\n── Training volume ──');

check('setVolume(225, 5) = 1125', setVolume(225, 5), 1125);

const sets = [
  { weight: 225, reps: 5, type: 'working' },
  { weight: 225, reps: 5, type: 'working' },
  { weight: 135, reps: 8, type: 'warmup'  },
];
check('sessionVolume: 2 working sets (excl warmup) = 2250', sessionVolume(sets),        2250);
check('sessionVolume: include warmup = 3330',               sessionVolume(sets, true), 3330);

const workouts = [{
  exercises: [{
    exerciseId: 'bench',
    sets: [
      { type: 'warmup',  weight: 135, reps: 8, completed: true },
      { type: 'working', weight: 225, reps: 5, completed: true },
      { type: 'working', weight: 225, reps: 5, completed: true },
    ],
  }],
}];
const exerciseDefs = {
  bench: { primaryMuscle: 'chest', secondaryMuscles: ['triceps', 'shoulders'] },
};
check('muscleVolumeWeekly: chest = 2250 (2 working sets, warmup excluded)',
  muscleVolumeWeekly(workouts, 'chest', exerciseDefs), 2250);
check('muscleVolumeWeekly: triceps (secondary) = 2250',
  muscleVolumeWeekly(workouts, 'triceps', exerciseDefs), 2250);
check('muscleVolumeWeekly: biceps (unrelated) = 0',
  muscleVolumeWeekly(workouts, 'biceps', exerciseDefs), 0);

check('volumeDelta(2250, 2000) = 250', volumeDelta(2250, 2000), 250);
check('volumeDelta(2000, 2000) = 0',   volumeDelta(2000, 2000), 0);

// ── Plate calculator ──────────────────────────────────────────────────────────
console.log('\n── Plate calculator ──');

// 225 lb: (225−45)/2 = 90 per side → [45, 45]
const p225 = plateSolution(225);
checkDeep('plateSolution(225) perSide = [45, 45]', p225.perSide, [45, 45]);
check('plateSolution(225) total = 225', p225.total, 225);
checkTrue('plateSolution(225) achievable', p225.achievable);

// 135 lb: (135−45)/2 = 45 per side → [45]
const p135 = plateSolution(135);
checkDeep('plateSolution(135) perSide = [45]', p135.perSide, [45]);
check('plateSolution(135) total = 135', p135.total, 135);

// 185 lb: (185−45)/2 = 70 per side → [45, 25]
const p185 = plateSolution(185);
checkDeep('plateSolution(185) perSide = [45, 25]', p185.perSide, [45, 25]);
check('plateSolution(185) total = 185', p185.total, 185);

// 95 lb: (95−45)/2 = 25 per side → [25]
const p95 = plateSolution(95);
checkDeep('plateSolution(95) perSide = [25]', p95.perSide, [25]);
check('plateSolution(95) total = 95', p95.total, 95);

// ── Warm-up ramp ──────────────────────────────────────────────────────────────
console.log('\n── Warm-up ramp ──');

const wu = warmupSets(225);
check('warmup set 0: 40% of 225 = 90',  wu[0].weight, 90);
check('warmup set 1: 60% of 225 = 135', wu[1].weight, 135);
check('warmup set 2: 80% of 225 = 180', wu[2].weight, 180);
check('warmup set 0: 8 reps',           wu[0].reps, 8);
check('warmup set 1: 5 reps',           wu[1].reps, 5);
check('warmup set 2: 3 reps',           wu[2].reps, 3);

const wu2 = warmupSets(300, [0.5, 0.75], [5, 3]);
check('custom warm-up: 50% of 300 = 150', wu2[0].weight, 150);
check('custom warm-up: 75% of 300 = 225', wu2[1].weight, 225);

// ── Peptides ──────────────────────────────────────────────────────────────────
console.log('\n── Peptides ──');

// 5 mg vial + 2 mL BAC water → 5000 mcg / 2 mL = 2500 mcg/mL
check('reconstitutionConcentration(5, 2) = 2500 mcg/mL',
  reconstitutionConcentration(5, 2), 2500);
check('reconstitutionConcentration(10, 2) = 5000 mcg/mL',
  reconstitutionConcentration(10, 2), 5000);

// 500 mcg dose at 2500 mcg/mL → 500 / (2500/100) = 500/25 = 20 U
check('unitsToDraw(500, 2500) = 20 units',
  unitsToDraw(500, 2500), 20);
// 250 mcg dose at 5000 mcg/mL → 250 / 50 = 5 U
check('unitsToDraw(250, 5000) = 5 units',
  unitsToDraw(250, 5000), 5);

// C(t) = dose × (½)^(t/half-life)
check('halfLifeDecay(100, 2, 2) = 50  (1 half-life)',  halfLifeDecay(100, 2, 2), 50);
check('halfLifeDecay(100, 4, 2) = 25  (2 half-lives)', halfLifeDecay(100, 4, 2), 25);
check('halfLifeDecay(100, 0, 2) = 100 (t=0)',          halfLifeDecay(100, 0, 2), 100);

check('adherencePct(14, 14) = 100', adherencePct(14, 14), 100);
check('adherencePct(7, 14)  = 50',  adherencePct(7, 14),   50);
check('adherencePct(0, 14)  = 0',   adherencePct(0, 14),    0);
checkNull('adherencePct(0, 0)  = null', adherencePct(0, 0));

// ── Nutrition (Stage 6) ─────────────────────────────────────────────────────

console.log('\nNutrition:');

// scaleMacros: 2 servings of a 100-kcal / 10P / 12C / 3F item
const scaled = scaleMacros({ kcal: 100, protein: 10, carbs: 12, fat: 3, fiber: 2 }, 2);
check('scaleMacros kcal  = 200', scaled.kcal, 200);
check('scaleMacros protein = 20', scaled.protein, 20);
check('scaleMacros fiber = 4',  scaled.fiber, 4);
check('scaleMacros missing micro → 0', scaled.sodium, 0);
check('scaleMacros half serving rounds', scaleMacros({ kcal: 101 }, 0.5).kcal, 50.5);

// sumMacros across two entries
const summed = sumMacros([
  { kcal: 200, protein: 20, carbs: 24, fat: 6 },
  { kcal: 150, protein: 5,  carbs: 30, fat: 2 },
]);
check('sumMacros kcal    = 350', summed.kcal, 350);
check('sumMacros protein = 25',  summed.protein, 25);
check('sumMacros carbs   = 54',  summed.carbs, 54);

// netCarbs floors at 0
check('netCarbs(30,8) = 22', netCarbs(30, 8), 22);
check('netCarbs(5,9)  = 0  (floored)', netCarbs(5, 9), 0);

// dayTotals across meal records each holding entries[]
const dt = dayTotals([
  { entries: [{ computedMacros: { kcal: 400, protein: 30 } }, { computedMacros: { kcal: 100, protein: 5 } }] },
  { entries: [{ computedMacros: { kcal: 600, protein: 45 } }] },
]);
check('dayTotals kcal    = 1100', dt.kcal, 1100);
check('dayTotals protein = 80',   dt.protein, 80);

// proteinHitRate
check('proteinHitRate(150,200) = 0.75', proteinHitRate(150, 200), 0.75);
checkNull('proteinHitRate(150,0) = null', proteinHitRate(150, 0));

// calorieBalance: intake − target (negative = deficit)
check('calorieBalance(1800,2000) = -200', calorieBalance(1800, 2000), -200);
check('calorieBalance(2200,2000) = 200',  calorieBalance(2200, 2000), 200);

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
