// טבלת פרמטרים לכל שנת מס.
//
// לכל ערך יש סטטוס:
//   verified      – אומת מול מקור רשמי או מול חישוב של רשות המסים / טופס 106 אמיתי
//   crosschecked  – שני מקורות משניים בלתי תלויים מסכימים (למשל כל זכות + אתר רו"ח)
//   unverified    – מהזיכרון או ממקור יחיד. המנוע **עוצר** שנה שצריכה ערך כזה.
//
// עדכון שנה = עריכת הקובץ הזה בלבד. אחרי כל שינוי: `npm test`.

const KOLZCHUT = 'https://www.kolzchut.org.il/he/מדרגות_מס_הכנסה_-_נתוני_עבר';
const OS_EXPERTS = 'https://www.os-experts.co.il/מדרגות-מס/';
// לוח העזר החודשי של רשות המסים (מקור רשמי). השנה בסוף הכתובת.
export const BOOKLET = (y) => `https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-${y}.pdf`;
const KZ_PENSION = 'https://www.kolzchut.org.il/he/זיכוי_ממס_הכנסה_בגין_הפרשות_לביטוח_פנסיוני';

// מדרגות שנתיות: [תקרה עליונה, שיעור]. השורה האחרונה כוללת מס יסף 3% (סעיף 121ב).
const b = (t1, t2, t3, t4, t5, t6) => [
  [t1, 0.10], [t2, 0.14], [t3, 0.20], [t4, 0.31], [t5, 0.35], [t6, 0.47], [Infinity, 0.50],
];

export const PARAMS = {
  2020: {
    brackets: {
      value: b(75_960, 108_960, 174_960, 243_120, 505_920, 651_600),
      status: 'crosschecked',
      source: `${KOLZCHUT} ; ${OS_EXPERTS}`,
      note: 'בגרסה הראשונה של המנוע (calc.py) הוזנו בטעות מדרגות 2021. לא השפיע על מקרה הבדיקה של 2020 כי ההכנסה בתוך המדרגה הראשונה.',
    },
    pensionIncomeCeiling: { value: 8_800, status: 'verified', source: 'לוח העזר של רשות המסים 2020, סעיף 47(א)(1)(1): 8,800 ₪ לחודש (עותק: https://www.prisha.co.il/UserFiles/File/pdf/hoz/parameters2020.pdf) ; מנורה "תקרות הפקדה 2020"' },
    creditPointValue: {
      value: 2_628, status: 'verified',
      source: 'כפתור "חישוב" במערכת 1301, מקרה בדיקה 2020: 2.25 נקודות = 5,913 ₪ (219 ₪ לחודש)',
    },
  },
  2021: {
    brackets: { value: b(75_480, 108_360, 173_880, 241_680, 502_920, 647_640), status: 'crosschecked', source: `${KOLZCHUT} ; ${OS_EXPERTS}` },
    creditPointValue: { value: 2_616, status: 'crosschecked', source: '218 ₪ לחודש. לאמת מול טופס 106 של 2021' },
    pensionIncomeCeiling: { value: 8_700, status: 'crosschecked', source: `לשכת רואי החשבון, טבלאות מס 2021: 104,400 ₪ לשנה (= 8,700 לחודש) https://sites.icpas.org.il/hs/wp-content/uploads/sites/2/2021/12/טבלאות-מס-הכנסה-שנת-המס-2021-למבחני-שנת-2022.pdf ; כל זכות: 609 ₪ לחודש = 7% × 8,700. ${KZ_PENSION}` },
  },
  2022: {
    brackets: { value: b(77_400, 110_880, 178_080, 247_440, 514_920, 663_240), status: 'crosschecked', source: `${KOLZCHUT} ; ${OS_EXPERTS}` },
    creditPointValue: { value: 2_676, status: 'verified', source: 'טופסי 106 אמיתיים, 2022: 223 ₪ לחודש' },
    pensionIncomeCeiling: { value: 8_900, status: 'verified', source: `לוח עזר 2022, סעיף 47(א)(1)(1): 8,900 ₪ לחודש ; כל זכות: 623 ₪ = 7%. ${BOOKLET(2022)}` },
  },
  2023: {
    brackets: { value: b(81_480, 116_760, 187_440, 260_520, 542_160, 698_280), status: 'crosschecked', source: `${KOLZCHUT} ; ${OS_EXPERTS}` },
    creditPointValue: { value: 2_820, status: 'verified', source: 'טופס 106 אמיתי, 2023: 235 ₪ לחודש' },
    pensionIncomeCeiling: { value: 9_400, status: 'verified', source: `לוח עזר 2023: 9,400 ₪ לחודש ; כל זכות: 658 ₪ = 7%. ${BOOKLET(2023)}` },
  },
  2024: {
    brackets: {
      value: b(84_120, 120_720, 193_800, 269_280, 560_280, 721_560), status: 'verified',
      source: `לוח העזר של רשות המסים 2024, פרק ב (שיעורי מס על הכנסה מיגיעה אישית): 84,120 / 120,720 / 193,800 / 269,280 / 560,280 ; ${OS_EXPERTS} ; ${BOOKLET(2024)}`,
      note: '721,560 = סף מס יסף.',
    },
    creditPointValue: { value: 2_904, status: 'verified', source: 'טופס 106 אמיתי, 2024: 242 ₪ לחודש' },
    pensionIncomeCeiling: { value: 9_700, status: 'verified', source: `לוח עזר 2024: 9,700 ₪ לחודש ; כל זכות: 8,148 ₪ לשנה = 7%. ${BOOKLET(2024)}` },
  },
  2025: {
    brackets: {
      value: b(84_120, 120_720, 193_800, 269_280, 560_280, 721_560), status: 'verified',
      source: `לוח העזר של רשות המסים 2025, פרק ב (שיעורי מס על הכנסה מיגיעה אישית): 84,120 / 120,720 / 193,800 / 269,280 / 560,280 ; ${OS_EXPERTS} ; ${BOOKLET(2025)}`,
      note: 'הקפאת מדרגות 2025 (חוק ההתייעלות). 721,560 = סף מס יסף.',
    },
    creditPointValue: { value: 2_904, status: 'verified', source: 'טופסי 106 אמיתיים, 2025: 242 ₪ לחודש' },
    pensionIncomeCeiling: { value: 9_700, status: 'verified', source: `לוח עזר 2025 (הקפאת תקרות 2025–2027): 9,700 ₪ לחודש. ${BOOKLET(2025)}` },
  },
  2026: {
    brackets: {
      value: b(84_120, 120_720, 228_000, 301_200, 560_280, 721_560), status: 'verified',
      source: `לוח העזר של רשות המסים 2026 (מעודכן לאפריל 2026), פרק ב: 84,120 / 120,720 / 228,000 / 301,200 / 560,280. תיקון סעיף 121 מ-31.3.2026, רטרואקטיבי מ-1.1.2026 ; ${OS_EXPERTS} ; ${BOOKLET(2026)}`,
      note: 'אפשר להגיש את 2026 רק מינואר 2027.',
    },
    creditPointValue: { value: 2_904, status: 'verified', source: `לוח העזר 2026, פרק ג סעיף א: 242 ₪ לחודש. ${BOOKLET(2026)}` },
    pensionIncomeCeiling: { value: 9_700, status: 'verified', source: `לוח העזר 2026, פרק ג סעיף ב, 47(א)(1)(1): 9,700 ₪ לחודש. ${BOOKLET(2026)}` },
  },
};

