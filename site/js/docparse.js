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
  btlUnemployment: 'אישור תשלומי אבטלה שנתי (ביטוח לאומי, נושא "אבטלה")',
  bankProof: 'אישור ניהול חשבון (מהבנק)',
  legacy106: 'מסמך בקידוד ישן שאי אפשר לקרוא',
  scanned: 'מסמך סרוק (תמונה)',
  residency: 'אישור תושבות (טופס 1312א, מהמועצה או העירייה)',
  form867: 'טופס 867: אישור ניכוי מס במקור משוק ההון (בנק או בית השקעות)',
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
    // גם מסמכים אחרים (למשל אישור מהבנק שהודפס מהאתר) מגיעים לפעמים בקידוד כזה. מזהים אותם אחרי ההמרה,
    // ו"טופס 106 ישן" רק כשבאמת יש בו מילים של טופס שכר.
    const dec = decodeLegacy(rawLines);
    all = prep(dec).map((l) => l.c).join('\n');
    if (!HEB.test(all)) return { type: 'unknown' };
    const d = parseDocument(dec);
    if (d.fields) delete d.fields.creditPoints; // השבר העשרוני לא נקרא נכון בקידוד הישן
    if (d.type !== 'unknown') return d;
    return { type: /מעביד|מעסיק|משכורת|ניכויים/.test(all) ? 'legacy106' : 'unknown' };
  }
  if (!all.trim()) return { type: 'scanned' };

  if (/אישורניכוימסבמקור/.test(all) && /רווחהוןמניירותערך|דיבידנדוריביתמניירותערך/.test(all)) return { type: 'form867', ...parse867(rawLines, L) };
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
  // ביטוח לאומי ← אישורים ← נושא "אבטלה" ← "אישור תשלומי אבטלה שנתי": טבלה לפי חודשים, עם עמודת "מס הכנסה".
  if (/אישורתשלומיאבטלהלשנת|תשלומיקצבתאבטלהבשנת/.test(all)) {
    const year = yearAfter(all, 'אישורתשלומיאבטלהלשנת') || yearAfter(all, 'קצבתאבטלהבשנת');
    return { type: 'btlUnemployment', kind: 'unemployment', year, ...unemploymentTable(rawLines), idTail: idTail(L) };
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
  if (/אישורתושב|1312א|1312/.test(all)) return { type: 'residency' };
  // כל בנק קורא לו אחרת: "אישור ניהול חשבון", "אישור על ניהול חשבון", "אישור בעלות בחשבון".
  // יש קבצים שהטקסט שלהם יוצא הפוך (משמאל לימין), ולכן בודקים גם את הצורה ההפוכה.
  if (/ניהולחשבון|בעלותבחשבון|בעלותעלחשבון|בעלותחשבון|ןובשחלוהינ|ןובשחבתולעב|ןובשחלעתולעב/.test(all)) return { type: 'bankProof' };
  // אישור שהמועצה מילאה: לפעמים רק הנתונים הם טקסט, והטופס עצמו תמונת רקע. מזהים לפי שם הרשות ותאריך.
  if (/מועצהאזורית|מועצהמקומית|עיריית|עירייה|ועדמקומי/.test(all) && /\d{2}\/\d{2}\/\d{4}/.test(all)) return { type: 'residency' };
  return { type: 'unknown' };
}

