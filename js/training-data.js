// Training data layer — exercise catalog seeder and session helpers.
import * as db   from './db.js';
import * as calc from './calc.js';

// ── Built-in exercise catalog ─────────────────────────────────────────────────

const BUILT_IN = [
  // Chest
  { name: 'Bench Press (Barbell)',          primaryMuscle: 'Chest',      secondaryMuscles: ['Shoulders','Triceps'],         equipment: 'Barbell' },
  { name: 'Bench Press (Dumbbell)',          primaryMuscle: 'Chest',      secondaryMuscles: ['Shoulders','Triceps'],         equipment: 'Dumbbell' },
  { name: 'Incline Bench Press (Barbell)',   primaryMuscle: 'Chest',      secondaryMuscles: ['Shoulders','Triceps'],         equipment: 'Barbell' },
  { name: 'Incline Bench Press (Dumbbell)', primaryMuscle: 'Chest',      secondaryMuscles: ['Shoulders','Triceps'],         equipment: 'Dumbbell' },
  { name: 'Cable Fly',                      primaryMuscle: 'Chest',      secondaryMuscles: ['Shoulders'],                   equipment: 'Cable' },
  { name: 'Push-up',                        primaryMuscle: 'Chest',      secondaryMuscles: ['Shoulders','Triceps'],         equipment: 'Bodyweight' },
  // Back
  { name: 'Deadlift',                       primaryMuscle: 'Back',       secondaryMuscles: ['Glutes','Hamstrings','Core'],  equipment: 'Barbell' },
  { name: 'Barbell Row',                    primaryMuscle: 'Back',       secondaryMuscles: ['Biceps','Shoulders'],          equipment: 'Barbell' },
  { name: 'Cable Row (Seated)',             primaryMuscle: 'Back',       secondaryMuscles: ['Biceps'],                      equipment: 'Cable' },
  { name: 'Dumbbell Row (Single Arm)',      primaryMuscle: 'Back',       secondaryMuscles: ['Biceps'],                      equipment: 'Dumbbell' },
  { name: 'Pull-up',                        primaryMuscle: 'Back',       secondaryMuscles: ['Biceps'],                      equipment: 'Bodyweight' },
  { name: 'Lat Pulldown',                   primaryMuscle: 'Back',       secondaryMuscles: ['Biceps'],                      equipment: 'Cable' },
  { name: 'Face Pull',                      primaryMuscle: 'Shoulders',  secondaryMuscles: ['Back'],                        equipment: 'Cable' },
  // Shoulders
  { name: 'Overhead Press (Barbell)',       primaryMuscle: 'Shoulders',  secondaryMuscles: ['Triceps','Core'],              equipment: 'Barbell' },
  { name: 'Overhead Press (Dumbbell)',      primaryMuscle: 'Shoulders',  secondaryMuscles: ['Triceps'],                     equipment: 'Dumbbell' },
  { name: 'Lateral Raise',                  primaryMuscle: 'Shoulders',  secondaryMuscles: [],                              equipment: 'Dumbbell' },
  { name: 'Front Raise',                    primaryMuscle: 'Shoulders',  secondaryMuscles: [],                              equipment: 'Dumbbell' },
  { name: 'Arnold Press',                   primaryMuscle: 'Shoulders',  secondaryMuscles: ['Triceps'],                     equipment: 'Dumbbell' },
  // Biceps
  { name: 'Barbell Curl',                   primaryMuscle: 'Biceps',     secondaryMuscles: [],                              equipment: 'Barbell' },
  { name: 'Dumbbell Curl',                  primaryMuscle: 'Biceps',     secondaryMuscles: [],                              equipment: 'Dumbbell' },
  { name: 'Hammer Curl',                    primaryMuscle: 'Biceps',     secondaryMuscles: ['Forearms'],                    equipment: 'Dumbbell' },
  { name: 'Cable Curl',                     primaryMuscle: 'Biceps',     secondaryMuscles: [],                              equipment: 'Cable' },
  // Triceps
  { name: 'Tricep Dip',                     primaryMuscle: 'Triceps',    secondaryMuscles: ['Chest','Shoulders'],           equipment: 'Bodyweight' },
  { name: 'Tricep Pushdown',                primaryMuscle: 'Triceps',    secondaryMuscles: [],                              equipment: 'Cable' },
  { name: 'Skull Crusher',                  primaryMuscle: 'Triceps',    secondaryMuscles: [],                              equipment: 'Barbell' },
  { name: 'Overhead Tricep Extension',      primaryMuscle: 'Triceps',    secondaryMuscles: [],                              equipment: 'Dumbbell' },
  // Quads
  { name: 'Squat (Barbell)',                primaryMuscle: 'Quads',      secondaryMuscles: ['Glutes','Hamstrings','Core'],  equipment: 'Barbell' },
  { name: 'Goblet Squat',                   primaryMuscle: 'Quads',      secondaryMuscles: ['Glutes','Core'],               equipment: 'Dumbbell' },
  { name: 'Leg Press',                      primaryMuscle: 'Quads',      secondaryMuscles: ['Glutes','Hamstrings'],         equipment: 'Machine' },
  { name: 'Leg Extension',                  primaryMuscle: 'Quads',      secondaryMuscles: [],                              equipment: 'Machine' },
  { name: 'Walking Lunge',                  primaryMuscle: 'Quads',      secondaryMuscles: ['Glutes','Hamstrings'],         equipment: 'Dumbbell' },
  // Glutes / Hamstrings
  { name: 'Hip Thrust',                     primaryMuscle: 'Glutes',     secondaryMuscles: ['Hamstrings'],                  equipment: 'Barbell' },
  { name: 'Romanian Deadlift',              primaryMuscle: 'Hamstrings', secondaryMuscles: ['Back','Glutes'],               equipment: 'Barbell' },
  { name: 'Leg Curl',                       primaryMuscle: 'Hamstrings', secondaryMuscles: [],                              equipment: 'Machine' },
  // Calves
  { name: 'Calf Raise (Machine)',           primaryMuscle: 'Calves',     secondaryMuscles: [],                              equipment: 'Machine' },
  { name: 'Seated Calf Raise',              primaryMuscle: 'Calves',     secondaryMuscles: [],                              equipment: 'Machine' },
  // Core
  { name: 'Plank',                          primaryMuscle: 'Core',       secondaryMuscles: [],                              equipment: 'Bodyweight' },
  { name: 'Ab Wheel Rollout',               primaryMuscle: 'Core',       secondaryMuscles: [],                              equipment: 'Other' },
  { name: 'Cable Crunch',                   primaryMuscle: 'Core',       secondaryMuscles: [],                              equipment: 'Cable' },
  { name: 'Hanging Leg Raise',              primaryMuscle: 'Core',       secondaryMuscles: [],                              equipment: 'Bodyweight' },
];

