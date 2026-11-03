// מנוע החישוב. קוד טהור, בלי DOM, כדי שירוץ גם בדפדפן וגם בבדיקות (node --test).
//
// סדר החישוב זהה למסך "חישוב" בדו"ח 1301:
// הכנסות → ניכויים → הכנסה חייבת → מס ברוטו → זיכויים → מס מגיע → ניכויים במקור → יתרה.
// יתרה חיובית = מגיע החזר. יתרה שלילית = חוב.

import { PARAMS, RULES, ALLOWED, childPoints } from './params.js';

export function taxOnIncome(income, brackets) {
  let tax = 0, low = 0;
  for (const [top, rate] of brackets) {
    if (income > low) tax += (Math.min(income, top) - low) * rate;
    low = top;
  }
  return tax;
}

const sum = (arr, key) => (arr || []).reduce((s, x) => s + (Number(x[key]) || 0), 0);

// אילו כללים לא מאומתים האדם הזה צריך בשנה הזו.
function neededRules(p) {
  const need = [];
  const f = p.flags || {};
  if (f.kids) need.push('childrenPoints');
  if (f.singleParent) need.push('singleParentPoints');
  if (f.degree) need.push('degreePoints');
  if (f.dischargedSoldier) need.push('dischargedSoldierPoints');
  if (f.alimony) need.push('alimonyPoints');
  if (f.spousePoints) need.push('spousePoints');
  if (sum(p.employers, 'pensionDeposit') > 0) need.push('pensionCredit');
  if (f.dischargedSoldier?.unsupported) need.push('dischargedSoldierCareer');
  const c = p.credits || {};
  if (c.lifeInsurance > 0) need.push('lifeInsuranceCredit');
  if (c.donations > 0) need.push('donationsCredit');
  if (c.disabilityInsurance > 0) need.push('disabilityInsuranceDeduction');
  if (c.institutionRelative > 0) need.push('institutionRelativeCredit');
  return need;
}

