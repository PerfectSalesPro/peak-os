// Tests for workout deletion key semantics — run with: node test/db-delete.test.mjs
// Uses fake-indexeddb (spec-compliant, in-memory) so the real db.js runs in Node.
// Reproduces the DataError bug (NaN key from numeric coercion of a UUID string)
// and verifies the fixed string-key delete actually removes the record.

import 'fake-indexeddb/auto';
import * as db from '../js/db.js';

let passed = 0, failed = 0;

function check(label, ok, detail = '') {
  if (ok) { console.log(`  ✓  ${label}`); passed++; }
  else    { console.log(`  ✗  ${label} ${detail}`); failed++; }
}

console.log('db-delete tests');

// Mirror the CSV importer (training-tracker.js _parseStrongCSV): put with NO id,
// so db.put assigns crypto.randomUUID() — a string key.
const rec = await db.put('workouts', {
  date: '2026-06-12', templateId: null, name: '__delete-test__',
  durationSec: 1, notes: '', dayType: 'training', exercises: [],
});

check('put assigns string UUID id', typeof rec.id === 'string' && rec.id.length === 36,
  `(got ${typeof rec.id}: ${rec.id})`);
check('numeric coercion of UUID id is NaN (the old bug)', Number.isNaN(+rec.id));

const fetched = await db.get('workouts', rec.id);
check('record retrievable by string key', fetched?.name === '__delete-test__');

// The old broken call — remove('workouts', +id) — must throw DataError.
let dataErr = null;
try { await db.remove('workouts', +rec.id); } catch (e) { dataErr = e; }
check('remove with NaN key throws DataError', dataErr?.name === 'DataError',
  `(got ${dataErr?.name || 'no error'})`);

const stillThere = await db.get('workouts', rec.id);
check('record untouched after failed NaN delete', stillThere?.id === rec.id);

// The fixed call — string key.
await db.remove('workouts', rec.id);
const gone = await db.get('workouts', rec.id);
check('record gone from store after string-key delete', gone === undefined,
  `(got ${JSON.stringify(gone)})`);

const all = await db.getAll('workouts');
check('store contains no leftover test records', !all.some(w => w.name === '__delete-test__'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
