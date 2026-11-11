// Renomme les PDF Scan Flash vers un nom uniforme :
//   "VTE N°<ordre>-<mm>-<yy> <FAC|AVR>.pdf"   ex. "VTE N°1-09-26 FAC2609-00002338.pdf"
// Usage : node rename-scan-pdfs.cjs <dossier>            -> apercu (dry-run)
//         node rename-scan-pdfs.cjs <dossier> --apply    -> renomme
const fs = require('fs');
const path = require('path');

const DIR = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!DIR) { console.error('dossier requis'); process.exit(1); }

const changes = [];
const skipped = [];
const conflicts = [];
let same = 0;

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { walk(full); continue; }
    if (!e.name.toLowerCase().endsWith('.pdf')) { skipped.push(`${full} (pas un PDF)`); continue; }

    const fac = e.name.match(/(FAC|AVR)\s*\d{4}-\d+/i);
    if (!fac) { skipped.push(`${full} (pas de numero FAC/AVR)`); continue; }
    const num = fac[0].replace(/\s+/g, '').toUpperCase();

    const m = e.name.match(/^VTE\s*N?\s*°?\s*(\d+)\s*-\s*(\d{1,2})\s*-\s*(\d{2})/i);
    if (!m) { skipped.push(`${full} (pas de motif VTE jj-mm-aa)`); continue; }

    const ordre = String(parseInt(m[1], 10));
    const mm = m[2].padStart(2, '0');
    const yy = m[3];
    const target = `VTE N°${ordre}-${mm}-${yy} ${num}.pdf`;
    const targetFull = path.join(path.dirname(full), target);

    if (target === e.name) { same++; continue; }
    if (fs.existsSync(targetFull)) { conflicts.push(`${full} -> ${target} (existe deja)`); continue; }
    changes.push({ from: full, to: targetFull });
  }
}

walk(DIR);

console.log(`Dossier : ${DIR}`);
console.log(`Inchanges : ${same} | A renommer : ${changes.length} | Conflits : ${conflicts.length} | Ignorés : ${skipped.length}`);
console.log('--- A renommer (exemples) ---');
changes.slice(0, 12).forEach(c => console.log('  ' + path.basename(c.from) + '\n    -> ' + path.basename(c.to)));
if (changes.length > 12) console.log(`  ... et ${changes.length - 12} autres`);
if (conflicts.length) { console.log('--- Conflits ---'); conflicts.slice(0, 5).forEach(x => console.log('  ' + x)); }
if (skipped.length) { console.log('--- Ignorés ---'); skipped.slice(0, 8).forEach(x => console.log('  ' + x)); }

if (!APPLY) { console.log('\nDRY-RUN : rien renomme. Relancer avec --apply pour appliquer.'); process.exit(0); }

let ok = 0, err = 0;
for (const c of changes) {
  try { fs.renameSync(c.from, c.to); ok++; }
  catch (e) { err++; console.log('ERREUR ' + c.from + ' : ' + e.message); }
}
console.log(`\nRENOMMAGE : ${ok} OK, ${err} erreures`);
