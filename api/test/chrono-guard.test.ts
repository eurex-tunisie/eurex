// Garde-fou chrono : plafond norme + 30 min (jours ouvres) et coupure 18:00
// heure locale Tunisie (UTC+1). Le calcul est isole dans chronoDayLimit() pour
// etre teste sans base : une regression ici remettrait les chronos oublies
// (16h a 22h enregistrees) ou couperait une journee normale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chronoDayLimit, DAY_TOLERANCE_SECONDS } from '../src/index.ts';

const SRC = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const H = 3600;
// 23/11/2026 est un lundi (donnees de reference du depot).
const MON = (h: number, m = 0) => Date.UTC(2026, 10, 23, h, m, 0);
const SAT = (h: number, m = 0) => Date.UTC(2026, 10, 21, h, m, 0);

test('garde-fou : tolerance de 30 minutes au-dessus de la norme', () => {
  assert.equal(DAY_TOLERANCE_SECONDS, 1800);
});

test('garde-fou : jour ouvré sans pointage -> norme + 30 min', () => {
  const start = MON(8); // 09:00 TN
  const r = chronoDayLimit(start, 30600, 0, start);
  assert.equal(r.day_tn, '2026-11-23');
  assert.equal(r.limit_seconds, 30600 + 1800);
  assert.equal(r.elapsed_seconds, 0);
});

test('garde-fou : plafond = norme + 30 min moins les autres pointages', () => {
  const start = MON(8);
  const r = chronoDayLimit(start, 30600, 30000, start + H * 1000);
  assert.equal(r.limit_seconds, 2400);
  assert.equal(r.elapsed_seconds, H);
});

test('garde-fou : journee deja au plafond -> limite 0', () => {
  const start = MON(8);
  const r = chronoDayLimit(start, 30600, 32400, start);
  assert.equal(r.limit_seconds, 0);
});

test('garde-fou : coupure a 18:00 (17:00 UTC) meme si la norme le permet', () => {
  const start = MON(15); // 16:00 TN
  const r = chronoDayLimit(start, 30600, 0, start);
  assert.equal(r.limit_seconds, 2 * H);
});

test('garde-fou : demarrage apres 18:00 -> limite 0', () => {
  const start = MON(17, 30); // 18:30 TN
  assert.equal(chronoDayLimit(start, 30600, 0, start).limit_seconds, 0);
});

test('garde-fou : week-end sans plafond de norme, coupure 18:00 maintenue', () => {
  const start = SAT(10); // samedi 11:00 TN
  const r = chronoDayLimit(start, 30600, 30000, start);
  assert.equal(r.day_tn, '2026-11-21');
  assert.equal(r.limit_seconds, 7 * H); // 11:00 -> 18:00 TN
});

test('garde-fou : le jour de reference est le jour LOCAL de debut', () => {
  // vendredi 20/11 23:30 UTC = samedi 00:30 TN
  const start = Date.UTC(2026, 10, 20, 23, 30, 0);
  const r = chronoDayLimit(start, 30600, 0, start);
  assert.equal(r.day_tn, '2026-11-21');
});

test('garde-fou : branche sur toutes les lectures du chrono + cron 18:11 TN', () => {
  assert.ok(SRC.includes('async function enforceChronoLimits'));
  assert.ok(SRC.includes("enforceChronoLimits(env.DB, { organizationId: user.organization_id, userId: user.id })"), 'lecture utilisateur');
  assert.ok(SRC.includes('enforceChronoLimits(active.DB, {})'), 'cron tout le cabinet');
  assert.ok(SRC.includes("event.cron === '11 0,6,12,17 * * *'"), 'cron 17:11 UTC = 18:11 TN');
  assert.ok(SRC.includes('just_stopped: guardStopped > 0'), 'etat renvoye au front');
});