// ── Muscle assignment rules (applied to imported exercises with primaryMuscle='Other') ──

function _inferMuscle(name) {
  const n = name.toLowerCase();
  // Glutes checked first so "glute bridge with foam roller" isn't killed by the mobility skip
  if (/hip.?thrust|glute.?bridge|\bglute\b|\bglutes\b|barbell.?hip|db.?hip|good.?girls|bad.?girls|unilateral.?hip.?hinge/.test(n)) return 'Glutes';
  // Skip cardio / mobility rows
  if (/aerobic|treadmill|\bbike\b|jump rope|stair.?master|sauna|massage|warm.?up|foam.?roll|cat.?to.?camel|thoracic|child.?pose|thread.?needle|roll.?and.?reach|lumbar|\bsleds?\b|high.?knees|burpee|active.?hang|dead.?hang|bar.?hang|\brunning\b/.test(n)) return null;
  if (/calf.?raise|donkey.?calf|\bcalf\b|toe.?press|seated.?calf|standing.?calf/.test(n)) return 'Calves';
  if (/romanian|stiff.?leg.?dead|stiff.?dead|\brdl\b|leg.?curls?|hamstring.?curls?|lying.?leg.?curl|seated.?leg.?curl|laying.?hamstring|single.?leg.?hamstring|\bhamstring/.test(n)) return 'Hamstrings';
  if (/\bcrunch|ab.?wheel|ab.?crunch|sit.?up|\bplank|oblique|russian.?twist|mountain.?climb|dead.?bug|birddog|leg.?raise|knee.?raise|leg.?lift|wood.?chop|woodchop|pallof|cable.?crunch|kneeling.?cable|reverse.?crunch|butterfly.?sit|lying.?oblique|landmine|trunk.?rot|roman.?chair|heel.?tap|hanging.?knee|hanging.?leg/.test(n)) return 'Core';
  if (/\btricep|\btriceps|pushdown|press.?down|pressdown|pressd|skull.?crush|close.?grip.?bench|bench.*close.?grip|close.?grip.?press|close.?grip.?machine|smith.?machine.?close.?grip|overhead.*tri|rope.?press.?down|ez.?bar.?tricep|ez.?bar.?skull|bench.?dip|machine.?dip|seated.?dip|\bdips\b|assisted.?dip|\bkickback|single.?arm.*press.?down|single.?arm.*pushdown|long.?grip.*pushdown|db.*french|overhead.?tricep|seated.?overhead.?tricep|seated.?tricep|rope.?tricep|db.?kickback/.test(n)) return 'Triceps';
  if (/\bcurls?\b|bicep|biceps|\bpreacher|concentration.?curls?|hammer.?curls?|spider.?curls?|jpg.?cable|v.?bar.?cable.?curls?|straight.?bar.?bicep|straight.?bar.?curls?|supinated.?curls?|standing.?db.?bicep|incline.*curls?|seated.*curls?|single.?arm.?bicep|single.?arm.?cable.?curls?|band.?curls?|alternating.?db.?curls?|standing.?cable.?curls?|rope.?hammer.?curls?|side.?curls?/.test(n)) return 'Biceps';
  if (/shoulder.?press|over.?head.*press|overhead.?press|military.?press|lateral.?raise|lat.?raise|\blaterals\b|side.?lateral|front.?raise|plate.?front.?raise|front.?plate.?raise|cable.?front.?raise|db.?front.?delt|upright.?row|face.?pull|rear.?delt|rear.?delts|arnold.?press|\bshrug|\bdelt\b|\bdelts\b|cable.?lateral|db.?lateral|seated.?lateral|single.?arm.?cable.?lateral|machine.?lateral|band.?shoulder|banded.?shoulder|bamboo.?shoulder|plate.?loaded.?shoulder|plate.?loaded.?overhead|hammer.?shoulder|smith.*shoulder|cable.?trap|rope.?trap|cable.?rear|band.?front.?raise|band.?lateral|external.*shoulder|internal.*shoulder|seated.?db.?press|seated.?military|seated.?db.?arnold|db.?overhead.?press|dumbbell.?overhead.?press|standing.?band.?shoulder|reverse.*fly|rope.?overhead|overhead.*rope|rope.?ski/.test(n)) return 'Shoulders';
  // Back checked before Chest so "Incline Db Rows", "Incline Rotating Db Row" etc. don't get caught by incline patterns
  if (/\brow\b|\brows\b|rowing|pulldown|pull.?down|pull.?downs|pull.?up|\bchin.?up|lat.?pull|lat.?push.?down|deadlift|\brack.?pull|hex.?bar|pullover|pull.?over|back.?extension|rounded.?back|\bhypers\b|t.?bar.?row|tbar.?row|iso.?lateral.?row|bent.?over.*row|seated.*row|cable.?row|machine.?row|db.?row|dumbbell.?row|single.?arm.*row|incline.*row|hammer.*row|dy.?row|close.?grip.*row|wide.?grip.*row|wide.?grip.*pull|narrow.*pull|front.*pulldown|reverse.?grip.*pull|iso.?front.?lat|single.?arm.?lat.?pull|straight.?bar.?lat|narrow.?v.?grip.*pull|wide.?d.?grip|hammer.?pull|hammer.?strength.?pull|high.?row/.test(n)) return 'Back';
  // Chest — "incline.*db" removed (too broad); replaced with explicit incline+(press|fly|bench|chest)
  if (/incline.*(press|fli?|bench|chest)|decline.*(press|fly|db|chest)|chest.?press|chest.?fly|\bpec.?deck|pec.?fly|cable.?cross|cable.?fly|standing.?cable.?fl|flat.?bench|flat.*(press|fly|fli|db)|dumbbell.?chest|banded.?standing.?chest|press.?up|push.?up|\bpushup|machine.*(chest|incline)|plate.*(incline)|free.?motion.?chest|hammer.*(press|decline)|low.?incline|low.?cable.?chest|high.?cable.?fly|low.?cable.?fly|cable.?chest|seated.*(fly)/.test(n)) return 'Chest';
  if (/\bsquat|leg.?press|\blunge\b|\blunges\b|reverse.?lunge|leg.?extension|quad.?extension|\bextensions\b|hack.?squat|step.?up|bulgarian|front.?squat|pause.?squat|jump.?squat|side.?squat|sumo.?squat|db.?sumo|static.?lunge|single.?leg.?squat|single.?leg.?press|single.?half.?rep.?leg|narrow.?stance|goblet.?squat|plate.?loaded.?squat/.test(n)) return 'Quads';
  return null;
}

