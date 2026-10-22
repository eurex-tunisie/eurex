// Libelle des ecritures VT generees depuis les factures ScanFlash.
// Le numero extrait du PDF contient deja son prefixe (FAC2606-00001989 / AVR...) :
// on ne le double pas, on le fait simplement suivre du nom du client, comme avant.
export function buildLibelle(numero: string | null | undefined, client: string | null | undefined): string {
  const n = (numero || '').trim();
  const c = (client || '').trim();
  if (n && c) return `${n}/${c}`;
  return n || c;
}

// Numero affiche dans la liste des factures : le numero extrait contient deja
// FAC/AVR (ex: FAC2609-00002391), on n'ajoute le prefixe que s'il manque.
export function formatNumero(numero: string | null | undefined, isAvoir: boolean): string {
  const n = (numero || '').trim();
  const prefix = isAvoir ? 'AVR' : 'FAC';
  if (!n) return prefix;
  return /^(FAC|AVR)/i.test(n) ? n : `${prefix} ${n}`;
}
