import { describe, it, expect } from 'vitest';
import { pickClientAccounts, findClientAccount, resolveClientAccount } from '../scanPlan';

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