// כללים שתלויים בתשובות. כל כלל שעוד לא אומת עוצר את השנה שבה הוא נדרש,
// עם הסבר למשתמש. רשימת ה-unverified כאן היא בעצם רשימת המשימות לשלב "טבלת פרמטרים".
export const RULES = {
  residentPoints: { value: 2.25, status: 'verified', source: 'סעיפים 34 ו-36 לפקודה; אומת בחישוב 2020 (2.25 נקודות)' },
  womanExtraPoints: { value: 0.5, status: 'crosschecked', source: 'סעיף 36א לפקודה' },
  childrenPoints: { status: 'crosschecked', label: 'נקודות זיכוי בעד ילדים', note: 'לפי שנה, גיל הילד, ומי מקבל את קצבת הילדים. ראו CHILD_POINTS.' },
  // סעיף 40ג: תואר ראשון = נקודה אחת, בשנת המס שאחרי שנת סיום הלימודים. capitax 2012 (תואר ראשון 1, שני 0.5) ;
  // טופס 106 אמיתי 2023 (תואר ראשון שהסתיים ב-2022: נקודה אחת ב-2023). תואר שני, רפואה, תעודת מקצוע ודחיית הנקודה: עוד לא אומתו, ולכן מפנים לרו"ח.
  degreePoints: { status: 'crosschecked', label: 'נקודת זיכוי לתואר אקדמי', value: { ba: 1 } },
  // סעיף 39א. 36 חודשים מהחודש שאחרי חודש השחרור. שירות מלא (גבר 23+ חודשים, אישה 22+, שירות לאומי 24+) = 2 נקודות לשנה
  // (1/6 לחודש). 12 חודשים ומעלה אבל פחות ממלא = נקודה אחת לשנה (1/12 לחודש). כל זכות, protocol.co.il ו-bshcpa מסכימים.
  dischargedSoldierPoints: {
    status: 'crosschecked', label: 'נקודות זיכוי לחייל משוחרר', value: { full: 2, partial: 1, months: 36 },
    source: 'https://www.kolzchut.org.il/he/נקודות_זיכוי_ממס_הכנסה_לחיילים_משוחררים_ומסיימי_שירות_לאומי-אזרחי ; https://protocol.co.il/tax-credit-points-veteran/ ; https://www.bshcpa.co.il/נקודת-זיכוי-לחייל-משוחרר/',
  },
  // סעיף 37: מי שנישא מחדש ומשלם מזונות לבן/בת הזוג הקודם/ת לפי פסק דין = נקודה אחת. (bshcpa, protocol)
  alimonyPoints: { status: 'crosschecked', label: 'נקודת זיכוי על תשלום מזונות', value: 1 },
  // סעיף 40(ג): הורה יחיד (אלמן/ה, או שהילד רשום רק על שמו) = נקודה אחת נוספת. ילדיו מחושבים בעמודת "אם". (bshcpa, protocol)
  singleParentPoints: { status: 'crosschecked', label: 'נקודות זיכוי להורה יחיד', value: 1 },
  // סעיף 45א לשכיר: 35% מההפקדות של העובד, עד 7% מההכנסה המזכה, וההכנסה המזכה מוגבלת לתקרה החודשית של השנה (pensionIncomeCeiling).
  pensionCredit: {
    status: 'crosschecked', label: 'זיכוי על הפקדות לפנסיה', value: { rate: 0.35, share: 0.07 },
    source: `${KZ_PENSION} ; as-invest "תקרות וסכומים 2024/2025": "הפקדה לזיכוי במס (בשיעור 35%) 7% מהכנסה מזכה"`,
  },
  lifeInsuranceCredit: { status: 'unverified', label: 'זיכוי 25% על ביטוח חיים' },
  // סעיף 46: 35% מהתרומה, אם סך התרומות בשנה לפחות הסכום המינימלי. התרומה המוכרת: עד 30% מההכנסה החייבת ועד הסכום המקסימלי.
  // מינימום/מקסימום לפי שנה: 2026 מלוח העזר 2026 (207 / 10,354,816). 2022–2024 מלוחות העזר. 2021 מאתרי רו"ח. 2025 עוד לא נמצא.
  donationsCredit: {
    status: 'crosschecked', label: 'זיכוי 35% על תרומות (סכום מינימלי ותקרה לכל שנה)',
    value: { rate: 0.35, incomeShare: 0.3, byYear: { 2021: [190, 9_294_000], 2022: [190, 9_517_000], 2023: [200, 10_019_808], 2024: [207, 10_354_816], 2026: [207, 10_354_816] } },
  },
  disabilityInsuranceDeduction: { status: 'unverified', label: 'ניכוי על ביטוח אובדן כושר עבודה' },
  // סעיף 11: אחוז × הכנסה מיגיעה אישית, עד התקרה של היישוב, לפי חלק השנה שגרו שם. הטבלאות ב-settlements.js (מלוח העזר, 2022–2025).
  // 2020, 2021: אין עדיין טבלה, ולכן השנה נעצרת עם הסבר (ראו engine.js).
  settlementCredit: { status: 'verified', label: 'הטבת יישוב מזכה', source: 'לוח העזר החודשי של רשות המסים לכל שנה, פרק "רשימת היישובים המוטבים"' },
  // סעיף 37: תושב נשוי שבן/בת הזוג בלי הכנסה, ואחד מהם הגיע לגיל פרישה, או בן/בת הזוג עיוור/ת או נכה = נקודה אחת. (bshcpa, protocol)
  spousePoints: { status: 'crosschecked', label: 'נקודת זיכוי לבן/בת זוג בלי הכנסה (גיל פרישה / נכות)', value: 1 },
  institutionRelativeCredit: { status: 'unverified', label: 'זיכוי על מימון קרוב במוסד' },
  // שערוך (הצמדה וריבית). כויל ממקרה אחד: 7,941 ₪ של 2020 קיבלו 3,802 ₪ בהגשה ב-3.11.2026.
  // זו הערכה גסה בלבד, ומוצגת בנפרד מהקרן. השלב הבא: מדד המחירים בפועל + 4% ריבית.
  indexation: {
    status: 'estimate',
    calibration: { principal: 7_941, addition: 3_802, from: '2021-01-01', to: '2026-11-03' },
  },
};