// Migrates muscle groups on all imported exercises.
// Runs on every app boot but skips exercises that already have the right muscle.
// Re-checks all custom (CSV-imported) exercises so mis-classifications from a
// previous run are corrected when the mapping improves.
export async function migrateExerciseMuscles() {
  const all = await db.getAll('exercises');
  // Target: custom exercises that are either 'Other' or were auto-classified
  const candidates = all.filter(e => e.isCustom);
  if (!candidates.length) return { assigned: 0, stillOther: [] };
  let assigned = 0;
  const stillOther = [];
  for (const ex of candidates) {
    const muscle = _inferMuscle(ex.name);
    if (muscle && muscle !== ex.primaryMuscle) {
      await db.put('exercises', { ...ex, primaryMuscle: muscle });
      assigned++;
    } else if (!muscle && ex.primaryMuscle !== 'Other') {
      // already 'Other' or cardio — leave alone
    } else if (!muscle) {
      stillOther.push(ex.name);
    }
  }
  return { assigned, stillOther };
}

// Seeds built-in exercises if the store is empty. Idempotent.
export async function seedExercises() {
  const existing = await db.getAll('exercises');
  if (existing.length > 0) return;
  for (const ex of BUILT_IN) {
    await db.put('exercises', { ...ex, isCustom: false, bestSet: null });
  }
}

