// מקרי בדיקה. כל מקרה: מסמכים + תשובות, ותוצאה רשמית מכפתור "חישוב" של רשות המסים.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeYear, taxOnIncome, amountBucket, estimateIndexation } from '../site/js/engine.js';
import { PARAMS, openYears } from '../site/js/params.js';
import { buildGuide } from '../site/js/guide.js';

const case2020 = {
  maritalStatus: 'single',
  people: [{
    role: 'self', gender: 'm', flags: {}, credits: {}, settlement: { livedMonths: 0, employerGave: 0 },
    employers: [{ name: 'מעסיק 1', income: 26_909, taxWithheld: 0, pensionDeposit: 0 }],
    btl: [
      { label: 'תגמולי מילואים', gross: 41_498, taxWithheld: 9_089 },
      { label: 'דמי אבטלה', gross: 2_210, taxWithheld: 0 },
    ],
  }],
};

test('מקרה בדיקה 2020 תואם לכפתור "חישוב" של רשות המסים', () => {
  const r = computeYear(2020, case2020, new Date('2026-11-03'));
  assert.equal(r.status, 'refund');
  const L = r.results[0].lines;
  assert.equal(L.totalIncome, 70_617);   // סה"כ הכנסות
  assert.equal(L.grossTax, 7_061);       // מס ברוטו
  assert.equal(L.credits, 5_913);        // זיכויים
  assert.equal(L.taxDue, 1_148);         // מס מגיע
  assert.equal(L.withheld, 9_089);       // ניכויים במקור
  assert.equal(r.balance, 7_941);        // מס ששולם ביתר
});

test('שערוך 2020 מכויל: 3,802 ₪ ב-3.11.2026', () => {
  assert.equal(estimateIndexation(7_941, 2020, new Date('2026-11-03')), 3_802);
  assert.equal(estimateIndexation(-500, 2020), null);
});

test('מדריך 1301 למקרה 2020: 158, 194, 042', () => {
  const r = computeYear(2020, case2020, new Date('2026-11-03'));
  const g = buildGuide(2020, case2020, r);
  const inc = g.tabs.find((t) => t.title === 'פירוט הכנסות').fields;
  const v = (f) => inc.find((x) => x.field === f)?.value;
  assert.equal(v('158'), (26_909).toLocaleString('he-IL'));
  assert.equal(v('194'), (43_708).toLocaleString('he-IL'));
  assert.equal(v('042'), (9_089).toLocaleString('he-IL'));
});

test('כלל לא מאומת עוצר את השנה (ילדים)', () => {
  const c = structuredClone(case2020);
  c.people[0].flags.kids = true;
  const r = computeYear(2020, c);
  assert.equal(r.status, 'blocked');
  assert.match(r.blocks.join(), /ילדים/);
});

test('הטבת יישוב בתלוש בלי מגורים בפועל = הפניה לרו"ח', () => {
  const c = structuredClone(case2020);
  c.people[0].settlement.employerGave = 5_000;
  assert.equal(computeYear(2020, c).status, 'cpa');
});

test('מס ביטוח לאומי לא ידוע עוצר (אפס הנחות)', () => {
  const c = structuredClone(case2020);
  c.people[0].btl[1].taxWithheld = null;
  assert.equal(computeYear(2020, c).status, 'blocked');
});

test('נשואים: כל אחד ממוסה בנפרד, היתרה מצטברת', () => {
  const c = structuredClone(case2020);
  c.maritalStatus = 'married';
  c.people.push({ role: 'spouse', gender: 'f', flags: {}, credits: {}, settlement: {},
    employers: [{ name: 'מעסיק', income: 60_000, taxWithheld: 0, pensionDeposit: 0 }], btl: [] });
  const r = computeYear(2020, c, new Date('2026-11-03'));
  const s = r.results[1].lines;
  assert.equal(s.points, 2.75);
  assert.equal(s.taxDue, 0);                       // 6,000 מס פחות 7,227 זיכויים
  assert.equal(r.balance, 7_941);
});

test('מדרגות מס: מס יסף מעל התקרה העליונה', () => {
  const br = PARAMS[2023].brackets.value;
  const t = taxOnIncome(800_000, br) - taxOnIncome(698_280, br);
  assert.equal(Math.round(t), Math.round(101_720 * 0.5));
});

