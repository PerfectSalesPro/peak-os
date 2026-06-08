// Stage 2 — Body screen UI.
// Reads: bodyEntries (sync status). Writes: via health-import.js.
// Listens for peak:screen:body and peak:import:done events.

import * as db from './db.js';
import { ingestPayload, ingestManualEntry } from './health-import.js';

export function initBodyScreen() {
  _wireGoalForm();
  _wireQuickEntry();
  _wireJsonPaste();
  _wireGuideToggle();
  window.addEventListener('peak:screen:body', refreshSyncStatus);
  window.addEventListener('peak:import:done', refreshSyncStatus);
  refreshSyncStatus();
}

// ── Goal body fat % form ──────────────────────────────────────────────────────

function _wireGoalForm() {
  const input  = document.getElementById('goal-bf-input');
  const submit = document.getElementById('goal-bf-submit');
  const fb     = document.getElementById('goal-bf-feedback');
  if (!input || !submit) return;

  // Pre-populate from stored settings
  db.get('settings', 'user').then(s => {
    if (s?.goalBodyFatPct != null) input.value = s.goalBodyFatPct;
  });

  submit.addEventListener('click', async () => {
    const val = parseFloat(input.value);
    if (isNaN(val) || val < 1 || val > 50) {
      _setFeedback(fb, 'Enter a body fat % between 1 and 50.', 'error');
      return;
    }
    _setBtnState(submit, true, 'Saving…');
    try {
      const existing = (await db.get('settings', 'user')) ?? {};
      await db.put('settings', { ...existing, id: 'user', goalBodyFatPct: val });
      _setFeedback(fb, `Goal set: ${val.toFixed(1)}%`, 'success');
      window.dispatchEvent(new CustomEvent('peak:import:done'));
    } catch (err) {
      _setFeedback(fb, err.message, 'error');
    } finally {
      _setBtnState(submit, false, 'Save Goal');
    }
  });
}

// ── Quick Entry form ──────────────────────────────────────────────────────────

function _wireQuickEntry() {
  const submit = document.getElementById('me-submit');
  const dateEl = document.getElementById('me-date');
  const wtEl   = document.getElementById('me-weight');
  const bfEl   = document.getElementById('me-bf');
  const fb     = document.getElementById('me-feedback');
  if (!submit) return;

  dateEl.value = _today();

  submit.addEventListener('click', async () => {
    _clearFeedback(fb);
    _setBtnState(submit, true, 'Saving…');
    try {
      await ingestManualEntry({
        date:       dateEl.value,
        weightLbs:  wtEl.value  || null,
        bodyFatPct: bfEl.value  || null,
      });
      _setFeedback(fb, 'Logged.', 'success');
      wtEl.value   = '';
      bfEl.value   = '';
      dateEl.value = _today();
      await refreshSyncStatus();
    } catch (err) {
      _setFeedback(fb, err.message, 'error');
    } finally {
      _setBtnState(submit, false, 'Log Entry');
    }
  });
}

// ── Paste-JSON import form ────────────────────────────────────────────────────

function _wireJsonPaste() {
  const submit  = document.getElementById('json-submit');
  const textarea = document.getElementById('json-paste');
  const fb      = document.getElementById('json-feedback');
  if (!submit) return;

  submit.addEventListener('click', async () => {
    _clearFeedback(fb);
    _setBtnState(submit, true, 'Importing…');

    let raw;
    try {
      raw = JSON.parse(textarea.value.trim());
    } catch {
      _setFeedback(fb, 'Invalid JSON — check the text and try again.', 'error');
      _setBtnState(submit, false, 'Import');
      return;
    }

    try {
      const result = await ingestPayload(raw, 'import');
      _setFeedback(fb, `Imported for ${result.date}.`, 'success');
      textarea.value = '';
      await refreshSyncStatus();
      window.peakShowToast?.(`Synced ${result.date}`, 'blue');
    } catch (err) {
      _setFeedback(fb, err.message, 'error');
    } finally {
      _setBtnState(submit, false, 'Import');
    }
  });
}

// ── Shortcut setup guide (collapsible) ───────────────────────────────────────

function _wireGuideToggle() {
  const toggle  = document.getElementById('guide-toggle');
  const body    = document.getElementById('guide-body');
  const chevron = toggle?.querySelector('.guide-chevron');
  if (!toggle || !body) return;

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    body.hidden = expanded;
    if (chevron) chevron.style.transform = expanded ? '' : 'rotate(180deg)';
  });
}

// ── Sync status refresh ───────────────────────────────────────────────────────
// Stage 3: only updates the header pill text; dashboard owns the data display.

export async function refreshSyncStatus() {
  const pill = document.getElementById('sync-status-pill');
  if (!pill) return;

  try {
    const allBody = await db.getAll('bodyEntries');
    if (!allBody.length) { _setPillText(pill, '—'); return; }
    allBody.sort((a, b) => b.date.localeCompare(a.date));
    _setPillText(pill, `Synced ${_formatTime(allBody[0].updatedAt)}`);
  } catch {
    _setPillText(pill, '—');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _today() { return new Date().toISOString().slice(0, 10); }

function _formatTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  catch { return '—'; }
}

function _setPillText(pill, text) {
  const span = pill?.querySelector('[id="sync-status-text"]');
  if (span) span.textContent = text;
}

function _setBtnState(btn, disabled, label) {
  btn.disabled     = disabled;
  btn.textContent  = label;
}

function _clearFeedback(el) { el.textContent = ''; el.className = 'form-feedback'; }

function _setFeedback(el, msg, type) {
  el.textContent = msg;
  el.className   = `form-feedback fb-${type}`;
}
