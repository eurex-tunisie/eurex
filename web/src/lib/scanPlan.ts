// Plan comptable des clients (comptes 411XXX) importe depuis un XLSX.
// Permet d'affecter automatiquement le bon compte 411 au lieu de 411000.

export interface PlanAccount {
  code: string;
  libelle: string;
}

export function normalizePlanName(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

// Garde uniquement les comptes clients 411XXX avec un libelle, sans doublon.
export function pickClientAccounts(rows: any[][]): PlanAccount[] {
  const out: PlanAccount[] = [];
  const seen = new Set<string>();
  for (const r of rows || []) {
    if (!Array.isArray(r)) continue;
    const code = String(r[0] ?? '').trim();
    const libelle = String(r[1] ?? '').trim();
    if (!/^411\d*$/.test(code) || !libelle || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, libelle });
  }
  return out;
}

// Retrouve le compte d'un client : correspondance exacte du libelle, sinon
// inclusion (le plus long libelle gagne). 411000 (clients ordinaires) est exclu.
export function findClientAccount(plan: PlanAccount[], clientName: string | null | undefined): string | null {
  const target = normalizePlanName(clientName);
  if (!target || target.length < 3) return null;
  const usable = (plan || []).filter(a => a.code !== '411000');
  const exact = usable.find(a => normalizePlanName(a.libelle) === target);
  if (exact) return exact.code;
  const candidates = usable.filter(a => {
    const n = normalizePlanName(a.libelle);
    return n.length >= 3 && (n.includes(target) || target.includes(n));
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.libelle.length - a.libelle.length);
  return candidates[0].code;
}

// Compte final d'une facture : mapping manuel (code client) > plan comptable (nom) > 411000.
export function resolveClientAccount(
  clientMap: Record<string, string>,
  plan: PlanAccount[],
  codeClient: string | null | undefined,
  clientName: string | null | undefined,
): string {
  const code = (codeClient || '').trim();
  if (code && clientMap && clientMap[code]) return clientMap[code];
  return findClientAccount(plan, clientName) || '411000';
}

// Un compte client SCANFLASH est un code a 6 chiffres : 411XXX.
export function isValidClientCode(code: string | null | undefined): boolean {
  return /^411\d{3}$/.test((code || '').trim());
}

// Prochain numero de compte client libre (411XXX, 6 chiffres). Si la plage est
// saturee (411999 deja pris), on redescend pour trouver le premier libre.
export function nextClientCode(plan: PlanAccount[]): string {
  const used = new Set<number>();
  for (const a of plan || []) {
    if (isValidClientCode(a.code)) used.add(Number(a.code.slice(3)));
  }
  let n = 1;
  for (const v of used) n = Math.max(n, v + 1);
  while (n <= 999 && used.has(n)) n++;
  if (n > 999) {
    n = 999;
    while (n >= 1 && used.has(n)) n--;
  }
  if (n < 1) return '411000';
  return '411' + String(n).padStart(3, '0');
}

// Ajoute un compte client au plan. Renvoie null si code/libelle invalide ou doublon.
export function addClientAccount(plan: PlanAccount[], code: string, libelle: string): PlanAccount[] | null {
  const c = (code || '').trim();
  const l = (libelle || '').trim();
  if (!isValidClientCode(c) || !l) return null;
  if ((plan || []).some(a => a.code === c)) return null;
  return [...(plan || []), { code: c, libelle: l }].sort((a, b) => a.code.localeCompare(b.code));
}
