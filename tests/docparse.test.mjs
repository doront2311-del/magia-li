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
  assert.deepEqual(L, [['אב', '042'], ['שורה']]);
});
