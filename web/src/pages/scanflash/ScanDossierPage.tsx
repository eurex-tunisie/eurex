import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Table2, Trash2, Download, Zap, Upload, CheckCircle, ShieldCheck, Wrench, Database, FolderOpen } from 'lucide-react';
import { api } from '../../lib/api';
import { extractTextFromPDF } from '../../lib/pdf';
import { buildLibelle, formatNumero } from '../../lib/scanEcritures';
import { pickClientAccounts, resolveClientAccount, nextClientCode, addClientAccount, type PlanAccount } from '../../lib/scanPlan';
import defaultPlanJson from '../../lib/scanPlanDefault.json';

type Tab = 'factures' | 'ecritures' | 'export';

// --- PDF source : nom affiche ("VTE N°1-09-26") + acces au fichier local ---
const pdfLabel = (p?: string | null) => {
  if (!p) return '';
  const base = String(p).split(/[\\/]/).pop() || String(p);
  return base.replace(/\.pdf$/i, '')
    .replace(/(FAC|AVR)\s*\d{4}-\d+/gi, '')
    .replace(/\s*N\s*°\s*/g, 'N°')   // "VTE N °17" / "VTE N° 7" -> "VTE N°17" / "VTE N°7"
    .replace(/\s+/g, ' ')
    .trim();
};
const pdfFileUrl = (p: string) => {
  const norm = p.replace(/\\/g, '/');
  return 'file://' + encodeURI(norm.startsWith('/') ? norm : '/' + norm).replace(/#/g, '%23');
};
const openPdf = (p: string) => {
  const w = window.open(pdfFileUrl(p), '_blank');
  if (!w) {
    // Chrome/Edge bloquent file:// depuis un site https : on copie le chemin
    navigator.clipboard?.writeText(p).catch(() => {});
    alert("Le navigateur bloque l'ouverture des fichiers locaux.\nChemin copie dans le presse-papiers :\n" + p);
  }
};

export default function ScanDossierPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dossier, setDossier] = useState<any>(null);
  const [factures, setFactures] = useState<any[]>([]);
  const [ecritures, setEcritures] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('factures');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);

  // Rattachement des PDF (colle des chemins Z:\...\VTE N°1-09-26 FAC2609-00002338.pdf)
  const [linkPaths, setLinkPaths] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkResult, setLinkResult] = useState('');
  // Dossier source des PDF (Z:\SCANFLASH\...\Facture), memorise d'un mois sur l'autre
  const [pdfBase, setPdfBase] = useState(() => localStorage.getItem('scan_pdf_base') || '');
  const [zipping, setZipping] = useState(false);
  const [zipMsg, setZipMsg] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameMsg, setRenameMsg] = useState('');
  const [pendingDir, setPendingDir] = useState<{ dir: any; entries: any[] } | null>(null);

  // Client-side memory (no DB)
  const [localFactures, setLocalFactures] = useState<any[]>([]);
  const [localEcritures, setLocalEcritures] = useState<any[]>([]);

  // Manual add form
  const [form, setForm] = useState({ numero: '', date_facture: '', client: '', compte_client: '', total_ht_0: '0', total_ht_19: '0', tva_19: '0', fodec: '0', timbre: '0', total_ttc: '0' });

  const load = async (withEcritures = false) => {
    if (!id) return;
    setLoading(true);
    const d = await api.scan.getDossier(id);
    setDossier(d);
    const f = await api.scan.getFactures(id);
    setFactures(f);
    // Base Z:\ proposee automatiquement si un PDF est deja rattache a ce dossier
    const withPdf = Array.isArray(f) ? f.find((x: any) => x.pdf_path) : null;
    if (withPdf) {
      const dir = String(withPdf.pdf_path).replace(/[\\/]+$/, '').replace(/[\\/][^\\/]+$/, '');
      setPdfBase(prev => prev || dir);
    }
    if (withEcritures) {
      const e = await api.scan.getEcritures(id);
      setEcritures(e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handleUploadPDF = async (files: FileList) => {
    if (!files.length) return;
    setUploading(true);
    const newFactures: any[] = [];
    try {
      for (const file of Array.from(files)) {
        const text = await extractTextFromPDF(file);
        const parsed = parseScanInvoice(text);
        if (parsed) {
          // Nom du fichier = seule reference PDF connue a l'import (le chemin
          // complet Z:\ est pose plus tard par "Rattacher les PDF")
          newFactures.push({ ...parsed, id: crypto.randomUUID(), pdf_path: file.name });
        }
      }
      setLocalFactures(prev => [...prev, ...newFactures]);
    } catch (e: any) {
      alert('Erreur extraction: ' + e.message);
    }
    setUploading(false);
  };

  // Client code → 411XXX account mapping (stored in localStorage)
  const [clientMap, setClientMap] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('scan_client_map') || '{}'); } catch { return {}; }
  });
  const [newClientCode, setNewClientCode] = useState('');
  const [newClientAccount, setNewClientAccount] = useState('');
  const [newClientName, setNewClientName] = useState('');

  const saveClientMap = (map: Record<string, string>) => {
    setClientMap(map);
    localStorage.setItem('scan_client_map', JSON.stringify(map));
  };

  // Plan comptable clients (411XXX) : plan par defaut embarque dans l'app,
  // remplacable par un import XLSX (stocke en localStorage).
  const DEFAULT_PLAN = defaultPlanJson as PlanAccount[];
  const [plan, setPlan] = useState<PlanAccount[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('scan_plan_comptable') || '[]');
      return Array.isArray(raw) && raw.length ? raw : DEFAULT_PLAN;
    } catch { return DEFAULT_PLAN; }
  });
  const [planImporting, setPlanImporting] = useState(false);
  const [planCustom, setPlanCustom] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('scan_plan_comptable') || '[]');
      return Array.isArray(raw) && raw.length > 0;
    } catch { return false; }
  });
  const [newPlanCode, setNewPlanCode] = useState('');
  const [newPlanLibelle, setNewPlanLibelle] = useState('');
  const [planError, setPlanError] = useState('');

  const addPlanAccount = () => {
    const code = newPlanCode.trim() || nextClientCode(plan);
    const updated = addClientAccount(plan, code, newPlanLibelle);
    if (!updated) {
      setPlanError('Compte 411XXX (6 chiffres) invalide, libellé manquant ou compte déjà présent.');
      return;
    }
    localStorage.setItem('scan_plan_comptable', JSON.stringify(updated));
    setPlan(updated);
    setPlanCustom(true);
    setNewPlanCode('');
    setNewPlanLibelle('');
    setPlanError('');
  };

  const handleImportPlan = async (file: File) => {
    setPlanImporting(true);
    try {
      const XLSXMod = await import('xlsx');
      const XLSX = XLSXMod.default || XLSXMod;
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const accounts: PlanAccount[] = [];
      for (const sheetName of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false }) as any[][];
        accounts.push(...pickClientAccounts(rows));
      }
      const unique = accounts.filter((a, i) => accounts.findIndex(x => x.code === a.code) === i);
      localStorage.setItem('scan_plan_comptable', JSON.stringify(unique));
      setPlan(unique);
      setPlanCustom(true);
      alert(`${unique.length} comptes clients 411XXX importes.`);
    } catch (e: any) {
      alert('Erreur lecture plan comptable: ' + (e?.message || 'fichier invalide'));
    } finally {
      setPlanImporting(false);
    }
  };

  const parseAmount = (s: string): number => {
    // "1 560,391" → 1560.391, "-299,438" → -299.438
    return parseFloat(s.replace(/\s/g, '').replace(',', '.')) || 0;
  };

  // Parse un montant depuis une ligne : "279,000" | "Total HT 279,000" | "Total HT -1 250,000" (espace=milliers)
  const parseLineAmount = (line: string): number => {
    // Extrait le dernier nombre de la ligne (avec signe, séparateur espace/virgule/point)
    // Gère "1 250,000" (espace = milliers) et "-1 250,000" (avoir)
    const m = line.match(/(-?\d[\d\s]*(?:[.,]\d{1,3})?)\s*(?:DT|TTC|HT)?\s*$/i);
    if (m) {
      // Enlever espaces (milliers) puis virgule→point
      const cleaned = m[1].replace(/\s/g, '').replace(',', '.');
      return parseFloat(cleaned) || 0;
    }
    return 0;
  };

  const parseScanInvoice = (text: string): any | null => {
    const lines = text.split('\n');
    let numero = '';
    let isAvoir = false;
    let date = '';
    let codeClient = '';
    let clientName = '';
    let totalHT = 0;
    let tva19 = 0;
    let fodec = 0;
    let timbre = 0;
    let totalTTC = 0;
    let afterAdressA = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Numéro : "Facture FAC2606-00001989", "FACTURE N° FAC...", "Facture avoir AVR...", "FAC2606-00001989" seul
      // Tolère espaces, n°, majuscules, préfixes variables
      if (!numero) {
        const facMatch = line.match(/(?:facture\s*(?:avoir)?\s*(?:n[°ºo]\s*)?:?\s*)((?:avoir\s+)?(?:FAC|AVR|FA|AV)\S{4,})/i);
        if (facMatch) {
          isAvoir = /avoir/i.test(facMatch[1]) || /avoir/i.test(line);
          numero = facMatch[1].replace(/\s+/g, '').trim();
        }
        // Fallback : numéro seul commençant par FAC/AVR sans mot "Facture"
        if (!numero) {
          const soloMatch = line.match(/^((?:AVR|FAC)\d[\w-]{4,})/i);
          if (soloMatch) {
            isAvoir = /^AVR/i.test(soloMatch[1]);
            numero = soloMatch[1].trim();
          }
        }
      }

      // Date : "Date facturation : 05/06/2026", "Date : 05/06/2026", "05/06/2026" près de "Date"
      if (!date) {
        const dateMatch = line.match(/(?:date\s*(?:facturation|facture|de\s*facturation)?)\s*:?\s*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/i);
        if (dateMatch) {
          const [, d, m, y] = dateMatch;
          date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
      }

      // Code client : "Code client : CLT0626-1187", "Code : CLT...", "Client : CLT..."
      if (!codeClient) {
        const codeMatch = line.match(/(?:code\s*client|code|client\s*code)\s*:?\s*(CLT[\w-]+)/i);
        if (codeMatch) codeClient = codeMatch[1];
      }

      // Client name: format "Émetteur Adressé à" puis ligne "EMETTEUR CLIENT"
      // Le client = partie APRÈS l'émetteur (ex: "SCANFLASH CAMCE" → "CAMCE")
      if (line.match(/(?:Adress[ée]\s+[àa]|attention\s+de)/i)) {
        afterAdressA = true;
        continue;
      }
      if (afterAdressA && line) {
        // Ligne "SCANFLASH CAMCE" → client = "CAMCE" (après le 1er mot qui est l'émetteur)
        // Ligne "SCANFLASH MAGHREB CORPORATE" → client = "MAGHREB CORPORATE"
        // Sauf si c'est une ligne d'adresse/tél/email (on continue)
        if (!line.match(/^(Num[ée]ro|N[°º]|T[ée]l|Email|Web|Adresse|BP|Code|Montants|D[ée]signation|Facture|Rectificatif)/i)) {
          // Séparer émetteur (gauche) et client (droite) : le 1er mot est souvent l'émetteur
          const parts = line.split(/\s{2,}/); // 2+ espaces = colonnes séparées par pdf.js
          if (parts.length >= 2) {
            clientName = parts[1].trim(); // colonne droite = client
          } else {
            // Même ligne fusionnée : enlever le nom de l'émetteur connu
            const cleaned = line.replace(/^SCANFLASH\s*/i, '').trim();
            if (cleaned && cleaned !== line) {
              clientName = cleaned;
            } else {
              clientName = line;
            }
          }
          afterAdressA = false;
        }
      }

      // Montants : "Total HT 279,000" ou "... Total HT 510,436" (fin de ligne)
      // PAS de ^ (Total HT peut etre au milieu) mais montant REQUIS (header sans montant ignore)
      const htLine = line.match(/total\s*ht\b\s*:?\s*(-?[\d\s]*[.,]\d{1,3}|-?\d{2,})\s*(?:DT|TTC)?\s*$/i);
      if (htLine && totalHT === 0) {
        if (htLine[1]) {
          totalHT = parseAmount(htLine[1]);
        } else {
          for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
            const v = parseAmount(lines[j].trim());
            if (v !== 0) { totalHT = v; break; }
          }
        }
      }

      const tvaLine = line.match(/total\s*tva\s*19\s*%?\s*:?\s*(-?[\d\s]*[.,]\d{1,3}|-?\d{2,})\s*$/i);
      if (tvaLine && tva19 === 0) {
        if (tvaLine[1]) {
          tva19 = parseAmount(tvaLine[1]);
        } else {
          for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
            const v = parseAmount(lines[j].trim());
            if (v !== 0) { tva19 = v; break; }
          }
        }
      }

      const fodecLine = line.match(/fodec\s*1\s*%?\s*:?\s*(-?[\d\s]*[.,]\d{1,3}|-?\d{2,})\s*$/i);
      if (fodecLine && fodec === 0) {
        if (fodecLine[1]) {
          fodec = parseAmount(fodecLine[1]);
        } else {
          for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
            const v = parseAmount(lines[j].trim());
            if (v !== 0) { fodec = v; break; }
          }
        }
      }

      const timbreLine = line.match(/timbre\s*fiscal\s*:?\s*(-?[\d\s]*[.,]\d{1,3}|-?\d{1,2})\s*$/i);
      if (timbreLine && timbre === 0) {
        if (timbreLine[1]) {
          timbre = parseAmount(timbreLine[1]);
        } else {
          for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
            const v = parseAmount(lines[j].trim());
            if (v !== 0) { timbre = v; break; }
          }
        }
      }

      const ttcLine = line.match(/total\s*ttc\b\s*:?\s*(-?[\d\s]*[.,]\d{1,3}|-?\d{2,})\s*(?:DT|TTC)?\s*$/i);
      if (ttcLine && totalTTC === 0) {
        if (ttcLine[1]) {
          totalTTC = parseAmount(ttcLine[1]);
        } else {
          for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
            const v = parseAmount(lines[j].trim());
            if (v !== 0) { totalTTC = v; break; }
          }
        }
      }
    }

    // Fallback : si TTC absent mais HT+TVA connus
    if (totalTTC === 0 && (totalHT !== 0 || tva19 !== 0)) {
      totalTTC = totalHT + tva19 + fodec + timbre;
    }

    if (!numero || !date) return null;

    // Detect 0% TVA invoices (no TVA line in PDF) → HT goes to 707003
    // AVR : TVA negative (-3.358) → on utilise Math.abs pour detecter
    const hasTVA = Math.abs(tva19) > 0;

    // Mapping manuel par code client, sinon plan comptable par nom de client, sinon 411000
    const compteClient = resolveClientAccount(clientMap, plan, codeClient, clientName);

    return {
      numero, date_facture: date, client: clientName || codeClient, code_client: codeClient,
      compte_client: compteClient, is_avoir: isAvoir,
      total_ht_0: hasTVA ? 0 : Math.abs(totalHT),
      total_ht_19: hasTVA ? Math.abs(totalHT) : 0,
      tva_19: Math.abs(tva19), fodec: Math.abs(fodec),
      timbre: isAvoir ? 0 : Math.abs(timbre),
      total_ttc: Math.abs(totalTTC),
    };
  };

  const handleAddFacture = async () => {
    if (!id) return;
    const f = {
      ...form,
      total_ht_0: parseFloat(form.total_ht_0) || 0,
      total_ht_19: parseFloat(form.total_ht_19) || 0,
      tva_19: parseFloat(form.tva_19) || 0,
      fodec: parseFloat(form.fodec) || 0,
      timbre: parseFloat(form.timbre) || 0,
      total_ttc: parseFloat(form.total_ttc) || 0,
    };
    await api.scan.addFacture(id, f);
    setForm({ numero: '', date_facture: '', client: '', compte_client: '', total_ht_0: '0', total_ht_19: '0', tva_19: '0', fodec: '0', timbre: '0', total_ttc: '0' });
    await load();
  };

  const handleSaveToDB = async () => {
    if (!id || localFactures.length === 0) return;
    if (!confirm(`Sauvegarder ${localFactures.length} facture(s) en base?`)) return;
    let saved = 0, updated = 0;
    for (const f of localFactures) {
      try {
        const res = await api.scan.addFacture(id, {
          numero: f.numero, date_facture: f.date_facture, client: f.client,
          code_client: f.code_client, compte_client: f.compte_client, is_avoir: f.is_avoir,
          total_ht_0: f.total_ht_0, total_ht_19: f.total_ht_19, tva_19: f.tva_19,
          fodec: f.fodec, timbre: f.timbre, total_ttc: f.total_ttc, pdf_path: f.pdf_path,
        });
        if ((res as any)?.updated) updated++; else saved++;
      } catch { /* skip errors */ }
    }
    alert(`${saved} ajoutees, ${updated} mises a jour.`);
    setLocalFactures([]);
    await load();
  };

  // Colle des chemins Z:\ -> le n° FAC/AVR du nom de fichier lie la facture
  const handleLinkPdfs = async (pathsOverride?: string[]) => {
    if (!id) return;
    const paths = (Array.isArray(pathsOverride)
      ? pathsOverride
      : linkPaths.split(/\r?\n/).map(s => s.trim())
    ).map(s => s.trim()).filter(Boolean);
    if (paths.length === 0) return;
    setLinking(true);
    setLinkResult('');
    try {
      const res = await api.scan.linkPdfs(id, paths);
      const miss = res.missing?.length ? ` · ${res.missing.length} facture(s) absente(s) de la base` : '';
      const unp = res.unparsed?.length ? ` · ${res.unparsed.length} ligne(s) sans n° FAC/AVR` : '';
      // Chemin construit a la main (ex. ...\FAC2609-00002338.pdf) : le fichier reel
      // porte le prefixe "VTE N°1-09-26", sans lui le nom affiche est vide.
      const sansNom = (res.details || []).filter(d => !pdfLabel(d.pdf_path)).length;
      const warn = sansNom ? ` · ⚠ ${sansNom} chemin(s) sans nom de pièce (VTE N°…)` : '';
      setLinkResult(`${res.linked} PDF rattaché(s)${miss}${unp}${warn}`);
      if (res.missing?.length) console.log('factures introuvables :', res.missing);
      if (res.unparsed?.length) console.log('lignes ignorées :', res.unparsed);
      await load();
    } catch (e: any) {
      setLinkResult('Erreur : ' + (e?.message || e));
    }
    setLinking(false);
  };

  // Choix du dossier des PDF (un clic) : base Z:\ + noms de fichiers -> liaison directe
  const handlePickFolder = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const base = pdfBase.trim();
    if (!base) {
      alert("Indiquer d'abord le dossier de base, ex.\nZ:\\SCANFLASH\\EXERCICE\\2026\\DOCS COMPTABLES\\09-2026\\Facture");
      return;
    }
    // Les scans de cheques/traites (FAC...-CHQ..., sous-dossier Les CHQS) portent
    // le meme n° de facture : les exclure pour ne pas ecraser le PDF de la facture.
    const names = Array.from(files).map(f => f.name).filter(n => n.toLowerCase().endsWith('.pdf') && /^vte/i.test(n));
    if (names.length === 0) { alert('Aucun PDF de facture (VTE...) dans ce dossier.'); return; }
    const paths = names.map(n => base.replace(/[\\/]+$/, '') + '\\' + n);
    setLinkPaths(paths.join('\n'));
    localStorage.setItem('scan_pdf_base', base);
    await handleLinkPdfs(paths);
  };

  // Telechargement de TOUS les PDF d'un dossier en un seul ZIP (lecture locale
  // cote navigateur : le Worker n'a pas acces a Z:\)
  const handleZipFolder = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const pdfs = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (pdfs.length === 0) { alert('Aucun PDF dans ce dossier.'); return; }
    // Garde-fou : un dossier sans prefixe "VTE" (ex. copies "FAC2609-....pdf")
    // donne un ZIP aux noms "FAC....pdf" — demander confirmation avant.
    const sansVte = pdfs.filter(f => !/^vte/i.test(f.name)).length;
    if (sansVte === pdfs.length) {
      const ok = confirm(
        `⚠ Aucun PDF "VTE…" dans ce dossier (${pdfs.length} fichiers).\n` +
        `Exemple : ${pdfs[0].name}\n\n` +
        `Le ZIP gardera ces noms-là. Continuer ?\n` +
        `(Sinon choisir Z:\\SCANFLASH\\EXERCICE\\2026\\DOCS COMPTABLES\\09-2026\\Facture)`
      );
      if (!ok) { setZipMsg('Annulé — mauvais dossier choisi.'); return; }
    }
    setZipping(true);
    setZipMsg('');
    try {
      const JSZipMod = await import('jszip');
      const JSZip = (JSZipMod as any).default || JSZipMod;
      const zip = new JSZip();
      for (const f of pdfs) {
        const rel = ((f as any).webkitRelativePath || f.name).replace(/^[^/]+\//, '');
        zip.file(rel, await f.arrayBuffer());
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const name = zipName();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a);
      a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setZipMsg(`${pdfs.length} PDF compressés → ${name}`);
    } catch (e: any) {
      setZipMsg('Erreur : ' + (e?.message || e));
    }
    setZipping(false);
  };

  // Nom du ZIP : dossier source (ex. 09-2026) si connu, sinon nom du dossier
  const zipName = () => {
    const segs = pdfBase.trim().split(/[\\/]+/).filter(Boolean);
    const folder = segs.length >= 2 && /facture/i.test(segs[segs.length - 1]) ? segs[segs.length - 2] : segs[segs.length - 1];
    const base = folder || dossier?.nom || 'scanflash';
    return `PDF_${base.replace(/[^\w.-]+/g, '_')}.zip`;
  };

  // Pieces du mois lues dans le scan_ecritures.xlsx (colonnes N° / Date pièce comptable)
  const readPiecesFromXlsx = async (file: Blob, label: string) => {
    const XLSXMod = await import('xlsx');
    const XLSX: any = (XLSXMod as any).default || XLSXMod;
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: null }) as any[][];
    const header = (rows[0] || []).map((h: any) => String(h ?? ''));
    const iN = header.findIndex((h: string) => /n[°ºo]?\s*pi[eè]ce\s*comptable/i.test(h));
    const iD = header.findIndex((h: string) => /date\s*pi[eè]ce\s*comptable/i.test(h));
    if (iN < 0 || iD < 0) return null;
    const pieces: { numero: string; date: string }[] = [];
    for (const r of rows.slice(1)) {
      const n = r[iN] == null ? '' : String(r[iN]).trim();
      if (!n) continue;
      let d = r[iD];
      if (d instanceof Date) d = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      pieces.push({ numero: n.replace(/\s+/g, '').toUpperCase(), date: d == null ? '' : String(d).trim() });
    }
    return pieces.length ? { pieces, source: label } : null;
  };

  // Renomme les PDF du dossier choisi en "VTE N°<ordre>-<mm>-<yy> <FAC/AVR>.pdf".
  // Ordre = rang de la piece dans les ecritures du mois (tri par date, puis numero),
  // lu dans le scan_ecritures.xlsx — aucune dependance a la base.
  const runRename = async (dir: any, entries: any[], pieces: { numero: string; date: string }[], source: string) => {
    // Rang : tri (date, numero) — accepte jj/mm/aaaa et ISO aaaa-mm-jj
    const pd = (s: string) => {
      const str = String(s);
      let m = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/); // ISO : 2026-09-02
      if (m) return { k: m[1] + m[2].padStart(2, '0') + m[3].padStart(2, '0'), mm: m[2].padStart(2, '0'), yy: m[1].slice(2) };
      m = str.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/); // classique : 02/09/2026
      if (m) return { k: m[3] + m[2].padStart(2, '0') + m[1].padStart(2, '0'), mm: m[2].padStart(2, '0'), yy: m[3].slice(2) };
      return null;
    };
    const seen = new Set<string>();
    const uniq: { numero: string; date: string }[] = [];
    for (const p of pieces) if (!seen.has(p.numero)) { seen.add(p.numero); uniq.push(p); }
    uniq.sort((a, b) => {
      const ka = pd(a.date)?.k || '99999999';
      const kb = pd(b.date)?.k || '99999999';
      return ka < kb ? -1 : ka > kb ? 1 : a.numero < b.numero ? -1 : a.numero > b.numero ? 1 : 0;
    });
    const rank = new Map(uniq.map((p, i) => [p.numero, { r: i + 1, d: pd(p.date) }]));

    // Plan : "FAC2609-00002338.pdf" (ou VTE deja present) -> nom canonique
    const plain = (n: string) => /^(FAC|AVR)\d{4}-\d+\.pdf$/i.test(n);
    const vte = (n: string) => /^VTE\s*N?\s*°?\s*\d+-\d{2}-\d{2}\s+(FAC|AVR)\d{4}-\d+\.pdf$/i.test(n);
    const plan: { from: string; to: string }[] = [];
    const taken = new Set<string>();
    let deja = 0, horsEcr = 0, sansDate = 0, nonConcerne = 0, conflit = 0;
    for (const e of entries) {
      if (e.kind !== 'file' || !/\.pdf$/i.test(e.name)) continue;
      if (!plain(e.name) && !vte(e.name)) { nonConcerne++; continue; } // ex. "CHQ FAC...-Asso.pdf"
      const m = e.name.match(/(FAC|AVR)\d{4}-\d+/i);
      const num = m ? m[0].toUpperCase() : '';
      const info = num ? rank.get(num) : undefined;
      if (!info) { horsEcr++; continue; }
      if (!info.d) { sansDate++; continue; }
      const target = `VTE N°${info.r}-${info.d.mm}-${info.d.yy} ${num}.pdf`;
      if (target === e.name) { deja++; continue; }
      if (taken.has(target) || entries.some(x => x.kind === 'file' && x.name === target)) { conflit++; continue; }
      taken.add(target);
      plan.push({ from: e.name, to: target });
    }

    const detail = [
      horsEcr && `${horsEcr} hors écritures`,
      sansDate && `${sansDate} sans date`,
      nonConcerne && `${nonConcerne} non concerné(s)`,
      conflit && `${conflit} conflit(s)`,
    ].filter(Boolean).join(' · ');

    if (plan.length === 0) {
      setRenameMsg(`Rien a renommer : ${deja} déjà conforme(s)${detail ? ' · ' + detail : ''} (${source}).`);
      return;
    }
    const preview = plan.slice(0, 5).map(p => `  ${p.from}\n     -> ${p.to}`).join('\n');
    const go = confirm(`Renommer ${plan.length} PDF dans « ${dir.name} » ?\n\n${preview}${plan.length > 5 ? `\n  ... et ${plan.length - 5} autres` : ''}\n\nSource : ${source}`);
    if (!go) { setRenameMsg('Annulé.'); return; }

    let ok = 0, err = 0;
    for (const p of plan) {
      try {
        const fh = await dir.getFileHandle(p.from);
        const buf = await (await fh.getFile()).arrayBuffer();
        const wh = await dir.getFileHandle(p.to, { create: true });
        const wtr = await wh.createWritable();
        await wtr.write(buf);
        await wtr.close();
        await dir.removeEntry(p.from);
        ok++;
      } catch { err++; }
    }
    setRenameMsg(`${ok} renommé(s)${err ? `, ${err} erreur(s)` : ''} · ${deja} déjà conforme(s)${detail ? ' · ' + detail : ''} (${source})`);
  };

  // Etape 1 : choisir le dossier — le xlsx du mois doit y etre (sinon etape 2)
  const handleRenamePdfs = async () => {
    const win = window as any;
    if (typeof win.showDirectoryPicker !== 'function') {
      alert("Renommage possible uniquement sous Chrome/Edge.\n(Firefox ne donne pas acces en ecriture aux dossiers.)");
      return;
    }
    let dir: any;
    try {
      dir = await win.showDirectoryPicker({ mode: 'readwrite' });
    } catch { return; } // choix annule par l'utilisateur
    setRenaming(true);
    setRenameMsg('');
    try {
      const entries: any[] = [];
      for await (const e of (dir as any).values()) entries.push(e);
      // Pieces du mois : le xlsx dans le dossier choisi
      const xlsx = entries.find(e => e.kind === 'file' && /\.xlsx?$/i.test(e.name) && !e.name.startsWith('~$') && /scan/i.test(e.name))
        || entries.find(e => e.kind === 'file' && /\.xlsx?$/i.test(e.name) && !e.name.startsWith('~$'));
      if (xlsx) {
        const r = await readPiecesFromXlsx(await xlsx.getFile(), `xlsx ${xlsx.name}`);
        if (r) { await runRename(dir, entries, r.pieces, r.source); return; }
      }
      // Pas de xlsx utilisable : demander le scan_ecritures.xlsx du mois (etape 2)
      setPendingDir({ dir, entries });
      setRenameMsg('Dossier sans scan_ecritures.xlsx — choisir le fichier xlsx du mois pour calculer les n°.');
    } catch (e: any) {
      setRenameMsg('Erreur : ' + (e?.message || e));
    } finally {
      setRenaming(false);
    }
  };

  // Etape 2 : xlsx choisi a la main -> calcul des n° -> renommage du dossier memorise
  const handlePickRenameXlsx = async (file: File | null) => {
    if (!file || !pendingDir) return;
    setRenaming(true);
    setRenameMsg('');
    try {
      const r = await readPiecesFromXlsx(file, `xlsx ${file.name}`);
      if (!r) { setRenameMsg('Colonnes N°/Date pièce introuvables dans ce xlsx.'); return; }
      await runRename(pendingDir.dir, pendingDir.entries, r.pieces, r.source);
      setPendingDir(null);
    } catch (e: any) {
      setRenameMsg('Erreur : ' + (e?.message || e));
    } finally {
      setRenaming(false);
    }
  };

  // Chemin PDF d'une piece (facture en base, puis facture de la session)
  const pdfOf = (numero?: string) =>
    (numero && (factures.find(f => f.numero === numero)?.pdf_path
      || localFactures.find(f => f.numero === numero)?.pdf_path)) || '';

  const handleGenerate = async () => {
    if (localFactures.length === 0) return;
    const ecritures: any[] = [];
    for (const f of localFactures) {
      const date = f.date_facture;
      const facNum = f.numero || '';
      const clientName = f.client || '';
      const compteClient = f.compte_client || '411000';
      const ht0 = f.total_ht_0 || 0;
      const ht19 = f.total_ht_19 || 0;
      const tva = f.tva_19 || 0;
      const fodec = f.fodec || 0;
      const timbre = f.timbre || 0;
      const isAvoir = !!f.is_avoir;
      const lib = buildLibelle(facNum, clientName);
      // D = sum of all C amounts (ensures balance)
      const totalCredit = ht19 + ht0 + tva + fodec + timbre;
      const r = (v: number) => Math.round(v * 1000) / 1000;

      if (isAvoir) {
        if (totalCredit > 0) ecritures.push({ numero_doc: facNum, date_operation: date, journal_code: 'VT', compte: compteClient, libelle: lib, sens: 'C', montant: r(totalCredit) });
        if (ht19 > 0) ecritures.push({ numero_doc: facNum, date_operation: date, journal_code: 'VT', compte: '707000', libelle: lib, sens: 'D', montant: r(ht19) });
        if (ht0 > 0) ecritures.push({ numero_doc: facNum, date_operation: date, journal_code: 'VT', compte: '707003', libelle: lib, sens: 'D', montant: r(ht0) });
        if (tva > 0) ecritures.push({ numero_doc: facNum, date_operation: date, journal_code: 'VT', compte: '436719', libelle: lib, sens: 'D', montant: r(tva) });
        if (fodec > 0) ecritures.push({ numero_doc: facNum, date_operation: date, journal_code: 'VT', compte: '436780', libelle: lib, sens: 'D', montant: r(fodec) });
      } else {
        if (totalCredit > 0) ecritures.push({ numero_doc: facNum, date_operation: date, journal_code: 'VT', compte: compteClient, libelle: lib, sens: 'D', montant: r(totalCredit) });
        if (ht19 > 0) ecritures.push({ numero_doc: facNum, date_operation: date, journal_code: 'VT', compte: '707000', libelle: lib, sens: 'C', montant: r(ht19) });
        if (ht0 > 0) ecritures.push({ numero_doc: facNum, date_operation: date, journal_code: 'VT', compte: '707003', libelle: lib, sens: 'C', montant: r(ht0) });
        if (tva > 0) ecritures.push({ numero_doc: facNum, date_operation: date, journal_code: 'VT', compte: '436719', libelle: lib, sens: 'C', montant: r(tva) });
        if (fodec > 0) ecritures.push({ numero_doc: facNum, date_operation: date, journal_code: 'VT', compte: '436780', libelle: lib, sens: 'C', montant: r(fodec) });
        if (timbre > 0) ecritures.push({ numero_doc: facNum, date_operation: date, journal_code: 'VT', compte: '437600', libelle: lib, sens: 'C', montant: r(timbre) });
      }
    }
    setLocalEcritures(ecritures);
    setTab('ecritures');
  };

  const handleExportCSV = async () => {
    if (localEcritures.length === 0) { alert('Aucune écriture à exporter. Générer d\'abord le VT.'); return; }
    const lines: string[] = [];
    for (const e of localEcritures) {
      const date = e.date_operation;
      const [y, m, d] = date.split('-');
      const dateFormatted = `${d}/${m}/${y}`;
      const montant = Math.round((e.montant || 0) * 1000) / 1000;
      const debit = e.sens === 'D' ? montant.toFixed(3) : '0.000';
      const credit = e.sens === 'C' ? montant.toFixed(3) : '0.000';
      lines.push(`${e.numero_doc || ''}\t${dateFormatted}\t${e.journal_code || 'VT'}\t${e.libelle || ''}\t${e.compte}\t\t${debit}\t${credit}`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `scan_ecritures.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleExportXLSX = async () => {
    if (localEcritures.length === 0) { alert('Aucune écriture à exporter. Générer d\'abord le VT.'); return; }
    const XLSXMod = await import('xlsx').catch(() => null);
    if (!XLSXMod) { alert('Erreur chargement bibliothèque XLSX.'); return; }
    const XLSX = XLSXMod.default || XLSXMod;
    const header = ['N° pièce comptable', 'Date pièce comptable', 'Journal', 'Libellé', 'N° compte', 'Libellé trésorerie', 'Débit', 'Crédit'];
    const rows: any[][] = [header];
    for (const e of localEcritures) {
      const date = e.date_operation;
      const [y, m, d] = date.split('-');
      const dateFormatted = `${d}/${m}/${y}`;
      const montant = Math.round((e.montant || 0) * 1000) / 1000;
      rows.push([e.numero_doc || '', dateFormatted, e.journal_code || 'VT', e.libelle || '', e.compte, '', e.sens === 'D' ? montant : 0, e.sens === 'C' ? montant : 0]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 30 }, { wch: 27 }, { wch: 10 }, { wch: 40 }, { wch: 12 }, { wch: 28 }, { wch: 15 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ecritures');
    const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `scan_ecritures.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleDeleteFactures = () => {
    if (!confirm('Vider les factures?')) return;
    setLocalFactures([]);
    setLocalEcritures([]);
  };

  const handleDeleteEcritures = () => {
    if (!confirm('Vider les ecritures?')) return;
    setLocalEcritures([]);
  };

  const handleVerify = () => {
    if (localFactures.length === 0) return;
    const checks: any[] = [];
    let errors = 0;
    let totalHT = 0, totalTVA = 0, totalFODEC = 0, totalTimbre = 0, totalTTC = 0;
    for (const f of localFactures) {
      const ht19 = f.total_ht_19 || 0;
      const ht0 = f.total_ht_0 || 0;
      const htTotal = ht0 + ht19;
      const tvaActual = f.tva_19 || 0;
      const tvaExpected = ht19 > 0 ? Math.round(ht19 * 19) / 100 : 0;
      const tvaDiff = Math.abs(tvaActual - tvaExpected);
      const fodecActual = f.fodec || 0;
      const fodecExpected = ht19 > 0 ? Math.round(ht19 * 1) / 100 : 0;
      const fodecDiff = Math.abs(fodecActual - fodecExpected);
      const ttcComputed = htTotal + tvaActual + fodecActual + (f.timbre || 0);
      const ttcDeclared = f.total_ttc || ttcComputed;
      const ttcDiff = Math.abs(ttcDeclared - ttcComputed);
      totalHT += htTotal;
      totalTVA += tvaActual;
      totalFODEC += fodecActual;
      totalTimbre += f.timbre || 0;
      totalTTC += ttcDeclared;
      const pieceChecks: any[] = [];
      if (tvaDiff > 0.01) { pieceChecks.push({ name: 'TVA', status: 'error', detail: `TVA ${tvaActual} ≠ HT×19% = ${tvaExpected} (ecart ${tvaDiff.toFixed(3)})`, expected: tvaExpected, actual: tvaActual }); errors++; } else { pieceChecks.push({ name: 'TVA', status: 'ok', detail: `TVA ${tvaActual} = HT×19%` }); }
      if (fodecDiff > 0.01) { pieceChecks.push({ name: 'FODEC', status: 'error', detail: `FODEC ${fodecActual} ≠ HT×1% = ${fodecExpected}`, expected: fodecExpected, actual: fodecActual }); errors++; } else { pieceChecks.push({ name: 'FODEC', status: 'ok', detail: `FODEC ${fodecActual} = HT×1%` }); }
      if (Math.abs(ttcDiff) > 0.01) { pieceChecks.push({ name: 'TTC', status: 'error', detail: `TTC declare ${ttcDeclared} ≠ calcule ${ttcComputed}`, expected: ttcComputed, actual: ttcDeclared }); errors++; } else { pieceChecks.push({ name: 'TTC', status: 'ok', detail: `TTC ${ttcDeclared} = somme lignes` }); }
      checks.push({ piece: f.numero, type: f.is_avoir ? 'AVR' : 'FAC', client: f.client, checks: pieceChecks });
    }
    setVerifyResult({ verdict: errors > 0 ? 'ERREUR' : 'OK', errors, totalFactures: localFactures.length, totals: { ht: totalHT, tva: totalTVA, fodec: totalFODEC, timbre: totalTimbre, ttc: totalTTC }, checks });
  };

  const handleFixTVA = () => {
    const fixed = localFactures.map(f => {
      const ht19 = f.total_ht_19 || 0;
      const tvaExpected = ht19 > 0 ? Math.round(ht19 * 19) / 100 : 0;
      const tvaActual = f.tva_19 || 0;
      const fodecExpected = ht19 > 0 ? Math.round(ht19 * 1) / 100 : 0;
      const fodecActual = f.fodec || 0;
      let changed = false;
      let newTva = tvaActual;
      let newFodec = fodecActual;
      if (Math.abs(tvaActual - tvaExpected) > 0.01) { newTva = tvaExpected; changed = true; }
      if (Math.abs(fodecActual - fodecExpected) > 0.01) { newFodec = fodecExpected; changed = true; }
      if (changed) {
        const newTtc = (f.total_ht_0 || 0) + ht19 + newTva + newFodec + (f.timbre || 0);
        return { ...f, tva_19: newTva, fodec: newFodec, total_ttc: newTtc };
      }
      return f;
    });
    setLocalFactures(fixed);
    setVerifyResult(null);
    setLocalEcritures([]);
  };

  if (loading) return <div className="text-gray-400 py-10">Chargement...</div>;
  if (!dossier) return <div className="text-red-500 py-10">Dossier non trouve</div>;

  const tabs: { key: Tab; label: string; icon: any; count: number }[] = [
    { key: 'factures', label: 'Factures', icon: FileText, count: localFactures.length },
    { key: 'ecritures', label: 'Ecritures VT', icon: Table2, count: localEcritures.length },
    { key: 'export', label: 'Export', icon: Download, count: localEcritures.length },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/scanflash')} className="text-gray-400 hover:text-gray-700"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-xl font-bold text-gray-800">{dossier.nom}</h1>
          <span className="text-xs text-gray-500">SCANFLASH</span>
        </div>
        <div className="ml-auto flex gap-2">
          {(localFactures.length > 0 || localEcritures.length > 0) && (
            <button onClick={() => { if (confirm('Tout vider?')) { setLocalFactures([]); setLocalEcritures([]); setVerifyResult(null); } }} className="text-sm text-red-500 hover:text-red-700">Tout vider</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1 px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab === t.key ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <t.icon size={15} />
            {t.label}
            {t.count > 0 && <span className="ml-1 bg-gray-200 text-gray-600 text-xs px-1.5 rounded-full">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Tab: Factures */}
      {tab === 'factures' && (
        <div className="space-y-4">
          {/* Upload */}
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <label className="btn btn-emerald px-4 py-2 rounded text-sm hover:bg-emerald-700 cursor-pointer">
                <Upload size={15} className="inline mr-1" />
                {uploading ? 'Extraction...' : 'Importer PDF(s)'}
                <input type="file" accept=".pdf" multiple className="hidden" onChange={e => e.target.files && handleUploadPDF(e.target.files)} />
              </label>
              {localFactures.length > 0 && (
                <button onClick={handleSaveToDB} className="btn btn-accent px-4 py-2 rounded text-sm hover:bg-purple-700">
                  <Database size={15} className="inline mr-1" /> Sauver en base
                </button>
              )}
              {localFactures.length > 0 && (
                <button onClick={handleGenerate} className="btn btn-blue px-4 py-2 rounded text-sm hover:bg-blue-700">
                  <Zap size={15} className="inline mr-1" /> Generer VT
                </button>
              )}
              <span className="text-xs text-gray-400">{localFactures.length} factures importees</span>
              {localFactures.length > 0 && (
                <button onClick={handleDeleteFactures} className="text-red-400 hover:text-red-600 text-xs ml-auto"><Trash2 size={14} className="inline mr-1" /> Tout supprimer</button>
              )}
            </div>
          </div>

          {/* Rattachement des PDF (chemins Z:) */}
          <div className="card p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
              <h3 className="font-semibold text-gray-700 text-sm">Rattacher les PDF</h3>
              <span className="text-xs text-gray-400">
                Le n° FAC/AVR du nom de fichier fait la liaison · ex. <code>VTE N°1-09-26 FAC2609-00002338.pdf</code>
              </span>
            </div>
            {/* 1 clic : choisir le dossier -> tous les PDF du dossier lies d'un coup */}
            <div className="flex gap-2 items-center mb-2 flex-wrap">
              <input
                value={pdfBase}
                onChange={e => setPdfBase(e.target.value)}
                placeholder="Dossier de base : Z:\SCANFLASH\EXERCICE\2026\DOCS COMPTABLES\09-2026\Facture"
                className="flex-1 min-w-[280px] input-sm font-mono text-xs"
                data-testid="pdf-base"
              />
              <label className="btn btn-emerald px-4 py-2 rounded text-sm hover:bg-emerald-700 cursor-pointer">
                <FolderOpen size={15} className="inline mr-1" />
                Choisir le dossier des PDF
                <input
                  type="file"
                  multiple
                  className="hidden"
                  {...({ webkitdirectory: '', directory: '' } as any)}
                  data-testid="pdf-folder"
                  onChange={e => { handlePickFolder(e.target.files); e.target.value = ''; }}
                />
              </label>
            </div>

            <textarea
              value={linkPaths}
              onChange={e => setLinkPaths(e.target.value)}
              placeholder={'Z:\\SCANFLASH\\EXERCICE\\2026\\DOCS COMPTABLES\\09-2026\\Facture\\VTE N°1-09-26 FAC2609-00002338.pdf\n(un chemin par ligne — ou utilise le choix de dossier ci-dessus)'}
              className="w-full h-24 input-sm font-mono text-xs"
              data-testid="link-paths"
            />
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={() => handleLinkPdfs()}
                disabled={linking || !linkPaths.trim()}
                className="btn btn-emerald px-4 py-2 rounded text-sm hover:bg-emerald-700 disabled:opacity-50"
                data-testid="link-pdfs-btn"
              >
                <FileText size={15} className="inline mr-1" />
                {linking ? 'Liaison...' : 'Lier les PDF'}
              </button>
              {linkResult && <span className="text-xs text-gray-600" data-testid="link-result">{linkResult}</span>}
            </div>
          </div>

          {/* Telechargement de tous les PDF du dossier en ZIP */}
          <div className="card p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
              <h3 className="font-semibold text-gray-700 text-sm">Télécharger tous les PDF</h3>
              <span className="text-xs text-gray-400">Choisis le dossier → un seul fichier ZIP (lecture locale, rien n'est envoyé)</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="btn btn-blue px-4 py-2 rounded text-sm hover:bg-blue-700 cursor-pointer">
                <Download size={15} className="inline mr-1" />
                {zipping ? 'Compression...' : 'Choisir le dossier → ZIP'}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  {...({ webkitdirectory: '', directory: '' } as any)}
                  data-testid="zip-folder"
                  onChange={e => { handleZipFolder(e.target.files); e.target.value = ''; }}
                />
              </label>
              {zipMsg && <span className="text-xs text-gray-600" data-testid="zip-msg">{zipMsg}</span>}
            </div>
          </div>

          {/* Renommage des PDF avec le n° d'ordre des ecritures */}
          <div className="card p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
              <h3 className="font-semibold text-gray-700 text-sm">Renommer les PDF (n° d'ordre)</h3>
              <span className="text-xs text-gray-400">
                {'"VTE N°<ordre>-<mm>-<yy> FAC….pdf"'} — ordre = rang de la pièce dans les écritures du mois (xlsx du dossier)
              </span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleRenamePdfs}
                disabled={renaming}
                className="btn btn-blue px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                data-testid="rename-pdfs-btn"
              >
                <Wrench size={15} className="inline mr-1" />
                {renaming ? 'Renommage...' : 'Choisir le dossier → renommer'}
              </button>
              {pendingDir && (
                <label className="btn px-4 py-2 rounded text-sm border border-blue-300 text-blue-700 hover:bg-blue-50 cursor-pointer">
                  <FileText size={15} className="inline mr-1" />
                  Choisir le xlsx du mois
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    data-testid="rename-xlsx"
                    onChange={e => { handlePickRenameXlsx(e.target.files?.[0] || null); e.target.value = ''; }}
                  />
                </label>
              )}
              {renameMsg && <span className="text-xs text-gray-600" data-testid="rename-msg">{renameMsg}</span>}
            </div>
          </div>

          {/* Client mapping */}
          <div className="card p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <h3 className="font-semibold text-gray-700 text-sm">Mapping client → compte 411XXX</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400" data-testid="plan-count">
                  {plan.length} comptes clients{planCustom ? ' (importé)' : ' (plan par défaut)'}
                </span>
                <label className="btn btn-outline px-3 py-1.5 text-xs cursor-pointer">
                  <Upload size={13} className="inline mr-1" />
                  {planImporting ? 'Import...' : 'Plan comptable XLSX'}
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    data-testid="plan-file"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImportPlan(f); e.target.value = ''; }}
                  />
                </label>
                {planCustom && (
                  <button
                    onClick={() => { localStorage.removeItem('scan_plan_comptable'); setPlan(DEFAULT_PLAN); setPlanCustom(false); }}
                    className="text-gray-400 hover:text-gray-600 text-xs"
                  >
                    Plan par défaut
                  </button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mb-2">
              411000 par défaut ; le compte est choisi automatiquement par nom de client dans le plan, ou via le mapping ci-dessous. Un client absent peut être ajouté au plan.
            </p>
            <div className="flex gap-2 items-end mb-2">
              <input placeholder="Code client (ex: CLT0626-1187)" value={newClientCode} onChange={e => setNewClientCode(e.target.value)} className="flex-1 input-sm" />
              <input placeholder="Compte 411XXX" value={newClientAccount} onChange={e => setNewClientAccount(e.target.value)} className="w-32 input-sm" />
              <input placeholder="Nom (optionnel)" value={newClientName} onChange={e => setNewClientName(e.target.value)} className="flex-1 input-sm" />
              <button onClick={() => {
                if (!newClientCode.trim() || !newClientAccount.trim()) return;
                saveClientMap({ ...clientMap, [newClientCode.trim()]: newClientAccount.trim() });
                setNewClientCode(''); setNewClientAccount(''); setNewClientName('');
              }} className="btn btn-emerald px-3 py-1.5 rounded text-sm hover:bg-emerald-600">+</button>
            </div>
            {Object.keys(clientMap).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {Object.entries(clientMap).map(([code, acct]) => (
                  <span key={code} className="inline-flex items-center gap-1 bg-gray-100 text-xs px-2 py-1 rounded">
                    {code} → {acct}
                    <button onClick={() => { const m = { ...clientMap }; delete m[code]; saveClientMap(m); }} className="text-red-400 hover:text-red-600">×</button>
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--separator)' }}>
              <h4 className="text-xs font-semibold text-gray-600 mb-2">Nouveau compte client dans le plan</h4>
              <div className="flex gap-2 items-end">
                <input
                  placeholder={`Compte (ex: ${nextClientCode(plan)})`}
                  value={newPlanCode}
                  onChange={e => { setNewPlanCode(e.target.value); setPlanError(''); }}
                  className="w-48 input-sm"
                  data-testid="plan-new-code"
                />
                <input
                  placeholder="Nom du client (libellé)"
                  value={newPlanLibelle}
                  onChange={e => { setNewPlanLibelle(e.target.value); setPlanError(''); }}
                  className="flex-1 input-sm"
                  data-testid="plan-new-libelle"
                />
                <button
                  onClick={addPlanAccount}
                  data-testid="plan-add"
                  className="btn btn-emerald px-3 py-1.5 rounded text-sm hover:bg-emerald-600"
                >
                  + Ajouter
                </button>
              </div>
              {planError && <p className="text-xs text-red-600 mt-1" data-testid="plan-error">{planError}</p>}
            </div>
          </div>

          {/* Manual add */}
          <div className="card p-4">
            <h3 className="font-semibold text-gray-700 mb-3 text-sm">Ajouter manuellement</h3>
            <div className="grid grid-cols-4 gap-2 text-sm">
              <input placeholder="N° FAC" value={form.numero} onChange={e => setForm({...form, numero: e.target.value})} className="input-sm" />
              <input type="date" value={form.date_facture} onChange={e => setForm({...form, date_facture: e.target.value})} className="input-sm" />
              <input placeholder="Client" value={form.client} onChange={e => setForm({...form, client: e.target.value})} className="input-sm" />
              <input placeholder="Compte 411XXX" value={form.compte_client} onChange={e => setForm({...form, compte_client: e.target.value})} className="input-sm" />
              <input placeholder="HT 0%" type="number" step="0.001" value={form.total_ht_0} onChange={e => setForm({...form, total_ht_0: e.target.value})} className="input-sm" />
              <input placeholder="HT 19%" type="number" step="0.001" value={form.total_ht_19} onChange={e => setForm({...form, total_ht_19: e.target.value})} className="input-sm" />
              <input placeholder="TVA 19%" type="number" step="0.001" value={form.tva_19} onChange={e => setForm({...form, tva_19: e.target.value})} className="input-sm" />
              <input placeholder="FODEC" type="number" step="0.001" value={form.fodec} onChange={e => setForm({...form, fodec: e.target.value})} className="input-sm" />
              <input placeholder="Timbre" type="number" step="0.001" value={form.timbre} onChange={e => setForm({...form, timbre: e.target.value})} className="input-sm" />
              <input placeholder="TTC" type="number" step="0.001" value={form.total_ttc} onChange={e => setForm({...form, total_ttc: e.target.value})} className="input-sm" />
              <button onClick={handleAddFacture} className="btn btn-emerald rounded px-3 py-1.5 hover:bg-emerald-600">+</button>
            </div>
          </div>

          {/* Factures table */}
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th className="px-3 py-2 text-left">N°</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Compte</th>
                  <th className="px-3 py-2 text-right">HT 0%</th>
                  <th className="px-3 py-2 text-right">HT 19%</th>
                  <th className="px-3 py-2 text-right">TVA</th>
                  <th className="px-3 py-2 text-right">FODEC</th>
                  <th className="px-3 py-2 text-right">Timbre</th>
                  <th className="px-3 py-2 text-right">TTC</th>
                  <th className="px-3 py-2 text-left">PDF</th>
                </tr>
              </thead>
              <tbody>
                {localFactures.map(f => (
                  <tr key={f.id} className="row-hover">
                    <td className="px-3 py-1.5 font-mono text-xs">
                      <span className={f.is_avoir ? 'text-red-600 font-bold' : ''}>{formatNumero(f.numero, !!f.is_avoir)}</span>
                    </td>
                    <td className="px-3 py-1.5 text-xs">{f.date_facture}</td>
                    <td className="px-3 py-1.5 text-xs">{f.client}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-gray-500">{f.code_client}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{f.compte_client}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{(f.total_ht_0 || 0).toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{(f.total_ht_19 || 0).toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{(f.tva_19 || 0).toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{(f.fodec || 0).toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{(f.timbre || 0).toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-semibold">{(f.total_ttc || 0).toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-xs">
                      {f.pdf_path ? (
                        <button onClick={() => openPdf(f.pdf_path)} title={f.pdf_path}
                          className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 hover:underline font-mono">
                          <FileText size={12} />{pdfLabel(f.pdf_path) || '⚠ fichier introuvable'}
                        </button>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
                {localFactures.length === 0 && <tr><td colSpan={12} className="text-center text-gray-400 py-6">Aucune facture</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Factures deja en base + leurs PDF (la table ci-dessus ne montre que la session en cours) */}
          {factures.length > 0 && (
            <div className="card overflow-x-auto" data-testid="factures-db">
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-700 text-sm">Factures en base ({factures.length})</h3>
                <span className="text-xs text-gray-400">{factures.filter(f => f.pdf_path).length} avec PDF</span>
              </div>
              <table className="w-full text-sm">
                <thead className="table-header">
                  <tr>
                    <th className="px-3 py-2 text-left">N°</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Client</th>
                    <th className="px-3 py-2 text-right">TTC</th>
                    <th className="px-3 py-2 text-left">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {factures.map(f => (
                    <tr key={f.id} className="row-hover">
                      <td className="px-3 py-1.5 font-mono text-xs">
                        <span className={f.is_avoir ? 'text-red-600 font-bold' : ''}>{formatNumero(f.numero, !!f.is_avoir)}</span>
                      </td>
                      <td className="px-3 py-1.5 text-xs">{f.date_facture}</td>
                      <td className="px-3 py-1.5 text-xs">{f.client}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs font-semibold">{(f.total_ttc || 0).toFixed(3)}</td>
                      <td className="px-3 py-1.5 text-xs">
                        {f.pdf_path ? (
                          <button onClick={() => openPdf(f.pdf_path)} title={f.pdf_path}
                            className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 hover:underline font-mono">
                            <FileText size={12} />{pdfLabel(f.pdf_path) || '⚠ fichier introuvable'}
                          </button>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Generate button */}
          {localFactures.length > 0 && (
            <div className="flex justify-center">
              <button onClick={handleGenerate} disabled={generating}
                className="btn btn-emerald px-6 py-3 rounded-lg font-semibold disabled:opacity-50 flex items-center gap-2">
                <Zap size={18} />
                {generating ? 'Generation...' : `Generer VT (${localFactures.length} factures)`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab: Ecritures */}
      {tab === 'ecritures' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => handleExportCSV()} className="btn btn-emerald px-3 py-1.5 rounded text-sm hover:bg-emerald-700">
              <Download size={14} className="inline mr-1" /> Export CSV VT
            </button>
            <button onClick={handleExportXLSX} className="btn btn-blue px-3 py-1.5 rounded text-sm hover:bg-blue-700">
              <Download size={14} className="inline mr-1" /> Export XLSX VT
            </button>
            {localEcritures.length > 0 && (
              <button onClick={() => handleDeleteEcritures()} className="text-red-400 hover:text-red-600 text-sm border border-red-200 px-3 py-1.5 rounded">
                <Trash2 size={14} className="inline mr-1" /> Vider ecritures
              </button>
            )}
          </div>

          {/* Manual add ecriture */}
          <div className="card p-4">
            <h3 className="font-semibold text-gray-700 mb-3 text-sm">Ajouter une ecriture</h3>
            <div className="grid grid-cols-6 gap-2 text-sm">
              <input type="date" id="ecr-date" className="input-sm" defaultValue={dossier?.mois ? `${dossier.annee}-${String(dossier.mois).padStart(2,'0')}-01` : ''} />
              <input placeholder="N° Piece" id="ecr-piece" className="input-sm" />
              <input placeholder="Compte" id="ecr-compte" className="input-sm" />
              <input placeholder="Libelle" id="ecr-libelle" className="input-sm" />
              <select id="ecr-sens" className="input-sm">
                <option value="D">Debit</option>
                <option value="C">Credit</option>
              </select>
              <input placeholder="Montant" type="number" step="0.001" id="ecr-montant" className="input-sm" />
              <button onClick={() => {
                const date = (document.getElementById('ecr-date') as HTMLInputElement).value;
                const piece = (document.getElementById('ecr-piece') as HTMLInputElement).value;
                const compte = (document.getElementById('ecr-compte') as HTMLInputElement).value;
                const libelle = (document.getElementById('ecr-libelle') as HTMLInputElement).value;
                const sens = (document.getElementById('ecr-sens') as HTMLSelectElement).value;
                const montant = parseFloat((document.getElementById('ecr-montant') as HTMLInputElement).value) || 0;
                if (!date || !compte || montant <= 0) return alert('Remplir tous les champs');
                setLocalEcritures(prev => [...prev, { id: crypto.randomUUID(), numero_doc: piece, date_operation: date, journal_code: 'VT', compte, libelle, sens, montant }]);
                (document.getElementById('ecr-montant') as HTMLInputElement).value = '';
              }} className="btn btn-emerald rounded px-3 py-1.5 hover:bg-emerald-600">+</button>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Journal</th>
                  <th className="px-3 py-2 text-left">N° Piece</th>
                  <th className="px-3 py-2 text-left">Compte</th>
                  <th className="px-3 py-2 text-left">Libelle</th>
                  <th className="px-3 py-2 text-center">D/C</th>
                  <th className="px-3 py-2 text-right">Debit</th>
                  <th className="px-3 py-2 text-right">Credit</th>
                  <th className="px-3 py-2 text-left">PDF</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {localEcritures.map(e => (
                  <tr key={e.id} className="row-hover">
                    <td className="px-3 py-1.5 text-xs">{e.date_operation}</td>
                    <td className="px-3 py-1.5 text-xs font-mono">{e.journal_code}</td>
                    <td className="px-3 py-1.5 text-xs font-mono">{e.numero_doc}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{e.compte}</td>
                    <td className="px-3 py-1.5 text-xs">{e.libelle}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`text-xs font-bold ${e.sens === 'D' ? 'text-blue-600' : 'text-emerald-600'}`}>{e.sens}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs">{e.sens === 'D' ? (e.montant || 0).toFixed(3) : ''}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs">{e.sens === 'C' ? (e.montant || 0).toFixed(3) : ''}</td>
                    <td className="px-3 py-1.5 text-xs">
                      {pdfOf(e.numero_doc) ? (
                        <button onClick={() => openPdf(pdfOf(e.numero_doc))} title={pdfOf(e.numero_doc)}
                          className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 hover:underline font-mono">
                          <FileText size={12} />{pdfLabel(pdfOf(e.numero_doc)) || '⚠ fichier introuvable'}
                        </button>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-1">
                      <button onClick={() => setLocalEcritures(prev => prev.filter(x => x.id !== e.id))} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
                {localEcritures.length === 0 && <tr><td colSpan={10} className="text-center text-gray-400 py-6">Aucune ecriture - cliquer "Generer VT" ou ajouter manuellement</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Export */}
      {tab === 'export' && (
        <div className="space-y-4">
          <div className="card p-6 space-y-4">
            <h3 className="font-semibold text-gray-700">Export CSV / Axeane</h3>
            <p className="text-sm text-gray-500">Format: N° piece | Date | Journal | Libelle | Compte | Libelle tresorerie | Debit | Credit</p>
            <div className="flex gap-3 items-center flex-wrap">
              <button onClick={() => handleExportCSV()} disabled={localEcritures.length === 0} className="btn btn-emerald px-4 py-2 rounded text-sm hover:bg-emerald-700 disabled:opacity-50">
                <Download size={15} className="inline mr-1" /> Export CSV
              </button>
              <button onClick={handleExportXLSX} disabled={localEcritures.length === 0} className="btn btn-blue px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                <Download size={15} className="inline mr-1" /> Export XLSX
              </button>
              <button onClick={handleVerify} disabled={localFactures.length === 0} className="btn btn-blue px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                <ShieldCheck size={15} className="inline mr-1" /> Verifier TVA 19%
              </button>
              {verifyResult && verifyResult.errors > 0 && (
                <button onClick={handleFixTVA} className="bg-amber-600 text-white px-4 py-2 rounded text-sm hover:bg-amber-700">
                  <Wrench size={15} className="inline mr-1" /> Corriger TVA
                </button>
              )}
              <span className="text-sm text-gray-500">{localFactures.length} factures / {localEcritures.length} ecritures</span>
            </div>

            {verifyResult && !verifyResult.error && (
              <div className={`rounded-lg border p-4 ${verifyResult.verdict === 'OK' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {verifyResult.verdict === 'OK' ? <CheckCircle size={18} className="text-green-600" /> : <span className="text-red-600 font-bold">!</span>}
                  <span className={`font-semibold ${verifyResult.verdict === 'OK' ? 'text-green-700' : 'text-red-700'}`}>
                    {verifyResult.verdict} — {verifyResult.errors} erreur(s) sur {verifyResult.totalFactures} factures
                  </span>
                </div>
                {verifyResult.totals && (
                  <div className="text-xs text-gray-600 mb-2">
                    HT: {verifyResult.totals.ht?.toFixed(3)} | TVA: {verifyResult.totals.tva?.toFixed(3)} | FODEC: {verifyResult.totals.fodec?.toFixed(3)} | Timbre: {verifyResult.totals.timbre?.toFixed(3)} | TTC: {verifyResult.totals.ttc?.toFixed(3)}
                  </div>
                )}
                {verifyResult.checks && (
                  <div className="max-h-64 overflow-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="table-header"><th className="text-left pr-2">Piece</th><th className="text-left pr-2">Type</th><th className="text-left pr-2">Client</th><th className="text-left">Check</th></tr></thead>
                      <tbody>
                        {verifyResult.checks.map((c: any, i: number) =>
                          c.checks?.map((ch: any, j: number) => (
                            <tr key={`${i}-${j}`} className={`border-t ${ch.status === 'error' ? 'bg-red-50' : ''}`}>
                              {j === 0 && <td rowSpan={c.checks.length} className="pr-2 font-mono">{c.piece}</td>}
                              {j === 0 && <td rowSpan={c.checks.length} className="pr-2">{c.type}</td>}
                              {j === 0 && <td rowSpan={c.checks.length} className="pr-2">{c.client}</td>}
                              <td className={ch.status === 'error' ? 'text-red-600 font-medium' : 'text-green-600'}>{ch.detail}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            {verifyResult?.error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">{verifyResult.error}</div>
            )}
            {localEcritures.length > 0 && (
              <div className="bg-gray-50 rounded p-3 text-xs text-gray-600 max-h-48 overflow-auto">
                <table className="w-full">
                  <thead><tr className="table-header"><th className="text-left pr-3">Date</th><th className="text-left pr-3">Piece</th><th className="text-left pr-3">Compte</th><th className="text-right pr-3">D</th><th className="text-right">C</th></tr></thead>
                  <tbody>
                    {localEcritures.slice(0, 30).map(e => (
                      <tr key={e.id} className="border-t border-gray-200">
                        <td className="pr-3">{e.date_operation}</td>
                        <td className="pr-3 font-mono">{e.numero_doc}</td>
                        <td className="pr-3 font-mono">{e.compte}</td>
                        <td className="pr-3 text-right font-mono">{e.sens === 'D' ? (e.montant || 0).toFixed(3) : ''}</td>
                        <td className="text-right font-mono">{e.sens === 'C' ? (e.montant || 0).toFixed(3) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {localEcritures.length > 30 && <div className="text-gray-400 mt-1">... {localEcritures.length - 30} lignes de plus</div>}
              </div>
            )}
          </div>

          <div className="card p-6">
            <h3 className="font-semibold text-gray-700 mb-2">Comptes utilises</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium text-gray-600 mb-1">Clients (Debit)</h4>
                <ul className="text-xs text-gray-500 space-y-0.5">
                  <li><code>411XXX</code> — Compte client (par tiers)</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-gray-600 mb-1">Ventes (Credit)</h4>
                <ul className="text-xs text-gray-500 space-y-0.5">
                  <li><code>707000</code> — Ventes 19%</li>
                  <li><code>707003</code> — Vente suspension TVA</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-gray-600 mb-1">TVA & taxes (Credit)</h4>
                <ul className="text-xs text-gray-500 space-y-0.5">
                  <li><code>436719</code> — TVA collectee 19%</li>
                  <li><code>436780</code> — FODEC</li>
                  <li><code>437600</code> — Timbre fiscal</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
