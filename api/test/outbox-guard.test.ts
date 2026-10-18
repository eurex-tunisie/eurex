// Le journal de rejeu (outbox) et le drapeau forward_gap ont des delais de vie
// SEPARES : une reparation partielle reecrit le journal (nouveau delai) sans
// retoucher le drapeau, qui peut donc expirer le premier. Le journal survit
// alors SEUL, et plus rien ne le rejouait — pire, la copie nocturne
// Supabase -> D1 ecrasait l'ecriture que D1 avait retenue.
//
// Constate en production le 2026-10-18 : un UPDATE org_clients (portal_token)
// en attente depuis le 15, drapeau disparu, journal orphelin.
//
// Ce test verrouille les deux moities du correctif :
//   1. outboxEnAttente compte les ecritures en attente et ne leve jamais ;
//   2. le cron de resync ET /internal/resync consultent ce compteur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { outboxEnAttente } from '../src/index.ts';

function envAvec(store: Record<string, string | null>): any {
  return {
    DOCS_KV: {
      get: async (k: string) => (k in store ? store[k] : null),
      put: async () => {},
      delete: async () => {},
    },
    DB: {},
  };
}

test('outboxEnAttente : journal absent ou vide -> 0', async () => {
  assert.equal(await outboxEnAttente(envAvec({})), 0);
  assert.equal(await outboxEnAttente(envAvec({ '__backend/forward_gap': '2026-10-15T00:00:00Z' })), 0);
  assert.equal(await outboxEnAttente(envAvec({ '__backend/outbox': '[]' })), 0);
});

test('outboxEnAttente : compte les ecritures conservees', async () => {
  const une = JSON.stringify([{ s: 'UPDATE org_clients SET portal_token = ? WHERE id = ?', p: ['jeton', 'client'] }]);
  assert.equal(await outboxEnAttente(envAvec({ '__backend/outbox': une })), 1);
  const trois = JSON.stringify([{ s: 'a', p: [] }, { s: 'b', p: [] }, { s: 'c', p: [] }]);
  assert.equal(await outboxEnAttente(envAvec({ '__backend/outbox': trois })), 3);
});

test('outboxEnAttente : journal illisible ou KV absent -> 0, sans lever', async () => {
  assert.equal(await outboxEnAttente(envAvec({ '__backend/outbox': '{tronque' })), 0);
  assert.equal(await outboxEnAttente(envAvec({ '__backend/outbox': '"texte"' })), 0);
  assert.equal(await outboxEnAttente({ DB: {} } as any), 0);
  assert.equal(await outboxEnAttente({} as any), 0);
});

const SOURCE = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

test('le cron de resync rejoue le journal meme si le drapeau a disparu', () => {
  const debut = SOURCE.indexOf('async function resyncAndFlipBack');
  assert.ok(debut > 0, 'fonction presente');
  const corps = SOURCE.slice(debut, SOURCE.indexOf('\n}\n', debut));
  assert.match(corps, /const reliquat = await outboxEnAttente\(env\)/, 'le cron compte le journal');
  assert.match(corps, /if \(fwd \|\| reliquat > 0\)/, 'le cron s\'abstient tant que le journal n\'est pas vide');
});

test('les deux chemins de retour sur D1 consultent le journal, pas seulement le drapeau', () => {
  // 3 tests dans /internal/resync (dry / passage outre / reparation) + 1 dans le cron.
  const gardes = SOURCE.split('reliquat > 0').length - 1;
  assert.ok(gardes >= 4, 'gardes trouvees : ' + gardes);
  assert.equal(SOURCE.split('const reliquat = await outboxEnAttente(env);').length - 1, 2);
});

test('l etat du backend publie le journal en attente sans le reparser', () => {
  assert.match(SOURCE, /outbox: await outboxEnAttente\(env\)/);
});
