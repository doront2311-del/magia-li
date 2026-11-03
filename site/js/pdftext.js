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
      if (prev && gap < it.h * 0.25 && it.s.length <= 2 && prev.s.length <= 2) { const w = words[words.length - 1]; w.s += it.s; w.x = it.x; }
      else words.push({ s: it.s, x: it.x, r: it.x + it.w });
      prev = it;
    }
    const kept = words.map((w) => ({ ...w, s: w.s.trim() })).filter((w) => w.s);
    // המיקום האופקי של כל מילה (x = קצה שמאלי, r = קצה ימני), לטבלאות שבהן תאים ריקים (למשל אישור תשלומי אבטלה).
    const line = kept.map((w) => w.s);
    line.pos = kept.map((w) => ({ x: w.x, r: w.r }));
    out.push(line);
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

// מציג קובץ PDF בתוך האפליקציה: כל עמוד כתמונה (canvas). עובד גם בטלפון, בלי תוסף PDF.
export async function renderPdf(blob, container) {
  const lib = await loadPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
  const width = Math.min(container.clientWidth || 800, 900);
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const ratio = window.devicePixelRatio || 1;
    const vp = page.getViewport({ scale: (width / base.width) * ratio });
    const c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    c.style.width = `${width}px`;
    container.appendChild(c);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  }
}
