// שכר דירה מעל תקרת הפטור, ושוק ההון (טופס 867).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computeYear, taxOnSlice, rentTaxablePart, capitalTax } from '../site/js/engine.js';
import { PARAMS } from '../site/js/params.js';
import { parseDocument, summarizeDocs } from '../site/js/docparse.js';

// טופס 867 אמיתי, אחרי שהוחלפו בו שמות, מספרי זהות ומספר חשבון. כולל מיקומים, כמו ש-pdf.js מחזיר.
const raw867 = JSON.parse(fs.readFileSync(new URL('./fixtures/form867-anon.json', import.meta.url))).map((l) => Object.assign([...l.s], { pos: l.pos }));

test('867: קורא רווח הון, דיבידנד לפי שיעור, מחזור ומס שנוכה', () => {
  const d = parseDocument(raw867);
  assert.equal(d.type, 'form867');
  assert.equal(d.year, 2025);
  assert.equal(d.account, '555001');
  assert.deepEqual(d.partners, ['1111', '2222']);
  assert.deepEqual(d.gains, { 25: 46 });
  assert.deepEqual(d.dividends, { 15: 46, 20: 143 });
  assert.deepEqual(d.interest, {});
  assert.equal(d.turnover, 8_380);
  assert.equal(d.gainsTax, 11);
  assert.equal(d.dividendTax, 35);
  assert.equal(d.losses, 0);
});

test('867: הפסד בר קיזוז נקרא, ושני קבצים של אותו חשבון מתאחדים בלי כפילות', () => {
  const withLoss = raw867.map((l) => {
    if (!/^הפסדים$/.test(l[0] || '') && !(l.join('').includes('הפסדים') && l.join('').includes('ברי קיזוז') && !l.join('').includes('שאינם'))) return l;
    const a = Object.assign([...l, '1,500'], { pos: [...l.pos, { x: 110, r: 136 }] });
    return a;
  });
  const d = parseDocument(withLoss);
  assert.equal(d.losses, 1_500);
  const s = summarizeDocs([{ ...d, fileName: 'a.pdf' }, { ...parseDocument(raw867), fileName: 'b.pdf' }], 2025);
  assert.equal(s.accounts.length, 1);
  assert.equal(s.accounts[0].losses, 1_500);
  assert.ok(s.issues.some((i) => i.includes('b.pdf')));
});

test('פרוסת שכר דירה מעל המשכורת: לפחות 31% מתחת לגיל 60, מדרגות רגילות מגיל 60', () => {
  const br = PARAMS[2020].brackets.value;
  assert.equal(Math.round(taxOnSlice(50_000, 9_600, br, 0.31)), 2_976);
  assert.equal(Math.round(taxOnSlice(50_000, 9_600, br, 0)), 960);
  assert.equal(Math.round(taxOnSlice(70_000, 9_600, br, 0)), Math.round(5_960 * 0.1 + 3_640 * 0.14));
});

test('פטור חלקי: פעמיים (שכר הדירה פחות התקרה), ומעל פעמיים התקרה הכול חייב', () => {
  assert.equal(rentTaxablePart(Array(12).fill(5_500), 5_100), 9_600);
  assert.equal(rentTaxablePart([6_000], 5_654), 692);
  assert.equal(rentTaxablePart([12_000, 5_000], 5_654), 12_000);
});

test('שוק ההון: מס לפי השיעור שבטופס, הפסד מקוזז מרווח קודם', () => {
  assert.deepEqual(capitalTax({ gains: { 25: 46 }, dividends: { 15: 46, 20: 143 }, withheld: 46 }), { tax: 47, income: 235, lossLeft: 0, lossOffsetPossible: false, withheld: 46 });
  const c = capitalTax({ gains: { 25: 1_000 }, losses: 1_500, dividends: { 25: 200 } });
  assert.equal(c.tax, 50);
  assert.equal(c.lossLeft, 500);
  assert.equal(c.lossOffsetPossible, true);
});

const base = (extra, income = 60_000) => ({ maritalStatus: 'single', people: [{ role: 'self', gender: 'm', flags: {}, credits: {}, settlement: { livedMonths: 0, employerGave: 0 },
  employers: [{ name: 'מעסיק', income, taxWithheld: 3_000, pensionDeposit: 0 }], btl: [], ...extra }] });

test('שנה עם שכר דירה מעל התקרה: המס על החלק החייב נכנס לחישוב', () => {
  const plain = computeYear(2020, base({}));
  const r = computeYear(2020, base({ rent: { taxable: 9_600, age60: false } }));
  assert.equal(r.results[0].lines.rentTaxable, 9_600);
  assert.equal(r.results[0].lines.grossTax - plain.results[0].lines.grossTax, 2_976);
  assert.equal(r.balance, plain.balance - 2_976);
});

test('שנה עם 867: המס שנוכה נכנס, והמס על שוק ההון נוסף למס המגיע', () => {
  const plain = computeYear(2025, base({}, 150_000));
  const r = computeYear(2025, base({ capital: { gains: { 25: 46 }, dividends: { 15: 46, 20: 143 }, withheld: 46 } }, 150_000));
  assert.equal(r.results[0].lines.capitalTax, 47);
  assert.equal(r.results[0].lines.capitalWithheld, 46);
  assert.equal(r.balance, plain.balance - 1);
  assert.equal(r.partial, false);
  const loss = computeYear(2025, base({ capital: { gains: { 25: 100 }, losses: 300, dividends: { 25: 400 }, withheld: 100 } }, 150_000));
  assert.ok(loss.excluded.some((e) => e.effect === 'up' && e.label.includes('הפסד')));
  // נקודות זיכוי שלא נוצלו (הכנסה נמוכה) לא מקוזזות מהמס על שוק ההון, והתוצאה מסומנת שיכולה רק לעלות.
  const low = computeYear(2025, base({ capital: { gains: { 25: 46 }, withheld: 11 } }, 30_000));
  assert.ok(low.excluded.some((e) => e.effect === 'up' && e.label.includes('נקודות זיכוי')));
});
