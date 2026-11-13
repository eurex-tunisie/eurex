import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

// Depassements de norme (GET /api/org/norms/overages) : lecture seule,
// taches dont le temps depasse la norme effective (norme dossier > modele).

test('endpoint GET /api/org/norms/overages present', () => {
  assert.match(SRC, /path === '\/api\/org\/norms\/overages' && method === 'GET'/);
});

test('depassements reserves expert/manager (verifyOrgToken + isSupervisor)', () => {
  const idx = SRC.indexOf("path === '/api/org/norms/overages'");
  assert.ok(idx > 0, 'endpoint overages trouvé');
  const block = SRC.slice(idx, idx + 1600);
  assert.match(block, /const user = await verifyOrgToken\(request\)/);
  assert.match(block, /if \(!user\) return json\(\{ error: 'Non autorisé' \}, 401\)/);
  assert.match(block, /if \(!isSupervisor\(user\.role\)\) return json\(\{ error: 'Réservé au rôle expert\/manager' \}, 403\)/);
});

test('norme effective = COALESCE(norme dossier, norme modele)', () => {
  const idx = SRC.indexOf("path === '/api/org/norms/overages'");
  const block = SRC.slice(idx, idx + 2400);
  assert.match(block, /LEFT JOIN org_dossier_task_norms n ON n\.dossier_id = t\.dossier_id AND n\.task_label = t\.label/);
  assert.match(block, /COALESCE\(n\.norm_seconds, t\.norm_seconds\) AS effective_norm/);
  // condition de depassement : temps > norme effective, norme obligatoire
  assert.match(block, /COALESCE\(n\.norm_seconds, t\.norm_seconds\) IS NOT NULL/);
  assert.match(block, /COALESCE\(t\.total_time_seconds, 0\) > COALESCE\(n\.norm_seconds, t\.norm_seconds\)/);
});

test('perimetre : organisation, taches non masquees, pire d\'abord, limite 100', () => {
  const idx = SRC.indexOf("path === '/api/org/norms/overages'");
  const block = SRC.slice(idx, idx + 2400);
  assert.match(block, /c\.organization_id = \?/);
  assert.match(block, /t\.hidden = 0/);
  assert.match(block, /ORDER BY gap_seconds DESC LIMIT 100/);
});

test('lecture seule : aucune ecriture dans le bloc', () => {
  const idx = SRC.indexOf("path === '/api/org/norms/overages'");
  const block = SRC.slice(idx, idx + 2400);
  const end = block.indexOf('// --- ORG: TRANSFERT DE DOSSIER');
  const endpoint = end > 0 ? block.slice(0, end) : block;
  assert.ok(!/INSERT INTO|UPDATE |DELETE FROM/.test(endpoint), 'aucune écriture SQL dans l\'endpoint overages');
  assert.match(endpoint, /return json\(results\)/);
});
