// Libelle des ecritures VT generees depuis les factures ScanFlash.
// Le numero extrait du PDF contient deja son prefixe (FAC2606-00001989 / AVR...) :
// on ne le double pas, on le fait simplement suivre du nom du client, comme avant.
export function buildLibelle(numero: string | null | undefined, client: string | null | undefined): string {
  const n = (numero || '').trim();
  const c = (client || '').trim();
  if (n && c) return `${n}/${c}`;
  return n || c;
}