// טופס 867 (רשות המסים קבעה את המבנה, ולכן הוא זהה בכל בנק ובית השקעות): רווח הון (867 א+ב) ודיבידנד וריבית (867 ג).
// הסכומים מופיעים בעמודות לפי שיעור המס, ולכן משייכים כל סכום לכותרת העמודה הקרובה אליו (צריך מיקומים).
// לא שומרים שמות ומספרי זהות: רק את 4 הספרות האחרונות של כל שותף בחשבון, כדי לדעת אם החשבון משותף.
const RATE = /^(\d{1,2})%$/;
export function parse867(rawLines, L = prep(rawLines)) {
  const all = L.map((l) => l.c).join('\n');
  const out = { year: yearAfter(all, 'לשנתהמס'), account: null, partners: [], gains: {}, losses: 0, nonOffsetLosses: 0, exemptGains: 0, oilGains: 0,
    turnover: null, gainsTax: null, dividends: {}, interest: {}, dividendTax: null, interestTax: null, foreignTax: 0, lossRefund: 0, hasGains: false, hasDividends: false, ok: true,
    partGains: /רווחהוןמניירותערך/.test(all), partDiv: /דיבידנדוריביתמניירותערך/.test(all) };
  if (rawLines.some((l) => !l.pos)) return { ...out, ok: false };
  const center = (p) => (p.x + p.r) / 2;
  const nums = (i, maxX = 360) => rawLines[i].map((s, k) => ({ s, c: center(rawLines[i].pos[k]) })).filter((o) => NUM.test(o.s) && o.c < maxX).map((o) => ({ v: toNum(o.s), c: o.c }));
  const heads = (i) => rawLines[i].map((s, k) => ({ m: s.match(RATE), c: center(rawLines[i].pos[k]) })).filter((o) => o.m).map((o) => ({ rate: Number(o.m[1]), c: o.c }));
  const nearest = (cols, c) => cols.reduce((b, h) => (Math.abs(h.c - c) < Math.abs(b.c - c) ? h : b)).rate;
  const add = (obj, k, v) => { obj[k] = (obj[k] || 0) + v; };
  // הסכום של שורה: באותה שורה, ואם אין, בשורה הבאה (כשהשורה הבאה היא רק מספרים).
  const valueAt = (i, maxX) => {
    const own = nums(i, maxX);
    if (own.length) return own[0].v;
    const n = L[i + 1];
    if (n && !HEB.test(n.items.filter((s) => !NUM.test(s)).join(''))) { const nx = nums(i + 1, maxX); if (nx.length) return nx[0].v; }
    return null;
  };
  let mode = null, cols = null, row = null, block = 0;
  L.forEach((line, i) => {
    const c = line.c;
    if (/מספרחשבון/.test(c) && out.account == null) {
      for (const j of [i, i + 1]) {
        const acc = (rawLines[j] || []).find((s) => /^\d{3,12}$/.test(s) && !/^9\d{8}$/.test(s) && !/מספרחשבון/.test(s));
        if (acc && j > i) { out.account = acc; break; }
      }
    }
    for (const s of line.items) if (/^[0-3]\d{8}$/.test(s) && !out.partners.includes(s.slice(-4))) out.partners.push(s.slice(-4));
    const h = heads(i);
    // כותרת של עמודות שיעורי מס. ברווח הון כתוב "שיעור מס", ובדיבידנד ובריבית "שיעור ניכוי המס במקור" (לפעמים בשורה נפרדת).
    if (h.length >= 4) {
      if (/שיעורמס/.test(c) && !/ניכוי/.test(c)) mode = 'gains';
      else { block += 1; mode = block === 1 ? 'div' : 'int'; }
      cols = h; row = null; return;
    }
    if (mode === 'gains') {
      if (/מחזורמכירות/.test(c)) { mode = 'after'; out.turnover = valueAt(i, 360) ?? out.turnover; return; }
      if (/רווחיםחייביםבמסלמעט/.test(c)) row = 'gains';
      else if (/רווחיםחייביםממכירתיחידות/.test(c)) row = 'oil';
      else if (/רווחיםפטורים/.test(c)) row = 'exempt';
      else if (/הפסדיםשאינםבריקיזוז/.test(c)) row = 'nonOffset';
      else if (/הפסדיםבמכירתמניותקרן/.test(c)) row = 'reit';
      else if (/^הפסדים/.test(c) && /בריקיזוז/.test(c)) row = 'losses';
      for (const n of nums(i)) {
        if (row === 'gains') { add(out.gains, nearest(cols, n.c), n.v); out.hasGains = true; }
        else if (row === 'losses' || row === 'reit') { out.losses += n.v; out.hasGains = true; }
        else if (row === 'nonOffset') out.nonOffsetLosses += n.v;
        else if (row === 'exempt') out.exemptGains += n.v;
        else if (row === 'oil') out.oilGains += n.v;
      }
      return;
    }
    if (mode === 'after') {
      if (out.turnover == null && line.items.every((s) => NUM.test(s))) { const n = nums(i); if (n.length) out.turnover = n[0].v; }
      if (/^מסשנוכהבמקור$/.test(c) || (/מסשנוכהבמקור/.test(c) && !/מדיבידנד|מריבית/.test(c))) out.gainsTax = valueAt(i, 360);
      return;
    }
    if (mode === 'div' || mode === 'int') {
      const num = line.items.find((s) => /^\d{1,2}$/.test(s) && center(rawLines[i].pos[line.items.indexOf(s)]) > 550);
      if (num) row = Number(num);
      if (/מסשנוכהבמקורמדיבידנד/.test(c)) { out.dividendTax = nums(i, 200)[0]?.v ?? 0; return; }
      if (/מסשנוכהבמקורמריבית/.test(c)) { out.interestTax = nums(i, 200)[0]?.v ?? 0; return; }
      if (/החזרבגיןקיזוזהפסדיהון/.test(c)) { out.lossRefund = nums(i, 200)[0]?.v ?? 0; }
      if (/ניכויבמקורנטו/.test(c)) return;
      if (/מסששולםבחו/.test(c) && /שהותר/.test(c) && !/שלאהותר/.test(c)) { const v = nums(i, 400).filter((n) => n.c < 420)[0]; if (v?.v) out.foreignTax += v.v; return; }
      const target = mode === 'div' && row === 1 ? out.dividends : mode === 'int' && row === 7 ? out.interest : null;
      if (target && !/^\(?\d\)?$/.test(c)) {
        for (const n of nums(i, 360)) { add(target, nearest(cols, n.c), n.v); out.hasDividends = true; }
      }
    }
  });
  if (out.dividendTax == null && /דיבידנדוריביתמניירותערך/.test(all)) out.dividendTax = 0;
  if (out.interestTax == null && /דיבידנדוריביתמניירותערך/.test(all)) out.interestTax = 0;
  return out;
}

