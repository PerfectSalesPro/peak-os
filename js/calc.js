// Calc engine — pure functions, no DOM or DB coupling.
// Every formula from formulas.md. Sources: Brzycki (1993), Epley (1985).

// ── Body composition ──────────────────────────────────────────────────────────

export function leanMass(weightLbs, bodyFatPct) {
  return weightLbs * (1 - bodyFatPct / 100);
}

export function fatMass(weightLbs, bodyFatPct) {
  return weightLbs * (bodyFatPct / 100);
}

// entries: [{date: 'YYYY-MM-DD', weightLbs: number}, ...]
// Returns mean of entries in the 7-day window ending on the latest date.
// Gaps are ignored (not zero-filled).
export function rollingAvg7Day(entries) {
  if (!entries || !entries.length) return null;
  const sorted  = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const latest  = sorted[sorted.length - 1].date;
  const cutoff  = _offsetDate(latest, -6);
  const window7 = sorted.filter(e => e.date >= cutoff && e.date <= latest);
  if (!window7.length) return null;
  return window7.reduce((s, e) => s + e.weightLbs, 0) / window7.length;
}

// thisWeekEntries / lastWeekEntries: two separate 7-day entry arrays.
export function weeklyDelta(thisWeekEntries, lastWeekEntries) {
  const a = rollingAvg7Day(thisWeekEntries);
  const b = rollingAvg7Day(lastWeekEntries);
  if (a === null || b === null) return null;
  return a - b;
}

// entries: [{date, weightLbs}] spanning ~4 weeks.
// Returns slope in lbs/week (negative = losing weight).
// Computes weekly rolling averages at 4 evenly-spaced points, then fits a line.
export function rateOfLoss(entries) {
  if (!entries || entries.length < 2) return 0;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1].date;

  const points = [];
  for (let w = 0; w < 4; w++) {
    const weekEnd   = _offsetDate(latest, -w * 7);
    const weekStart = _offsetDate(weekEnd, -6);
    const slice     = sorted.filter(e => e.date >= weekStart && e.date <= weekEnd);
    if (slice.length > 0) {
      const avg = slice.reduce((s, e) => s + e.weightLbs, 0) / slice.length;
      points.push({ x: -w, y: avg });
    }
  }

  if (points.length < 2) return 0;
  return _slope(points);
}

// ── Projections ───────────────────────────────────────────────────────────────

export function projectedWeight(currentRollingAvg, rateOfLossPerWeek, tWeeks) {
  return currentRollingAvg + rateOfLossPerWeek * tWeeks;
}

// Assumes all weight lost comes from fat (lean mass held constant — the cut assumption).
// Label this assumption in any UI that displays this value.
export function projectedBodyFatPct(currentFatMass, currentWeight, targetWeight) {
  const fatAtTarget = currentFatMass - (currentWeight - targetWeight);
  return (fatAtTarget / targetWeight) * 100;
}

export function weeksToGoal(currentRollingAvg, goalWeight, rateOfLossPerWeek) {
  if (rateOfLossPerWeek === 0) return Infinity;
  return (currentRollingAvg - goalWeight) / Math.abs(rateOfLossPerWeek);
}

// ── Strength ──────────────────────────────────────────────────────────────────

// Returns { oneRM, formula: 'Brzycki'|'Epley' }.
// Brzycki (1993) for reps ≤ 10; Epley (1985) for reps > 10.
// With useRPE=true, adds reps-in-reserve (10 − rpe) to reps before estimating.
export function estimate1RM(weight, reps, useRPE = false, rpe = null) {
  let r = reps;
  if (useRPE && rpe !== null) r += (10 - rpe);
  if (r <= 10) {
    return { oneRM: weight * 36 / (37 - r), formula: 'Brzycki' };
  }
  return { oneRM: weight * (1 + r / 30), formula: 'Epley' };
}

// Invert Epley: given 1RM, estimate weight for targetReps.
export function estimateXRM(oneRM, targetReps) {
  return oneRM / (1 + targetReps / 30);
}

// ── Training volume ───────────────────────────────────────────────────────────

export function setVolume(weight, reps) {
  return weight * reps;
}

// sets: [{weight, reps, type}]
// Warmup sets excluded by default; pass includeWarmups=true to include them.
export function sessionVolume(sets, includeWarmups = false) {
  return sets
    .filter(s => includeWarmups || s.type !== 'warmup')
    .reduce((sum, s) => sum + s.weight * s.reps, 0);
}

// workouts: [{exercises:[{exerciseId, sets:[{type,weight,reps,completed}]}]}]
// exerciseDefs: { [exerciseId]: { primaryMuscle, secondaryMuscles: [], equipment } }
// includeBodyweight: when false, exercises with equipment==='Bodyweight' are excluded
export function muscleVolumeWeekly(workouts, muscleId, exerciseDefs, includeBodyweight = true) {
  let total = 0;
  for (const workout of workouts) {
    for (const ex of workout.exercises) {
      const def = exerciseDefs[ex.exerciseId];
      if (!def) continue;
      if (!includeBodyweight && def.equipment === 'Bodyweight') continue;
      const targets = def.primaryMuscle === muscleId ||
                      (def.secondaryMuscles || []).includes(muscleId);
      if (!targets) continue;
      for (const set of ex.sets) {
        if (set.type !== 'warmup' && set.completed) total += (set.weight || 0) * (set.reps || 0);
      }
    }
  }
  return total;
}

