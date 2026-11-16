import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

// Duplication de dossier ouverte au comptable (retour en exercice passe) :
//  - expert/manager : tout dossier de l'org, tout exercice, changement de client OK
//  - comptable : uniquement SES dossiers (orgCanAccessDossier), exercice PASSE
//    (isAncientExercice) et sans changement de client
//  - exercice passe -> UNE tâche « Suivi exercice ancien » (pas de checklist)

function endpointBlock(): string {
  const idx = SRC.indexOf("path.match(/^\\/api\\/org\\/dossiers\\/([^/]+)\\/duplicate$/)");
  assert.ok(idx > 0, 'endpoint duplicate trouvé');
  const end = SRC.indexOf('// --- ORG:', idx + 10);
  return SRC.slice(idx, end > 0 ? end : idx + 5000);
}

test('endpoint POST duplicate present', () => {
  assert.match(SRC, /orgDupMatch = path\.match\(\/\^\\\/api\\\/org\\\/dossiers\\\/\(\[\^\/\]\+\)\\\/duplicate\$\/\)/);
  assert.match(SRC, /orgDupMatch && method === 'POST'/);
});

test('authentification requise (plus de garde expert en dur avant le fetch)', () => {
  const block = endpointBlock();
  assert.match(block, /const user = await verifyOrgToken\(request\);\s*if \(!user\) return json\(\{ error: 'Non autorisé' \}, 401\)/);
  // l'ancienne garde unique « Réservé au rôle expert » avant lecture du src est retiree
  assert.ok(!block.includes("if (!user || !isSupervisor(user.role)) return json({ error: 'Réservé au rôle expert' }, 403);"), 'plus de garde expert bloquante');
});

test('src org-scoped puis permission : superviseur OU acces au dossier', () => {
  const block = endpointBlock();
  assert.match(block, /SELECT d\.\*, c\.assigned_comptable_id[\s\S]*?WHERE d\.id = \? AND c\.organization_id = \?/);
  assert.match(block, /if \(!src\) return json\(\{ error: 'Dossier source introuvable' \}, 404\)/);
  assert.match(block, /const dupSup = isSupervisor\(user\.role\)/);
  assert.match(block, /if \(!dupSup && !await orgCanAccessDossier\(user, orgDupMatch\[1\]\)\) return json\(\{ error: 'Accès refusé' \}, 403\)/);
});

test('comptable : exercice PASSE uniquement (retour arriere)', () => {
  const block = endpointBlock();
  assert.match(block, /if \(!dupSup\) \{\s*if \(!isAncientExercice\(targetYear\)\) return json\(\{ error: 'Le comptable ne peut dupliquer que vers un exercice passé' \}, 403\)/);
});

test('comptable : pas de changement de client (transfert = expert)', () => {
  const block = endpointBlock();
  assert.match(block, /if \(targetClient !== src\.client_id\) return json\(\{ error: 'Le comptable ne peut pas changer de client' \}, 403\)/);
  // ... mais la verification d'existence du client cible reste (expert)
  assert.match(block, /SELECT id FROM org_clients WHERE id = \? AND organization_id = \? AND deleted_at IS NULL/);
});

test('exercice cible valide + doublon refuse (409)', () => {
  const block = endpointBlock();
  assert.match(block, /if \(!Number\.isInteger\(targetYear\) \|\| targetYear < 2000 \|\| targetYear > 2100\) return json\(\{ error: 'Exercice invalide' \}, 400\)/);
  assert.match(block, /SELECT id FROM org_dossiers WHERE client_id = \? AND exercice = \?/);
  assert.match(block, /Un dossier existe déjà pour ce client sur l/);
});

test('exercice passe -> tâche unique ANCIENT_TASK_LABEL, pas de checklist', () => {
  const block = endpointBlock();
  assert.match(block, /const ancientDup = isAncientExercice\(targetYear\)/);
  assert.match(block, /if \(ancientDup\) \{\s*\/\/ Exercice passe : UNE tâche de suivi au lieu de la copie de la check-list/);
  assert.match(block, /\.bind\(genId\(\), newDossierId, ANCIENT_TASK_LABEL, src\.assigned_comptable_id \|\| null\)\.run\(\)/);
  // la copie des tâches et des documents est vide pour un exercice passe
  assert.match(block, /for \(const t of \(ancientDup \? \[\] : srcTasks\) as any\[\]\) \{/);
  assert.match(block, /for \(const doc of \(ancientDup \? \[\] : srcDocs\) as any\[\]\) \{/);
});

test('audit dossier_duplicated conserve (ancien: true)', () => {
  const block = endpointBlock();
  assert.match(block, /\\'dossier_duplicated\\', \\'dossier\\'/);
  assert.match(block, /\.\.\.\(ancientDup \? \{ ancien: true \} : \{\}\)/);
});
