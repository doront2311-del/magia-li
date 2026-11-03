// בדיקות לקריאת מסמכים, על שורות סינתטיות (בלי מידע אישי). המבנה מחקה את מה ש-pdf.js מחזיר.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument, summarizeDocs } from '../site/js/docparse.js';
import { linesFromItems } from '../site/js/pdftext.js';

const summary = (year, employers, income, tax) => [
  [`ריכוז נתוני שכר מכלל המעסיקים בשנת המס ${year}`],
  ['מספר זהות', '012345678'],
  ...employers.map(([name, file]) => ['לא', name, file]),
  ['סה"כ', 'הכנסה חייבת', '158/172', income.toLocaleString('en-US')],
  ['042', 'מס הכנסה', tax.toLocaleString('en-US')],
];
const form = (year, name, file, income, tax, extra = []) => [
  [`מידע על הכנסות לשנת המס ${year}`],
  [name, file],
  ['ת.ז.', '012345678'],
  ['158/172', 'משכורת', income.toLocaleString('en-US')],
  ['042', 'ניכויי מס הכנסה', tax.toLocaleString('en-US')],
  ...extra,
];

test('ריכוז נתוני שכר: מעסיקים, סכומים ו-4 ספרות של ת.ז. בלבד', () => {
  const d = parseDocument(summary(2023, [['חברה א בע"מ', '912345678'], ['חברה ב בע"מ', '987654321']], 150_000, 12_000));
  assert.equal(d.type, 'payrollSummary');
  assert.equal(d.year, 2023);
  assert.deepEqual(d.employers.map((e) => e.taxFile), ['912345678', '987654321']);
  assert.equal(d.fields.income, 150_000);
  assert.equal(d.fields.taxWithheld, 12_000);
  assert.equal(d.idTail, '5678');
});

test('"מס הכנסה" בלי רווחים לא נחשב שורת סה"כ, ושתי שורות 042 מסוכמות', () => {
  const d = parseDocument(form(2024, 'חברה א בע"מ', '912345678', 100_000, 9_000, [['042', 'מסהכנסהעלתשלומיםלשנת', '2023', '1,000']]));
  assert.equal(d.fields.taxWithheld, 10_000);
});

test('סיכום: מוצא 106 חסר, ומשתמש בשם מהריכוז', () => {
  const docs = [
    { ...parseDocument(summary(2023, [['חברה א בע"מ', '912345678'], ['חברה ב בע"מ', '987654321']], 150_000, 12_000)), fileName: 's.pdf' },
    { ...parseDocument(form(2023, 'חברהאבע"מ', '912345678', 100_000, 8_000)), fileName: 'a.pdf' },
  ];
  const s = summarizeDocs(docs, 2023);
  assert.deepEqual(s.missing.map((e) => e.taxFile), ['987654321']);
  assert.equal(s.employers[0].name, 'חברה א בע"מ');
});

test('סיכום: מתריע על שנה אחרת, כפילות ופער מול הריכוז', () => {
  const docs = [
    { ...parseDocument(summary(2023, [['חברה א בע"מ', '912345678']], 150_000, 12_000)), fileName: 's.pdf' },
    { ...parseDocument(form(2023, 'חברה א בע"מ', '912345678', 100_000, 8_000)), fileName: 'a.pdf' },
    { ...parseDocument(form(2023, 'חברה א בע"מ', '912345678', 100_000, 8_000)), fileName: 'a2.pdf' },
    { ...parseDocument(form(2022, 'חברה א בע"מ', '912345678', 1, 1)), fileName: 'old.pdf' },
  ];
  const s = summarizeDocs(docs, 2023);
  assert.equal(s.employers.length, 1);
  assert.ok(s.issues.some((i) => i.includes('old.pdf')));
  assert.ok(s.issues.some((i) => i.includes('כפול')));
  assert.ok(s.issues.some((i) => i.includes('שונה מהסכום')));
});

test('ביטוח לאומי: אישור מילואים ואישור תשלומים שנתי', () => {
  const m = parseDocument([['אישור שנתי למס הכנסה לשנת 2021'], ['תגמולי מילואים'], ['ברוטו בסך', '10,000'], ['נוכה מס הכנסה בסך', '1,500']]);
  assert.equal(m.type, 'btlMiluim');
  assert.equal(m.gross, 10_000);
  assert.equal(m.tax, 1_500);
  const a = parseDocument([['ריכוז תשלומים שנתי - 2020'], ['אבטלה', '2,000', '200', '1,800']]);
  assert.equal(a.type, 'btlAnnual');
  assert.deepEqual(a.benefits, [{ kind: 'unemployment', gross: 2000, deductions: 200, net: 1800 }]);
});

test('קובץ בלי טקסט = סרוק; טקסט לא מוכר = לא זוהה', () => {
  assert.equal(parseDocument([]).type, 'scanned');
  assert.equal(parseDocument([['תלוש שכר לחודש']]).type, 'unknown');
});

