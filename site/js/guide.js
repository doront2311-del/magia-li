// מדריך מילוי 1301: רשימת שדות לפי הלשוניות של הטופס, באותו סדר שבו הם מופיעים במסך.
// מציגים רק שדות עם ערך או סימון. לכל שדה: מקור (מסמך או תשובה).

const MARITAL_1301 = {
  single: 'רווק/ה', married: 'נשוי/אה', commonLaw: 'נשוי/אה (ידועים בציבור נחשבים בני זוג לצורכי מס. לאמת מול המרשם)',
  divorced: 'גרוש/ה', widowed: 'אלמן/ה',
};

const fmt = (n) => Number(n).toLocaleString('he-IL');

export function buildGuide(year, yearCase, result) {
  const self = yearCase.people.find((p) => p.role === 'self');
  const spouse = yearCase.people.find((p) => p.role === 'spouse');
  const all = yearCase.people;
  const tabs = [];

  tabs.push({
    title: 'כניסה',
    steps: [
      'נכנסים ל"פתיחת תיק ברשות המסים" ובוחרים "אני רוצה לבקש החזר מס".',
      `מאשרים כתובת, בוחרים את שנת ${year} ומשדרים. המערכת מפנה לדו"ח השנתי המקוון (טופס 1301).`,
      'במסך 1301: מספר תיק = מספר תעודת הזהות (9 ספרות). שנת מס: ' + year + '. בוחרים את האפשרות הראשונה: "הזנת דו"ח שנתי מלא ליחיד (טופס 1301) כולל מסמכים והגשה מקוונת".',
      'השדות הרלוונטיים מסומנים בצהוב. לוחצים "שמירה" אחרי כל לשונית, כי המערכת מנתקת אחרי זמן.',
    ],
    fields: [],
  });

  const employerNames = all.flatMap((p) => (p.employers || []).map((e) => e.name)).filter(Boolean);
  tabs.push({
    title: 'פרטים אישיים',
    fields: [
      { field: 'מצב משפחתי', value: MARITAL_1301[yearCase.maritalStatus] || yearCase.maritalStatus, source: `תשובה: מצב משפחתי ב-${year}` },
      { field: 'שמות המעבידים', value: employerNames.join(', '), source: 'טופסי 106 שהזנת' },
      { field: 'פרטי בנק (278/277)', value: 'סמל בנק, סניף, מספר חשבון, שם בעל החשבון (על שמך)', source: 'אישור ניהול חשבון' },
      { field: '"נעזרתי במילוי, תמורת תשלום"', value: 'לא לסמן', source: 'האפליקציה חינמית ולא נחשבת מייצג' },
    ],
  });

  tabs.push({
    title: 'פרטים כלליים',
    fields: [
      { field: '"אני מגיש דוח לשנת מס זו למרות שאיני חייב - בקשה להחזר מס"', value: '✓ לסמן', source: 'זו בקשת החזר' },
      { field: 'נספח ד\' (הכנסות מחו"ל)', value: 'לא', source: 'תשובה בסינון: אין הכנסות מחו"ל' },
      { field: 'רווח הון / מניות / קריפטו', value: 'לא', source: 'תשובה בסינון: אין הכנסות כאלה' },
      { field: 'שאלות החובה (150, 1213/1385, 702, 1345/1346)', value: 'לא', source: 'תשובות בסינון: שכיר בלבד, בלי נכסים בחו"ל' },
    ],
  });

  const income = [];
  const add = (field, value, source) => { if (value) income.push({ field, value: fmt(value), source }); };
  for (const p of all) {
    const who = p.role === 'spouse' ? ' (בן/בת הזוג)' : '';
    const salary = (p.employers || []).reduce((s, e) => s + e.income, 0);
    add(p.role === 'spouse' ? '172' : '158', salary, `סעיף 3, משכורת${who}: סה"כ שדה 158/172 מ-${(p.employers || []).length} טופסי 106`);
    const btl = (p.btl || []).reduce((s, x) => s + x.gross, 0);
    add(p.role === 'spouse' ? '196 (לאמת במסך)' : '194', btl, `סעיף 2ב, תקבולים מביטוח לאומי${who}: ${(p.btl || []).map((x) => x.label).join(' + ')}`);
  }
  const withheld = all.reduce((s, p) => s + (p.employers || []).reduce((a, e) => a + e.taxWithheld, 0) + (p.btl || []).reduce((a, x) => a + x.taxWithheld, 0), 0);
  add('042', withheld, 'סעיף 81, מס שנוכה במקור: מכל טופסי ה-106 ואישורי ביטוח לאומי');
  const docs = all.reduce((s, p) => s + (p.employers || []).length + (p.btl || []).length, 0);
  income.push({ field: 'מצ"ב __ טופסי 106', value: String(docs), source: 'מספר המסמכים שמצורפים (106 ואישורי ביטוח לאומי)' });
  tabs.push({ title: 'פירוט הכנסות', fields: income, note: 'כל שאר השדות ריקים. נקודות הזיכוי לתושב (020) מסומנות אוטומטית.' });

  if (result?.results) {
    const L = (k) => result.results.reduce((s, r) => s + r.lines[k], 0);
    tabs.push({
      title: 'חישוב (לפני שידור)',
      steps: ['לוחצים על "חישוב" ומשווים לשורות כאן. אם יש הפרש של יותר מ-10 ₪, עוצרים ובודקים שוב את השדות.'],
      fields: [
        { field: 'סה"כ הכנסות', value: fmt(L('totalIncome')), source: 'סכום ההכנסות' },
        { field: 'מס ברוטו', value: fmt(L('grossTax')), source: 'מדרגות המס של השנה' },
        { field: 'זיכויים', value: fmt(L('credits')), source: 'נקודות זיכוי × ערך נקודה' },
        { field: 'מס מגיע', value: fmt(L('taxDue')), source: 'מס ברוטו פחות זיכויים' },
        { field: 'ניכויים במקור', value: fmt(L('withheld')), source: 'שדה 042' },
        { field: result.balance >= 0 ? 'מס ששולם ביתר' : 'יתרת חוב', value: fmt(Math.abs(result.balance)), source: 'ההפרש' },
      ],
    });
  }

  tabs.push({
    title: 'צרופות והגשה',
    steps: [
      'לוחצים "שידור". שידור הוא עוד לא ההגשה.',
      'עוברים ל"מערכת צרופות" (או "הוספת מסמכים לאחר הגשת הדו"ח"), מעלים את הקבצים ולוחצים "סיום". אפשר גם קובץ zip אחד.',
      'מורידים PDF של נתוני הדיווח.',
      'במסך "הגשת הדו"ח": מסמנים "מאשר" בהצהרה ולוחצים "הגשה". רק הלחיצה הזו מגישה.',
      'שומרים את ה-PDF של מסך "אישור הגשת הדו"ח". המזהה הוא תיק + שנה + גרסה.',
    ],
    fields: [
      ...all.flatMap((p) => (p.employers || []).map((e) => ({ field: 'קובץ', value: `טופס 106 – ${e.name}`, source: p.role === 'spouse' ? 'בן/בת הזוג' : 'שלך' }))),
      ...all.flatMap((p) => (p.btl || []).map((x) => ({ field: 'קובץ', value: `ביטוח לאומי – ${x.label}`, source: p.role === 'spouse' ? 'בן/בת הזוג' : 'שלך' }))),
      ...(yearCase.needsBankProof ? [{ field: 'קובץ', value: 'אישור ניהול חשבון', source: 'תשובה: לא קיבלת בעבר החזר לחשבון הזה' }] : []),
    ],
  });

  return { year, tabs, selfName: self?.name, hasSpouse: !!spouse };
}
