import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

// Journal des ajustements de norme (GET /api/org/norms/audit) — traçabilité
// « qui a changé quelle norme, sur quel dossier, quand ». L'entrée d'audit
// dossier_task_norm_updated est déjà écrite par PUT /org/dossiers/:id/norms.

test('endpoint GET /api/org/norms/audit present', () => {
  assert.match(SRC, /path === '\/api\/org\/norms\/audit' && method === 'GET'/);
});

test('journal reserve expert/manager (verifyOrgToken + isSupervisor)', () => {
  const idx = SRC.indexOf("path === '/api/org/norms/audit'");
  assert.ok(idx > 0, 'endpoint audit trouvé');
  const block = SRC.slice(idx, idx + 1600);
  assert.match(block, /const user = await verifyOrgToken\(request\)/);
  assert.match(block, /if \(!user\) return json\(\{ error: 'Non autorisé' \}, 401\)/);
  assert.match(block, /if \(!isSupervisor\(user\.role\)\) return json\(\{ error: 'Réservé au rôle expert\/manager' \}, 403\)/);
});

test('journal filtre les entrees dossier_task_norm_updated de l\'organisation', () => {
  const idx = SRC.indexOf("path === '/api/org/norms/audit'");
  const block = SRC.slice(idx, idx + 2200);
  assert.match(block, /a\.organization_id = \? AND a\.action = 'dossier_task_norm_updated'/);
  assert.match(block, /ORDER BY a\.created_at DESC LIMIT 50/);
  // jointure dossier + client pour afficher « quel dossier »
  assert.match(block, /LEFT JOIN org_dossiers d/);
  assert.match(block, /LEFT JOIN org_clients c/);
  assert.match(block, /\.bind\(user\.organization_id\)\.all\(\)/);
});

test('chaque entree renvoie qui / tache / valeur / quand', () => {
  const idx = SRC.indexOf("path === '/api/org/norms/audit'");
  const block = SRC.slice(idx, idx + 3000);
  assert.match(block, /task_label: details\.task_label/);
  assert.match(block, /norm_seconds: details\.norm_seconds/);
  assert.match(block, /user_name: r\.user_name/);
  assert.match(block, /created_at: r\.created_at/);
  assert.match(block, /JSON\.parse\(r\.details \|\| '\{\}'\)/);
  assert.match(block, /return json\(entries\)/);
});

// L'ecriture reste sur l'endpoint existant : aucune nouvelle table, aucun
// changement sur les 8 elements figes.
test('ecriture toujours via PUT /org/dossiers/:id/norms (aucune nouvelle route d\'ecriture)', () => {
  assert.match(SRC, /orgDossierNormMatch && method === 'PUT'/);
  assert.match(SRC, /'dossier_task_norm_updated', 'dossier', dossierId/);
  assert.match(SRC, /INSERT INTO org_audit_log \(id, organization_id, user_id, user_name, action, target_type, target_id, details\)/);
});
