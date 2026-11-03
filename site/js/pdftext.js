// הופך את פריטי הטקסט של pdf.js לשורות. כל שורה היא רשימת "מילים" מימין לשמאל.
// פריטים צמודים (למשל אות-אות במסמכי ביטוח לאומי) מתחברים למילה אחת.

export function linesFromItems(items) {
  const rows = new Map();
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const y = Math.round(it.transform[5] / 3) * 3;
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push({ x: it.transform[4], w: it.width || 0, h: Math.abs(it.transform[3]) || 10, s: it.str });
  }
  const out = [];
  for (const [, row] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
    row.sort((a, b) => b.x - a.x);
    const words = [];
    let prev = null;
    for (const it of row) {
      const gap = prev ? prev.x - (it.x + it.w) : Infinity;
      if (prev && gap < it.h * 0.25 && it.s.length <= 2 && prev.s.length <= 2) words[words.length - 1] += it.s;
      else words.push(it.s);
      prev = it;
    }
    out.push(words.map((w) => w.trim()).filter(Boolean));
  }
  return out;
}

let pdfjsLib = null;
async function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/pdfjs/pdf.min.js', import.meta.url).href;
    s.onload = resolve; s.onerror = () => reject(new Error('pdf.js load failed'));
    document.head.appendChild(s);
  });
  pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.js', import.meta.url).href;
  return pdfjsLib;
}

// קורא קובץ PDF בדפדפן. הקובץ לא יוצא מהמחשב.
export async function pdfLines(file) {
  const lib = await loadPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const lines = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    lines.push(...linesFromItems(tc.items));
  }
  return lines;
}