test('אישור תושבות מהמועצה מזוהה', () => {
  assert.equal(parseDocument([['מועצה אזורית'], ['אישור תושב לצורך הנחה במס הכנסה']]).type, 'residency');
  assert.equal(parseDocument([['טופס 1312א']]).type, 'residency');
  // אישור ממולא שבו רק הנתונים הם טקסט (הטופס עצמו תמונה)
  assert.equal(parseDocument([['מועצה אזורית הגליל העליון'], ['ישראל ישראלי'], ['יישוב לדוגמה 01/01/2010 ועד בכלל']]).type, 'residency');
});

test('קידוד ישן (ISO-8859-8 כאותיות לטיניות) מתורגם לעברית', () => {
  const lat = (h) => [...h].map((c) => (c >= 'א' && c <= 'ת' ? String.fromCharCode(c.charCodeAt(0) - 0x05d0 + 0xe0) : c)).join('');
  const rev = (n) => [...n].reverse().join('');
  const d = parseDocument([
    [lat('תעודהעל-פיתקנותמסהכנסהלשנת') + rev('2024')],
    [lat('במקוםטופס') + rev('106')],
    [lat('תיקניכויים:') + rev('912345678')],
    [rev('158/172'), lat('הכנסהחייבת'), rev('50,000')],
    [rev('042'), lat('מסהכנסה'), rev('4,000')],
    ...Array.from({ length: 10 }, () => [lat('שורהנוספתלמילוי')]),
  ]);
  assert.equal(d.type, 'form106');
  assert.equal(d.year, 2024);
  assert.equal(d.fields.income, 50_000);
  assert.equal(d.fields.taxWithheld, 4_000);
});

test('linesFromItems: מקבץ לפי גובה, מימין לשמאל, ומחבר אותיות בודדות צמודות', () => {
  const it = (s, x, y, w = 5) => ({ str: s, transform: [10, 0, 0, 10, x, y], width: w });
  const L = linesFromItems([it('ב', 100, 500), it('א', 105, 500), it('042', 20, 500, 15), it('שורה', 80, 480, 20)]);
  assert.deepEqual(L.map((l) => [...l]), [['אב', '042'], ['שורה']]);
  assert.deepEqual(L[0].pos, [{ x: 100, r: 110 }, { x: 20, r: 35 }]);
});

// אישור תשלומי אבטלה שנתי (ביטוח לאומי, נושא "אבטלה"): תאים ריקים, ולכן לפי מיקום העמודה. המספרים מומצאים.
const at = (pairs) => { const l = pairs.map(([s]) => s); l.pos = pairs.map(([, x, w = 30]) => ({ x, r: x + w })); return l; };
const unemploymentDoc = () => [
  at([['הנדון:אישורתשלומיאבטלהלשנת', 349, 170], ['2024', 323, 23]]),
  at([['תאריך', 740], ['תשלום', 561], ['סה"כ', 248], ['נטו', 190]]),
  at([['סוג', 679, 16], ['תקופה', 610], ['ביטוח', 509], ['ביטוח', 458], ['מס', 414, 16]]),
  at([['תשלום', 737], ['ברוטו', 561, 28], ['חובות', 357], ['הפרשים', 299], ['ניכויים', 246], ['לתשלום', 181]]),
  at([['בריאות', 506, 35], ['לאומי', 459], ['הכנסה', 405, 34]]),
  at([['12/08/2024', 728, 54], ['אבטלה', 685], ['07/2024', 610], ['10,000', 566, 32], ['300', 529, 18], ['500', 410, 18], ['800', 274, 18], ['9,200', 197, 32]]),
  at([['12/09/2024', 728, 54], ['אבטלה', 685], ['08/2024', 610], ['4,000', 566, 32], ['120', 529, 18], ['120', 274, 18], ['3,880', 197, 32]]),
];

test('אישור תשלומי אבטלה שנתי: ברוטו ומס הכנסה לפי העמודות', () => {
  const d = parseDocument(unemploymentDoc());
  assert.equal(d.type, 'btlUnemployment');
  assert.equal(d.kind, 'unemployment');
  assert.equal(d.year, 2024);
  assert.equal(d.gross, 14_000);
  assert.equal(d.tax, 500);
});

test('אישור תשלומי אבטלה בלי מיקומים: המס לא ידוע (null), לא אפס', () => {
  const d = parseDocument(unemploymentDoc().map((l) => [...l]));
  assert.equal(d.tax, null);
});

test('אישור ניהול חשבון מזוהה', () => {
  assert.equal(parseDocument([['בנק', 'לאומי'], ['אישור', 'על', 'ניהול', 'חשבון']]).type, 'bankProof');
  assert.equal(parseDocument([['אישור בעלות בחשבון'], ['הננו לאשר כי החשבון שבנדון רשום בסניפנו על שם']]).type, 'bankProof');
});