test('שנים פתוחות להגשה ב-11.2026: 2020–2025', () => {
  assert.deepEqual(openYears(new Date('2026-11-03')), [2020, 2021, 2022, 2023, 2024, 2025]);
});

test('טווחי סכומים לאנליטיקס', () => {
  assert.equal(amountBucket(7_941), '5k-10k');
  assert.equal(amountBucket(-10), 'debt');
  assert.equal(amountBucket(0), '0');
});

const person = (over = {}) => ({ role: 'self', gender: 'm', flags: {}, credits: {}, settlement: {}, btl: [],
  employers: [{ name: 'מעסיק', income: 180_000, taxWithheld: 30_000, pensionDeposit: 0, insuredIncome: 180_000 }], ...over });

test('חייל משוחרר: שירות מלא כל השנה = 2 נקודות נוספות; 3 חודשים = חצי נקודה', () => {
  const full = computeYear(2022, { people: [person({ flags: { dischargedSoldier: { level: 'full', months: 12 } } })] });
  assert.equal(full.results[0].lines.points, 4.25);
  const part = computeYear(2022, { people: [person({ flags: { dischargedSoldier: { level: 'full', months: 3 } } })] });
  assert.equal(part.results[0].lines.points, 2.75);
  const one = computeYear(2022, { people: [person({ flags: { dischargedSoldier: { level: 'partial', months: 12 } } })] });
  assert.equal(one.results[0].lines.points, 3.25);
});

test('פנסיה 2024 לפי הדוגמה של כל זכות: 15,000 ₪ בחודש, 6% הפקדה = זיכוי 2,852 ₪', () => {
  const p = person();
  p.employers[0].pensionDeposit = 10_800;
  const r = computeYear(2024, { people: [p] });
  // 2024: המדרגות עוד לא אומתו, אבל שורת הזיכוי מחושבת בכל זאת
  assert.equal(r.results[0].lines.pensionCredit, 2_852);
});

test('פנסיה מתחת לתקרה: 35% מכל ההפקדה', () => {
  const p = person();
  p.employers[0] = { name: 'מעסיק', income: 60_000, taxWithheld: 5_000, pensionDeposit: 3_600, insuredIncome: 60_000 };
  assert.equal(computeYear(2022, { people: [p] }).results[0].lines.pensionCredit, 1_260);
});

test('פנסיה 2021: התקרה ממקור אחד בלבד עוצרת את השנה', () => {
  const p = person();
  p.employers[0].pensionDeposit = 5_000;
  const r = computeYear(2021, { people: [p] });
  assert.equal(r.status, 'blocked');
  assert.match(r.blocks.join(), /תקרת ההכנסה המזכה/);
});

test('יישוב מזכה: 12% עד 196,080, 6 חודשים', () => {
  const p = person({ settlement: { livedMonths: 6, rate: 12, ceiling: 196_080 } });
  const r = computeYear(2022, { people: [p] });
  assert.equal(r.results[0].lines.settlementCredit, Math.round(0.12 * 98_040));
});

test('יישוב מזכה בלי טבלה לשנה = עצירה עם הסבר', () => {
  const p = person({ settlement: { livedMonths: 12, rate: 0, ceiling: 0, missing: 'אין טבלה' } });
  assert.equal(computeYear(2022, { people: [p] }).status, 'blocked');
});

test('טבלת היישובים: שניר 12% בכל השנים, והתקרות תואמות את לוח העזר', async () => {
  const { SETTLEMENTS } = await import('../site/js/settlements.js');
  assert.deepEqual(SETTLEMENTS[2022]['שניר'], { rate: 12, ceiling: 196_080 });
  assert.deepEqual(SETTLEMENTS[2023]['שניר'], { rate: 12, ceiling: 206_400 });
  assert.deepEqual(SETTLEMENTS[2024]['שניר'], { rate: 12, ceiling: 213_240 });
  assert.deepEqual(SETTLEMENTS[2025]['שניר'], { rate: 12, ceiling: 213_240 });
  for (const y of [2022, 2023, 2024, 2025]) assert.ok(Object.keys(SETTLEMENTS[y]).length > 470);
});
