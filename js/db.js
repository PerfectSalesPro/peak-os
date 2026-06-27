// IndexedDB wrapper — the data-models.md stores plus Stage-6 nutrition meta.
// Every store uses { keyPath: 'id' }; date-indexed stores carry one extra index.
// API: openDB · put · get · getAll · remove · getByDateRange · exportDB · importDB
//
// v2 (Stage 6) adds two stores. onupgradeneeded only *creates* stores that don't
// already exist, so existing devices keep all their data; the new stores appear
// empty. No existing store shape changes.

const DB_NAME    = 'peak-os';
const DB_VERSION = 2;

const STORE_DEFS = [
  { name: 'settings'    , keyPath: 'id' },
  { name: 'bodyEntries' , keyPath: 'id', indexes: [{ name: 'date',     unique: true  }] },
  { name: 'healthEntries', keyPath: 'id', indexes: [{ name: 'date',    unique: false }] },
  { name: 'exercises'   , keyPath: 'id' },
  { name: 'templates'   , keyPath: 'id' },
  { name: 'workouts'    , keyPath: 'id', indexes: [{ name: 'date',     unique: false }] },
  { name: 'foods'       , keyPath: 'id' },
  { name: 'meals'       , keyPath: 'id', indexes: [{ name: 'date',     unique: false }] },
  { name: 'peptides'    , keyPath: 'id' },
  { name: 'peptideDoses', keyPath: 'id', indexes: [{ name: 'datetime', unique: false }] },
  { name: 'vials'       , keyPath: 'id' },
  { name: 'bloodPanels' , keyPath: 'id', indexes: [{ name: 'drawDate', unique: false }] },
  { name: 'verdicts'    , keyPath: 'id', indexes: [{ name: 'weekOf',   unique: false }] },
  // Stage 6 — nutrition per-day meta (water, day-type override) + fasting log.
  { name: 'nutritionDays' , keyPath: 'id', indexes: [{ name: 'date',     unique: true  }] },
  { name: 'fastingSessions', keyPath: 'id', indexes: [{ name: 'startedAt', unique: false }] },
];

let _db = null;

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror  = () => reject(req.error);
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      for (const def of STORE_DEFS) {
        if (db.objectStoreNames.contains(def.name)) continue;
        const store = db.createObjectStore(def.name, { keyPath: def.keyPath });
        for (const idx of (def.indexes || [])) {
          store.createIndex(idx.name, idx.name, { unique: idx.unique });
        }
      }
    };
  });
}

function r2p(idbReq) {
  return new Promise((res, rej) => {
    idbReq.onsuccess = () => res(idbReq.result);
    idbReq.onerror   = () => rej(idbReq.error);
  });
}

export async function put(storeName, record) {
  const db  = await openDB();
  const now = new Date().toISOString();
  const rec = { ...record };
  if (!rec.id)        rec.id        = crypto.randomUUID();
  if (!rec.createdAt) rec.createdAt = now;
  rec.updatedAt = now;
  await r2p(db.transaction(storeName, 'readwrite').objectStore(storeName).put(rec));
  return rec;
}

export async function get(storeName, id) {
  const db = await openDB();
  return r2p(db.transaction(storeName, 'readonly').objectStore(storeName).get(id));
}

export async function getAll(storeName) {
  const db = await openDB();
  return r2p(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
}

export async function remove(storeName, id) {
  const db = await openDB();
  return r2p(db.transaction(storeName, 'readwrite').objectStore(storeName).delete(id));
}

// Queries a named date index for records whose date falls in [startDate, endDate] (inclusive).
export async function getByDateRange(storeName, indexName, startDate, endDate) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const index = db.transaction(storeName, 'readonly')
                    .objectStore(storeName)
                    .index(indexName);
    const req = index.getAll(IDBKeyRange.bound(startDate, endDate));
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// Returns a JSON string containing every record in every store.
export async function exportDB() {
  const db     = await openDB();
  const stores = {};
  for (const name of db.objectStoreNames) {
    stores[name] = await r2p(
      db.transaction(name, 'readonly').objectStore(name).getAll()
    );
  }
  return JSON.stringify({ version: DB_VERSION, exportedAt: new Date().toISOString(), stores }, null, 2);
}

// Clears every store then bulk-inserts records from a prior exportDB snapshot.
export async function importDB(jsonString) {
  const db      = await openDB();
  const payload = JSON.parse(jsonString);
  const names   = Object.keys(payload.stores);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
    for (const name of names) {
      const store = tx.objectStore(name);
      store.clear();
      for (const rec of payload.stores[name]) store.put(rec);
    }
  });
}