// טבלת אישור תשלומי אבטלה: בחלק מהשורות יש תאים ריקים, ולכן משייכים כל סכום לכותרת העמודה הקרובה אליו.
// בלי מיקומים (pos) אי אפשר לדעת איזה סכום הוא המס, ואז tax = null (כלומר חסר, לא אפס).
function unemploymentTable(rawLines) {
  const center = (p) => (p.x + p.r) / 2;
  const isRow = (l) => l.some((s) => /^\d{2}\/\d{4}$/.test(s)) && l.some((s) => /אבטלה/.test(s));
  const first = rawLines.findIndex(isRow);
  if (first < 0 || rawLines.some((l) => !l.pos)) return { gross: null, tax: null };
  const heads = [];
  for (const l of rawLines.slice(Math.max(0, first - 8), first)) {
    l.forEach((s, i) => { if (!/\d/.test(s)) heads.push({ s: compact(s), c: center(l.pos[i]) }); });
  }
  const col = (re) => heads.filter((h) => re.test(h.s)).map((h) => h.c);
  const taxCols = col(/^הכנסה$|^מס$/), grossCols = col(/^ברוטו$/);
  if (!taxCols.length || !grossCols.length) return { gross: null, tax: null };
  let gross = 0, tax = 0;
  for (const l of rawLines.filter(isRow)) {
    l.forEach((s, i) => {
      if (!NUM.test(s) || /\//.test(s)) return;
      const c = center(l.pos[i]);
      // כותרות של שתי שורות ("תשלום" מעל "ברוטו") נמצאות באותו מקום, ולכן משווים מרחקים עם מרווח קטן.
      const dist = (cols) => Math.min(...cols.map((x) => Math.abs(x - c)));
      const best = dist(heads.map((h) => h.c));
      if (dist(taxCols) <= best + 3) tax += toNum(s);
      else if (dist(grossCols) <= best + 3) gross += toNum(s);
    });
  }
  return { gross, tax };
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
    employerPension: f.fields.employerPension ?? 0,
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
  const certs = forYear.filter((d) => ['btlMiluim', 'btlTaxCert', 'btlUnemployment'].includes(d.type));
  const legacy = forYear.filter((d) => d.type === 'legacy106' || d.type === 'scanned');
  const unknown = forYear.filter((d) => d.type === 'unknown');
  const residency = docs.find((d) => d.type === 'residency') || null;
  const bankProof = docs.find((d) => d.type === 'bankProof') || null;
  const accounts = mergeAccounts(forYear.filter((d) => d.type === 'form867'), issues);
  return { residency, bankProof, summary, forms, expected, missing, employers, btlAnnual, certs, legacy, unknown, issues, accounts };
}

// כמה קבצי 867 של אותו חשבון (למשל 867 א+ב בקובץ אחד ו-867 ג בקובץ אחר) מתאחדים לחשבון אחד.
// קובץ שאותו חלק שלו כבר הועלה לא נספר פעמיים.
function mergeAccounts(docs, issues) {
  const out = [];
  const addAll = (to, from) => { for (const [k, v] of Object.entries(from || {})) to[k] = (to[k] || 0) + v; };
  for (const d of docs) {
    const key = d.account || d.fileName;
    let a = out.find((x) => x.key === key);
    if (!a) out.push(a = { key, account: d.account, partners: [], gains: {}, dividends: {}, interest: {}, losses: 0, nonOffsetLosses: 0, exemptGains: 0, oilGains: 0,
      turnover: 0, gainsTax: 0, dividendTax: 0, interestTax: 0, foreignTax: 0, lossRefund: 0, partGains: false, partDiv: false, sources: [], ok: true });
    for (const t of d.partners || []) if (!a.partners.includes(t)) a.partners.push(t);
    if (!d.ok) a.ok = false;
    let used = false;
    if (d.partGains) {
      if (a.partGains) issues.push(`"${d.fileName}": את רווח ההון של חשבון ${key} כבר העלית בקובץ אחר. הוא נכלל פעם אחת.`);
      else {
        a.partGains = used = true;
        addAll(a.gains, d.gains);
        a.losses += d.losses; a.nonOffsetLosses += d.nonOffsetLosses; a.exemptGains += d.exemptGains; a.oilGains += d.oilGains;
        a.turnover += d.turnover || 0; a.gainsTax += d.gainsTax || 0;
      }
    }
    if (d.partDiv) {
      if (a.partDiv) issues.push(`"${d.fileName}": את הדיבידנד והריבית של חשבון ${key} כבר העלית בקובץ אחר. הם נכללו פעם אחת.`);
      else {
        a.partDiv = used = true;
        addAll(a.dividends, d.dividends); addAll(a.interest, d.interest);
        a.dividendTax += d.dividendTax || 0; a.interestTax += d.interestTax || 0; a.foreignTax += d.foreignTax || 0; a.lossRefund += d.lossRefund || 0;
      }
    }
    if (used) a.sources.push(d.fileName);
  }
  return out;
}
