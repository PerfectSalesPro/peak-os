// Dry-run the mapping against the unique exercise names from the CSV
// to predict what the browser migration will do
const { execSync } = require('child_process');

function inferMuscle(name) {
  const n = name.toLowerCase();
  if (/hip.?thrust|glute.?bridge|\bglute\b|\bglutes\b|barbell.?hip|db.?hip|good.?girls|bad.?girls|unilateral.?hip.?hinge/.test(n)) return 'Glutes';
  if (/aerobic|treadmill|\bbike\b|jump rope|stair.?master|sauna|massage|warm.?up|foam.?roll|cat.?to.?camel|thoracic|child.?pose|thread.?needle|roll.?and.?reach|lumbar|\bsleds?\b|high.?knees|burpee|active.?hang|dead.?hang|bar.?hang|\brunning\b/.test(n)) return null;
  if (/calf.?raise|donkey.?calf|\bcalf\b|toe.?press|seated.?calf|standing.?calf/.test(n)) return 'Calves';
  if (/romanian|stiff.?leg.?dead|stiff.?dead|\brdl\b|leg.?curls?|hamstring.?curls?|lying.?leg.?curl|seated.?leg.?curl|laying.?hamstring|single.?leg.?hamstring|\bhamstring/.test(n)) return 'Hamstrings';
  if (/\bcrunch|ab.?wheel|ab.?crunch|sit.?up|\bplank|oblique|russian.?twist|mountain.?climb|dead.?bug|birddog|leg.?raise|knee.?raise|leg.?lift|wood.?chop|woodchop|pallof|cable.?crunch|kneeling.?cable|reverse.?crunch|butterfly.?sit|lying.?oblique|landmine|trunk.?rot|roman.?chair|heel.?tap|hanging.?knee|hanging.?leg/.test(n)) return 'Core';
  if (/\btricep|\btriceps|pushdown|press.?down|pressdown|pressd|skull.?crush|close.?grip.?bench|bench.*close.?grip|close.?grip.?press|close.?grip.?machine|smith.?machine.?close.?grip|overhead.*tri|rope.?press.?down|ez.?bar.?tricep|ez.?bar.?skull|bench.?dip|machine.?dip|seated.?dip|\bdips\b|assisted.?dip|\bkickback|single.?arm.*press.?down|single.?arm.*pushdown|long.?grip.*pushdown|db.*french|overhead.?tricep|seated.?overhead.?tricep|seated.?tricep|rope.?tricep|db.?kickback/.test(n)) return 'Triceps';
  if (/\bcurls?\b|bicep|biceps|\bpreacher|concentration.?curls?|hammer.?curls?|spider.?curls?|jpg.?cable|v.?bar.?cable.?curls?|straight.?bar.?bicep|straight.?bar.?curls?|supinated.?curls?|standing.?db.?bicep|incline.*curls?|seated.*curls?|single.?arm.?bicep|single.?arm.?cable.?curls?|band.?curls?|alternating.?db.?curls?|standing.?cable.?curls?|rope.?hammer.?curls?|side.?curls?/.test(n)) return 'Biceps';
  if (/shoulder.?press|over.?head.*press|overhead.?press|military.?press|lateral.?raise|lat.?raise|\blaterals\b|side.?lateral|front.?raise|plate.?front.?raise|front.?plate.?raise|cable.?front.?raise|db.?front.?delt|upright.?row|face.?pull|rear.?delt|rear.?delts|arnold.?press|\bshrug|\bdelt\b|\bdelts\b|cable.?lateral|db.?lateral|seated.?lateral|single.?arm.?cable.?lateral|machine.?lateral|band.?shoulder|banded.?shoulder|bamboo.?shoulder|plate.?loaded.?shoulder|plate.?loaded.?overhead|hammer.?shoulder|smith.*shoulder|cable.?trap|rope.?trap|cable.?rear|band.?front.?raise|band.?lateral|external.*shoulder|internal.*shoulder|seated.?db.?press|seated.?military|seated.?db.?arnold|db.?overhead.?press|dumbbell.?overhead.?press|standing.?band.?shoulder|reverse.*fly|rope.?overhead|overhead.*rope|rope.?ski/.test(n)) return 'Shoulders';
  if (/\brow\b|\brows\b|rowing|pulldown|pull.?down|pull.?downs|pull.?up|\bchin.?up|lat.?pull|lat.?push.?down|deadlift|\brack.?pull|hex.?bar|pullover|pull.?over|back.?extension|rounded.?back|\bhypers\b|t.?bar.?row|tbar.?row|iso.?lateral.?row|bent.?over.*row|seated.*row|cable.?row|machine.?row|db.?row|dumbbell.?row|single.?arm.*row|incline.*row|hammer.*row|dy.?row|close.?grip.*row|wide.?grip.*row|wide.?grip.*pull|narrow.*pull|front.*pulldown|reverse.?grip.*pull|iso.?front.?lat|single.?arm.?lat.?pull|straight.?bar.?lat|narrow.?v.?grip.*pull|wide.?d.?grip|hammer.?pull|hammer.?strength.?pull|high.?row/.test(n)) return 'Back';
  if (/incline.*(press|fli?|bench|chest)|decline.*(press|fly|db|chest)|chest.?press|chest.?fly|\bpec.?deck|pec.?fly|cable.?cross|cable.?fly|standing.?cable.?fl|flat.?bench|flat.*(press|fly|fli|db)|dumbbell.?chest|banded.?standing.?chest|press.?up|push.?up|\bpushup|machine.*(chest|incline)|plate.*(incline)|free.?motion.?chest|hammer.*(press|decline)|low.?incline|low.?cable.?chest|high.?cable.?fly|low.?cable.?fly|cable.?chest|seated.*(fly)/.test(n)) return 'Chest';
  if (/\bsquat|leg.?press|\blunge\b|\blunges\b|reverse.?lunge|leg.?extension|quad.?extension|\bextensions\b|hack.?squat|step.?up|bulgarian|front.?squat|pause.?squat|jump.?squat|side.?squat|sumo.?squat|db.?sumo|static.?lunge|single.?leg.?squat|single.?leg.?press|single.?half.?rep.?leg|narrow.?stance|goblet.?squat|plate.?loaded.?squat/.test(n)) return 'Quads';
  return null;
}