// חישוב לאדם אחד בשנה אחת.
export function computePerson(year, p) {
  const yp = PARAMS[year];
  const blocks = [];  // פרמטר חסר / לא מאומת: אי אפשר לחשב עדיין
  const stops = [];   // מקרה ספק: להפנות לרואה חשבון

  if (!yp) return { blocks: [`אין פרמטרים לשנת ${year}`], stops, lines: null };
  for (const key of ['brackets', 'creditPointValue']) {
    if (!ALLOWED.has(yp[key].status)) blocks.push(`${key === 'brackets' ? 'מדרגות המס' : 'ערך נקודת זיכוי'} לשנת ${year} עוד לא אומתו`);
  }
  const pensionNeeded = sum(p.employers, 'pensionDeposit') > 0;
  if (pensionNeeded && !ALLOWED.has(yp.pensionIncomeCeiling?.status)) blocks.push(`תקרת ההכנסה המזכה לפנסיה לשנת ${year} עוד לא אומתה`);
  // ילדים: flags.kids = { ages: [...], column: 'mother'|'father' }. true בלבד (בלי פרטים) = חסום.
  let kidPoints = 0;
  const k = p.flags?.kids;
  if (k) {
    if (k.notWithMe) stops.push('הילדים לא גרים איתך. במקרה כזה נקודות הזיכוי תלויות בהסדרי המשמורת ובמזונות. מומלץ רואה חשבון לשנה הזו.');
    else if (!k.ages || !k.column) blocks.push('נקודות זיכוי בעד ילדים: חסרים פרטים (גילאי הילדים, ומי מקבל את קצבת הילדים)');
    else {
      const cp = childPoints(year, k.column, k.ages);
      if (cp.missing) blocks.push(cp.missing); else kidPoints = cp.points;
    }
  }
  for (const r of neededRules(p)) {
    if (r === 'childrenPoints') continue; // נבדק למעלה לפי שנה וגיל
    if (r === 'dischargedSoldierCareer') { stops.push('שירות קבע מיד אחרי השירות הסדיר משנה את חישוב נקודות החייל המשוחרר, והמקורות לא מסכימים איך. מומלץ רואה חשבון לשנה הזו.'); continue; }
    if (!ALLOWED.has(RULES[r].status)) blocks.push(`${RULES[r].label}: הכלל עוד לא אומת באפליקציה`);
  }
  if ((p.settlement?.livedMonths || 0) > 0 && !(p.settlement.rate > 0)) {
    blocks.push(p.settlement.missing || `הטבת יישוב מזכה: אין לנו עדיין את טבלת היישובים הרשמית לשנת ${year}`);
  }
  if ((p.settlement?.employerGave || 0) > 0 && !(p.settlement?.livedMonths > 0)) {
    stops.push('בטופס 106 המעסיק נתן הטבת יישוב (קוד 093/193), אבל ענית שלא גרת ביישוב מזכה. לפני הגשה לשנה הזו מומלץ להתייעץ עם רואה חשבון, כי ההגשה פותחת את השנה לבדיקה.');
  }
  for (const btl of p.btl || []) {
    if (btl.taxWithheld === null || btl.taxWithheld === undefined || btl.taxWithheld === '') {
      blocks.push(`חסר סכום המס שנוכה מ${btl.label || 'תשלום ביטוח לאומי'}. צריך את האישור השנתי למס הכנסה מביטוח לאומי`);
    }
  }

  const salary = sum(p.employers, 'income');                // 158 / 172
  const btlIncome = sum(p.btl, 'gross');                    // 194 / 196
  const totalIncome = salary + btlIncome;
  const deductions = 0;                                     // ניכויים: כולם חסומים כרגע (ראו RULES)
  const taxable = totalIncome - deductions;
  // רשות המסים עיגלה כלפי מטה במקרה 2020 (7,061.7 → 7,061). כויל ממקרה אחד.
  const grossTax = Math.floor(taxOnIncome(taxable, yp.brackets.value));
  // חייל משוחרר: חלק יחסי לפי מספר החודשים בשנה הזו שבתוך 36 החודשים.
  const ds = p.flags?.dischargedSoldier;
  const soldierPoints = ds && ds.months > 0 ? (RULES.dischargedSoldierPoints.value[ds.level] || 0) * ds.months / 12 : 0;
  const points = Math.round((RULES.residentPoints.value + (p.gender === 'f' ? RULES.womanExtraPoints.value : 0) + soldierPoints + kidPoints) * 100) / 100;
  const pointsCredit = Math.round(points * yp.creditPointValue.value);
  // פנסיה (45א): 35% מההפקדה, עד 7% מההכנסה המזכה. ההכנסה המזכה = ההכנסה המבוטחת (244/245) או המשכורת, עד התקרה השנתית.
  let pensionCredit = 0;
  if (pensionNeeded && yp.pensionIncomeCeiling) {
    const pc = RULES.pensionCredit.value;
    const base = Math.min(sum(p.employers.map((e) => ({ v: e.insuredIncome > 0 ? e.insuredIncome : e.income })), 'v'), yp.pensionIncomeCeiling.value * 12);
    pensionCredit = Math.round(pc.rate * Math.min(sum(p.employers, 'pensionDeposit'), pc.share * base));
  }
  // יישוב מזכה (סעיף 11): אחוז × ההכנסה מעבודה, עד התקרה השנתית כפול חלק השנה שבו גרו שם.
  let settlementCredit = 0;
  const st = p.settlement || {};
  if (st.livedMonths > 0 && st.rate > 0) settlementCredit = Math.round(st.rate / 100 * Math.min(totalIncome, st.ceiling * st.livedMonths / 12));
  const credits = pointsCredit + pensionCredit + settlementCredit;
  const taxDue = Math.max(0, grossTax - credits);
  const withheld = sum(p.employers, 'taxWithheld') + sum(p.btl, 'taxWithheld'); // 042
  const balance = withheld - taxDue;

  return {
    blocks, stops,
    lines: { salary, btlIncome, totalIncome, deductions, taxable, grossTax, points, kidPoints, pointsCredit, pensionCredit, settlementCredit, credits, taxDue, withheld, balance },
  };
}

