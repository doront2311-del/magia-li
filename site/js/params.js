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
    creditPointValue: {
      value: 2_628, status: 'verified',
      source: 'כפתור "חישוב" במערכת 1301, מקרה בדיקה 2020: 2.25 נקודות = 5,913 ₪ (219 ₪ לחודש)',
    },
  },
  2021: {
    brackets: { value: b(75_480, 108_360, 173_880, 241_680, 502_920, 647_640), status: 'crosschecked', source: `${KOLZCHUT} ; ${OS_EXPERTS}` },
    creditPointValue: { value: 2_616, status: 'crosschecked', source: '218 ₪ לחודש. לאמת מול טופס 106 של 2021' },
  },
  2022: {
    brackets: { value: b(77_400, 110_880, 178_080, 247_440, 514_920, 663_240), status: 'crosschecked', source: `${KOLZCHUT} ; ${OS_EXPERTS}` },
    creditPointValue: { value: 2_676, status: 'verified', source: 'טופסי 106 אמיתיים, 2022: 223 ₪ לחודש' },
  },
  2023: {
    brackets: { value: b(81_480, 116_760, 187_440, 260_520, 542_160, 698_280), status: 'crosschecked', source: `${KOLZCHUT} ; ${OS_EXPERTS}` },
    creditPointValue: { value: 2_820, status: 'verified', source: 'טופס 106 אמיתי, 2023: 235 ₪ לחודש' },
  },
  2024: {
    brackets: {
      value: b(84_120, 120_720, 193_800, 269_280, 560_280, 721_560), status: 'unverified', source: OS_EXPERTS,
      note: 'מקור אחד בלבד. צריך מקור שני או פרסום של רשות המסים.',
    },
    creditPointValue: { value: 2_904, status: 'verified', source: 'טופס 106 אמיתי, 2024: 242 ₪ לחודש' },
  },
  2025: {
    brackets: {
      value: b(84_120, 120_720, 193_800, 269_280, 560_280, 721_560), status: 'unverified', source: OS_EXPERTS,
      note: 'הקפאת מדרגות 2025. מקור אחד בלבד.',
    },
    creditPointValue: { value: 2_904, status: 'verified', source: 'טופסי 106 אמיתיים, 2025: 242 ₪ לחודש' },
  },
  2026: {
    brackets: {
      value: b(84_120, 120_720, 228_000, 301_200, 560_280, 721_560), status: 'unverified', source: OS_EXPERTS,
      note: 'הרפורמה של 2026 הרחיבה את מדרגות 20% ו-31%. מקור אחד בלבד. אפשר להגיש את 2026 רק מינואר 2027.',
    },
    creditPointValue: { value: 2_904, status: 'unverified', source: 'הנחה שערך הנקודה נשאר 242 ₪. לאמת מול תלוש 2026' },
  },
};

// כללים שתלויים בתשובות. כל כלל שעוד לא אומת עוצר את השנה שבה הוא נדרש,
// עם הסבר למשתמש. רשימת ה-unverified כאן היא בעצם רשימת המשימות לשלב "טבלת פרמטרים".
export const RULES = {
  residentPoints: { value: 2.25, status: 'verified', source: 'סעיפים 34 ו-36 לפקודה; אומת בחישוב 2020 (2.25 נקודות)' },
  womanExtraPoints: { value: 0.5, status: 'crosschecked', source: 'סעיף 36א לפקודה' },
  childrenPoints: { status: 'unverified', label: 'נקודות זיכוי בעד ילדים', note: 'הכללים לאב ולאם השתנו ב-2022. צריך טבלה לפי שנה וגיל הילד.' },
  degreePoints: { status: 'unverified', label: 'נקודת זיכוי לתואר אקדמי' },
  dischargedSoldierPoints: { status: 'unverified', label: 'נקודות זיכוי לחייל משוחרר' },
  alimonyPoints: { status: 'unverified', label: 'נקודת זיכוי על תשלום מזונות' },
  singleParentPoints: { status: 'unverified', label: 'נקודות זיכוי להורה יחיד' },
  pensionCredit: { status: 'unverified', label: 'זיכוי על הפקדות לפנסיה (תקרת הכנסה מבוטחת)', note: 'צריך את התקרה לכל שנה, ואת חלוקת 7% בין זיכוי לניכוי.' },
  lifeInsuranceCredit: { status: 'unverified', label: 'זיכוי 25% על ביטוח חיים' },
  donationsCredit: { status: 'unverified', label: 'זיכוי 35% על תרומות (סכום מינימלי ותקרה לכל שנה)' },
  disabilityInsuranceDeduction: { status: 'unverified', label: 'ניכוי על ביטוח אובדן כושר עבודה' },
  settlementCredit: { status: 'unverified', label: 'הטבת יישוב מזכה', note: 'צריך טבלה רשמית של יישובים, אחוזים ותקרות לכל שנה.' },
  spousePoints: { status: 'unverified', label: 'נקודת זיכוי לבן/בת זוג בלי הכנסה (גיל פרישה / נכות)' },
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