// All exercises sorted by muscle group then name.
export async function getAllExercises() {
  const all = await db.getAll('exercises');
  return all.sort((a, b) =>
    a.primaryMuscle.localeCompare(b.primaryMuscle) || a.name.localeCompare(b.name)
  );
}

// Previous completed sets for exerciseId from the most recent session that included it.
export async function getPrevSets(exerciseId, currentWorkoutId = null) {
  const all = await db.getAll('workouts');
  const prev = all
    .filter(w => w.id !== currentWorkoutId && w.durationSec !== null
              && w.exercises?.some(e => e.exerciseId === exerciseId))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!prev.length) return [];
  const ex = prev[0].exercises.find(e => e.exerciseId === exerciseId);
  return ex ? ex.sets.filter(s => s.completed) : [];
}

// Checks if a working set beats bestSet. Returns { isPR, estimated1RM }.
export async function checkPR(exerciseId, weight, reps, rpe = null) {
  if (!weight || !reps || reps <= 0 || weight <= 0) return { isPR: false, estimated1RM: null };
  const ex = await db.get('exercises', exerciseId);
  if (!ex) return { isPR: false, estimated1RM: null };
  const { oneRM } = calc.estimate1RM(weight, reps, rpe !== null, rpe);
  const prevBest = ex.bestSet?.estimated1RM ?? 0;
  return { isPR: oneRM > prevBest, estimated1RM: oneRM };
}

// Updates bestSet on an exercise. Call after confirming a PR.
export async function updateBestSet(exerciseId, weight, reps, rpe = null) {
  const ex = await db.get('exercises', exerciseId);
  if (!ex) return;
  const { oneRM } = calc.estimate1RM(weight, reps, rpe !== null, rpe);
  return db.put('exercises', {
    ...ex,
    bestSet: { weight, reps, estimated1RM: oneRM, date: new Date().toISOString().slice(0, 10) },
  });
}
