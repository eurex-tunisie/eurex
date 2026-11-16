import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

// Acces CLIENT pour le comptable en renfort : orgCanAccessClient devait
// compter le proprietaire SEUL → le picker « Choisir les dossiers »
// (GET /org/clients/:id/dossiers) renvoyait 403 « Accès refusé » alors que
// le comptable avait pourtant un grant actif sur un dossier du client.
// Fix : un grant actif sur UN dossier du client ouvre l'acces au client.

function accessClientBlock(): string {
  const idx = SRC.indexOf('async function orgCanAccessClient');
  assert.ok(idx > 0, 'orgCanAccessClient trouvé');
  return SRC.slice(idx, idx + 900);
}

test('orgCanAccessClient : proprietaire OU grant actif sur un dossier du client', () => {
  const block = accessClientBlock();
  assert.match(block, /if \(isSupervisor\(user\.role\)\) return true;/);
  assert.match(block, /if \(c\?\.assigned_comptable_id === user\.id\) return true;/);
  // nouveau : join grants -> dossiers du client
  assert.match(block, /SELECT 1 AS x FROM org_dossier_grants g JOIN org_dossiers d ON d\.id = g\.dossier_id WHERE d\.client_id = \? AND g\.granted_to = \? AND \$\{ORG_GRANT_ACTIVE\}/);
  assert.match(block, /return !!g;/);
  // l'ancien return direct (sans grant) n'existe plus
  assert.ok(!/return c\?\.assigned_comptable_id === user\.id;\s*\}/.test(block), 'plus de retour direct proprietaire seul');
});

test('le picker GET /org/clients/:id/dossiers passe par orgCanAccessClient', () => {
  const idx = SRC.indexOf("path.match(/^\\/api\\/org\\/clients\\/([^/]+)\\/dossiers$/)");
  assert.ok(idx > 0, 'route clients/:id/dossiers trouvée');
  const block = SRC.slice(idx, idx + 700);
  assert.match(block, /if \(!await orgCanAccessClient\(user, orgClientDossiersMatch\[1\]\)\) return json\(\{ error: 'Accès refusé' \}, 403\)/);
  // le picker liste TOUS les dossiers du client (tous exercices), ordre desc
  assert.match(block, /SELECT \* FROM org_dossiers WHERE client_id = \? ORDER BY exercice DESC/);
});

test('creation de dossier : garde expert AVANT l acces client (pas d elargissement)', () => {
  const iPost = SRC.indexOf("orgClientDossiersMatch && method === 'POST'");
  assert.ok(iPost > 0, 'handler POST trouvé');
  const block = SRC.slice(iPost, iPost + 900);
  const iGuard = block.indexOf("La création de dossiers est réservée");
  const iAccess = block.indexOf('orgCanAccessClient');
  assert.ok(iGuard > 0, 'garde creation presente');
  assert.ok(iAccess > iGuard, 'orgCanAccessClient appele APRES la garde expert');
});

test('self-service : le comptable ne s auto-grante que s il a deja un renfort sur le client', () => {
  const idx = SRC.indexOf('const selfService = !isSupervisor(user.role);');
  assert.ok(idx > 0, 'flag selfService trouvé');
  const block = SRC.slice(idx, idx + 1200);
  assert.match(block, /if \(user\.role !== 'comptable' \|\| granted_to !== user\.id\) return json\(\{ error: 'Seul un expert\/manager peut ouvrir un renfort pour un autre comptable' \}, 403\)/);
  // source : grant actif AUTRE dossier du meme client
  assert.match(block, /FROM org_dossier_grants g JOIN org_dossiers d ON g\.dossier_id = d\.id WHERE g\.granted_to = \? AND d\.client_id = \? AND g\.dossier_id <> \?/);
  assert.match(block, /if \(!src\) return json\(\{ error: 'Accès non autorisé à ce client' \}, 403\)/);
  // duree + echeance reprises du renfort source
  assert.match(block, /grantDays = src\.days;/);
  assert.match(block, /expiresAt = src\.expires_at;/);
});

test('grants/mine expose d.exercice (filtre de la carte renfort par exercice)', () => {
  const idx = SRC.indexOf("path === '/api/org/grants/mine' && method === 'GET'");
  assert.ok(idx > 0, 'endpoint grants/mine trouvé');
  const block = SRC.slice(idx, idx + 700);
  assert.match(block, /g\.expires_at, g\.created_at, d\.exercice, d\.status, c\.name as client_name/);
  assert.match(block, /WHERE g\.granted_to = \? AND g\.revoked_at IS NULL/);
});
