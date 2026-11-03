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
  const inc = g.tabs.find((t) => t.title.startsWith('פירוט הכנסות')).fields;
  const v = (f) => inc.find((x) => x.kind === 'fill' && x.field.includes(`${f}:`))?.value;
  assert.equal(v('158'), (26_909).toLocaleString('he-IL'));
  assert.equal(v('194'), (43_708).toLocaleString('he-IL'));
  assert.equal(v('042'), (9_089).toLocaleString('he-IL'));
});

test('מדריך 1301: כל לשונית מפרטת גם את מה שלא ממלאים, עם סיבה', () => {
  const g = buildGuide(2020, case2020, computeYear(2020, case2020, new Date('2026-11-03')));
  for (const title of ['פרטים אישיים', 'פרטים כלליים']) {
    const t = g.tabs.find((x) => x.title === title);
    assert.ok(t.fields.some((f) => f.kind === 'skip'));
    assert.ok(t.fields.every((f) => f.kind === 'section' || f.source));
  }
  const gen = g.tabs.find((x) => x.title === 'פרטים כלליים').fields;
  assert.ok(gen.some((f) => /1213/.test(f.field) && f.value === 'בוחרים "לא"'));
  assert.ok(gen.some((f) => /1345/.test(f.field) && f.value === 'בוחרים "לא"'));
  const inc = g.tabs.find((t) => t.title.startsWith('פירוט הכנסות')).fields;
  assert.ok(inc.some((f) => f.kind === 'section' && f.field.startsWith('יג.')));
  assert.ok(inc.some((f) => /^13–31/.test(f.field) && f.kind === 'skip'));
});

test('פרטי ילדים חסרים: הערכה חלקית בלי הנקודות, לא חסימה', () => {
  const c = structuredClone(case2020);
  const full = computeYear(2020, c);
  c.people[0].flags.kids = true;
  const r = computeYear(2020, c);
  assert.equal(r.status, 'refund');
  assert.equal(r.partial, true);
  assert.equal(r.direction, 'up');
  assert.equal(r.balance, full.balance);
  assert.match(r.excluded.map((e) => e.label).join(), /ילדים/);
});

test('נתונים מלאים: לא מסומן כהערכה חלקית', () => {
  const r = computeYear(2020, structuredClone(case2020));
  assert.equal(r.partial, false);
  assert.equal(r.direction, null);
  assert.deepEqual(r.missingDocs, []);
});

test('ביטוח חיים (כלל לא מאומת): לא נכלל, והאישור מחברת הביטוח ברשימת המסמכים', () => {
  const c = structuredClone(case2020);
  const full = computeYear(2020, c);
  c.people[0].credits = { lifeInsurance: 1_200 };
  const r = computeYear(2020, c);
  assert.equal(r.status, 'refund');
  assert.equal(r.balance, full.balance);
  assert.equal(r.direction, 'up');
  assert.match(r.excluded[0].label, /ביטוח חיים/);
  assert.match(r.missingDocs.join(), /חברת הביטוח/);
});

test('פריט שיכול לשנות לשני הכיוונים: direction = either', () => {
  const c = structuredClone(case2020);
  c.people[0].excluded = [{ label: 'תשלומים מביטוח לאומי', effect: 'either', doc: 'אישור תשלומים שנתי', kind: 'doc' }];
  c.people[0].credits = { lifeInsurance: 1_200 };
  const r = computeYear(2020, c);
  assert.equal(r.direction, 'either');
  assert.equal(r.missingDocs.length, 2);
});

test('חסימה קשה מבחוץ (למשל בלי ריכוז הכנסות) עדיין חוסמת', () => {
  const c = structuredClone(case2020);
  c.people[0].blocks = ['חסר ריכוז הכנסות'];
  assert.equal(computeYear(2020, c).status, 'blocked');
});

