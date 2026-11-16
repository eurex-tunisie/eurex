// Retour en correction depuis la page dossier : le comptable PROPRIETAIRE
// (assigne ou done_by) peut reprendre SA tache en verification, l'expert partout.
//  1. le bouton ↩ du kanban n'appelle plus updateTaskStatus('en_cours') brut :
//     il ouvre le modal motif (orgApi.returnTask) ;
//  2. en vue detail, le comptable proprietaire a « ↩ Reprendre » ;
//  3. le motif (>= 3 car.) est oblige, puis load() recharge le dossier ;
//  4. l'audit affiche task_returned_self (KPI qualite compte task_returned seul).
// Lecture en « ?raw » : on lit le texte de la page, sans rendu React.
import { describe, test, expect } from 'vitest';
import dossierPage from '../OrgDossierPage.tsx?raw';
import orgApiSrc from '../../../lib/orgApi.ts?raw';

describe('helper de propriete de la tache', () => {
  test('isTaskOwner = assigned_comptable_id OU done_by (sans role)', () => {
    expect(dossierPage).toContain('const isTaskOwner = (task: OrgTask) =>');
    expect(dossierPage).toContain('task.assigned_comptable_id === state.user.id || task.done_by === state.user.id');
  });
});

describe('bouton de retour (kanban)', () => {
  test('le ↩ du kanban ouvre le modal motif, pas un changement de statut brut', () => {
    expect(dossierPage).toContain('onClick={() => openReturnModal(task)}');
    expect(dossierPage).toContain('data-testid="task-return-btn"');
    // plus de retour silencieux sans motif ni audit
    expect(dossierPage).not.toContain("updateTaskStatus(task.id, 'en_cours')}\" className=\"px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50");
  });

  test('visible pour l expert/manager OU le proprietaire (a_verifier)', () => {
    expect(dossierPage).toContain('{(isExpert || isTaskOwner(task)) && (');
  });
});

describe('bouton en vue detail', () => {
  test('comptable non-expert et proprietaire : « ↩ Reprendre »', () => {
    expect(dossierPage).toContain("{task.status === 'a_verifier' && !isExpert && isTaskOwner(task) && (");
    expect(dossierPage).toContain('data-testid="task-return-btn-detail"');
    expect(dossierPage).toContain('↩ Reprendre');
  });
});

describe('modal motif', () => {
  test('modal present avec textarea et bouton d envoi', () => {
    expect(dossierPage).toContain('data-testid="task-return-modal"');
    expect(dossierPage).toContain('data-testid="task-return-reason"');
    expect(dossierPage).toContain('data-testid="task-return-submit"');
  });

  test('motif oblige (3 car. mini) avant l appel returnTask', () => {
    expect(dossierPage).toContain("if (reason.length < 3) { alert('Motif requis (3 caractères minimum)'); return; }");
    expect(dossierPage).toContain('await orgApi.returnTask(dossier.id, returnTaskTarget.id, reason);');
  });

  test('apres succes : fermeture du modal + rechargement du dossier', () => {
    expect(dossierPage).toContain('setReturnTaskTarget(null);');
    expect(dossierPage).toContain('submitReturn');
    // le reload est fait via load() comme la validation
    expect(dossierPage).toMatch(/await orgApi\.returnTask\(dossier\.id, returnTaskTarget\.id, reason\);\s*setReturnTaskTarget\(null\);\s*load\(\);/);
  });

  test('busy pendant l envoi, bouton disabled', () => {
    expect(dossierPage).toContain('const [returnBusy, setReturnBusy] = useState(false);');
    expect(dossierPage).toContain('disabled={returnBusy}');
  });
});

describe('affichage audit', () => {
  test('task_returned_self libelle « Reprise par le comptable »', () => {
    expect(dossierPage).toContain("task_returned_self: 'Reprise par le comptable'");
  });
});

describe('orgApi', () => {
  test('returnTask POST le motif vers /return', () => {
    expect(orgApiSrc).toContain('returnTask: (dossierId: string, taskId: string, reason: string)');
    expect(orgApiSrc).toMatch(/`\/org\/dossiers\/\$\{dossierId\}\/tasks\/\$\{taskId\}\/return`, \{ method: 'POST', body: JSON\.stringify\(\{ reason \}\) \}/);
  });
});
