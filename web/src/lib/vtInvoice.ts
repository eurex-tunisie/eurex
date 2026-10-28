// Lecture des factures de vente "ANIMAL CITY" (edition facture vente).
// Deux mises en page existent :
//  - normale : "1 025,939 0% NET H.TVA : 1 229,97"
//  - avec remise : "112,40 0% REMISE : 28,10" (assiette 0% deja nette)
// Dans les deux cas le NET H.TVA est la base apres remise.

export interface VTInvoice {
  date: string;
  numero: string;
  client: string;
  ht0: number;
  ht19: number;
  tva19: number;
  timbre: number;
  ttc: number;
}

export function parseInvoice(rawText: string): VTInvoice {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  let numero = '';
  let date = '';
  let client = '';
  let ht0 = 0, ht19 = 0, tva19 = 0, ttc = 0, timbre = 1.0;
  const p = (s: string) => { try { return parseFloat(s.replace(/ /g, '').replace(',', '.')); } catch { return 0; } };

  for (const line of lines) {
    if (!numero) {
      const m = line.match(/FACTURE\s*N[°o∞.]\s*:\s*(\d{4})\s*\/\s*(\d+)/);
      if (m) numero = m[1] + '/' + m[2];
    }
    if (!date) {
      const m = line.match(/LE\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) date = m[3] + '-' + m[2] + '-' + m[1];
    }
    if (!client) {
      const m = line.match(/^Client\s*:\s*(.+)/);
      if (m) {
        const c = m[1].trim();
        client = c.toUpperCase().includes('PASSAGERS') ? 'CLIENTS PASSAGERS' : c;
      }
    }
    // HT 0%: "AMOUNT  0%  NET H.TVA  :  TOTAL"
    if (!ht0) {
      const m = line.match(/([\d][\d ]*,\d+)\s+0%\s+NET\s+H\.TVA\s*:\s*([\d ][\d ]*,\d+)/);
      if (m) ht0 = p(m[1]);
      else {
        // Facture avec remise : "112,40  0%  REMISE : 28,10"
        const r = line.match(/^([\d][\d ]*,\d+)\s+0%\s+REMISE\s*:\s*[\d ]*,\d+/);
        if (r) ht0 = p(r[1]);
      }
    }
    // HT 19%: "AMOUNT  19%  TVA_AMOUNT"
    if (!ht19) {
      const m = line.match(/([\d][\d ]*,\d+)\s+19%\s+([\d ]*,\d+)/);
      if (m) { ht19 = p(m[1]); tva19 = p(m[2]); }
    }
    // Timbre
    if (timbre === 1.0) {
      const m = line.match(/TIMBRE\s+FIS\.?\s*:\s*([\d ]*,\d+)/);
      if (m) timbre = p(m[1]);
    }
    // TTC
    if (!ttc) {
      const m = line.match(/NET\s+T\.T\.C\.?\s+([\d ]*,\d+)/);
      if (m) ttc = p(m[1]);
    }
  }

  return { date, numero, client, ht0, ht19, tva19, timbre, ttc };
}
