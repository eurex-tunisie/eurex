import { describe, it, expect } from 'vitest';
import { pickClientAccounts, findClientAccount, resolveClientAccount, nextClientCode, addClientAccount, type PlanAccount } from '../scanPlan';
import defaultPlanJson from '../scanPlanDefault.json';

const rows: any[][] = [
  ['Code', 'Libelle', 'Nature', 'Sens'],
  ['411000', 'CLIENTS ORDINAIRES', 'Comptable', 'DC'],
  ['411279', 'PUSTERLA TUNISIE', 'Comptable', 'DC'],
  ['411280', '  Société Générale  ', 'Comptable', 'DC'],
  ['411281', 'PUSTERLA', 'Comptable', 'DC'],
  ['512000', 'BANQUE', 'Comptable', 'DC'],
  ['411279', 'DOUBLON', 'Comptable', 'DC'],
  ['411282', '', 'Comptable', 'DC'],
];

describe('plan comptable clients', () => {
  it('ne garde que les comptes 411XXX avec libelle, sans doublon', () => {
    const plan = pickClientAccounts(rows);
    expect(plan.map(a => a.code)).toEqual(['411000', '411279', '411280', '411281']);
    expect(plan[1].libelle).toBe('PUSTERLA TUNISIE');
  });

  it('retrouve le compte par nom exact (casse/accents/espaces ignores)', () => {
    const plan = pickClientAccounts(rows);
    expect(findClientAccount(plan, 'Pusterla Tunisie')).toBe('411279');
    expect(findClientAccount(plan, '  PUSTERLA   TUNISIE ')).toBe('411279');
    expect(findClientAccount(plan, 'societe generale')).toBe('411280');
  });

  it('ne renvoie pas 411000 quand le nom est inconnu', () => {
    const plan = pickClientAccounts(rows);
    expect(findClientAccount(plan, 'Client Inconnu SARL')).toBeNull();
  });

  it('priorite au libelle exact quand plusieurs correspondent', () => {
    const plan = pickClientAccounts(rows);
    expect(findClientAccount(plan, 'PUSTERLA')).toBe('411281');
    expect(findClientAccount(plan, 'Pusterla Tunisie SARL')).toBe('411279');
  });

  it('priorite au mapping manuel par code client', () => {
    const plan = pickClientAccounts(rows);
    expect(resolveClientAccount({ 'CLT1025-1067': '411999' }, plan, 'CLT1025-1067', 'Pusterla Tunisie')).toBe('411999');
    expect(resolveClientAccount({}, plan, 'CLT1025-1067', 'Pusterla Tunisie')).toBe('411279');
    expect(resolveClientAccount({}, plan, 'CLT0000-0000', 'Inconnu')).toBe('411000');
  });
});

describe('plan comptable par defaut (embarque dans l app)', () => {
  const plan = defaultPlanJson as PlanAccount[];

  it('contient les 537 comptes clients SCANFLASH', () => {
    expect(plan.length).toBe(537);
  });

  it('affecte Pusterla Tunisie au 411279 sans import', () => {
    expect(resolveClientAccount({}, plan, 'CLT1025-1067', 'Pusterla Tunisie')).toBe('411279');
  });

  it('retombe sur 411000 pour un client absent du plan', () => {
    expect(findClientAccount(plan, 'CLIENT QUI N EXISTE PAS')).toBeNull();
    expect(resolveClientAccount({}, plan, '', 'CLIENT QUI N EXISTE PAS')).toBe('411000');
  });
});

describe('ajout d un nouveau compte client', () => {
  const plan = defaultPlanJson as PlanAccount[];

  it('suggere le prochain numero libre', () => {
    const last = plan[plan.length - 1].code;
    const next = nextClientCode(plan);
    expect(/^411\d{3,}$/.test(next)).toBe(true);
    expect(Number(next.slice(3))).toBeGreaterThan(Number(last.slice(3)));
    expect(plan.some(a => a.code === next)).toBe(false);
  });

  it('ajoute un compte et le rend trouvable par nom', () => {
    const next = nextClientCode(plan);
    const updated = addClientAccount(plan, next, 'Nouveau Client SARL');
    expect(updated).not.toBeNull();
    expect(updated!.some(a => a.code === next)).toBe(true);
    expect(findClientAccount(updated!, 'Nouveau Client SARL')).toBe(next);
  });

  it('refuse un code invalide, un libelle vide ou un doublon', () => {
    expect(addClientAccount(plan, '512000', 'Banque')).toBeNull();
    expect(addClientAccount(plan, '411999', '')).toBeNull();
    expect(addClientAccount(plan, plan[1].code, 'Doublon')).toBeNull();
  });
});
