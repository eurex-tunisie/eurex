import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

// Depassements de norme (GET /api/org/norms/overages) : lecture seule,
// taches dont le temps depasse la norme effective (norme dossier > modele),
// avec les trois roles (assigne / pointe / termine) et le motif de retard.

function endpointBlock(): string {
  const idx = SRC.indexOf("path === '/api/org/norms/overages'");
  assert.ok(idx > 0, 'endpoint overages trouvé');
  const end = SRC.indexOf('// --- ORG: TRANSFERT DE DOSSIER', idx);
  return SRC.slice(idx, end > 0 ? end : idx + 6000);
}

test('endpoint GET /api/org/norms/overages present', () => {
  assert.match(SRC, /path === '\/api\/org\/norms\/overages' && method === 'GET'/);
});

test('depassements reserves expert/manager (verifyOrgToken + isSupervisor)', () => {
  const block = endpointBlock();
  assert.match(block, /const user = await verifyOrgToken\(request\)/);
  assert.match(block, /if \(!user\) return json\(\{ error: 'Non autorisé' \}, 401\)/);
  assert.match(block, /if \(!isSupervisor\(user\.role\)\) return json\(\{ error: 'Réservé au rôle expert\/manager' \}, 403\)/);
});

test('norme effective = COALESCE(norme dossier, norme modele)', () => {
  const block = endpointBlock();
  assert.match(block, /LEFT JOIN org_dossier_task_norms n ON n\.dossier_id = t\.dossier_id AND n\.task_label = t\.label/);
  assert.match(block, /COALESCE\(n\.norm_seconds, t\.norm_seconds\) AS effective_norm/);
  // condition de depassement : temps > norme effective, norme obligatoire
  assert.match(block, /COALESCE\(n\.norm_seconds, t\.norm_seconds\) IS NOT NULL/);
  assert.match(block, /COALESCE\(t\.total_time_seconds, 0\) > COALESCE\(n\.norm_seconds, t\.norm_seconds\)/);
});

test('perimetre : organisation, taches non masquees, pire d\'abord, limite 100', () => {
  const block = endpointBlock();
  assert.match(block, /c\.organization_id = \?/);
  assert.match(block, /t\.hidden = 0/);
  assert.match(block, /ORDER BY gap_seconds DESC LIMIT 100/);
});

test('les trois roles : assigne, termine par, et motif de retard', () => {
  const block = endpointBlock();
  assert.match(block, /t\.late_reason/);
  assert.match(block, /au\.full_name AS assigned_name/);
  assert.match(block, /du\.full_name AS done_by_name/);
  assert.match(block, /LEFT JOIN org_users au ON t\.assigned_comptable_id = au\.id/);
  assert.match(block, /LEFT JOIN org_users du ON t\.done_by = du\.id/);
});

test('qui a pointe : requete DISTINCT sur org_time_entries par paquets d\'ids', () => {
  const block = endpointBlock();
  assert.match(block, /SELECT DISTINCT te\.task_id, u\.full_name FROM org_time_entries te JOIN org_users u/);
  assert.match(block, /te\.task_id IN \(\$\{chunk\.map\(\(\) => '\?'\)\.join\(','\)\}\)/);
  assert.match(block, /chunkIds\(rows\.map\(r => r\.task_id\)\)/);
  assert.match(block, /workers: workersByTask\.get\(r\.task_id\) \|\| \[\]/);
});

test('fallback : comptable du dossier (dossierComp) si tache non assignee', () => {
  const block = endpointBlock();
  assert.match(block, /dc\.full_name AS dossier_comptable_name/);
  assert.match(block, /LEFT JOIN org_users dc ON \$\{dossierComp\(\)\} = dc\.id/);
  // l'assignation de la tache reste visible telle quelle
  assert.match(block, /au\.full_name AS assigned_name/);
});

test('lecture seule : aucune ecriture dans le bloc', () => {
  const block = endpointBlock();
  assert.ok(!/INSERT INTO|UPDATE |DELETE FROM/.test(block), 'aucune écriture SQL dans l\'endpoint overages');
  assert.match(block, /return json\(rows\.map/);
});
