// Egress Supabase (2026-11-26 : 5,5/5 GB epuises, grace jusqu'au 26 dec.) :
// ensureAlertPack relisait TOUTES les ~1200 lignes de org_fiscal_alerts (champ
// note enorme) a chaque appel — 9314 appels x 1190 lignes = 11 M lignes lues,
// soit la quasi totalite de l'egress. Le routeur /api/org/alerts appelait en
// plus ensureAlertPack pour CHAQUE dossier du comptable a chaque requete.
// Ces tests figent les deux correctifs : lecture restreinte aux ids du pack,
// et seed cible des seuls dossiers incomplets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { alertPack } from '../src/index.ts';

const SRC = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

test('alertPack : 15 echeances type, ids utilisables pour un IN filtre', () => {
  const p = alertPack(2026);
  assert.equal(p.length, 15, 'pack de depart attendu');
  const ids = new Set(p.map(x => `pack_${x.key}_org_cabinet_001`));
  assert.equal(ids.size, 15, 'ids deterministes uniques');
  assert.ok(p.every(x => x.due_date.startsWith('2026-')), 'due_date porte lan en cours');
});

test('ensureAlertPack : SELECT filtre par id IN (…) et non sur toute la table', () => {
  const start = SRC.indexOf('async function ensureAlertPack');
  assert.ok(start > -1, 'ensureAlertPack presente');
  const body = SRC.slice(start, start + 4000);
  const sel = body.match(/SELECT id, title, due_date[^`]*FROM org_fiscal_alerts[^`]*`/);
  assert.ok(sel, 'SELECT des colonnes du pack present');
  assert.ok(sel[0].includes('id IN ('), 'lecture RESTREINTE aux ids du pack');
  assert.ok(sel[0].includes('organization_id = ?'), 'scope organization_id conserve');
  // L'ancien SELECT sans filtre d'id relisait ~1200 lignes par appel.
  assert.ok(
    !/FROM org_fiscal_alerts WHERE organization_id = \?`/.test(body),
    'plus de SELECT sur toute la table de lorganisation',
  );
  assert.ok(body.includes('packIds.map(() => \'?\')'), 'placeholders construits depuis les ids du pack');
});

test('ensureAlertPack : boucle par dossier supprimee de GET /api/org/alerts', () => {
  const start = SRC.indexOf("path === '/api/org/alerts' && method === 'GET'");
  assert.ok(start > -1, 'route GET /api/org/alerts presente');
  const block = SRC.slice(start, start + 4500);
  assert.ok(
    !block.includes('for (const d of myDossiers as any[]) await ensureAlertPack'),
    'plus de ensureAlertPack appele pour CHAQUE dossier du comptable',
  );
  assert.ok(block.includes('const { results: needSeed }'), 'seed cible via une seule requete');
  assert.ok(block.includes('alertPack(yNow).length'), 'comparaison au nombre d echeances du pack');
  assert.ok(
    block.includes('for (const d of needSeed as any[]) await ensureAlertPack'),
    'seed limite aux dossiers incomplets ou au pack perime',
  );
  // La portee du comptable doit rester filtree par dossierComp().
  assert.ok(block.includes('dossierComp()'), 'scope comptable conserve sur la requete de seed');
});

test('GET /api/org/alerts : pack global toujours seede (vue expert)', () => {
  const start = SRC.indexOf("path === '/api/org/alerts' && method === 'GET'");
  const block = SRC.slice(start, start + 1200);
  assert.ok(
    block.includes('await ensureAlertPack(env.DB, user.organization_id);'),
    'appel unique du pack org avant l emission de la reponse',
  );
});
