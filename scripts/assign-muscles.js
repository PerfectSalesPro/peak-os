import { chromium } from 'playwright';

// Inline string version of the mapping function (safe to pass into page.evaluate)
const MAPPING_SRC = `
function assignMuscle(name) {
  const n = name.toLowerCase();
  // Cardio / mobility — skip
  if (/aerobic|treadmill|\\bbike\\b|jump rope|stair.?master|sauna|massage|warm.?up|foam.?roll|cat.?to.?camel|thoracic|child.?pose|thread.?needle|roll.?and.?reach|lumbar|\\bsleds?\\b|high.?knees|burpee|active.?hang|dead.?hang|bar.?hang|\\brunning\\b/.test(n)) return null;
  if (/calf.?raise|donkey.?calf|\\bcalf\\b|toe.?press|seated.?calf|standing.?calf/.test(n)) return 'Calves';
  if (/romanian|stiff.?leg.?dead|stiff.?dead|\\brdl\\b|leg.?curl|hamstring.?curl|lying.?leg.?curl|seated.?leg.?curl|laying.?hamstring|single.?leg.?hamstring|\\bhamstring/.test(n)) return 'Hamstrings';
  if (/hip.?thrust|glute.?bridge|barbell.?hip|db.?hip|\\bglute\\b|\\bglutes\\b/.test(n)) return 'Glutes';
  if (/\\bcrunch|ab.?wheel|ab.?crunch|sit.?up|\\bplank|oblique|russian.?twist|mountain.?climb|dead.?bug|birddog|leg.?raise|knee.?raise|leg.?lift|wood.?chop|woodchop|pallof|cable.?crunch|kneeling.?cable|reverse.?crunch|butterfly.?sit|lying.?oblique|landmine|trunk.?rot|roman.?chair|heel.?tap|hanging.?knee|hanging.?leg/.test(n)) return 'Core';
  if (/\\btricep|\\btriceps|pushdown|press.?down|pressdown|skull.?crush|close.?grip.?bench|close.?grip.?press|close.?grip.?machine|smith.?machine.?close.?grip|overhead.*tri|rope.?overhead.?press|rope.?press.?down|ez.?bar.?tricep|ez.?bar.?skull|bench.?dip|machine.?dip|seated.?dip|\\bdips\\b|assisted.?dip|\\bkickback|single.?arm.*press.?down|single.?arm.*pushdown|long.?grip.*pushdown|db.*french|overhead.?tricep|seated.?overhead.?tricep|seated.?tricep|rope.?tricep|db.?kickback/.test(n)) return 'Triceps';
  if (/\\bcurl\\b|bicep|biceps|\\bpreacher|concentration.?curl|hammer.?curl|spider.?curl|jpg.?cable|v.?bar.?cable.?curl|straight.?bar.?bicep|straight.?bar.?curl|supinated.?curl|standing.?db.?bicep|incline.*curl|seated.*curl|single.?arm.?bicep|single.?arm.?cable.?curl|band.?curl|alternating.?db.?curl|standing.?cable.?curl|rope.?hammer.?curl/.test(n)) return 'Biceps';
  if (/shoulder.?press|overhead.?press|military.?press|lateral.?raise|lat.?raise|\\blaterals\\b|side.?lateral|front.?raise|plate.?front.?raise|front.?plate.?raise|cable.?front.?raise|db.?front.?delt|upright.?row|face.?pull|rear.?delt|rear.?delts|arnold.?press|\\bshrug|\\bdelt\\b|\\bdelts\\b|cable.?lateral|db.?lateral|seated.?lateral|single.?arm.?cable.?lateral|machine.?lateral|band.?shoulder|banded.?shoulder|bamboo.?shoulder|plate.?loaded.?shoulder|plate.?loaded.?overhead|hammer.?shoulder|smith.*shoulder|cable.?trap|rope.?trap|cable.?rear|band.?front.?raise|band.?lateral|external.*shoulder|internal.*shoulder|seated.?db.?press|seated.?military|seated.?db.?arnold|db.?overhead.?press|dumbbell.?overhead.?press|standing.?band.?shoulder/.test(n)) return 'Shoulders';
  if (/incline.*press|incline.*fly|incline.*db|incline.*bench|incline.*chest|decline.*press|decline.*fly|decline.*db|chest.?press|chest.?fly|\\bpec.?deck|pec.?fly|cable.?cross|cable.?fly|standing.?cable.?fl|flat.?bench|flat.*press|flat.*fly|flat.*db|dumbbell.?chest|banded.?standing.?chest|press.?up|push.?up|\\bpushup|machine.*chest|machine.*incline|plate.*incline|plate.?loaded.?incline|free.?motion.?chest|hammer.*press|hammer.*decline|low.?incline|low.?cable.?chest|high.?cable.?fly|low.?cable.?fly|cable.?chest/.test(n)) return 'Chest';
  if (/\\brow\\b|\\brows\\b|rowing|pulldown|pull.?down|pull.?downs|pull.?up|\\bchin.?up|lat.?pull|lat.?push.?down|deadlift|\\brack.?pull|hex.?bar|pullover|pull.?over|back.?extension|rounded.?back|\\bhypers\\b|t.?bar.?row|tbar.?row|iso.?lateral.?row|bent.?over.*row|seated.*row|cable.?row|machine.?row|db.?row|dumbbell.?row|single.?arm.*row|incline.*row|hammer.*row|dy.?row|close.?grip.*row|wide.?grip.*row|wide.?grip.*pull|narrow.*pull|front.*pulldown|reverse.?grip.*pull|iso.?front.?lat|single.?arm.?lat.?pull|straight.?bar.?lat|narrow.?v.?grip.*pull|wide.?d.?grip|hammer.?pull|hammer.?strength.?pull|high.?row/.test(n)) return 'Back';
  if (/\\bsquat|leg.?press|\\blunge\\b|\\blunges\\b|reverse.?lunge|leg.?extension|quad.?extension|\\bextensions\\b|hack.?squat|step.?up|bulgarian|front.?squat|pause.?squat|jump.?squat|side.?squat|sumo.?squat|db.?sumo|static.?lunge|single.?leg.?squat|single.?leg.?press|single.?half.?rep.?leg|narrow.?stance|goblet.?squat|plate.?loaded.?squat/.test(n)) return 'Quads';
  return null;
}
`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2500);

  const result = await page.evaluate(async (mappingSrc) => {
    const assignMuscle = eval(`(function(){${mappingSrc}; return assignMuscle;})()`);

    return new Promise((resolve) => {
      const req = indexedDB.open('peak-os-db');
      req.onerror = () => resolve({ error: req.error?.message || 'open failed' });
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('exercises', 'readwrite');
        const store = tx.objectStore('exercises');
        const all = store.getAll();

        all.onerror = () => resolve({ error: 'getAll failed' });
        all.onsuccess = () => {
          const exercises = all.result;
          const otherExs = exercises.filter(e => e.primaryMuscle === 'Other');
          const assignedList = [];
          const stillOther = [];

          for (const ex of otherExs) {
            const muscle = assignMuscle(ex.name);
            if (muscle) {
              store.put({ ...ex, primaryMuscle: muscle });
              assignedList.push({ name: ex.name, muscle });
            } else {
              stillOther.push(ex.name);
            }
          }

          tx.oncomplete = () => resolve({
            total: exercises.length,
            otherBefore: otherExs.length,
            assigned: assignedList.length,
            assignedList,
            stillOther,
          });
          tx.onerror = () => resolve({ error: tx.error?.message });
        };
      };
    });
  }, MAPPING_SRC);

  await browser.close();

  if (result.error) { console.error('ERROR:', result.error); process.exit(1); }

  console.log('\n=== MUSCLE GROUP ASSIGNMENT RESULTS ===');
  console.log(`Total exercises in DB : ${result.total}`);
  console.log(`Had "Other" before    : ${result.otherBefore}`);
  console.log(`Assigned              : ${result.assigned}`);
  console.log(`Still Other           : ${result.stillOther.length}`);

  const byMuscle = {};
  for (const { name, muscle } of result.assignedList)
    (byMuscle[muscle] = byMuscle[muscle] || []).push(name);

  console.log('\n--- ASSIGNED BY MUSCLE ---');
  for (const [muscle, names] of Object.entries(byMuscle).sort()) {
    console.log(`\n${muscle} (${names.length}):`);
    names.sort().forEach(n => console.log(`  ${n}`));
  }

  if (result.stillOther.length) {
    console.log(`\n--- STILL "Other" (${result.stillOther.length}) ---`);
    result.stillOther.sort().forEach(n => console.log(`  ${n}`));
  } else {
    console.log('\nAll exercises assigned!');
  }
})();
