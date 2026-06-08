// Stage 2 — Apple Health import logic.
// Pure functions: validate · parse · upsert · ingest · manual entry.
// No DOM coupling. Calls db.js + calc.js only.

import * as db   from './db.js';
import * as calc from './calc.js';

const SCHEMA = 'peakos.health.v1';

// ── Validation ────────────────────────────────────────────────────────────────

export function validatePayload(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Payload must be a JSON object.' };
  if (raw.schema !== SCHEMA)
    return { ok: false, error: `Unknown schema "${raw.schema || ''}" — expected "${SCHEMA}".` };
  if (!raw.date || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date))
    return { ok: false, error: 'Missing or invalid date field (expected YYYY-MM-DD).' };
  return { ok: true };
}

// ── Parsing (no side effects) ─────────────────────────────────────────────────

export function parsePayload(raw, source = 'shortcut') {
  const date    = raw.date;
  const body    = raw.body    || {};
  const health  = raw.health  || {};
  const humeRaw = body.hume   || {};

  // Body entry
  const bodyEntry = { date, source };
  if (body.weightLbs  != null) bodyEntry.weightLbs  = +body.weightLbs;
  if (body.bodyFatPct != null) bodyEntry.bodyFatPct = +body.bodyFatPct;

  // Recompute lean/fat mass whenever both are present (60% engine)
  if (bodyEntry.weightLbs != null && bodyEntry.bodyFatPct != null) {
    bodyEntry.leanMassLbs = +calc.leanMass(bodyEntry.weightLbs, bodyEntry.bodyFatPct).toFixed(2);
    bodyEntry.fatMassLbs  = +calc.fatMass (bodyEntry.weightLbs, bodyEntry.bodyFatPct).toFixed(2);
  }

  // Hume block — each field independently optional
  const humeKeys = ['muscleMassLbs', 'visceralFatLevel', 'bodyWaterPct',
                    'boneMassLbs', 'softLeanMassLbs', 'waistHipRatio'];
  const hume = {};
  for (const k of humeKeys) {
    if (humeRaw[k] != null) hume[k] = +humeRaw[k];
  }
  if (Object.keys(hume).length) bodyEntry.hume = hume;

  // Health entry
  const healthEntry = { date, source };
  for (const k of ['hrvMs', 'restingHr', 'sleepHours', 'activeCalories', 'steps']) {
    if (health[k] != null) healthEntry[k] = +health[k];
  }

  return { bodyEntry, healthEntry };
}

// ── Upsert by date ────────────────────────────────────────────────────────────
// If a record with this date exists: overwrite it (same id, preserving createdAt).
// If not: insert a new record.

async function upsertByDate(storeName, date, newData) {
  const dbInst = await db.openDB();

  const existing = await new Promise((resolve, reject) => {
    const tx  = dbInst.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).index('date').get(date);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });

  if (existing) {
    const merged = {
      ...existing,
      ...newData,
      date,
      id:        existing.id,
      createdAt: existing.createdAt,
    };
    return db.put(storeName, merged);
  }
  return db.put(storeName, { ...newData, date });
}

// ── Ingest full payload (Shortcut or paste) ───────────────────────────────────

export async function ingestPayload(raw, source = 'shortcut') {
  const v = validatePayload(raw);
  if (!v.ok) throw new Error(v.error);

  const { bodyEntry, healthEntry } = parsePayload(raw, source);
  const [body, health] = await Promise.all([
    upsertByDate('bodyEntries',  bodyEntry.date,   bodyEntry),
    upsertByDate('healthEntries', healthEntry.date, healthEntry),
  ]);
  return { body, health, date: raw.date };
}

// ── Manual single-field entry ─────────────────────────────────────────────────

export async function ingestManualEntry({ date, weightLbs, bodyFatPct }) {
  if (!date) throw new Error('Date is required.');

  const w  = weightLbs  !== '' && weightLbs  != null ? +weightLbs  : null;
  const bf = bodyFatPct !== '' && bodyFatPct != null ? +bodyFatPct : null;

  if (w  === null && bf === null) throw new Error('Enter at least weight or body fat %.');
  if (w  !== null && (isNaN(w)  || w  <= 0))   throw new Error('Weight must be a positive number.');
  if (bf !== null && (isNaN(bf) || bf < 0 || bf >= 100))
    throw new Error('Body fat % must be between 0 and 100.');

  const entry = { date, source: 'manual' };
  if (w  !== null) entry.weightLbs  = w;
  if (bf !== null) entry.bodyFatPct = bf;
  if (entry.weightLbs != null && entry.bodyFatPct != null) {
    entry.leanMassLbs = +calc.leanMass(entry.weightLbs, entry.bodyFatPct).toFixed(2);
    entry.fatMassLbs  = +calc.fatMass (entry.weightLbs, entry.bodyFatPct).toFixed(2);
  }
  return upsertByDate('bodyEntries', date, entry);
}

// ── URL param decode ──────────────────────────────────────────────────────────
// The iOS Shortcut base64-encodes the JSON and appends it as ?import=<value>.

export function decodeImportParam(val) {
  try {
    // Support both standard and URL-safe base64
    const b64  = val.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}