export function volumeDelta(thisWeekVolume, lastWeekVolume) {
  return thisWeekVolume - lastWeekVolume;
}

// ── Plate calculator ──────────────────────────────────────────────────────────

const DEFAULT_PLATES = [45, 35, 25, 10, 5, 2.5];

// Greedy largest-first fill.
// Returns { perSide: number[], total: number, achievable: boolean }
export function plateSolution(targetWeight, barWeight = 45, availablePlates = DEFAULT_PLATES) {
  const perSideTarget = (targetWeight - barWeight) / 2;
  if (perSideTarget < 0) return { perSide: [], total: barWeight, achievable: false };

  const plates    = [...availablePlates].sort((a, b) => b - a);
  let   remaining = perSideTarget;
  const perSide   = [];

  for (const p of plates) {
    while (remaining >= p - 0.001) {
      perSide.push(p);
      remaining -= p;
    }
  }

  const achievable = remaining < 0.001;
  const total      = barWeight + 2 * perSide.reduce((s, p) => s + p, 0);
  return { perSide, total, achievable };
}

// ── Warm-up ramp ──────────────────────────────────────────────────────────────

// Returns [{weight, reps, pct}]. Weights are exact (not rounded to nearest plate).
export function warmupSets(workingWeight, percentages = [0.4, 0.6, 0.8], repTargets = [8, 5, 3]) {
  return percentages.map((pct, i) => ({
    weight : workingWeight * pct,
    reps   : repTargets[i] !== undefined ? repTargets[i] : repTargets[repTargets.length - 1],
    pct,
  }));
}

// ── Peptides ──────────────────────────────────────────────────────────────────

// mcg per mL after reconstitution.
export function reconstitutionConcentration(vialMg, bacWaterMl) {
  return (vialMg * 1000) / bacWaterMl;
}

// Units to draw on a U-100 syringe.
// formula from data-models.md: doseMcg / (concentration / 100)
export function unitsToDraw(doseMcg, concentrationMcgPerMl) {
  return doseMcg / (concentrationMcgPerMl / 100);
}

// Serum level t hours after dose: C(t) = dose × (½)^(t / halfLifeHours)
export function halfLifeDecay(dose, tHours, halfLifeHours) {
  return dose * Math.pow(0.5, tHours / halfLifeHours);
}

// Returns 0–100, or null when nothing was scheduled.
export function adherencePct(dosesTaken, dosesScheduled) {
  if (dosesScheduled === 0) return null;
  return (dosesTaken / dosesScheduled) * 100;
}

// ── Nutrition (Stage 6) ─────────────────────────────────────────────────────

// The macro keys the engine sums. kcal + the three macros + the four tracked
// micros from nutrition-spec.md.
export const MACRO_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium', 'potassium'];

// Scale a per-serving macro object by a serving count. Missing fields → 0.
// Returns a full object over MACRO_KEYS, rounded to 1 decimal.
export function scaleMacros(perServing, servings) {
  const out = {};
  const n = Number(servings) || 0;
  for (const k of MACRO_KEYS) {
    out[k] = +(((perServing && perServing[k]) || 0) * n).toFixed(1);
  }
  return out;
}

// Sum an array of macro objects into one total over MACRO_KEYS.
export function sumMacros(list) {
  const out = {};
  for (const k of MACRO_KEYS) out[k] = 0;
  for (const m of (list || [])) {
    for (const k of MACRO_KEYS) out[k] += (m && m[k]) || 0;
  }
  for (const k of MACRO_KEYS) out[k] = +out[k].toFixed(1);
  return out;
}

// Net carbs = carbs − fiber, floored at 0.
export function netCarbs(carbs, fiber) {
  return Math.max(0, (carbs || 0) - (fiber || 0));
}

// Sum every entry across a day's meal records (each record holds entries[]).
export function dayTotals(mealRecords) {
  const all = [];
  for (const rec of (mealRecords || [])) {
    for (const e of (rec.entries || [])) all.push(e.computedMacros);
  }
  return sumMacros(all);
}

// Protein hit rate as a 0..1+ fraction (actual / target). null if no target.
export function proteinHitRate(actualG, targetG) {
  if (!targetG) return null;
  return actualG / targetG;
}

// Calorie balance vs target: intake − target. Negative = under (a deficit on a
// cut). Stage 8's realized-deficit signal is the negative of this on cut days.
export function calorieBalance(intakeKcal, targetKcal) {
  return (intakeKcal || 0) - (targetKcal || 0);
}

// ── Internal helpers (not exported) ──────────────────────────────────────────

// Shift a YYYY-MM-DD string by ±days. Uses noon UTC to avoid DST edge cases.
function _offsetDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Linear regression slope of [{x, y}] points.
function _slope(points) {
  const n     = points.length;
  const sumX  = points.reduce((s, p) => s + p.x,     0);
  const sumY  = points.reduce((s, p) => s + p.y,     0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}
