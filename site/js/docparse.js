// זיהוי וקריאה של מסמכים מתוך הטקסט שלהם. קוד טהור: מקבל שורות (כל שורה = רשימת פריטי טקסט
// מימין לשמאל, כמו ש-pdf.js מחזיר) ומחזיר אובייקט עם סוג המסמך, השנה והשדות.
// לא שומרים טקסט גולמי, שמות או מספרי זהות. רק 4 הספרות האחרונות של ת.ז., כדי לזהות קובץ של אדם אחר.

const NUM = /^\d{1,3}(,\d{3})+$|^\d+$/;
const toNum = (s) => Number(String(s).replace(/,/g, ''));
const compact = (s) => s.replace(/[\s|'"״׳`]/g, '');
const HEB = /[א-ת]/;

export const DOC_TYPES = {
  payrollSummary: 'ריכוז נתוני שכר מכלל המעסיקים (רשות המסים)',
  form106: 'טופס 106 (נספח ב\' מרשות המסים)',
  btlAnnual: 'ריכוז תשלומים שנתי (ביטוח לאומי)',
  btlMiluim: 'אישור שנתי למס הכנסה על תגמולי מילואים (ביטוח לאומי)',
  btlTaxCert: 'אישור שנתי למס הכנסה (ביטוח לאומי)',
  legacy106: 'מסמך בקידוד ישן שאי אפשר לקרוא',
  scanned: 'מסמך סרוק (תמונה)',
  unknown: 'מסמך שלא זיהינו',
};

function prep(lines) {
  return lines.map((items) => {
    const it = items.map((s) => String(s).trim()).filter(Boolean);
    return { items: it, text: it.join(' '), c: compact(it.join('')) };
  });
}

function amountOf(L, i) {
  // הסכום הוא פריט שכולו מספר באותה שורה. לפעמים הוא נשבר לשורה הבאה.
  const own = L[i].items.filter((s) => NUM.test(s));
  if (own.length) return toNum(own[own.length - 1]);
  const next = L[i + 1];
  if (next && next.items.some((s) => NUM.test(s)) && !HEB.test(next.items.filter((s) => !/^ש''?ח$/.test(s)).join(''))) {
    return toNum(next.items.find((s) => NUM.test(s)));
  }
  return null;
}

// קודי השדות מופיעים בשני הכיוונים: "158/172" ברשות המסים, "172/158" בטופס של חילן.
const FIELD_PATTERNS = [
  ['insuredIncome', /244\/245|245\/244/],
  ['pensionDeposit', /086\/045|045\/086/],
  ['employerPension', /248\/249|249\/248/],
];
const INCOME = /158\/172|172\/158/;
const TAX = /(^|\D)042(\D|$)/;
// "סה"כ" אבל לא בתוך "מס הכנסה" (בלי רווחים זה "מסהכנסה", שמכיל את האותיות סהכ).
const TOTAL = /(^|[^מ])סהכ/;
const SETTLEMENT = /בגיןזיכוילפיסעיף11|193\/093|093\/193|הנחתישוביםמזכים/;

function readFields(L) {
  const f = {};
  const incomeLines = [];
  const taxLines = [];
  L.forEach((line, i) => {
    for (const [key, re, must] of FIELD_PATTERNS) {
      if (f[key] != null) continue;
      if (re.test(line.c) && (!must || must.test(line.c))) {
        const v = amountOf(L, i);
        if (v != null) f[key] = v;
      }
    }
    if (INCOME.test(line.c)) { const v = amountOf(L, i); if (v != null) incomeLines.push({ v, total: TOTAL.test(line.c) }); }
    if (TAX.test(line.c) && /מסהכנסה|ניכויי?מס/.test(line.c)) { const v = amountOf(L, i); if (v != null) taxLines.push({ v, total: TOTAL.test(line.c) }); }
    if (SETTLEMENT.test(line.c)) f.settlement = true;
    const cp = line.c.match(/ערךנקודותזיכוי(\d+(?:\.\d+)?)/);
    if (cp) f.creditPoints = Number(cp[1]);
  });
  // כמה שורות (למשל משכורת + הפרשים לשנה קודמת) מסכמים. שורת "סה"כ" רק אם אין אחרות.
  const total = (rows) => {
    const parts = rows.filter((x) => !x.total);
    if (parts.length) return parts.reduce((s, x) => s + x.v, 0);
    return rows.length ? rows[0].v : undefined;
  };
  if (incomeLines.length) f.income = total(incomeLines);
  if (taxLines.length) f.taxWithheld = total(taxLines);
  return f;
}

// מעסיקים: שורה שיש בה תיק ניכויים (9 ספרות שמתחילות ב-9) ושם בעברית לידו.
function readEmployers(L) {
  const out = [];
  for (const line of L) {
    const idx = line.items.findIndex((s) => /^9\d{8}$/.test(s));
    if (idx < 0) continue;
    const name = [...line.items.slice(0, idx)].reverse().find((s) => HEB.test(s) && !/^(לא|כן)$/.test(s));
    if (name && !out.some((e) => e.taxFile === line.items[idx])) out.push({ name, taxFile: line.items[idx] });
  }
  return out;
}

// ת.ז.: קודם מספר שמופיע אחרי "ת.ז"/"זהות", אחר כך הפורמט של ביטוח לאומי (12345678-9), ואחר כך 9 ספרות.
function idTail(L) {
  const all = L.map((l) => l.c).join('');
  const near = all.match(/(?:ת\.?ז\.?|זהות:?)(\d{8}[-/]?\d)/);
  if (near) return near[1].replace(/\D/g, '').slice(-4);
  const items = L.flatMap((l) => l.items);
  const a = items.find((s) => /^\d{8}[-/]\d$/.test(s));
  if (a) return a.replace(/\D/g, '').slice(-4);
  const b = items.find((s) => /^[1-4]\d{8}$/.test(s)); // 5x = מספר חברה, 9x = תיק ניכויים
  return b ? b.slice(-4) : null;
}

const yearAfter = (c, marker) => {
  const m = c.match(new RegExp(`${marker}(\\d{4})`));
  return m ? Number(m[1]) : null;
};

const BTL_KINDS = [['unemployment', /^אבטלה/], ['maternity', /^דמילידה|^לידה/], ['injury', /^דמיפגיעה|^פגיעהבעבודה/]];

// טפסי 106 ישנים של חילן: עברית בקידוד ISO-8859-8 שמוצגת כאותיות לטיניות (à = א), וכל תו הוא פריט
// נפרד. ממירים לעברית, ומהפכים רצפים של ספרות, כי הם מגיעים בסדר הפוך.
function decodeLegacy(rawLines) {
  return rawLines.map((items) => items.flatMap((item) => {
    const heb = item.replace(/[à-ú]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xe0 + 0x05d0));
    const fixed = heb.replace(/\d[\d,./]*\d|\d/g, (run) => [...run].reverse().join(''));
    return fixed.split(/(\d[\d,]*\d|\d)/).map((x) => x.trim()).filter(Boolean);
  }));
}

export function parseDocument(rawLines) {
  let L = prep(rawLines);
  let all = L.map((l) => l.c).join('\n');
  const latin = (all.match(/[À-ÿ]/g) || []).length;
  if (!HEB.test(all) && latin > 30) {
    L = prep(decodeLegacy(rawLines));
    all = L.map((l) => l.c).join('\n');
    if (!/במקוםטופס106|תעודהעל-?פיתקנותמסהכנסה/.test(all)) return { type: 'legacy106' };
    const d = parseDocument(decodeLegacy(rawLines));
    if (d.fields) delete d.fields.creditPoints; // השבר העשרוני לא נקרא נכון בקידוד הישן
    return d;
  }
  if (!all.trim()) return { type: 'scanned' };

  if (/ריכוזנתונישכרמכללהמעסיקיםבשנתהמס/.test(all)) {
    return { type: 'payrollSummary', year: yearAfter(all, 'בשנתהמס'), employers: readEmployers(L), fields: readFields(L), idTail: idTail(L) };
  }
  if (/במקוםטופס106/.test(all) || /תעודהעל-?פיתקנותמסהכנסה/.test(all)) {
    const file = all.match(/תיקניכויים:?(9\d{8})/);
    const nameItem = L.slice(0, 30).flatMap((l) => l.items).find((s) => /בע"?מ|בעמ/.test(s));
    const nameLine = nameItem ? nameItem.replace(/(בע"?מ).*/, '$1').trim() : null;
    return { type: 'form106', source: 'employer', year: yearAfter(all, 'לשנת'), employer: file ? { name: nameLine || 'מעסיק', taxFile: file[1] } : null, fields: readFields(L), idTail: idTail(L) };
  }
  if (/מידעעלהכנסותלשנתהמס/.test(all)) {
    const employers = readEmployers(L);
    return { type: 'form106', year: yearAfter(all, 'לשנתהמס'), employer: employers[0] || null, fields: readFields(L), idTail: idTail(L) };
  }
  if (/אישורשנתילמסהכנסהלשנת/.test(all) || /אישורשנתילמסהכנסה/.test(all)) {
    const gross = all.match(/ברוטובסך:?([\d,]+)/);
    const tax = all.match(/נוכהמסהכנסהבסך:?([\d,]+)/);
    const year = yearAfter(all, 'לשנת') || yearAfter(all, 'לשנתהמס');
    const kind = /מילואים/.test(all) ? 'miluim' : /אבטלה/.test(all) ? 'unemployment' : /לידה|אמהות/.test(all) ? 'maternity' : /פגיעה/.test(all) ? 'injury' : null;
    return { type: kind === 'miluim' ? 'btlMiluim' : 'btlTaxCert', kind, year, gross: gross ? toNum(gross[1]) : null, tax: tax ? toNum(tax[1]) : null, idTail: idTail(L) };
  }
  if (/ריכוזתשלומיםשנתי/.test(all)) {
    const m = all.match(/ריכוזתשלומיםשנתי-?(\d{4})/);
    const benefits = [];
    for (const line of L) {
      const nums = line.items.filter((s) => NUM.test(s)).map(toNum);
      if (nums.length < 3) continue;
      const kind = BTL_KINDS.find(([, re]) => re.test(line.c));
      if (kind) benefits.push({ kind: kind[0], gross: nums[0], deductions: nums[1], net: nums[2] });
    }
    return { type: 'btlAnnual', year: m ? Number(m[1]) : null, benefits, idTail: idTail(L) };
  }
  return { type: 'unknown' };
}

// מסכם את כל המסמכים של אדם אחד בשנה אחת: מה נמצא, מה חסר, ואילו ערכים להזין למנוע.
export function summarizeDocs(docs, year) {
  const issues = [];
  const forYear = docs.filter((d) => {
    if (d.year && d.year !== year) { issues.push(`"${d.fileName}" הוא של שנת ${d.year}, לא ${year}. הוא לא נכלל.`); return false; }
    return true;
  });
  const tails = [...new Set(forYear.map((d) => d.idTail).filter(Boolean))];
  if (tails.length > 1) issues.push('נראה שחלק מהקבצים שייכים לאדם אחר (מספרי זהות שונים). בדקו שהעליתם רק מסמכים של אותו אדם.');

  const summary = forYear.find((d) => d.type === 'payrollSummary') || null;
  const forms = [];
  for (const d of forYear.filter((x) => x.type === 'form106')) {
    const key = d.employer?.taxFile || d.fileName;
    if (forms.some((f) => (f.employer?.taxFile || f.fileName) === key)) { issues.push(`"${d.fileName}" כפול. נכלל פעם אחת.`); continue; }
    forms.push(d);
  }
  const expected = summary?.employers || [];
  const missing = expected.filter((e) => !forms.some((f) => f.employer?.taxFile === e.taxFile));
  // השם מהריכוז של רשות המסים עדיף (בטפסים בקידוד ישן נעלמים הרווחים).
  const nameFor = (f) => expected.find((e) => e.taxFile === f.employer?.taxFile)?.name || f.employer?.name || f.fileName;
  const employers = forms.map((f) => ({
    name: nameFor(f),
    taxFile: f.employer?.taxFile || '',
    income: f.fields.income ?? null,
    taxWithheld: f.fields.taxWithheld ?? 0,
    pensionDeposit: f.fields.pensionDeposit ?? 0,
    insuredIncome: f.fields.insuredIncome ?? 0,
    settlementCode: f.fields.settlement ? 1 : 0,
    source: f.fileName,
  }));
  for (const e of employers) if (e.income == null) issues.push(`לא הצלחנו לקרוא את שדה 158/172 בקובץ "${e.source}".`);
  if (summary && employers.length && !missing.length) {
    const sum = employers.reduce((s, e) => s + (e.income || 0), 0);
    if (summary.fields.income != null && Math.abs(sum - summary.fields.income) > 2) {
      issues.push(`סכום המשכורות בטופסי ה-106 (${sum.toLocaleString('he-IL')}) שונה מהסכום בריכוז נתוני השכר (${summary.fields.income.toLocaleString('he-IL')}). בדקו אם חסר טופס.`);
    }
    const tax = employers.reduce((s, e) => s + (e.taxWithheld || 0), 0);
    if (summary.fields.taxWithheld != null && Math.abs(tax - summary.fields.taxWithheld) > 2) {
      issues.push(`סכום המס שנוכה בטופסי ה-106 (${tax.toLocaleString('he-IL')}) שונה מהסכום בריכוז נתוני השכר (${summary.fields.taxWithheld.toLocaleString('he-IL')}). בדקו את המספרים מול הטפסים.`);
    }
  }
  const btlAnnual = forYear.find((d) => d.type === 'btlAnnual') || null;
  const certs = forYear.filter((d) => d.type === 'btlMiluim' || d.type === 'btlTaxCert');
  const legacy = forYear.filter((d) => d.type === 'legacy106' || d.type === 'scanned');
  const unknown = forYear.filter((d) => d.type === 'unknown');
  return { summary, forms, expected, missing, employers, btlAnnual, certs, legacy, unknown, issues };
}