// הערכת הצמדה וריבית, מכוילת ממקרה אחד (ראו RULES.indexation). מחזיר null לחוב או לאפס.
export function estimateIndexation(principal, year, today = new Date()) {
  if (!(principal > 0)) return null;
  const c = RULES.indexation.calibration;
  const yrs = (a, b) => (new Date(b) - new Date(a)) / (365.25 * 864e5);
  const rate = Math.pow(1 + c.addition / c.principal, 1 / yrs(c.from, c.to)) - 1;
  const t = yrs(`${year + 1}-01-01`, today);
  if (t <= 0) return 0;
  return Math.round(principal * (Math.pow(1 + rate, t) - 1));
}

// סיבות להחזר או לחוב, כדי להסביר למשתמש (עיקרון "שקיפות").
function reasonsFor(person, lines) {
  const r = [];
  const payers = (person.employers || []).length + (person.btl || []).filter((x) => x.gross > 0).length;
  const btlTax = sum(person.btl, 'taxWithheld');
  if (btlTax > 0 && lines.balance > 0) r.push('ביטוח לאומי ניכה מס בשיעור גבוה (למשל מילואים לפי בסיס יומי), בזמן שההכנסה השנתית שלך נמוכה יותר.');
  if (payers > 1 && lines.balance < 0) r.push('היו כמה משלמים באותה שנה, וכל אחד מהם ניכה מס כאילו הוא היחיד (בלי תיאום מס). לכן נוכה פחות מדי.');
  if (payers > 1 && lines.balance > 0) r.push('היו כמה משלמים או חודשים בלי הכנסה. כל משלם ניכה מס כאילו ההכנסה נמשכת כל השנה.');
  if (payers === 1 && Math.abs(lines.balance) < 300) r.push('מעסיק אחד כל השנה: המעסיק כבר חישב את המס ברמה שנתית, ולכן כמעט אין הפרש.');
  if (lines.taxDue === 0 && lines.withheld > 0) r.push('נקודות הזיכוי שלך מכסות את כל המס על ההכנסה, ולכן כל המס שנוכה חוזר אליך.');
  return r;
}

// חישוב שנה שלמה: המשתמש ובן/בת הזוג (אם נשואים). דו"ח משותף אחד, אבל כל אחד ממוסה בנפרד.
export function computeYear(year, yearCase, today = new Date()) {
  const people = yearCase.people || [];
  const results = people.map((p) => ({ role: p.role, ...computePerson(year, p) }));
  const blocks = results.flatMap((r) => r.blocks.map((b) => (r.role === 'spouse' ? `בן/בת הזוג: ${b}` : b)));
  const stops = [...new Set(results.flatMap((r) => r.stops))];
  if (blocks.length) return { year, status: 'blocked', blocks, stops, results };

  const balance = results.reduce((s, r) => s + r.lines.balance, 0);
  const reasons = [...new Set(results.flatMap((r, i) => reasonsFor(people[i], r.lines)))];
  const indexation = estimateIndexation(balance, year, today);
  let status = balance > 0 ? 'refund' : balance < 0 ? 'debt' : 'zero';
  if (stops.length) status = 'cpa';
  return { year, status, balance, indexation, reasons, blocks, stops, results };
}

// טווח סכומים לאנליטיקס אנונימי. אף פעם לא שולחים סכום מדויק.
export function amountBucket(balance) {
  if (balance < 0) return 'debt';
  const edges = [0, 1, 2_000, 5_000, 10_000, 20_000];
  const labels = ['0', '1-2k', '2k-5k', '5k-10k', '10k-20k', '20k+'];
  let i = 0;
  while (i + 1 < edges.length && balance >= edges[i + 1]) i++;
  return labels[i];
}