export const ALLOWED = new Set(['verified', 'crosschecked']);

// אילו שנים פתוחות להגשה בתאריך נתון: שש שנים אחורה, עד השנה שהסתיימה.
export function openYears(today = new Date()) {
  const y = today.getFullYear();
  const years = [];
  for (let t = y - 6; t <= y - 1; t++) if (PARAMS[t]) years.push(t);
  return years;
}

// המועד האחרון להגשה לשנה: 31 בדצמבר של השנה השישית אחריה.
export const deadline = (year) => `31.12.${year + 6}`;

// נקודות זיכוי בעד ילדים (סעיפים 40, 66, 66א). גיל = שנת המס פחות שנת הלידה.
// "mother" = ההורה שמקבל את קצבת הילדים והילד בחזקתו (ברוב המשפחות האם). "father" = ההורה השני.
// גיל שחסר בטבלה של שנה = עוד לא אומת, והשנה נעצרת. שנה שאין לה טבלה בכלל = נעצרת.
const six12 = (v) => Object.fromEntries([6, 7, 8, 9, 10, 11, 12].map((a) => [a, v]));
const KIDS_2022 = {
  mother: { 0: 1.5, 1: 2.5, 2: 2.5, 3: 2.5, 4: 2.5, 5: 2.5, ...six12(2), 13: 1, 14: 1, 15: 1, 16: 1, 17: 1, 18: 0.5 },
  father: { 0: 1.5, 1: 2.5, 2: 2.5, 3: 2.5, 4: 2.5, 5: 2.5, ...six12(1), 13: 0, 14: 0, 15: 0, 16: 0, 17: 0, 18: 0 },
};
const KIDS_2021 = {
  mother: { 0:1.5,1:2.5,2:2.5,3:2.5,4:2.5,5:2.5, 6:1,7:1,8:1,9:1,10:1,11:1,12:1,13:1,14:1,15:1,16:1,17:1, 18:0.5 },
  father: { 0:1.5,1:2.5,2:2.5,3:2.5,4:2.5,5:2.5, 6:0,7:0,8:0,9:0,10:0,11:0,12:0,13:0,14:0,15:0,16:0,17:0, 18:0 },
};
const KIDS_2024 = {
  mother: { 0: 2.5, 1: 4.5, 2: 4.5, 3: 3.5, 4: 2.5, 5: 2.5, ...Object.fromEntries([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((a) => [a, 2])), 18: 0.5 },
  father: { 0: 2.5, 1: 4.5, 2: 4.5, 3: 3.5, 4: 2.5, 5: 2.5, ...Object.fromEntries([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((a) => [a, 1])), 18: 0 },
};
export const CHILD_POINTS = {
  // 2022–2023: לוח העזר 2022, פרק ז' (דוגמאות: אב בשנת הלידה 3.75, אב לילד בגיל 1–5 4.75, אם בשנת הלידה 4.25, אם לילד 1–5 5.25, אם לילד 6–17 3.75, אם לילד בוגר 3.25)
  // ; טופס 106 אמיתי 2022 (אב, ילד בשנת הלידה: 3.75). גילאי 6–12: נקודה נוספת בהוראת שעה ל-2022 ו-2023, עד 31.12.2023 (חוזר רשות המסים 3.1.2024, מס' 2024-000012, טבלאות 3.1 ו-3.2: אם 2, אב 1).
  // 2021: כמו 2020 (לוח העזר 2020 פרק ז: אם בשנת הלידה 4.25, אב 3.75, אם/אב לילד 1–5 5.25/4.75, אם לילד 6–17 3.75, אם לילד בוגר 3.25).
  // לפי bshcpa לא היה שינוי בין ההשוואה ב-2017 לבין 2022, והוראת השעה לגילאי 6–12 התחילה ב-2022.
  2021: KIDS_2021,
  2022: KIDS_2022,
  2023: KIDS_2022,
  // 2024–2025: חוק להגדלת נקודות זיכוי להורים, התשפ"ג-2023 (מלם שכר; לוח העזר 2024 פרק א סעיף 6) ; טבלת cpa-dray "מעודכן ל-2025"
  // ; טופסי 106 אמיתיים: 2024 אב לילד בן 2 = 2.25+4.5 = 6.75, 2025 אב לילדים בני 3 ו-0 = 2.25+3.5+2.5 = 8.25.
  2024: KIDS_2024,
  2025: KIDS_2024,
};
export function childPoints(year, column, ages) {
  const t = CHILD_POINTS[year];
  if (!t) return { missing: `נקודות זיכוי בעד ילדים לשנת ${year} עוד לא אומתו` };
  let pts = 0;
  for (const a of ages) {
    const v = t[column]?.[a];
    if (v === undefined) return { missing: `נקודות זיכוי בעד ילד בגיל ${a} בשנת ${year} עוד לא אומתו` };
    pts += v;
  }
  return { points: pts };
}