// Names already in BUILT_IN (these exist in DB with proper muscles, won't be 'Other')
const BUILT_IN_NAMES = new Set([
  'Bench Press (Barbell)', 'Bench Press (Dumbbell)', 'Incline Bench Press (Barbell)',
  'Incline Bench Press (Dumbbell)', 'Cable Fly', 'Push-up', 'Deadlift', 'Barbell Row',
  'Cable Row (Seated)', 'Dumbbell Row (Single Arm)', 'Pull-up', 'Lat Pulldown', 'Face Pull',
  'Overhead Press (Barbell)', 'Overhead Press (Dumbbell)', 'Lateral Raise', 'Front Raise',
  'Arnold Press', 'Barbell Curl', 'Dumbbell Curl', 'Hammer Curl', 'Cable Curl',
  'Tricep Dip', 'Tricep Pushdown', 'Skull Crusher', 'Overhead Tricep Extension',
  'Squat (Barbell)', 'Goblet Squat', 'Leg Press', 'Leg Extension', 'Walking Lunge',
  'Hip Thrust', 'Romanian Deadlift', 'Leg Curl', 'Calf Raise (Machine)', 'Seated Calf Raise',
  'Plank', 'Ab Wheel Rollout', 'Cable Crunch', 'Hanging Leg Raise'
]);

// Get exercise names from CSV (col 4, 0-indexed col 3)
const csv = execSync(`cut -d',' -f4 ~/Downloads/strong_workouts\\ 3.csv | sort -u | grep -v "^Exercise Name" | grep -v "^$" | sed 's/"//g'`, { shell: '/bin/zsh' }).toString();
const csvNames = csv.split('\n').map(s => s.trim()).filter(Boolean);

// Only names that would be imported as new exercises (not in BUILT_IN)
const imported = csvNames.filter(n => !BUILT_IN_NAMES.has(n));

const byMuscle = {};
const stillOther = [];

for (const name of imported) {
  const muscle = inferMuscle(name);
  if (muscle) {
    (byMuscle[muscle] = byMuscle[muscle] || []).push(name);
  } else {
    stillOther.push(name);
  }
}

const assigned = Object.values(byMuscle).flat().length;

console.log('\n=== MUSCLE ASSIGNMENT PREDICTION ===');
console.log(`Total unique CSV exercises  : ${csvNames.length}`);
console.log(`Already in BUILT_IN         : ${csvNames.length - imported.length}`);
console.log(`Imported as "Other"         : ${imported.length}`);
console.log(`Will be assigned            : ${assigned}`);
console.log(`Will remain Other           : ${stillOther.length}`);

console.log('\n--- ASSIGNED BY MUSCLE ---');
for (const [muscle, names] of Object.entries(byMuscle).sort()) {
  console.log(`\n${muscle} (${names.length}):`);
  names.sort().forEach(n => console.log(`  ${n}`));
}

if (stillOther.length) {
  console.log(`\n--- WILL REMAIN "Other" (${stillOther.length}) ---`);
  stillOther.sort().forEach(n => console.log(`  ${n}`));
}
