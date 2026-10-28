// Lecture du PDF "Vente par jour" (rapport des modes de reglement).
// Une ligne par jour : date puis 6 montants (especes, cheques, carte, bons
// d'achat, avoir, credit). Les montants peuvent etre negatifs (avoirs), et
// certaines colonnes peuvent manquer : la ligne doit malgre tout etre lue.

export interface RapportDay {
  especes: number;
  cheques: number;
  tpe: number;
  bonsAchat: number;
  avoir: number;
  credit: number;
}

function toAmount(s: string | undefined): number {
  if (!s) return 0;
  const v = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : 0;
}

// Montant tunisien : "1 352,85", "0,00", "-112,40"
const NUM_RE = /-?\d[\d ]*,\d+|-?\d,\d+/g;

export function parseRapport(text: string): Record<string, RapportDay> {
  const modes: Record<string, RapportDay> = {};
  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trim();
    const dm = line.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/);
    if (!dm) continue;
    const rest = line.slice(dm[0].length);
    const nums = rest.match(NUM_RE) || [];
    const date = `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
    modes[date] = {
      especes: toAmount(nums[0]),
      cheques: toAmount(nums[1]),
      tpe: toAmount(nums[2]),
      bonsAchat: toAmount(nums[3]),
      avoir: toAmount(nums[4]),
      credit: toAmount(nums[5]),
    };
  }
  return modes;
}