test('מסמך לצירוף בלבד נכנס לרשימת המסמכים בלי לסמן את ההערכה כחלקית', () => {
  const c = structuredClone(case2020);
  c.people[0].filingDocs = ['אישור תושבות'];
  const r = computeYear(2020, c);
  assert.equal(r.partial, false);
  assert.deepEqual(r.missingDocs, []);
  assert.deepEqual(r.filingDocs, ['אישור תושבות']);
});

test('הטבת יישוב בתלוש בלי מגורים בפועל = הפניה לרו"ח', () => {
  const c = structuredClone(case2020);
  c.people[0].settlement.employerGave = 5_000;
  assert.equal(computeYear(2020, c).status, 'cpa');
});

test('מס ביטוח לאומי לא ידוע: לא נכלל (לא מנחשים), ההחזר רק יכול לעלות', () => {
  const c = structuredClone(case2020);
  const full = computeYear(2020, c);
  const tax = c.people[0].btl[1].taxWithheld;
  c.people[0].btl[1].taxWithheld = null;
  const r = computeYear(2020, c);
  assert.notEqual(r.status, 'blocked');
  assert.equal(r.balance, full.balance - tax);
  assert.equal(r.direction, 'up');
  assert.match(r.missingDocs.join(), /אישור שנתי למס הכנסה/);
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

test('2026: מדרגות, ערך נקודה ותקרת פנסיה מלוח העזר 2026', () => {
  const p = person();
  p.employers[0].pensionDeposit = 5_000;
  const r = computeYear(2026, { people: [p] });
  assert.notEqual(r.status, 'blocked');
  assert.equal(taxOnIncome(228_000, PARAMS[2026].brackets.value), Math.round(84_120 * 0.1 + (120_720 - 84_120) * 0.14 + (228_000 - 120_720) * 0.2));
});

test('פנסיה 2021: 8,700 ₪ לחודש (לשכת רו"ח + כל זכות)', () => {
  const p = person();
  p.employers[0].pensionDeposit = 10_000;
  assert.equal(computeYear(2021, { people: [p] }).results[0].lines.pensionCredit, Math.round(0.35 * 0.07 * 104_400));
});

test('יישוב מזכה: 12% עד 196,080, 6 חודשים', () => {
  const p = person({ settlement: { livedMonths: 6, rate: 12, ceiling: 196_080 } });
  const r = computeYear(2022, { people: [p] });
  assert.equal(r.results[0].lines.settlementCredit, Math.round(0.12 * 98_040));
});

test('יישוב מזכה בלי טבלה לשנה = הערכה בלי ההטבה, עם הסבר', () => {
  const p = person({ settlement: { livedMonths: 12, rate: 0, ceiling: 0, missing: 'אין טבלה' } });
  const r = computeYear(2022, { people: [p] });
  assert.notEqual(r.status, 'blocked');
  assert.equal(r.results[0].lines.settlementCredit, 0);
  assert.match(r.excluded[0].label, /אין טבלה/);
});

test('טבלת היישובים: שניר 12% בכל השנים, והתקרות תואמות את לוח העזר', async () => {
  const { SETTLEMENTS } = await import('../site/js/settlements.js');
  assert.deepEqual(SETTLEMENTS[2020]['שניר'], { rate: 12, ceiling: 192_600 });
  assert.deepEqual(SETTLEMENTS[2021]['שניר'], { rate: 12, ceiling: 191_400 });
  assert.deepEqual(SETTLEMENTS[2022]['שניר'], { rate: 12, ceiling: 196_080 });
  assert.deepEqual(SETTLEMENTS[2023]['שניר'], { rate: 12, ceiling: 206_400 });
  assert.deepEqual(SETTLEMENTS[2024]['שניר'], { rate: 12, ceiling: 213_240 });
  assert.deepEqual(SETTLEMENTS[2025]['שניר'], { rate: 12, ceiling: 213_240 });
  assert.ok(SETTLEMENTS[2021]['שיזף'].complex, 'שיזף 2021 התחיל באמצע השנה');
  assert.ok(SETTLEMENTS[2020]['קריית שמונה'].from, 'קריית שמונה 2020 השתנה ב-1.7');
  assert.deepEqual(SETTLEMENTS[2026]['שניר'], { rate: 12, ceiling: 213_240 });
  assert.deepEqual(SETTLEMENTS[2026]['אשקלון'], { rate: 7, ceiling: 146_640 });
  for (const y of [2020, 2021, 2022, 2023, 2024, 2025, 2026]) assert.ok(Object.keys(SETTLEMENTS[y]).length > 470);
});

test('נקודות ילדים לאב: תואם לטופסי 106 אמיתיים 2024 ו-2025', () => {
  const r24 = computeYear(2024, { people: [person({ flags: { kids: { ages: [2], column: 'father' } } })] });
  assert.equal(r24.results[0].lines.points, 6.75);
  const r25 = computeYear(2025, { people: [person({ flags: { kids: { ages: [3, 0], column: 'father' } } })] });
  assert.equal(r25.results[0].lines.points, 8.25);
  const r22 = computeYear(2022, { people: [person({ flags: { kids: { ages: [0], column: 'father' } } })] });
  assert.equal(r22.results[0].lines.points, 3.75);
});

test('נקודות ילדים: גיל 6–12 ב-2022 = אם 2 (הוראת שעה), 2021 כמו 2020, 2026 כמו 2024, ילדים שלא גרים איתך = רו"ח', () => {
  assert.equal(computeYear(2022, { people: [person({ gender: 'f', flags: { kids: { ages: [8], column: 'mother' } } })] }).results[0].lines.points, 4.75);
  assert.equal(computeYear(2021, { people: [person({ flags: { kids: { ages: [1], column: 'father' } } })] }).results[0].lines.points, 4.75);
  assert.equal(computeYear(2021, { people: [person({ gender: 'f', flags: { kids: { ages: [8], column: 'mother' } } })] }).results[0].lines.points, 3.75);
  assert.equal(computeYear(2026, { people: [person({ flags: { kids: { ages: [1], column: 'father' } } })] }).results[0].lines.points, 6.75);
  assert.equal(computeYear(2024, { people: [person({ flags: { kids: { ages: [2], notWithMe: true } } })] }).status, 'cpa');
  assert.equal(computeYear(2024, { people: [person({ gender: 'f', flags: { kids: { ages: [8], column: 'mother' } } })] }).results[0].lines.points, 4.75);
});

test('תואר ראשון, הורה יחיד, מזונות, בן/בת זוג: נקודה אחת כל אחד', () => {
  // טופס 106 אמיתי 2023: אב לילד בן 1, תואר ראשון שהסתיים ב-2022 = 2.25 + 2.5 + 1 = 5.75
  const r = computeYear(2023, { people: [person({ flags: { kids: { ages: [1], column: 'father' }, degree: true } })] });
  assert.equal(r.results[0].lines.points, 5.75);
  for (const k of ['singleParent', 'alimony', 'spousePoints']) {
    assert.equal(computeYear(2024, { people: [person({ flags: { [k]: true } })] }).results[0].lines.points, 3.25, k);
  }
  assert.equal(computeYear(2024, { people: [person({ flags: { stop: ['x'] } })] }).status, 'cpa');
});

test('תרומות: 35%, מינימום לכל שנה, עד 30% מההכנסה', () => {
  const d = (year, donations, income = 200_000) => computeYear(year, { people: [person({ employers: [{ income, taxWithheld: 30_000 }], credits: { donations } })] });
  assert.equal(d(2024, 1_000).results[0].lines.donationsCredit, 350);
  assert.equal(d(2024, 150).results[0].lines.donationsCredit, 0); // מתחת למינימום 207
  assert.equal(d(2024, 100_000).results[0].lines.donationsCredit, Math.round(0.35 * 60_000));
  assert.equal(d(2025, 1_000).results[0].lines.donationsCredit, 350);
});
