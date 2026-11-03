// בונה את site/js/settlements.js מהקבצים ב-data/settlements/<שנה>.txt.
// כל קובץ הוא העתקה של פרק "רשימת היישובים המוטבים" מלוח העזר החודשי של רשות המסים לאותה שנה.
// שורה: שם|אחוז|תקרה שנתית. שורה עם "?" = לא נקרא בוודאות מהמקור, והאפליקציה לא תחשב לפיה.
// אחרי "## split YYYY-MM-DD": שם|אחוז מהתאריך|תקרה|אחוז לפני התאריך|תקרה.
import fs from 'node:fs';
const dir = new URL('../data/settlements/', import.meta.url);
const out = {};
for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}\.txt$/.test(x)).sort()) {
  const year = Number(f.slice(0, 4));
  const rows = {};
  let split = null;
  for (const line of fs.readFileSync(new URL(f, dir), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const m = line.match(/^## split (\d{4}-\d{2}-\d{2})/);
    if (m) { split = m[1]; continue; }
    const [name, pct, ceil, pct2, ceil2] = line.split('|');
    const clean = name.replace(/\*$/, '').trim();
    if (pct === '?') { rows[clean] = { unclear: true }; continue; }
    rows[clean] = split ? { rate: +pct, ceiling: +ceil, from: split, before: { rate: +pct2, ceiling: +ceil2 } } : { rate: +pct, ceiling: +ceil };
  }
  out[year] = rows;
}
const js = `// נוצר אוטומטית מ-data/settlements על ידי scripts/build-settlements.mjs. לא לערוך ידנית.
// מקור: לוח העזר לחישוב מס הכנסה ממשכורת של רשות המסים, פרק "רשימת היישובים המוטבים", לכל שנה.
export const SETTLEMENTS = ${JSON.stringify(out)};
`;
fs.writeFileSync(new URL('../site/js/settlements.js', import.meta.url), js);
console.log(Object.entries(out).map(([y, r]) => `${y}: ${Object.keys(r).length}`).join(', '));
