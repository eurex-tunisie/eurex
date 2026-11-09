import * as pdfjsLib from 'pdfjs-dist';
// Worker embarque dans le bundle (Vite) : aucun appel a unpkg.com au runtime
// (CDN externe = 1er chargement tres lent / bloque selon le reseau).
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageTexts: string[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .filter((item: any) => 'str' in item && item.str.trim())
      .map((item: any) => ({
        str: item.str,
        x: Math.round(item.transform[4]),
        y: Math.round(item.transform[5]),
      }));

    // Reconstruct rows per page (Y-coordinate grouping)
    const rows: { y: number; items: any[] }[] = [];
    const sorted = items.sort((a: any, b: any) => b.y - a.y || a.x - b.x);
    for (const item of sorted) {
      const existingRow = rows.find(r => Math.abs(r.y - item.y) < 4);
      if (existingRow) {
        existingRow.items.push(item);
      } else {
        rows.push({ y: item.y, items: [item] });
      }
    }
    for (const row of rows) {
      row.items.sort((a: any, b: any) => a.x - b.x);
    }
    pageTexts.push(rows.map(r => r.items.map((i: any) => i.str).join(' ')).join('\n'));
  }

  return pageTexts.join('\n');
}

export async function extractTextItemsFromPDF(file: File): Promise<any[]> {
  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allItems: any[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ('str' in item && item.str.trim()) {
        allItems.push({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          page: i,
        });
      }
    }
  }
  return allItems;
}
