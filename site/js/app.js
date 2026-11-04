// האשף: סינון → שאלות עליך → לכל שנה (שאלות + מסמכים) → תוצאה → מדריך הגשה → אחרי ההגשה.
// עיקרון אפס הנחות: אין ברירות מחדל. כל שאלה מוצגת היא שאלת חובה, ו"המשך" לא עובד עד שעונים על הכול.

import { computeYear, amountBucket, rentTaxablePart } from './engine.js';
import { buildGuide } from './guide.js';
import { openYears, deadline, BOOKLET, RENT_CEILING } from './params.js';
import { track, device } from './analytics.js';
import { parseDocument, summarizeDocs, DOC_TYPES } from './docparse.js';
import { pdfLines, renderPdf } from './pdftext.js';
import { SETTLEMENTS } from './settlements.js';
import { putFile, getFile, delFile, clearFiles, suggestName } from './filestore.js';

const STORE = 'magia-li-v1';
const STEPS = ['screen', 'me', 'years', 'extras', 'results', 'guide', 'after'];
const STEP_NAMES = { screen: 'סינון', me: 'שאלות עליך', years: 'שנים ומסמכים', extras: 'מסמכים נוספים', results: 'תוצאה', guide: 'מדריך הגשה', after: 'אחרי ההגשה' };
const YEARS = openYears();

let state = load() || { step: 'screen', screen: {}, me: {}, years: {}, ui: {} };
const app = document.getElementById('app');

// ---------- state ----------
function load() { try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; } }
function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* private mode */ } }
function get(path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), state); }
function set(path, value) {
  const keys = path.split('.');
  let o = state;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
}
const answered = (v) => v !== undefined && v !== null && v !== '';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('he-IL');

// ---------- question builders. כל builder רושם את עצמו ב-ctx.req כשאלת חובה ----------
function mk(ctx) {
  const miss = (p) => ctx.showMissing && !answered(get(p)) ? ' missing' : '';
  const help = (h) => (h ? `<div class="help">${h}</div>` : '');
  return {
    req(path) { ctx.req.push(path); },
    missCls: miss,
    choice(path, label, options, h) {
      ctx.req.push(path);
      const v = get(path);
      const opts = options.map(([val, text]) => `<label><input type="radio" name="${path}" data-path="${path}" value="${val}" ${v === val ? 'checked' : ''}>${text}</label>`).join('');
      return `<div class="q${miss(path)}" data-q="${path}"><div class="label">${label}</div>${help(h)}<div class="choices">${opts}</div></div>`;
    },
    yn(path, label, h) { return this.choice(path, label, [['yes', 'כן'], ['no', 'לא']], h); },
    num(path, label, h, opt = {}) {
      ctx.req.push(path);
      const v = get(path);
      return `<div class="q${miss(path)}" data-q="${path}"><label for="${path}">${label}</label>${help(h)}<input id="${path}" type="number" inputmode="numeric" min="${opt.min ?? 0}" ${opt.max ? `max="${opt.max}"` : ''} data-path="${path}" data-num="1" value="${answered(v) ? esc(v) : ''}"></div>`;
    },
    text(path, label, h, opt = {}) {
      ctx.req.push(path);
      const v = get(path);
      return `<div class="q${miss(path)}" data-q="${path}"><label for="${path}">${label}</label>${help(h)}<input id="${path}" type="text" data-path="${path}" value="${esc(v)}"${opt.list ? ` list="${opt.list}" autocomplete="off"` : ''}></div>`;
    },
  };
}

// ---------- step: screen (סינון) ----------
function renderScreen(ctx) {
  const q = mk(ctx);
  const sel = get('screen.selectedYears') || [];
  // בחירת שנים מתוך רשימה. path הוא מערך של שנים. מסומן כחסר אם לא נבחרה אף שנה.
  const years = (path, label, h, list) => {
    ctx.req.push(path);
    const v = get(path) || [];
    const m = ctx.showMissing && !v.length ? ' missing' : '';
    return `<div class="q${m}" data-q="${path}"><div class="label">${label}</div>${h ? `<div class="help">${h}</div>` : ''}
      <div class="choices">${list.map((y) => `<label><input type="checkbox" data-yearlist="${path}" data-years="${y}" ${v.includes(y) ? 'checked' : ''}>${y}</label>`).join('')}</div></div>`;
  };
  let html = `<h1>כמה שאלות לפני שמתחילים</h1>
  <p class="muted">הגרסה הזו מתאימה לשכירים. השאלות האלה בודקות שהאפליקציה מתאימה למקרה שלך.</p>
  <div class="card">
    ${years('screen.selectedYears', 'אילו שנים לבדוק?', `אפשר לבדוק עד שש שנים אחורה. מומלץ לבדוק את כולן. השנה הכי ישנה נסגרת בסוף השנה הזו (${deadline(YEARS[0])}).`, YEARS)}
    ${q.yn('screen.selfEmployed', 'היה לך עסק עצמאי (עוסק פטור / מורשה) באחת השנים שתרצה לבדוק?')}
    ${q.yn('screen.resident', 'היית תושב/ת ישראל בכל השנים האלה?')}
    ${q.yn('screen.oleh', 'עלית לארץ או חזרת אחרי תקופה ארוכה בחו"ל (תושב חוזר) בעשר השנים האחרונות?')}`;
  const OUT_YEARS = 'את השנים האלה האפליקציה עוד לא יודעת לחשב, ונמליץ עליהן על רואה חשבון. את שאר השנים נבדוק כרגיל.';
  if (sel.length) {
    html += q.yn('screen.otherIncome', 'היו לך (או לבן/בת הזוג) באחת השנים שבחרת הכנסות מקריפטו, ממניות בחשבון מסחר בחו"ל (ברוקר זר), ממניות או אופציות שקיבלת מהמעסיק (RSU או סעיף 102), הכנסות אחרות מחו"ל, או שכר דירה על נכס שהוא לא דירת מגורים (למשל חנות או משרד)?',
      'על חשבון מסחר בבנק או בבית השקעות בישראל, ועל שכר דירה מדירת מגורים שלא שילמת עליו מס, נשאל בהמשך. אלה כן נתמכים.');
    if (get('screen.otherIncome') === 'yes') html += `<div class="sub">${years('screen.otherYears', 'באילו שנים?', OUT_YEARS, sel)}</div>`;
    html += q.yn('screen.severance', 'באחת השנים שבחרת, קיבלת (או בן/בת הזוג) כסף לחשבון הבנק מפיצויים, או משכת כסף מקופת פנסיה, גמל או קרן השתלמות לפני הזמן?',
      'אם עזבת עבודה והפיצויים נשארו בקרן הפנסיה ולא משכת אותם, עונים "לא". המעסיק אולי נתן לך טופס 161, אבל אם הכסף לא יצא מהקרן אין כאן הכנסה לדווח עליה. קרן השתלמות אחרי 6 שנים: גם "לא".');
    if (get('screen.severance') === 'yes') html += `<div class="sub">${years('screen.sevYears', 'באילו שנים?', OUT_YEARS, sel)}</div>`;
    html += q.yn('screen.rentTaxed', 'באחת השנים שבחרת, קיבלת (או בן/בת הזוג) שכר דירה על דירת מגורים, ושילמת עליו מס לרשות המסים (במסלול 10%, או במסלול הרגיל לפי המדרגות)?',
      'אם קיבלת שכר דירה ולא דיווחת ולא שילמת עליו מס, עונים "לא". על זה נשאל בהמשך, וזה נתמך.');
    if (get('screen.rentTaxed') === 'yes') html += `<div class="sub">${years('screen.rentTaxedYears', 'באילו שנים?', OUT_YEARS, sel)}</div>`;
  }
  html += '</div>';
  const out = [];
  if (get('screen.selfEmployed') === 'yes') out.push('היה לך עסק עצמאי. עצמאים עדיין לא נתמכים באפליקציה.');
  if (get('screen.resident') === 'no') out.push('לא היית תושב/ת ישראל בכל השנים. האפליקציה מתאימה רק לתושבי ישראל.');
  if (get('screen.oleh') === 'yes') out.push('עלית לארץ או חזרת אחרי תקופה ארוכה בחו"ל. לעולים חדשים ולתושבים חוזרים יש הטבות מיוחדות, שעוד לא נתמכות.');
  // שאלות לפי שנים: חוסמות רק כשכל השנים שנבחרו נפסלות. אחרת ממשיכים עם השאר.
  const outYears = new Set();
  const yearCase = [['otherIncome', 'otherYears', 'היו הכנסות מקריפטו, מברוקר בחו"ל, ממניות מהמעסיק, מחו"ל או משכירות של נכס שאינו דירת מגורים'],
    ['severance', 'sevYears', 'היו פיצויים או משיכה מקופת פנסיה, גמל או קרן השתלמות'],
    ['rentTaxed', 'rentTaxedYears', 'שילמת מס על שכר דירה במסלול 10% או במסלול הרגיל']];
  const partly = [];
  for (const [k, ys, why] of yearCase) {
    if (get(`screen.${k}`) !== 'yes') continue;
    const list = (get(`screen.${ys}`) || []).filter((y) => sel.includes(y));
    list.forEach((y) => outYears.add(y));
    if (list.length) partly.push(`${list.join(', ')}: ${why}.`);
  }
  if (sel.length && outYears.size >= sel.length) out.push(...partly);
  if (out.length) html += `<div class="notice warn" id="outNotice"><b>כרגע האפליקציה לא מתאימה למקרה שלך:</b><br>${out.join('<br>')}<br>מומלץ לפנות לרואה חשבון או ליועץ מס.</div>`;
  else if (partly.length) html += `<div class="notice warn" id="outNotice"><b>חלק מהשנים האפליקציה לא תחשב:</b><br>${partly.join('<br>')}<br>לשנים האלה מומלץ לפנות לרואה חשבון או ליועץ מס. את שאר השנים נבדוק כרגיל, והשנים האלה יסומנו בתוצאה "מחוץ להיקף".</div>`;
  ctx.blocked = out.length > 0;
  ctx.outSig = out.join('|') + '#' + partly.join('|');
  return html;
}

// ---------- step: me (שאלות קבועות) ----------
function renderMe(ctx) {
  const q = mk(ctx);
  let html = `<h1>שאלות עליך</h1>
  <p class="muted">אלה שאלות שלנו, לא טופס של רשות המסים. כל שאלה ממלאת שדה בדו"ח 1301 או קובעת אם מגיעה לך נקודת זיכוי.</p>
  <div class="card">
    ${q.choice('me.gender', 'מין', [['m', 'גבר'], ['f', 'אישה']], 'אישה מקבלת חצי נקודת זיכוי נוספת.')}
    ${q.yn('me.hasKids', `היו לך ילדים מתחת לגיל 19 ${selText()}?`, 'כולל ילד שנולד באותה שנה. ילדים מזכים בנקודות זיכוי לפי הגיל שלהם בכל שנה.')}`;
  if (get('me.hasKids') === 'yes') {
    html += `<div class="sub">${q.text('me.kidsBirthYears', 'שנות הלידה של הילדים', 'מופרדות בפסיק, למשל: 2022, 2025')}
      ${q.yn('me.kidsLiveWith', 'הילדים גרים איתך באותו בית?', 'אם יש ילד שגר אצל ההורה השני (למשל אחרי גירושין), עונים "לא".')}`;
    if (get('me.kidsLiveWith') === 'yes') html += q.choice('me.allowance', 'לאיזה חשבון בנק נכנסת קצבת הילדים מביטוח לאומי?', [['me', 'לחשבון שלי'], ['other', 'לחשבון של ההורה השני']], 'ההורה שמקבל את הקצבה מקבל יותר נקודות זיכוי על ילדים מגיל 6. ברוב המשפחות הקצבה נכנסת לחשבון של האם. אפשר לבדוק באזור האישי בביטוח לאומי.');
    html += '</div>';
  }
  html += q.yn('me.degree', 'סיימת אי פעם תואר אקדמי או תעודת מקצוע? (בכל שנה, לא רק בשנים שבחרת)', 'בשאלה הבאה נשאל באיזו שנה. נקודת הזיכוי ניתנת רק בשנה שאחרי הסיום, אז האפליקציה תבדוק לבד אם היא נוגעת לשנים שבחרת.');
  if (get('me.degree') === 'yes') html += `<div class="sub">${q.choice('me.degreeType', 'איזה תואר או תעודה?', [['ba', 'תואר ראשון'], ['ma', 'תואר שני'], ['other', 'דוקטורט, רפואה, או תעודת מקצוע']], 'תואר ראשון מזכה בנקודת זיכוי אחת בשנה שאחרי הסיום.')}
    ${get('me.degreeType') === 'ba' ? q.yn('me.degreeDefer', 'ביקשת לדחות את נקודת הזיכוי על התואר לשנה מאוחרת יותר? (למשל כי המשכת ישר לתואר שני)', 'רוב האנשים לא ביקשו, ועונים "לא".') : ''}</div>`;
  if (get('me.degree') === 'yes') html += `<div class="sub">${q.num('me.degreeYear', 'באיזו שנה סיימת את התואר או את הלימודים לתעודה?', 'השנה שבה קיבלת זכאות לתואר (כתוב באישור הזכאות מהמוסד)', { min: 1960, max: 2030 })}</div>`;
  html += q.yn('me.served', 'שירתת בשירות צבאי סדיר (חובה) או בשירות לאומי?', 'הכוונה לשירות הסדיר, לא למילואים. חיילים משוחררים מקבלים נקודות זיכוי ל-3 שנים אחרי השחרור. על מילואים נשאל בהמשך, בתוך כל שנה.');
  if (get('me.served') === 'yes') {
    html += `<div class="sub">${q.choice('me.serviceType', 'איזה שירות?', [['army', 'צבאי'], ['national', 'שירות לאומי / אזרחי']])}
      ${q.choice('me.serviceLength', 'כמה זמן שירתת בשירות הסדיר?', [['full', get('me.serviceType') === 'national' ? '24 חודשים ומעלה' : 'גבר: 23 חודשים ומעלה. אישה: 22 חודשים ומעלה'], ['partial', 'לפחות 12 חודשים, אבל פחות מזה'], ['short', 'פחות מ-12 חודשים']], 'שירות מלא = 2 נקודות זיכוי בשנה. שירות חלקי (12 חודשים ומעלה) = נקודה אחת בשנה. לא כולל תקופות של מאסר או נפקדות.')}
      ${q.yn('me.career', 'המשכת לשירות קבע מיד אחרי השירות הסדיר?', 'בשירות קבע החישוב שונה, והמקורות לא מסכימים איך בדיוק.')}
      ${q.num('me.dischargeYear', 'באיזו שנה השתחררת מהשירות הסדיר?', 'מספיק שנה. חודש נבקש רק אם הוא משנה את התוצאה.', { min: 1960, max: 2030 })}`;
    if (dischargeNeedsMonth()) html += q.num('me.dischargeMonth', 'באיזה חודש השתחררת? (1–12)', 'הזכאות מתחילה בחודש שאחרי השחרור ונמשכת 36 חודשים. באחת השנים שבחרת היא מתחילה או נגמרת, ולכן החודש קובע כמה נקודות מגיעות בה.', { min: 1, max: 12 });
    else if (get('me.dischargeYear')) html += '<div class="help">בשנים שבחרת הזכאות נמשכת את כל השנה, ולכן לא צריך את החודש המדויק.</div>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

// ---------- step: years (שאלות + מסמכים לכל שנה) ----------
// דיוק מדורג: חודש השחרור משנה רק כשאחת השנים שנבדקות היא שנת השחרור או השנה שבה 36 החודשים נגמרים.
function dischargeNeedsMonth() {
  const sy = Number(get('me.dischargeYear'));
  if (!sy) return false;
  return (get('screen.selectedYears') || []).some((y) => y === sy || y === sy + 3);
}
function selText() {
  const sel = get('screen.selectedYears') || [];
  if (sel.length === 1) return `בשנת ${sel[0]}`;
  return `באחת השנים שבחרת (${sel.join(', ')})`;
}
const kidsYears = () => String(get('me.kidsBirthYears') || '').split(/[,\s]+/).map(Number).filter((n) => n > 1900);

// ---------- מסמכים: העלאה וקריאה אוטומטית בדפדפן ----------
const TAX_LOGIN = 'https://secapp.taxes.gov.il/logon/LogonPoint/tmindex.html';
const TAX_REGISTER = 'https://secapp.taxes.gov.il/srRishum/main/openPage';
const BTL_LOGIN = 'https://ps.btl.gov.il/';
const HOWTO_LOGIN = `<li><b>כניסה:</b> <a class="btn small-btn" href="${TAX_LOGIN}" target="_blank" rel="noopener">פתיחת האזור האישי ברשות המסים ←</a><br><span class="small muted">רק דרך הכפתור הזה. החיפוש באתר gov.il לא מוצא את הטפסים.</span></li>
  <li><b>הזדהות:</b> תעודת זהות, קוד משתמש וקוד חד-פעמי לטלפון. אין לך קוד משתמש? <a href="${TAX_REGISTER}" target="_blank" rel="noopener">רישום חד-פעמי</a>.
    <div class="notice info small">ברישום מבקשים לבחור אמצעי זיהוי. <b>מספיק אחד בלבד</b>: הכי קל לבחור <b>"כרטיס אשראי"</b> ולהשאיר את השאר ריקים.</div></li>`;
const HOWTO_SUMMARY = `<details class="howto" open><summary>איך מורידים מרשות המסים</summary><ol>
  ${HOWTO_LOGIN}
  <li>בעמוד הראשי בוחרים <b>"טפסי 106"</b>, ואז את השנה.</li>
  <li>במסך <b>"מידע מרוכז מהמעסיקים"</b> מורידים <b>שני סוגי קבצים</b>:<br>
    (א) לוחצים על הקישור <b>"למסמך ריכוז הכנסות"</b> (ליד הכותרת): קובץ אחד, הרשימה של כל מי ששילם לך משכורת באותה שנה.<br>
    (ב) ליד כל מעסיק ברשימה לוחצים <b>"להצגת טופס 106"</b> ושומרים את הקובץ: אחד לכל מעסיק.<br>
    <span class="small muted">הטעות הנפוצה: להוריד רק את ה-106 ולשכוח את הריכוז. בלי הריכוז אין לנו דרך לדעת שלא חסר מעסיק.</span></li></ol></details>`;
// באתר ביטוח לאומי, בתפריט "אישורים", כל אישור נמצא תחת "נושא", ויש כמה אישורים עם שמות דומים.
// לכן תמיד כותבים קודם את הנושא ואחר כך את השם המדויק (לפי צילומי מסך מ-3.11.2026).
const BTL_DOCS = {
  annual: 'בנושא "כללי": "אישור תשלומים שנתי"',
  miluim: 'בנושא "מילואים": "אישור שנתי למס הכנסה על תשלום תגמולי מילואים"',
  unemployment: 'בנושא "אבטלה": "אישור שנתי למס הכנסה" (או "אישור תשלומי אבטלה שנתי")',
  maternity: 'בנושא של דמי הלידה: האישור השנתי על התשלומים והמס שנוכה (את המסך הזה עוד לא ראינו, אז מחפשים לפי הנושא)',
  injury: 'בנושא של פגיעה בעבודה: האישור השנתי על התשלומים והמס שנוכה (את המסך הזה עוד לא ראינו, אז מחפשים לפי הנושא)',
};
const btlDoc = (kind, year) => `ביטוח לאומי ← "אישורים" ← ${BTL_DOCS[kind] || 'אישור שנתי על התשלום'}, לשנת ${year}`;
const miluimNeeded = (base) => ['yes', 'unsure'].includes(get(`${base}.miluimDirect`));
const howtoBtl = (base, year) => `<details class="howto" open><summary>איך מורידים מביטוח לאומי</summary><ol>
  <li><b>כניסה:</b> <a class="btn small-btn" href="${BTL_LOGIN}" target="_blank" rel="noopener">פתיחת האזור האישי בביטוח לאומי ←</a> ואז בתפריט <b>"אישורים"</b>.</li>
  <li>בטבלת האישורים העמודה הראשונה מימין היא <b>"נושא"</b>. לכמה אישורים יש שמות כמעט זהים, אז מוצאים קודם את הנושא, ורק אז את שם האישור. את השנה בוחרים בעמודה "תקופה".</li>
  <li>נושא <b>"כללי"</b> ← <b>"אישור תשלומים שנתי"</b> לשנת ${year}. מורידים אותו תמיד, גם אם לא קיבלת כלום.</li>
  <li>אם באישור הזה מופיעה אבטלה: נושא <b>"אבטלה"</b> ← <b>"אישור שנתי למס הכנסה"</b> לשנת ${year}. כתוב בו במפורש כמה מס הכנסה נוכה. אפשר במקומו גם את "אישור תשלומי אבטלה שנתי" באותו נושא, ונקרא ממנו את עמודת "מס הכנסה".</li>
  ${miluimNeeded(base) ? `<li>נושא <b>"מילואים"</b> ← <b>"אישור שנתי למס הכנסה על תשלום תגמולי מילואים"</b> לשנת ${year}.</li>` : ''}
  <li><b>לא צריך:</b> נושא "גבייה" ← "אישור שנתי למס הכנסה". הוא על דמי הביטוח ששילמת, לא על כסף שקיבלת.</li>
  <li><b>שמות הקבצים:</b> כמה אישורים יורדים באותו שם, למשל "אישור מס הכנסה לשנת ${year}" גם למילואים וגם לתשלומים אחרים. כדאי לשנות את השם מיד אחרי כל הורדה, למשל <bdi>${year}-ביטוח-לאומי-מילואים.pdf</bdi>. אחרי ההעלאה נכתוב ליד כל קובץ מה זיהינו בו.</li></ol></details>`;
const HOWTO_BANK = `<details class="howto" open><summary>איך מורידים אישור ניהול חשבון</summary><ol>
  <li>צריך אותו כי ענית שלא קיבלת בעבר החזר לחשבון הזה, או שאתה לא בטוח. רשות המסים מעבירה את ההחזר רק לחשבון שעל שמך.</li>
  <li>מורידים אותו מהאפליקציה או מהאתר של הבנק. בדרך כלל הוא נקרא "אישור ניהול חשבון" או "אישור על ניהול חשבון", ולוקח דקה.</li></ol></details>`;
const NAMING_TIP = `<div class="notice info small"><b>טיפ:</b> חלק מהאתרים שומרים קבצים בשם של מספרים ואותיות (למשל <bdi dir="ltr">a8f3k29.pdf</bdi>). כשמורידים, כדאי לתת לכל קובץ שם ברור עם השנה ומה יש בו, ולשמור את כל הקבצים של שנה בתיקייה אחת. למשל:
  <bdi>2021-ריכוז-נתוני-שכר.pdf</bdi>, <bdi>2021-106-שם-המעסיק.pdf</bdi>, <bdi>2021-ביטוח-לאומי-אישור-תשלומים-שנתי.pdf</bdi>. אחרי ההעלאה נציע שם לכל קובץ שזיהינו, ואפשר לשמור עותק בשם הזה.</div>`;
const BTL_LABELS = { miluim: 'תגמולי מילואים', unemployment: 'דמי אבטלה', maternity: 'דמי לידה', injury: 'דמי פגיעה בעבודה' };

// מי שמבקש הטבת יישוב צריך לצרף אישור תושבות. כרגע ההטבה נשאלת על המגיש עצמו.
const needsResidency = (year) => get(`years.${year}.settlement`) === 'yes' && get(`years.${year}.settlement12`) === 'yes';

// מה המסמכים אומרים, ומה עוד חסר. משמש גם את התצוגה וגם את החישוב.
function docsState(base, year) {
  const docs = get(`${base}.docs`) || [];
  const s = summarizeDocs(docs, year);
  const need = [];
  if (!s.summary) need.push('ריכוז הכנסות מכל המעסיקים (רשות המסים: הקישור "למסמך ריכוז הכנסות")');
  for (const e of s.missing) need.push(`טופס 106 של ${e.name} (תיק ניכויים ${e.taxFile})`);
  if (!s.btlAnnual) need.push(btlDoc('annual', year));
  const btl = [];
  for (const b of s.btlAnnual?.benefits || []) {
    const cert = s.certs.find((c) => c.kind === b.kind);
    if (!cert) need.push(`כמה מס נוכה מ${BTL_LABELS[b.kind]}: ${btlDoc(b.kind, year)}`);
    else if (cert.tax == null) need.push(`לא הצלחנו לקרוא את המס שנוכה בקובץ "${cert.fileName}". בדקו שזה ${btlDoc(b.kind, year)}`);
    btl.push({ kind: b.kind, label: BTL_LABELS[b.kind], gross: cert?.gross ?? b.gross, taxWithheld: cert ? cert.tax : null, doc: btlDoc(b.kind, year), source: cert?.fileName || s.btlAnnual.fileName });
  }
  const miluim = s.certs.find((c) => c.kind === 'miluim');
  if (miluim) btl.push({ kind: 'miluim', label: BTL_LABELS.miluim, gross: miluim.gross, taxWithheld: miluim.tax, source: miluim.fileName });
  else if (miluimNeeded(base)) need.push(btlDoc('miluim', year));
  for (const c of s.certs) if (c.kind !== 'miluim' && !(s.btlAnnual?.benefits || []).some((b) => b.kind === c.kind)) {
    btl.push({ kind: c.kind || 'other', label: BTL_LABELS[c.kind] || 'תשלום מביטוח לאומי', gross: c.gross, taxWithheld: c.tax, source: c.fileName });
  }
  // אישור ניהול החשבון ואישור התושבות הם רק צרופות להגשה: הם מופיעים ברשימה נפרדת, ולא עוצרים את החישוב ואת המדריך.
  const later = [];
  for (const e of s.employers) if (e.income == null) need.push(`לא הצלחנו לקרוא את ההכנסה בקובץ "${e.source}". נסו את טופס ה-106 מרשות המסים (נספח ב').`);
  return { s, need, later, btl, complete: need.length === 0, partial: partialFrom(s, base, year) };
}

// כשחסרים מסמכים: מה עדיין אפשר לחשב, מה לא נכלל ולאיזה כיוון זה יכול לשנות, ומה חוסם לגמרי.
// אין ניחושים: כל מספר בחישוב מגיע ממסמך שהועלה. מה שלא ידוע נשאר בחוץ ומופיע ברשימה.
function partialFrom(s, base, year) {
  const blocks = [], excluded = [], filingDocs = [];
  const SUMMARY = 'ריכוז הכנסות מכל המעסיקים (רשות המסים: הקישור "למסמך ריכוז הכנסות")';
  let adjust = null;
  if (!s.summary) {
    blocks.push(`חסר ${SUMMARY}. בלי המסמך הזה אי אפשר לדעת מי היו כל המעסיקים ב-${year} וכמה מס נוכה, ולכן אין בסיס להערכה.`);
  } else {
    const gap = s.missing.length > 0 || s.employers.some((e) => e.income == null);
    if (gap) {
      const ti = s.summary.fields?.income, tt = s.summary.fields?.taxWithheld;
      if (ti == null || tt == null) blocks.push(`חסר טופס 106 של חלק מהמעסיקים, ולא הצלחנו לקרוא את הסכומים בריכוז ההכנסות, ולכן אין בסיס להערכה.`);
      else {
        // ההכנסה, המס, וגם ההפקדות לפנסיה (כשהן מופיעות) של כל המעסיקים ביחד לקוחים מהריכוז הרשמי.
        // מורידים את מה שכבר בטופסי ה-106 שהועלו, והשאר נכנס כשורה אחת.
        const known = s.employers.filter((e) => e.income != null);
        const tot = (k) => known.reduce((t, e) => t + (e[k] || 0), 0);
        const pd = s.summary.fields?.pensionDeposit, ii = s.summary.fields?.insuredIncome;
        adjust = { name: 'מעסיקים בלי טופס 106 (הסכומים מהריכוז)', income: ti - tot('income'), taxWithheld: tt - tot('taxWithheld'),
          pensionDeposit: pd != null ? Math.max(0, pd - tot('pensionDeposit')) : 0, insuredIncome: ii != null ? Math.max(0, ii - tot('insuredIncome')) : 0, settlementCode: 0 };
        const lacking = [...s.missing.map((e) => ({ name: e.name, doc: `טופס 106 של ${e.name} (רשות המסים: "להצגת טופס 106")` })),
          ...s.employers.filter((x) => x.income == null).map((e) => ({ name: e.name, doc: `טופס 106 של ${e.name} מרשות המסים (נספח ב'), כי הקובץ "${e.source}" לא נקרא עד הסוף` }))];
        for (const e of lacking) {
          if (pd == null) excluded.push({ label: `הזיכוי על הפקדות לפנסיה אצל ${e.name} (ההכנסה והמס כן נכללו, מהריכוז)`, effect: 'up', doc: e.doc, kind: 'doc' });
          else filingDocs.push(`${e.doc}. ההכנסה, המס וההפקדות לפנסיה נלקחו מהריכוז, אבל את הטופס צריך כדי למלא את הדו"ח ולבדוק אם המעסיק נתן הנחות בתלוש (למשל הטבת יישוב)`);
        }
      }
    }
  }
  if (!s.btlAnnual) excluded.push({ label: 'תשלומים מביטוח לאומי (אבטלה, דמי לידה, מילואים ועוד), אם היו', effect: 'either', doc: btlDoc('annual', year), kind: 'doc' });
  if (!s.certs.some((c) => c.kind === 'miluim') && miluimNeeded(base)) {
    excluded.push({ label: 'תגמולי מילואים ששולמו ישירות מביטוח לאומי, אם היו (גם ההכנסה וגם המס שנוכה)', effect: 'either', doc: btlDoc('miluim', year), kind: 'doc' });
  }
  if (base.endsWith('.self')) {
    if (needsBank() && !bankOk()) filingDocs.push('אישור ניהול חשבון מהבנק. צריך לצרף אותו, כי ענית שלא קיבלת בעבר החזר לחשבון הזה (או שאתה לא בטוח)');
    for (const a of attachMissing(year)) filingDocs.push(`${a.doc}. צריך לצרף אותו, ${a.why}`);
  }
  return { blocks, excluded, filingDocs, adjust };
}

// רשימת הסימון: מה צריך להוריד מכל אתר, ומה כבר הועלה. מתעדכנת לבד לפי הקבצים שהאפליקציה זיהתה.
function checklist(base, year, who) {
  const { s, btl } = docsState(base, year);
  const docs = get(`${base}.docs`) || [];
  const mark = (ok) => ok ? '<span class="ok">✓ הועלה</span>' : '<span class="todo">☐ עוד לא</span>';
  const tax = [[`"למסמך ריכוז הכנסות" ${year} (ריכוז נתוני שכר)`, !!s.summary]];
  if (s.summary) for (const e of s.expected) tax.push([`"להצגת טופס 106" של ${e.name}`, !s.missing.some((m) => m.taxFile === e.taxFile)]);
  else tax.push([`"להצגת טופס 106" ליד כל מעסיק (אחרי שתעלה את הריכוז נראה כאן את כולם)`, docs.some((d) => d.type === '106')]);
  const bl = [[`${BTL_DOCS.annual} ${year}`, !!s.btlAnnual]];
  for (const b of s.btlAnnual?.benefits || []) bl.push([`${BTL_DOCS[b.kind] || BTL_LABELS[b.kind]} ${year}`, btl.some((x) => x.kind === b.kind && x.taxWithheld != null)]);
  if (miluimNeeded(base)) bl.push([`${BTL_DOCS.miluim} ${year}`, s.certs.some((c) => c.kind === 'miluim')]);
  const rows = (list) => list.map(([n, ok]) => `<tr><td>${mark(ok)}</td><td><b>${esc(n)}</b></td></tr>`).join('');
  return `<div class="card sub checklist"><b>מה צריך להוריד ${who === 'spouse' ? 'לבן/בת הזוג' : ''} לשנת ${year}</b>
    <table class="files"><tr><td colspan="2" class="small muted">מרשות המסים (האזור האישי ← "טפסי 106" ← "מידע מרוכז מהמעסיקים")</td></tr>${rows(tax)}
    <tr><td colspan="2" class="small muted">מביטוח לאומי (האזור האישי ← "אישורים")</td></tr>${rows(bl)}</table>
    <div class="small muted">הרשימה מתעדכנת לבד אחרי שמעלים קבצים.</div></div>`;
}

function renderPersonDocs(q, base, who, year) {
  if (get(`${base}.mode`) === 'manual') return renderManualDocs(q, base, who, year);
  const pron = who === 'spouse' ? 'של בן/בת הזוג' : 'שלך';
  const docs = get(`${base}.docs`) || [];
  let html = `<h3>מסמכים ${pron} לשנת ${year}</h3>
    <p>מעלים את הקבצים, והאפליקציה ממלאת את המספרים לבד. הקבצים נקראים בתוך הדפדפן ולא יוצאים מהמחשב.</p>
    ${q.choice(`${base}.miluimDirect`, `עשית${who === 'spouse' ? ' (בן/בת הזוג)' : ''} מילואים בשנת ${year} ושולם ${who === 'spouse' ? 'לו/לה' : 'לך'} ישירות מביטוח לאומי (לא דרך המשכורת)?`, [['yes', 'כן'], ['no', 'לא'], ['unsure', 'לא בטוח/ה']], 'אם התגמול הגיע עם המשכורת, הוא כבר בטופס 106. אם הוא נכנס לבנק מביטוח לאומי, או שאתה לא בטוח, צריך גם את האישור השנתי על תגמולי מילואים. התשובה כאן מעדכנת את רשימת המסמכים למטה.')}
    <div class="notice info"><b>לפני שנכנסים לאתרים: עוברים על ההסבר כאן למטה.</b> יש בהם הכפתורים שמובילים בדיוק למקום הנכון באתרים, ואת השמות המדויקים של הקבצים.</div>
    ${checklist(base, year, who)}
    ${HOWTO_SUMMARY}${howtoBtl(base, year)}${NAMING_TIP}
    <label class="drop"><input type="file" accept="application/pdf,.pdf" multiple data-upload="${base}" data-upyear="${year}">
      <b>בחירת קבצי PDF</b><span class="small muted">אפשר לבחור כמה קבצים ביחד, ולהוסיף עוד אחר כך</span></label>`;
  if (state.ui.reading === base) html += '<div class="notice info">קורא את הקבצים…</div>';
  // קובץ שלא זוהה. "טופס 106 ישן" נחשב כאן לא מזוהה רק כשלא חסר אף טופס 106, כי אז כנראה זה מסמך אחר (למשל מהבנק).
  const missing106 = summarizeDocs(docs, year).missing.length > 0;
  const isUnk = (d) => ['unknown', 'scanned'].includes(d.type) || (d.type === 'legacy106' && !missing106);
  if (docs.length) {
    html += `<table class="files">${docs.map((d, i) => {
      const ok = !['unknown', 'scanned', 'legacy106', 'error'].includes(d.type) && (!d.year || d.year === year);
      const what = d.type === 'error' ? 'לא הצלחנו לפתוח את הקובץ' : (DOC_TYPES[d.type] || d.type) + (d.year ? `, ${d.year}` : '') + (d.employer?.name ? `, ${d.employer.name}` : '');
      const better = ok ? suggestName(d, year, who) : null;
      const rename = better && better !== d.fileName ? `<div class="small">שם מומלץ: <bdi>${esc(better)}</bdi> <button class="btn link" type="button" data-saveas="${base}|${i}">שמירת עותק בשם הזה</button></div>` : '';
      return `<tr><td>${ok ? '✓' : '⚠'}</td><td><bdi dir="ltr">${esc(d.fileName)}</bdi><div class="small muted">${esc(what)}</div>${rename}</td><td class="actions"><button class="btn link" type="button" data-view="${base}|${i}">צפייה</button> <button class="btn link" type="button" data-rmdoc="${base}|${i}">הסרה</button></td></tr>`;
    }).join('')}</table>`;
  }
  const { s, need, later, btl, complete } = docsState(base, year);
  set(`${base}.docsOk`, complete ? 'yes' : '');
  const bad = docs.filter((d) => d.type === 'error' || ['unknown', 'scanned', 'legacy106'].includes(d.type));
  if (bad.length) html += `<div class="notice warn">לא הצלחנו לקרוא: ${bad.map((d) => `"${esc(d.fileName)}"`).join(', ')}. טפסים סרוקים, או טפסים ישנים שהמעסיק שלח, לפעמים לא נקראים. במקומם מורידים את טופס ה-106 מהאזור האישי ברשות המסים (נספח ב'), כמו בהסבר למעלה. אישורים מהבנק, מהמועצה, מחברות ביטוח ומעמותות מעלים בשלב הבא, "מסמכים נוספים".</div>`;
  if (s.issues.length) html += `<div class="notice warn">${s.issues.map(esc).join('<br>')}</div>`;
  if (s.employers.length || btl.length) {
    html += `<table class="calc"><tr><td><b>מה מצאנו</b></td><td class="num"><b>הכנסה</b></td><td class="num"><b>מס שנוכה</b></td></tr>
      ${s.employers.map((e) => `<tr><td>${esc(e.name)}<div class="small muted">מקור: <bdi>${esc(e.source)}</bdi>. הפקדה לפנסיה ${fmt(e.pensionDeposit)} ₪${e.settlementCode ? '. המעסיק נתן הנחת יישוב מזכה' : ''}</div></td><td class="num">${e.income == null ? '?' : fmt(e.income)}</td><td class="num">${fmt(e.taxWithheld)}</td></tr>`).join('')}
      ${btl.map((b) => `<tr><td>ביטוח לאומי: ${esc(b.label)}<div class="small muted">מקור: <bdi>${esc(b.source)}</bdi></div></td><td class="num">${fmt(b.gross || 0)}</td><td class="num">${b.taxWithheld == null ? 'חסר אישור' : fmt(b.taxWithheld)}</td></tr>`).join('')}
    </table>`;
    if (s.summary?.fields?.income != null) html += `<p class="small muted">בריכוז נתוני השכר: הכנסה ${fmt(s.summary.fields.income)} ₪, מס ${fmt(s.summary.fields.taxWithheld || 0)} ₪.</p>`;
  } else if (s.summary && !s.expected.length) {
    html += '<div class="notice info">בריכוז נתוני השכר לא מופיע אף מעסיק בשנה הזו.</div>';
  }
  if (need.length) {
    html += `<div class="notice warn"><b>עוד חסר:</b><ul>${need.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`;
    if (!complete) html += q.choice(`${base}.partialOk`, 'אין לך עכשיו את כל המסמכים?', [['yes', 'להמשיך בלי, ולקבל הערכה חלקית']],
      'נחשב רק לפי מה שהועלה, בלי לנחש את החסר. בתוצאה תופיע כוכבית עם מה שלא נכלל, ורשימה של המסמכים שחסרים. אפשר לחזור ולהעלות אותם מתי שרוצים.');
  }
  if (later.length) html += `<div class="notice info"><b>לצרף בהגשה</b> (לא עוצר את החישוב ואת המדריך. אפשר להעלות לכאן, או פשוט לצרף אותם באתר של רשות המסים):<ul>${later.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`;
  if (complete) html += `<div class="notice info small">✓ כל המסמכים שצריך לחישוב הועלו. אם משהו בטבלה נראה לך לא נכון: <button class="btn link" type="button" data-mode="${base}|manual">תיקון ידני של המספרים</button></div>`;
  html += `<p class="small"><button class="btn link" type="button" data-mode="${base}|manual">אין לי את הקבצים, אני רוצה להקליד ידנית</button></p>`;
  return html;
}

function renderManualDocs(q, base, who, year) {
  const pron = who === 'spouse' ? 'של בן/בת הזוג' : 'שלך';
  let html = `<h3>מסמכים ${pron} לשנת ${year}: הקלדה ידנית</h3>
    <p><button class="btn link" type="button" data-mode="${base}|upload">חזרה להעלאת קבצים (מומלץ)</button></p>
    ${HOWTO_SUMMARY}
    ${q.num(`${base}.employersCount`, `כמה מעסיקים מופיעים במסך "מידע מרוכז מהמעסיקים" ברשות המסים ${pron} לשנת ${year}?`,
      'אם לא עבדת בכלל בשנה הזו, כתבו 0.', { max: 12 })}`;
  const n = Math.min(Number(get(`${base}.employersCount`)) || 0, 12);
  for (let i = 0; i < n; i++) {
    const e = `${base}.employers.${i}`;
    html += `<div class="card sub"><b>טופס 106, מעסיק ${i + 1}</b>
      <div class="grid2">
        ${q.text(`${e}.name`, 'שם המעסיק')}
        ${q.num(`${e}.income`, 'הכנסה ממשכורת (שדה 158 או 172)', 'בטופס 106, שורת "משכורת" / "הכנסה חייבת"')}
        ${q.num(`${e}.taxWithheld`, 'מס הכנסה שנוכה (שדה 042)', 'אם לא נוכה מס, כתבו 0')}
        ${q.num(`${e}.pensionDeposit`, 'הפקדות עובד לקופת גמל לקצבה (שדות 045/086)', 'אם אין בטופס, כתבו 0')}
        ${q.num(`${e}.settlementCode`, 'הנחת יישובים מזכים (קוד 093 או 193)', 'אם אין בטופס, כתבו 0')}
      </div></div>`;
  }
  html += q.yn(`${base}.btlDirect`, `קיבלת ${who === 'spouse' ? '(בן/בת הזוג)' : ''} בשנת ${year} תשלום ישירות מביטוח לאומי?`,
    'למשל מילואים כשלא עבדת דרך מעסיק, דמי אבטלה, דמי לידה, פגיעה בעבודה. מילואים ששולמו דרך המעסיק כבר נמצאים ב-106. אפשר לבדוק ב"אישור תשלומים שנתי" באזור האישי של ביטוח לאומי.');
  if (get(`${base}.btlDirect`) === 'yes') {
    const types = [['miluim', 'תגמולי מילואים', 'אישור שנתי למס הכנסה על תשלום תגמולי מילואים'],
      ['unemployment', 'דמי אבטלה', 'אישור שנתי למס הכנסה (אבטלה)'],
      ['maternity', 'דמי לידה', 'אישור שנתי למס הכנסה (אמהות)'],
      ['injury', 'דמי פגיעה בעבודה', 'אישור שנתי למס הכנסה (נפגעי עבודה)']];
    html += '<div class="sub">';
    for (const [k, label, cert] of types) {
      const t = `${base}.btl.${k}`;
      html += q.yn(`${t}.received`, `${label}?`);
      if (get(`${t}.received`) === 'yes') {
        html += `<div class="sub">${q.num(`${t}.gross`, `סכום ${label} ברוטו בשנה`)}
          ${q.yn(`${t}.hasCert`, `יש לך "${cert}" מביטוח לאומי?`, 'רק באישור הזה כתוב כמה מס נוכה. בריכוז התשלומים הניכויים מופיעים בסכום אחד (ביטוח לאומי + בריאות + מס), ואי אפשר לדעת מהם כמה מס נוכה.')}`;
        if (get(`${t}.hasCert`) === 'yes') html += q.num(`${t}.tax`, 'מס הכנסה שנוכה לפי האישור', 'אם לא נוכה מס, כתבו 0');
        if (get(`${t}.hasCert`) === 'no') html += '<div class="notice warn">בלי האישור אי אפשר לחשב את השנה הזו. מורידים אותו בעמוד "אישורים" באזור האישי של ביטוח לאומי.</div>';
        html += '</div>';
      }
    }
    html += '</div>';
  }
  return html;
}

function renderYear(ctx, year) {
  const q = mk(ctx);
  const y = `years.${year}`;
  let html = `<div class="card"><h2 style="margin-top:0">שנת ${year}</h2>
    ${q.choice(`${y}.marital`, `מה היה המצב המשפחתי שלך בשנת ${year}?`,
      [['single', 'רווק/ה'], ['married', 'נשוי/אה (רשום בתעודת הזהות)'], ['commonLaw', 'בתעודת הזהות לא נשוי/אה, אבל גר/ה עם בן/בת זוג ומנהלים משק בית משותף'], ['divorced', 'גרוש/ה'], ['widowed', 'אלמן/ה'], ['separated', 'נשואים שחיים בנפרד']],
      'בוחרים לפי המצב בפועל באותה שנה.')}`;
  const m = get(`${y}.marital`);
  const couple = m === 'married';
  if (m === 'commonLaw') {
    html += `<div class="notice info">בדו"ח באתר רשות המסים המצב המשפחתי מגיע ממרשם האוכלוסין, ולכן מסמנים "רווק/ה" (או מה שרשום אצלך), ולא צריך את המסמכים של בן/בת הזוג. אם יש לכם ילדים, ייתכן שהזוגיות משפיעה על נקודות הזיכוי בעדם, ונבדוק את זה כשנוסיף את כללי הילדים.</div>`;
  }
  if (couple) {
    html += `<div class="notice info">זוגות נשואים מגישים דו"ח אחד משותף, ולכן צריך גם את המסמכים של בן/בת הזוג (טופס 106 וביטוח לאומי). זה לא שאלון כפול: רק המסמכים ושתי שאלות. הדו"ח המשותף לא יוצר "ממוצע": כל אחד ממוסה לפי ההכנסה שלו.</div>
      <div class="sub">${q.choice(`${y}.spouseGender`, 'מין בן/בת הזוג', [['m', 'גבר'], ['f', 'אישה']])}
      ${q.yn(`${y}.spouseIncome`, `היו לבן/בת הזוג הכנסות בשנת ${year}?`, 'משכורת, או תשלומים מביטוח לאומי')}`;
    if (get(`${y}.spouseIncome`) === 'no') html += q.yn(`${y}.spouseSpecial`, 'בן/בת הזוג הגיע/ה לגיל פרישה, או נכה או עיוור/ת?', 'במקרים האלה יש נקודת זיכוי נוספת (שדה 021).');
    html += '</div>';
  }
  if (couple) html += q.yn(`${y}.alimonyEx`, `שילמת בשנת ${year} מזונות לבן/בת זוג מנישואים קודמים, לפי פסק דין?`, 'מי שנישא מחדש ומשלם מזונות לבן/בת הזוג הקודם/ת מקבל נקודת זיכוי. מזונות לילדים לא נחשבים כאן.');
  if (m === 'divorced' || m === 'single' || m === 'widowed') html += q.yn(`${y}.alimony`, `שילמת מזונות (לבן/בת זוג לשעבר או לילדים) בשנת ${year}?`);
  const kidsNow = kidsYears().some((b) => year - b >= 0 && year - b <= 18);
  if (kidsNow && (m === 'single' || m === 'divorced')) html += q.yn(`${y}.soleParent`, `בשנת ${year}, הילדים היו רשומים במשרד הפנים רק עליך, בלי הורה שני רשום?`, 'אם כן, את/ה "הורה יחיד" ומקבל/ת נקודת זיכוי נוספת. אם יש הורה שני רשום (גם אם הוא לא בתמונה), עונים "לא".');
  if (kidsNow && m === 'widowed') html += '<div class="notice info small">אלמן/ה עם ילדים נחשב/ת "הורה יחיד" ומקבל/ת נקודת זיכוי נוספת. נחשב אותה לשנה הזו.</div>';

  const out = yearOutBase(year);
  if (out) {
    html += `<div class="notice warn"><b>את ${year} האפליקציה לא תחשב.</b> ${out}<br>אפשר להמשיך בתהליך: את שאר השנים שבחרת נחשב כרגיל. לשנה הזו לא נבקש מסמכים, ובתוצאה היא תסומן "מחוץ להיקף". טעית בתשובה? פשוט משנים אותה במקום שבו ענית עליה.</div></div>`;
    return html;
  }
  html += renderPersonDocs(q, `${y}.self`, 'self', year);
  if (couple && get(`${y}.spouseIncome`) === 'yes') html += renderPersonDocs(q, `${y}.spouse`, 'spouse', year);
  html += '</div>';
  return html;
}

// ---------- step: extras (מסמכים נוספים) ----------
// שאלות שהתשובה עליהן מוסיפה מסמך שהאפליקציה לא יודעת לקרוא (כל גוף מוציא אותו אחרת), וגם חשבון מסחר (867).
// ליד כל קובץ מסמנים מה הוא. כשכל המסמכים ברשימה מסומנים, אין הודעה על חוסר.
function renderExtraYear(ctx, year) {
  const q = mk(ctx);
  const y = `years.${year}`;
  const couple = get(`${y}.marital`) === 'married';
  let html = `<div class="card"><h2 style="margin-top:0">שנת ${year}</h2>`;
  const pre = yearOutBase(year);
  if (pre) return html + `<div class="notice warn"><b>את ${year} האפליקציה לא תחשב.</b> ${pre}</div></div>`;
  html += `
    ${q.yn(`${y}.settlement`, `גרת בפועל ביישוב מזכה בשנת ${year}?`, 'בפועל = מרכז החיים: שם ישנת, שם גרו הילדים. רישום בתעודת הזהות לבד לא מספיק.')}`;
  if (get(`${y}.settlement`) === 'yes') {
    const table = SETTLEMENTS[year];
    html += `<div class="sub">${q.text(`${y}.settlementName`, 'באיזה יישוב?', table ? 'מתחילים להקליד ובוחרים מהרשימה. הרשימה היא הרשימה הרשמית של רשות המסים לשנה הזו.' : '', { list: `dl-${year}` })}`;
    if (table) html += `<datalist id="dl-${year}">${Object.keys(table).map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`;
    const st = settlementFor(year, get(`${y}.settlementName`));
    if (st?.row?.rate) html += `<div class="notice info small">לפי <a href="${BOOKLET(year)}" target="_blank" rel="noopener">לוח העזר של רשות המסים ל-${year}</a>: ${esc(st.name)}, הנחה של ${st.row.rate}% מההכנסה, עד הכנסה של ${fmt(st.row.ceiling)} ₪ בשנה.</div>`;
    else if (st?.msg) html += `<div class="notice warn small">${esc(st.msg)}</div>`;
    html += `${q.num(`${y}.settlementMonths`, `כמה חודשים בשנת ${year} גרת שם בפועל?`, 'ההטבה ניתנת רק על החודשים שגרת שם.', { min: 1, max: 12 })}
      ${q.yn(`${y}.settlement12`, 'עד היום, גרת ביישוב הזה לפחות 12 חודשים ברציפות? (מותר שחלק מהחודשים יהיו בשנה אחרת)', 'החוק נותן את ההטבה רק למי שגר ביישוב שנה שלמה לפחות. דוגמה: עברת ליישוב בספטמבר ונשארת שם עד ספטמבר בשנה הבאה, אז עונים "כן", וההטבה ניתנת גם על החודשים הראשונים. מי שגר שם פחות מ-12 חודשים בסך הכל עונה "לא", ואז אין הטבה לשנה הזו.')}`;
    if (get(`${y}.settlement12`) === 'no') html += '<div class="notice warn small">בלי 12 חודשים ברציפות אין הטבת יישוב, ולכן לא נחשב אותה לשנה הזו.</div>';
    if (get(`${y}.settlement12`) === 'yes') html += `<div class="notice info small"><b>מסמך שצריך להשיג: "אישור תושבות" (טופס 1312א).</b> הוא לא נמצא אצל רשות המסים, ואין להורדה באזור האישי. מבקשים אותו מהמועצה האזורית או מהעירייה של היישוב: באתר המועצה (בדרך כלל תחת "אישור תושבות" או "טפסים") או במשרדי המועצה. אומרים שזה "אישור תושבות לצורך הנחה במס הכנסה, לשנת ${year}". כשיש לך אותו, מעלים אותו כאן למטה, והוא יצורף לדו"ח. אם המעסיק כבר נתן לך את ההנחה בתלוש, כנראה כבר מסרת לו עותק, ואפשר לבקש ממנו.</div>`;
    html += '</div>';
  }
  {
    html += q.yn(`${y}.rent`, `קיבלת${couple ? ' (או בן/בת הזוג)' : ''} בשנת ${year} שכר דירה על דירת מגורים בישראל, ולא שילמת עליו מס?`, 'כולל שכר דירה שלא דיווחת עליו בכלל. שכר דירה ששילמת עליו מס (במסלול 10% או במסלול הרגיל) הוא שאלה במסך הראשון.');
    if (get(`${y}.rent`) === 'yes') {
      const c = RENT_CEILING[year];
      html += `<div class="sub">${q.choice(`${y}.rentUnderCeiling`, c ? `בכל חודש בשנת ${year}, שכר הדירה מכל הדירות ביחד היה עד ${fmt(c.value)} ₪?` : `בכל חודש בשנת ${year}, שכר הדירה היה מתחת לתקרת הפטור?`, [['yes', 'כן, בכל החודשים'], ['no', 'לא, לפחות בחודש אחד היה יותר'], ['unsure', 'לא בטוח/ה']], 'לא צריך סכום מדויק. זו התקרה של הפטור המלא: מתחתיה אין מס בכלל, ואין מה לשלם גם אחרי שמצהירים. סופרים יחד את שכר הדירה של כל הדירות שלך ושל בן/בת הזוג.')}`;
      if (c && get(`${y}.rentUnderCeiling`) === 'no') {
        html += '<div class="sub">';
        if (couple) html += q.choice(`${y}.rentWho`, 'על שם מי ההכנסה משכר הדירה?', [['self', 'רק שלי'], ['spouse', 'רק של בן/בת הזוג'], ['both', 'של שנינו ביחד']], 'לפי מי שהדירה רשומה על שמו.');
        html += q.yn(`${y}.rentSame`, `שכר הדירה (מכל הדירות ביחד) היה אותו סכום בכל החודשים שבהם קיבלת אותו ב-${year}?`);
        if (get(`${y}.rentSame`) === 'yes') {
          html += `<div class="grid2">${q.num(`${y}.rentMonthly`, 'כמה ₪ בחודש?', 'הסכום של כל הדירות ביחד, לפני הוצאות.')}
            ${q.num(`${y}.rentMonths`, `בכמה חודשים ב-${year} קיבלת אותו?`, '', { min: 1, max: 12 })}</div>`;
        } else if (get(`${y}.rentSame`) === 'no') {
          html += `<div class="label">כמה ₪ קיבלת בכל חודש ב-${year}? (בחודש בלי שכר דירה כותבים 0)</div><div class="grid2">`;
          for (let mo = 1; mo <= 12; mo++) html += q.num(`${y}.rentM.${mo}`, `חודש ${mo}`);
          html += '</div>';
        }
        const who = couple ? get(`${y}.rentWho`) : 'self';
        if (who === 'self' || who === 'spouse') html += q.yn(`${y}.rentAge60`, `${who === 'spouse' ? 'לבן/בת הזוג' : 'לך'} כבר מלאו 60 בשנת ${year}?`, 'מתחת לגיל 60 המס על החלק החייב הוא לפחות 31%. מגיל 60 הוא לפי המדרגות הרגילות.');
        html += '</div>';
      }
      html += '</div>';
    }
    const r = rentState(year);
    if (r?.ok && !r.taxable) html += `<div class="notice info small"><b>שכר הדירה פטור ממס, ולא משנה את החישוב.</b> אבל מי שמגיש בקשה להחזר צריך להצהיר בה על ההכנסה הזו ועל הבחירה במסלול הפטור, ולצרף את חוזה השכירות (שכתוב בו שהדירה למגורים בלבד), או הצהרה בכתב מהשוכרים שהדירה משמשת למגורים בלבד. הוספנו את זה לרשימת המסמכים למטה ולמדריך.</div>`;
    if (r?.ok && r.taxable) html += `<div class="notice bad"><b><span class="red-star">*</span> שכר הדירה עבר את התקרה, ולכן ${fmt(r.taxable)} ₪ ממנו חייבים במס ב-${year}.</b>
      <p>בחודש שבו שכר הדירה בין התקרה (${fmt(r.ceiling.value)} ₪) לפעמיים התקרה, החלק החייב הוא פעמיים ההפרש מעל התקרה. בחודש שבו הוא פעמיים התקרה או יותר, כולו חייב. החלק החייב נכנס לדו"ח בשדה 059, והמס עליו ${r.age60 ? 'לפי המדרגות הרגילות' : 'לפחות 31%'} נכנס לחישוב, ולכן הוא מקטין את ההחזר.</p>
      <p><b>מה מצרפים:</b> את חוזה השכירות (שכתוב בו שהדירה למגורים בלבד), ורשימה של שכר הדירה שקיבלת בכל חודש (מהצ'קים או מדפי הבנק). הוספנו אותם לרשימת המסמכים למטה ולמדריך.</p>
      <p><b>למה לא כדאי להשמיט את שכר הדירה מהבקשה:</b> בבקשה להחזר חותמים שכל ההכנסות דווחו. בקשה בלי שכר הדירה היא הצהרה לא נכונה. רשות המסים יכולה לגלות את ההכנסה (למשל מהשוכרים, מרישום הנכס או מהבנק), ואז היא פותחת את השנה, דורשת את המס עם הצמדה, ריבית וקנס, ויכולה לבטל את ההחזר. הצהרה לא נכונה בדו"ח היא גם עבירה לפי פקודת מס הכנסה.</p></div>`;
  }
  html += q.yn(`${y}.lifeIns`, `שילמת בעצמך בשנת ${year} על ביטוח חיים, כולל ביטוח חיים של משכנתא?`, 'הכוונה לביטוח שאתה משלם, למשל בהוראת קבע לחברת הביטוח או דרך הבנק של המשכנתא. ביטוח שהמעסיק מפריש לך דרך התלוש לא נחשב כאן.');
  if (get(`${y}.lifeIns`) === 'yes') html += `<div class="sub">${q.num(`${y}.lifeInsAmount`, 'סכום הפרמיות בשנה לפי האישור', 'מעתיקים מהאישור השנתי. איפה מוצאים אותו: ברשימת המסמכים למטה.')}</div>`;
  html += q.yn(`${y}.disability`, `שילמת בשנת ${year} ביטוח אובדן כושר עבודה פרטי (לא דרך המעסיק)?`);
  if (get(`${y}.disability`) === 'yes') html += `<div class="sub">${q.num(`${y}.disabilityAmount`, 'סכום ששילמת בשנה', 'מעתיקים מהאישור השנתי של חברת הביטוח. איפה מוצאים אותו: ברשימת המסמכים למטה.')}</div>`;
  html += q.yn(`${y}.privatePension`, `הפקדת בעצמך לפנסיה או לקופת גמל בשנת ${year} (לא דרך המעסיק)?`);
  html += q.yn(`${y}.donations`, `תרמת בשנת ${year} למוסד מוכר (סעיף 46) עם קבלה?`);
  if (get(`${y}.donations`) === 'yes') html += `<div class="sub">${q.num(`${y}.donationsAmount`, 'סכום התרומות בשנה', 'סוכמים את הקבלות.')}</div>`;
  html += q.yn(`${y}.institution`, `שילמת בשנת ${year} על אחזקת קרוב משפחה במוסד (ילד, בן/בת זוג או הורה)?`);
  if (get(`${y}.institution`) === 'yes') html += `<div class="sub">${q.num(`${y}.institutionAmount`, 'סכום ששילמת בשנה', 'סוכמים את הקבלות מהמוסד.')}</div>`;

  if (secYear(year)) html += renderSecurities(q, year);
  const out = yearOut(year);
  if (out) return html + `<div class="notice warn"><b>את ${year} האפליקציה לא תחשב.</b> ${out}<br>את שאר השנים שבחרת נחשב כרגיל. טעית בתשובה? פשוט משנים אותה כאן.</div></div>`;
  html += renderExtraDocs(year);
  return html + '</div>';
}

const EXTRA_HOWTO = {
  residency: 'מהמועצה האזורית או מהעירייה של היישוב (לא מרשות המסים): באתר המועצה, בדרך כלל תחת "אישור תושבות" או "טפסים", או במשרדי המועצה. מבקשים "אישור תושבות לצורך הנחה במס הכנסה" לשנה הזו. אם המעסיק נתן לך את ההנחה בתלוש, אפשר לבקש ממנו את העותק שמסרת לו.',
  lifeIns: 'מהאזור האישי באתר של חברת הביטוח: מחפשים "אישור שנתי למס הכנסה" או "אישורים למס". בביטוח חיים של משכנתא, הביטוח הוא אצל חברת ביטוח, ולפעמים האישור נמצא גם באתר הבנק של המשכנתא. אם לא ברור באיזו חברה הביטוח, בודקים ב"הר הביטוח" של משרד האוצר.',
  disability: 'מהאזור האישי באתר של חברת הביטוח: "אישור שנתי למס הכנסה" על ביטוח אובדן כושר עבודה. אם לא ברור באיזו חברה, בודקים ב"הר הביטוח".',
  donations: 'הקבלות מהעמותות (כל קבלה עם מספר סעיף 46). אם אין לך אותן, מבקשים עותק מהעמותה.',
  institution: 'הקבלות מהמוסד על התשלומים בשנה הזו. מבקשים מהמוסד ריכוז שנתי.',
  rent: 'החוזה עם השוכרים. אם לא כתוב בו שהדירה משמשת למגורים בלבד, מבקשים מהשוכרים הצהרה קצרה בכתב שהדירה למגורים בלבד.',
  rentList: 'רשימה פשוטה שכותבים בעצמך: לכל חודש כמה שכר דירה קיבלת. אפשר להיעזר בצ\'קים או בדפי הבנק.',
};
function renderExtraDocs(year) {
  const base = `years.${year}.extra`;
  const needs = attachNeeds(year);
  if (!needs.length) return '<p class="small muted">לפי התשובות שלך, אין מסמכים נוספים לשנה הזו.</p>';
  const docs = get(`${base}.docs`) || [];
  const has = (k) => attachHas(year, k);
  let html = `<h3>מסמכים לצרף לשנת ${year}</h3>
    <p>את המסמכים האלה האפליקציה לא קוראת, כי כל גוף מוציא אותם אחרת. מעלים אותם כאן, ומסמנים ליד כל קובץ מה הוא. ככה הם יופיעו ברשימת הצרופות במדריך.</p>
    <table class="files">${needs.map((a) => `<tr><td>${has(a.key) ? '<span class="ok">✓ הועלה</span>' : '<span class="todo">☐ עוד לא</span>'}</td><td><b>${esc(a.doc)}</b><div class="small muted">${esc(a.why)}. איפה מוצאים: ${esc(EXTRA_HOWTO[a.key] || '')}</div></td></tr>`).join('')}</table>
    <label class="drop"><input type="file" accept="application/pdf,.pdf,image/*" multiple data-upload="${base}" data-upyear="${year}">
      <b>בחירת קבצים</b><span class="small muted">PDF או תמונה. אפשר כמה ביחד</span></label>`;
  if (state.ui.reading === base) html += '<div class="notice info">קורא את הקבצים…</div>';
  if (docs.length) html += `<table class="files">${docs.map((d, i) => `<tr><td>${(d.tags || []).length ? '✓' : '⚠'}</td><td><bdi dir="ltr">${esc(d.fileName)}</bdi>
      <div class="small">מה זה? ${needs.map((a) => `<label class="tag"><input type="checkbox" data-tag="${base}|${i}|${a.key}" ${(d.tags || []).includes(a.key) ? 'checked' : ''}> ${esc(a.tag)}</label>`).join(' ')}</div></td>
      <td class="actions"><button class="btn link" type="button" data-view="${base}|${i}">צפייה</button> <button class="btn link" type="button" data-rmdoc="${base}|${i}">הסרה</button></td></tr>`).join('')}</table>`;
  const untagged = docs.filter((d) => !(d.tags || []).length);
  if (untagged.length) html += `<div class="notice info small">סמנו ליד ${untagged.map((d) => `"${esc(d.fileName)}"`).join(', ')} מה הקובץ, כדי שנדע שהוא נמצא.</div>`;
  const miss = needs.filter((a) => !has(a.key));
  if (miss.length) html += `<div class="notice warn"><b>עוד לא סימנת:</b><ul>${miss.map((a) => `<li>${esc(a.doc)}</li>`).join('')}</ul>זה לא עוצר את החישוב ואת המדריך: אפשר גם לצרף אותם ישירות באתר של רשות המסים בזמן ההגשה.</div>`;
  return html;
}

function renderExtras(ctx) {
  const q = mk(ctx);
  const sel = get('screen.selectedYears') || [];
  let html = `<h1>מסמכים נוספים</h1>
    <p class="muted">כמה שאלות על דברים שמזכים בהנחה במס או שצריך לדווח עליהם, ואילו מסמכים לצרף בגללם. לכל מסמך כתוב איפה מוצאים אותו.</p>
    <div class="card">
    ${q.choice('me.prevRefund', 'קיבלת בעבר החזר מרשות המסים לחשבון הבנק שאליו תבקש את ההחזר הפעם?', [['yes', 'כן'], ['no', 'לא'], ['unsure', 'לא בטוח/ה']], 'אם לא, או שלא בטוח, מצרפים אישור ניהול חשבון. מורידים אותו מהאפליקציה של הבנק, וזה לוקח דקה.')}`;
  if (needsBank()) {
    const base = 'extras.bank';
    const docs = get(`${base}.docs`) || [];
    html += `<div class="sub">${HOWTO_BANK}
      <table class="files"><tr><td>${bankOk() ? '<span class="ok">✓ הועלה</span>' : '<span class="todo">☐ עוד לא</span>'}</td><td><b>"אישור ניהול חשבון" מהבנק</b><div class="small muted">אחד מספיק לכל השנים</div></td></tr></table>
      <label class="drop"><input type="file" accept="application/pdf,.pdf,image/*" data-upload="${base}"><b>העלאת אישור ניהול החשבון</b></label>
      ${docs.length ? `<table class="files">${docs.map((d, i) => `<tr><td>${(d.tags || []).includes('bank') ? '✓' : '⚠'}</td><td><bdi dir="ltr">${esc(d.fileName)}</bdi><div class="small"><label class="tag"><input type="checkbox" data-tag="${base}|${i}|bank" ${(d.tags || []).includes('bank') ? 'checked' : ''}> זה אישור ניהול החשבון</label></div></td><td class="actions"><button class="btn link" type="button" data-view="${base}|${i}">צפייה</button> <button class="btn link" type="button" data-rmdoc="${base}|${i}">הסרה</button></td></tr>`).join('')}</table>` : ''}
      ${bankOk() ? '' : '<div class="notice warn small">עוד לא סימנת את אישור ניהול החשבון. זה לא עוצר את החישוב: אפשר גם לצרף אותו ישירות באתר של רשות המסים.</div>'}</div>`;
  }
  html += q.yn('screen.securities', 'היה לך (או לבן/בת הזוג) באחת השנים שבחרת חשבון מסחר בניירות ערך בבנק או בבית השקעות בישראל, שמכרת בו מניות, קרנות או אג"ח, או שקיבלת בו דיבידנד או ריבית?',
    'גם אם הפסדת, וגם אם המס כבר נוכה במקור. על כל חשבון כזה הבנק או בית ההשקעות מוציא בכל שנה "טופס 867", ואותו נבקש להעלות בכל שנה. חשבון שרק קנית בו ולא מכרת, ולא קיבלת בו דיבידנד או ריבית, לא נחשב.');
  if (get('screen.securities') === 'yes') {
    ctx.req.push('screen.secYears');
    const v = get('screen.secYears') || [];
    const m = ctx.showMissing && !v.length ? ' missing' : '';
    html += `<div class="sub"><div class="q${m}" data-q="screen.secYears"><div class="label">באילו שנים?</div><div class="choices">${sel.map((yr) => `<label><input type="checkbox" data-yearlist="screen.secYears" data-years="${yr}" ${v.includes(yr) ? 'checked' : ''}>${yr}</label>`).join('')}</div></div></div>`;
  }
  html += '</div>';
  html += yearTabs(ctx, renderExtraYear);
  return html;
}

// שכר דירה למגורים בישראל: נתמך רק מסלול הפטור כשכל חודש מתחת לתקרה. שם ההכנסה פטורה ולא נכנסת לחישוב,
// אבל צריך להצהיר עליה בבקשה ולצרף חוזה. כל מסלול אחר משנה את המס, ועוד לא נתמך.
function rentState(year) {
  const y = `years.${year}`;
  if (get(`${y}.rent`) !== 'yes') return null;
  const CPA = 'מומלץ רואה חשבון.';
  const c = RENT_CEILING[year];
  if (!c) return { out: `עוד אין לנו תקרת פטור מאומתת לשכר דירה ב-${year}, ולכן השנה הזו לא תחושב. אנחנו עובדים על זה.` };
  const under = get(`${y}.rentUnderCeiling`);
  if (!answered(under)) return null;
  if (under === 'unsure') return { out: `בלי לדעת אם שכר הדירה עבר בחודש כלשהו את ${fmt(c.value)} ₪ אי אפשר לדעת אם יש עליו מס. בודקים בחוזה או בצ'קים ועונים כן או לא. אם עדיין לא בטוח: ${CPA}` };
  if (under === 'no') {
    // פטור חלקי: לפי הסכום בכל חודש. החלק החייב נכנס לחישוב (059) ומקבל כוכבית אדומה בתוצאה.
    const couple = get(`${y}.marital`) === 'married';
    const who = couple ? get(`${y}.rentWho`) : 'self';
    if (!answered(who)) return null;
    if (who === 'both') return { out: `כששכר הדירה מעל התקרה והדירה של שניכם ביחד, צריך לחלק את ההכנסה ביניכם, ואת הכלל לחלוקה עוד לא אימתנו. ${CPA}` };
    if (who === 'spouse' && get(`${y}.spouseIncome`) !== 'yes') return { out: `שכר דירה חייב במס על שם בן/בת זוג שלא היו לו/לה הכנסות אחרות עוד לא נתמך באפליקציה. ${CPA}` };
    const same = get(`${y}.rentSame`);
    let monthly;
    if (same === 'yes') {
      const v = get(`${y}.rentMonthly`), n = get(`${y}.rentMonths`);
      if (!answered(v) || !answered(n)) return null;
      monthly = Array(Math.min(12, Math.max(0, Number(n)))).fill(Number(v));
    } else if (same === 'no') {
      monthly = [];
      for (let mo = 1; mo <= 12; mo++) { const v = get(`${y}.rentM.${mo}`); if (!answered(v)) return null; monthly.push(Number(v)); }
    } else return null;
    const age = get(`${y}.rentAge60`);
    if (!answered(age)) return null;
    return { ok: true, ceiling: c, monthly, who, age60: age === 'yes', taxable: rentTaxablePart(monthly, c.value) };
  }
  return { ok: true, ceiling: c };
}
// צרופות שנובעות מתשובות בשאלון: אין להן מבנה אחד (כל חברת ביטוח, מוסד ועמותה מוציאים אחרת), ולכן
// לא קוראים מהן מספרים. המשתמש מעתיק את הסכום מהאישור, מעלה את הקובץ ומסמן ליד הקובץ מה הוא.
function attachNeeds(year) {
  const y = (k) => get(`years.${year}.${k}`);
  const out = [];
  if (needsResidency(year)) out.push({ key: 'residency', tag: 'אישור התושבות', doc: 'אישור תושבות (טופס 1312א) מהמועצה או מהעירייה של היישוב', why: 'כי ענית שגרת ביישוב מזכה' });
  if (y('lifeIns') === 'yes') out.push({ key: 'lifeIns', tag: 'אישור ביטוח החיים', doc: 'אישור שנתי למס הכנסה מחברת הביטוח על ביטוח החיים', why: 'כי ענית ששילמת ביטוח חיים' });
  if (y('disability') === 'yes') out.push({ key: 'disability', tag: 'אישור אובדן כושר עבודה', doc: 'אישור שנתי למס הכנסה מחברת הביטוח על ביטוח אובדן כושר העבודה', why: 'כי ענית ששילמת ביטוח אובדן כושר עבודה פרטי' });
  if (y('donations') === 'yes') out.push({ key: 'donations', tag: 'קבלות על תרומות', doc: 'הקבלות על התרומות (סעיף 46)', why: 'כי ענית שתרמת' });
  if (y('institution') === 'yes') out.push({ key: 'institution', tag: 'קבלות מהמוסד', doc: 'הקבלות מהמוסד על התשלומים בשנה', why: 'כי ענית ששילמת על קרוב משפחה במוסד' });
  const rent = rentState(year);
  if (rent?.ok) out.push({ key: 'rent', tag: 'חוזה השכירות', doc: RENT_DOC, why: 'כי קיבלת שכר דירה על דירת מגורים' });
  if (rent?.ok && rent.taxable) out.push({ key: 'rentList', tag: 'רשימת שכר הדירה לפי חודשים', doc: RENT_LIST_DOC, why: 'כי שכר הדירה עבר את תקרת הפטור' });
  return out;
}
// מסמך נחשב קיים אם סימנו אותו ליד קובץ. אישור תושבות או אישור בנק שהאפליקציה זיהתה לבד נחשבים גם הם.
function attachHas(year, key) {
  if ((get(`years.${year}.extra.docs`) || []).some((d) => (d.tags || []).includes(key))) return true;
  if (key === 'residency') return (get(`years.${year}.self.docs`) || []).some((d) => d.type === 'residency');
  return false;
}
function attachMissing(year) { return attachNeeds(year).filter((a) => !attachHas(year, a.key)); }
const needsBank = () => get('me.prevRefund') !== 'yes';
function bankOk() {
  if ((get('extras.bank.docs') || []).some((d) => (d.tags || []).includes('bank'))) return true;
  return Object.values(state.years || {}).some((yr) => (yr?.self?.docs || []).some((d) => d.type === 'bankProof'));
}
const RENT_DOC = 'חוזה השכירות (שכתוב בו שהדירה משמשת למגורים בלבד), או הצהרה בכתב מהשוכרים שהדירה משמשת למגורים בלבד';
const RENT_LIST_DOC = 'רשימה של שכר הדירה שקיבלת בכל חודש בשנה (מהצ\'קים או מדפי הבנק)';

// ---------- חשבון מסחר בישראל (טופס 867) ----------
// הקבצים של כל החשבונות בשנה נשמרים במקום אחד (years.Y.sec), גם של בן/בת הזוג, כדי שחשבון משותף לא ייספר פעמיים.
const secYear = (year) => get('screen.securities') === 'yes' && (get('screen.secYears') || []).includes(year);
const HOWTO_867 = `<details class="howto" open><summary>איפה מוצאים את טופס 867</summary><ol>
  <li>נכנסים לאתר או לאפליקציה של הבנק או של בית ההשקעות (למשל IBI, מיטב, אקסלנס, או הבנק שבו יש תיק ניירות ערך).</li>
  <li>מחפשים "מסמכים", "דוחות שנתיים" או "אישורים למס", ושם את <b>"אישור ניכוי מס במקור"</b> או <b>"טופס 867"</b> לשנה הנכונה. בחלק מהמקומות הוא נקרא "דוח שנתי למס הכנסה".</li>
  <li>יש טופס נפרד לכל חשבון. הוא יוצא בדרך כלל בפברואר או במרץ של השנה שאחרי, ולשנים קודמות אפשר להוריד אותו מאותו מקום, או לבקש מהבנק.</li>
  <li>בטופס יש שני חלקים: "רווח הון מניירות ערך" (867 א+ב) ו"דיבידנד וריבית מניירות ערך" (867 ג). לפעמים הם באותו קובץ ולפעמים בשני קבצים. מעלים את שניהם.</li>
  <li>הדוח החודשי או הרבעוני שנשלח במייל הוא לא הטופס. צריך את האישור השנתי למס.</li></ol></details>`;
function secState(year) {
  const base = `years.${year}.sec`;
  const docs = get(`${base}.docs`) || [];
  const s = summarizeDocs(docs.filter((d) => d.type === 'form867'), year);
  const issues = [...s.issues];
  const others = docs.filter((d) => d.type !== 'form867');
  if (others.length) issues.push(`${others.map((d) => `"${d.fileName}"`).join(', ')}: זה לא נראה כמו טופס 867, ולכן לא נכלל. מסמכים אחרים מעלים במקום שלהם למעלה.`);
  const count = Number(get(`${base}.count`)) || 0;
  const need = [];
  if (s.accounts.length < count) need.push(`טופס 867 לשנת ${year}: הועלו ${s.accounts.length} מתוך ${count} חשבונות`);
  for (const a of s.accounts) {
    if (!a.ok) need.push(`לא הצלחנו לקרוא את הסכומים בטופס 867 של חשבון ${a.key}. נסו להוריד אותו שוב כ-PDF מהאתר (לא סריקה ולא צילום מסך)`);
    if (!a.partGains) need.push(`בחשבון ${a.key} חסר החלק "רווח הון מניירות ערך" (867 א+ב). אם הוא בקובץ נפרד, מעלים גם אותו`);
    if (!a.partDiv) need.push(`בחשבון ${a.key} חסר החלק "דיבידנד וריבית מניירות ערך" (867 ג). אם הוא בקובץ נפרד, מעלים גם אותו`);
  }
  const shares = s.accounts.filter((a) => a.partners.length > 1).map((a) => ({ a, path: `${base}.share.${a.key}` }));
  const shareOf = (a) => { const sh = shares.find((x) => x.a === a); return sh ? Number(get(sh.path)) / 100 : 1; };
  return { base, docs, accounts: s.accounts, issues, need, shares, shareOf, count, complete: need.length === 0 };
}
// כל החשבונות ביחד, לפי החלק של המגישים בכל חשבון. השיעורים נשארים כמו בטופס.
function capitalFrom(year, ignoreShares = false) {
  const st = secState(year);
  if (!st.accounts.length) return null;
  const cap = { gains: {}, dividends: {}, interest: {}, losses: 0, withheld: 0, foreignTax: 0, oilGains: 0, turnover: 0, gainsTax: 0, dividendTax: 0, interestTax: 0, nonOffsetLosses: 0, accounts: [] };
  const add = (to, from, k) => { for (const [r, v] of Object.entries(from || {})) to[r] = (to[r] || 0) + v * k; };
  for (const a of st.accounts) {
    const k = ignoreShares ? 1 : st.shareOf(a);
    if (!(k > 0)) continue;
    add(cap.gains, a.gains, k); add(cap.dividends, a.dividends, k); add(cap.interest, a.interest, k);
    cap.losses += a.losses * k; cap.foreignTax += a.foreignTax * k; cap.oilGains += a.oilGains * k; cap.turnover += a.turnover * k; cap.nonOffsetLosses += a.nonOffsetLosses * k;
    cap.gainsTax += a.gainsTax * k; cap.dividendTax += a.dividendTax * k; cap.interestTax += a.interestTax * k;
    cap.withheld += (a.gainsTax + a.dividendTax + a.interestTax - a.lossRefund) * k;
    cap.accounts.push({ key: a.key, share: k, sources: a.sources });
  }
  for (const o of [cap.gains, cap.dividends, cap.interest]) for (const r of Object.keys(o)) o[r] = Math.round(o[r]);
  for (const f of ['losses', 'foreignTax', 'oilGains', 'turnover', 'withheld', 'gainsTax', 'dividendTax', 'interestTax', 'nonOffsetLosses']) cap[f] = Math.round(cap[f]);
  return cap;
}
function renderSecurities(q, year) {
  const st = secState(year);
  const { base, docs } = st;
  let html = `<h3>חשבונות מסחר בניירות ערך ב-${year} (טופס 867)</h3>
    ${q.num(`${base}.count`, `בכמה חשבונות מסחר בישראל (שלך ושל בן/בת הזוג) מכרת ב-${year}, או קיבלת דיבידנד או ריבית?`, 'כל חשבון בבנק או בבית השקעות נספר בנפרד. חשבון משותף נספר פעם אחת.', { min: 1, max: 10 })}
    <p>על כל חשבון מעלים את טופס 867 של ${year}. האפליקציה קוראת ממנו את הרווח, ההפסד, הדיבידנד, הריבית והמס שכבר נוכה, ומכניסה אותם לחישוב ולמדריך.</p>
    ${HOWTO_867}
    <label class="drop"><input type="file" accept="application/pdf,.pdf" multiple data-upload="${base}" data-upyear="${year}">
      <b>בחירת קבצי טופס 867</b><span class="small muted">אפשר לבחור כמה קבצים ביחד</span></label>`;
  if (state.ui.reading === base) html += '<div class="notice info">קורא את הקבצים…</div>';
  if (docs.length) html += `<table class="files">${docs.map((d, i) => {
    const ok = d.type === 'form867' && (!d.year || d.year === year);
    const what = ok ? `טופס 867, ${d.year || year}${d.account ? `, חשבון ${d.account}` : ''}${d.partGains && d.partDiv ? '' : d.partGains ? ' (רווח הון)' : d.partDiv ? ' (דיבידנד וריבית)' : ''}` : d.type === 'error' ? 'לא הצלחנו לפתוח את הקובץ' : (DOC_TYPES[d.type] || 'לא זוהה');
    return `<tr><td>${ok ? '✓' : '⚠'}</td><td><bdi dir="ltr">${esc(d.fileName)}</bdi><div class="small muted">${esc(what)}</div></td><td class="actions"><button class="btn link" type="button" data-view="${base}|${i}">צפייה</button> <button class="btn link" type="button" data-rmdoc="${base}|${i}">הסרה</button></td></tr>`;
  }).join('')}</table>`;
  if (st.issues.length) html += `<div class="notice warn">${st.issues.map(esc).join('<br>')}</div>`;
  for (const { a, path } of st.shares) {
    html += q.num(path, `חשבון ${esc(a.key)} רשום על שם ${a.partners.length} אנשים. כמה אחוזים ממנו שייכים לך (ולבן/בת הזוג, אם אתם מגישים דו"ח משותף)?`, 'אם כל השותפים בחשבון הם את/ה ובן/בת הזוג ואתם מגישים דו"ח משותף, כותבים 100. אם יש שותף אחר (למשל הורה או אח), כותבים את החלק שלכם לפי ההסכם ביניכם, ובדרך כלל זה חלק שווה.', { min: 1, max: 100 });
  }
  if (st.accounts.length) {
    const pending = st.shares.some((x) => !answered(get(x.path)));
    const cap = capitalFrom(year, pending);
    const rates = (o) => Object.entries(o).filter(([, v]) => v).map(([r, v]) => `${fmt(v)} ₪ (${r}%)`).join(', ') || '0';
    html += `<table class="calc"><tr><td><b>מה מצאנו בטופסי 867</b>${st.shares.length ? `<div class="small muted">${pending ? 'הסכומים של כל החשבון. אחרי שתענה כמה אחוזים שייכים לך, נחשב רק את החלק שלך' : 'לפי החלק שלך בחשבונות המשותפים'}</div>` : ''}</td><td class="num"></td></tr>
      <tr><td>רווח הון</td><td class="num">${rates(cap.gains)}</td></tr>
      ${cap.losses ? `<tr><td>הפסד הון שאפשר לקזז</td><td class="num">${fmt(cap.losses)}</td></tr>` : ''}
      <tr><td>דיבידנד</td><td class="num">${rates(cap.dividends)}</td></tr>
      <tr><td>ריבית</td><td class="num">${rates(cap.interest)}</td></tr>
      <tr><td>מס שכבר נוכה במקור</td><td class="num">${fmt(cap.withheld)}</td></tr></table>`;
  }
  if (st.need.length) {
    html += `<div class="notice warn"><b>עוד חסר:</b><ul>${st.need.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`;
    html += q.choice(`${base}.partialOk`, 'אין לך עכשיו את כל טופסי ה-867?', [['yes', 'להמשיך בלי, ולקבל הערכה חלקית']],
      'נחשב רק לפי הטפסים שהועלו. בתוצאה תופיע כוכבית: החשבונות שחסרים יכולים לשנות את התוצאה לשני הכיוונים, ולכן לא מחליטים אם להגיש לפני שמשלימים.');
  }
  return html;
}

// yearOutBase: לפי תשובות מהמסך הראשון ומשלב 3. yearOut: כולל גם את התשובות בשלב "מסמכים נוספים".
function yearOutBase(year) {
  const y = `years.${year}`;
  if (get(`${y}.marital`) === 'separated') return 'נשואים שחיים בנפרד מגישים עם טופס 4440, וזה עוד לא נתמך. מומלץ רואה חשבון.';
  if (get('screen.otherIncome') === 'yes' && (get('screen.otherYears') || []).includes(year)) return 'ענית שבשנה הזו היו הכנסות מקריפטו, מברוקר בחו"ל, ממניות מהמעסיק, מחו"ל או משכירות של נכס שאינו דירת מגורים. את זה האפליקציה עוד לא יודעת לחשב. מומלץ רואה חשבון.';
  if (get('screen.rentTaxed') === 'yes' && (get('screen.rentTaxedYears') || []).includes(year)) return 'ענית ששילמת בשנה הזו מס על שכר דירה במסלול 10% או במסלול הרגיל. צריך לדווח בדו"ח על שכר הדירה ועל המס ששולם, וזה עוד לא נתמך באפליקציה. מומלץ רואה חשבון.';
  if (get('screen.severance') === 'yes' && (get('screen.sevYears') || []).includes(year)) return 'משיכת פיצויים או כספים מקופות דורשת חישוב של פטורים ופריסה, וזה עוד לא נתמך. מומלץ רואה חשבון.';
  return null;
}
function yearOut(year) {
  const base = yearOutBase(year);
  if (base) return base;
  const rent = rentState(year);
  if (rent?.out) return rent.out;
  if (get(`years.${year}.privatePension`) === 'yes') return 'הפקדה עצמאית לפנסיה עוד לא נתמכת. מומלץ רואה חשבון.';
  return null;
}

function yearTabs(ctx, renderFn) {
  const sel = get('screen.selectedYears') || [];
  let cur = state.ui.year;
  if (!sel.includes(cur)) cur = state.ui.year = sel[0];
  const done = (yr) => { const c = { req: [] }; renderFn(c, yr); return c.req.every((p) => answered(get(p))); };
  let html = `<div class="year-tabs">${sel.map((yr) => `<button type="button" data-year="${yr}" class="${yr === cur ? 'on' : ''} ${done(yr) ? 'done' : ''}">${yr}</button>`).join('')}</div>`;
  html += renderFn(ctx, cur);
  // לוודא שכל השנים מלאות, לא רק המוצגת
  for (const yr of sel) if (yr !== cur) { const c = { req: [] }; renderFn(c, yr); ctx.req.push(...c.req); }
  ctx.firstIncompleteYear = sel.find((yr) => !done(yr));
  return html;
}
function renderYears(ctx) {
  return `<h1>שנים ומסמכים</h1>
    <p class="muted">לכל שנה: המצב המשפחתי, ואז המסמכים מרשות המסים ומביטוח לאומי. אפשר לעבור בין השנים בכל רגע. הנתונים נשמרים רק בדפדפן הזה.</p>
    ${yearTabs(ctx, renderYear)}`;
}

// ---------- from answers to engine input ----------
function personFrom(base, gender, flags, year) {
  if (get(`${base}.mode`) !== 'manual') {
    const { s, btl, partial } = docsState(base, year);
    const employers = s.employers.map((e) => ({ name: e.name, income: e.income, taxWithheld: e.taxWithheld, pensionDeposit: e.pensionDeposit, insuredIncome: e.insuredIncome, employerPension: e.employerPension, settlementCode: e.settlementCode }));
    if (partial.adjust) employers.push(partial.adjust);
    return { gender, flags, employers, btl: btl.map((b) => ({ label: b.label, gross: b.gross, taxWithheld: b.taxWithheld, doc: b.doc })), credits: {}, settlement: { employerGave: employers.reduce((t, e) => t + (e.settlementCode || 0), 0) },
      blocks: partial.blocks, excluded: partial.excluded, filingDocs: partial.filingDocs };
  }
  const n = Number(get(`${base}.employersCount`)) || 0;
  const employers = [];
  for (let i = 0; i < n; i++) {
    const e = get(`${base}.employers.${i}`) || {};
    employers.push({ name: e.name, income: +e.income, taxWithheld: +e.taxWithheld, pensionDeposit: +e.pensionDeposit, settlementCode: +e.settlementCode });
  }
  const labels = { miluim: 'תגמולי מילואים', unemployment: 'דמי אבטלה', maternity: 'דמי לידה', injury: 'דמי פגיעה בעבודה' };
  const btl = [];
  if (get(`${base}.btlDirect`) === 'yes') {
    for (const k of Object.keys(labels)) {
      const t = get(`${base}.btl.${k}`) || {};
      if (t.received === 'yes') btl.push({ label: labels[k], gross: +t.gross, taxWithheld: t.hasCert === 'yes' ? +t.tax : null });
    }
  }
  return { gender, flags, employers, btl, credits: {}, settlement: { employerGave: employers.reduce((s, e) => s + (e.settlementCode || 0), 0) } };
}

// חיפוש יישוב בטבלה של השנה. מתעלמים מגרשיים, מרווחים כפולים ומסוגריים, כדי ש"נעמה" ימצא גם "נעמ"ה".
const normName = (s) => String(s || '').replace(/["'״׳*]/g, '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
function settlementFor(year, name) {
  if (!answered(name)) return null;
  const table = SETTLEMENTS[year];
  if (!table) return { msg: `עוד אין לנו את רשימת היישובים הרשמית לשנת ${year}, ולכן השנה הזו לא תחושב. אנחנו עובדים על זה.` };
  const key = Object.keys(table).find((n) => normName(n) === normName(name));
  if (!key) return { msg: `"${name}" לא מופיע ברשימת היישובים המוטבים של ${year}. בדקו את האיות (בחרו מהרשימה). אם הוא באמת לא ברשימה, אין הטבה לשנה הזו, וכדאי לענות "לא" בשאלה על יישוב מזכה.` };
  const row = table[key];
  if (row.unclear) return { name: key, msg: `לא הצלחנו לקרוא בוודאות את השיעור של ${key} ב-${year} מהמקור הרשמי, ולכן השנה הזו לא תחושב עד שנבדוק.` };
  if (row.complex) return { name: key, msg: `ב-${year} ההטבה של ${key} לא הייתה אחידה לכל השנה (${row.complex === true ? 'תנאים מיוחדים' : row.complex}). חישוב כזה עוד לא נתמך, ומומלץ להתייעץ עם רואה חשבון.` };
  if (row.from) return { name: key, msg: `ב-${year} השיעור של ${key} השתנה באמצע השנה (מ-${row.from.split('-').reverse().join('.')}). חישוב כזה עוד לא נתמך.` };
  return { name: key, row };
}

// חייל משוחרר: כמה חודשים בשנה הזו נמצאים בתוך 36 החודשים שמתחילים בחודש שאחרי השחרור.
function dischargedFor(year) {
  if (get('me.served') !== 'yes') return null;
  const level = get('me.serviceLength');
  if (level !== 'full' && level !== 'partial') return null;
  const sy = Number(get('me.dischargeYear')), dm = Number(get('me.dischargeMonth'));
  let months = 0;
  if (year > sy && year < sy + 3) months = 12;
  else if (year === sy || year === sy + 3) months = dm ? (year === sy ? 12 - dm : dm) : 0;
  if (!months) return null;
  return { level, months, unsupported: get('me.career') === 'yes' };
}

function caseFor(year) {
  const y = (k) => get(`years.${year}.${k}`);
  const ages = kidsYears().map((b) => year - b).filter((a) => a >= 0 && a <= 18);
  const kids = ages.length > 0;
  const kidsFlag = (forSpouse) => kids && {
    ages, notWithMe: get('me.kidsLiveWith') === 'no',
    column: get('me.allowance') ? ((get('me.allowance') === 'me') !== forSpouse ? 'mother' : 'father') : null,
  };
  const m = y('marital');
  const couple = m === 'married';
  const dy = Number(get('me.degreeYear'));
  const flags = {
    kids: kidsFlag(false),
    singleParent: kids && (m === 'widowed' || ((m === 'single' || m === 'divorced') && y('soleParent') === 'yes')),
    degree: get('me.degree') === 'yes' && get('me.degreeType') === 'ba' && get('me.degreeDefer') !== 'yes' && year === dy + 1,
    dischargedSoldier: dischargedFor(year),
    alimony: couple && y('alimonyEx') === 'yes',
    stop: [
      get('me.degree') === 'yes' && get('me.degreeType') && get('me.degreeType') !== 'ba' && (year === dy + 1 || year === dy + 2) && 'סיימת תואר שני, תואר ברפואה או תעודת מקצוע. נקודות הזיכוי על אלה תלויות בסוג הלימודים ובאפשרות לדחות אותן, ואת זה האפליקציה עוד לא מחשבת. מומלץ רואה חשבון לשנה הזו.',
      get('me.degree') === 'yes' && get('me.degreeType') === 'ba' && get('me.degreeDefer') === 'yes' && year >= dy + 1 && year <= dy + 3 && 'ביקשת לדחות את נקודת הזיכוי על התואר (למשל בגלל לימודי המשך). דחייה כזו האפליקציה עוד לא מחשבת. מומלץ רואה חשבון לשנה הזו.',
      kids && (m === 'single' || m === 'divorced') && y('soleParent') === 'no' && 'הורה גרוש או לא נשוי שיש לילדים הורה שני רשום מקבל נקודות זיכוי לפי כללים נוספים (משמורת, מזונות, מי מקבל את הקצבה), שעוד לא אימתנו. מומלץ רואה חשבון לשנה הזו.',
      (m === 'divorced' || m === 'single' || m === 'widowed') && y('alimony') === 'yes' && 'תשלום מזונות משנה את נקודות הזיכוי לפי מי מקבל אותם ולפי פסק הדין, ואת זה האפליקציה עוד לא מחשבת. מומלץ רואה חשבון לשנה הזו.',
    ].filter(Boolean),
    spousePoints: couple && y('spouseIncome') === 'no' && y('spouseSpecial') === 'yes',
  };
  const self = { role: 'self', ...personFrom(`years.${year}.self`, get('me.gender'), flags, year) };
  self.credits = {
    lifeInsurance: y('lifeIns') === 'yes' ? +y('lifeInsAmount') : 0,
    disabilityInsurance: y('disability') === 'yes' ? +y('disabilityAmount') : 0,
    donations: y('donations') === 'yes' ? +y('donationsAmount') : 0,
    institutionRelative: y('institution') === 'yes' ? +y('institutionAmount') : 0,
  };
  const lived = y('settlement') === 'yes' && y('settlement12') === 'yes' ? +y('settlementMonths') : 0;
  const st = lived ? settlementFor(year, y('settlementName')) : null;
  Object.assign(self.settlement, { livedMonths: lived, rate: st?.row?.rate || 0, ceiling: st?.row?.ceiling || 0, missing: st?.msg });
  const people = [self];
  if (couple && y('spouseIncome') === 'yes') {
    const sp = { role: 'spouse', ...personFrom(`years.${year}.spouse`, y('spouseGender'), { kids: kidsFlag(true) }, year) };
    Object.assign(sp.settlement, { livedMonths: lived, rate: self.settlement.rate, ceiling: self.settlement.ceiling, missing: self.settlement.missing });
    people.push(sp);
  }
  const rent = rentState(year);
  if (rent?.taxable) {
    const owner = rent.who === 'spouse' ? people.find((p) => p.role === 'spouse') : self;
    if (owner) owner.rent = { taxable: rent.taxable, age60: rent.age60 };
  }
  if (secYear(year)) {
    // את כל החשבונות שמים אצל המגיש: המס בשוק ההון בשיעור קבוע, ולכן לא משנה אצל מי מבני הזוג הוא נרשם.
    const cap = capitalFrom(year);
    if (cap) self.capital = cap;
    const st = secState(year);
    if (st.need.length) self.excluded = [...(self.excluded || []), { label: 'רווח, הפסד, דיבידנד, ריבית והמס שנוכה בחשבונות מסחר שעוד לא הועלה להם טופס 867 מלא', effect: 'either', doc: `טופס 867 לשנת ${year} מכל חשבון מסחר (הבנק או בית ההשקעות: "אישור ניכוי מס במקור")`, kind: 'doc' }];
  }
  // תשובות שהמדריך צריך כדי להגיד מה למלא בכל שדה (המנוע לא צריך אותן).
  const answers = {
    dischargeYear: get('me.dischargeYear'), dischargeMonth: get('me.dischargeMonth'), degreeYear: get('me.degreeYear'),
    settlementName: st?.name || y('settlementName'), rentExempt: !!rent?.ok && !rent.taxable, rentCeiling: rent?.ceiling?.value, rentTaxable: rent?.taxable || 0, rentWho: rent?.who, rentAge60: rent?.age60, rentMonthly: rent?.monthly,
    capital: self.capital || null, lifeIns: self.credits.lifeInsurance, disability: self.credits.disabilityInsurance, institution: self.credits.institutionRelative,
  };
  return { maritalStatus: m, people, answers, needsBankProof: get('me.prevRefund') !== 'yes', attachments: attachNeeds(year).filter((a) => a.key !== 'residency').map((a) => ({ doc: a.doc, why: a.why })) };
}

function resultFor(year) {
  const out = yearOut(year);
  if (out) return { year, status: 'out', blocks: [out], stops: [] };
  return computeYear(year, caseFor(year));
}

// ---------- step: results ----------
const STATUS_TEXT = {
  refund: ['מגיע לך החזר', 'מומלץ להגיש.'],
  debt: ['השנה הזו יוצאת בחוב', 'לא מומלץ להגיש לשנה הזו. הגשה פותחת את השנה ותיצור דרישת תשלום. שכיר שלא חייב בהגשת דו"ח לא צריך להגיש בקשת החזר לשנה שיוצאת בחוב.'],
  zero: ['אין הפרש', 'אין סיבה להגיש לשנה הזו.'],
  blocked: ['עוד אי אפשר לחשב את השנה הזו', ''],
  cpa: ['מומלץ להתייעץ עם רואה חשבון', ''],
  out: ['השנה מחוץ להיקף של האפליקציה', ''],
};

// כוכבית: מה לא נכלל בהערכה, ולאיזה כיוון זה יכול לשנות. ורשימת המסמכים שחסרים.
const star = (r) => (r.partial ? '<sup>*</sup>' : '');
function partialNotice(r) {
  let html = '';
  if (r.excluded?.length && r.status !== 'blocked') {
    const li = r.excluded.map((e) => `<li>${esc(e.label)}${e.effect === 'either' ? ' <b>(יכול לשנות לשני הכיוונים, גם לחוב)</b>' : ''}</li>`).join('');
    html += r.direction === 'either'
      ? `<div class="notice warn"><b>* הערכה חלקית, והתוצאה עוד יכולה להשתנות לשני הכיוונים.</b> לא נכללו בחישוב:<ul>${li}</ul>לא ניחשנו את מה שחסר. מה שמסומן "לשני הכיוונים" יכול גם להגדיל את ההחזר וגם להקטין אותו, ואפילו להפוך אותו לחוב. <b>לא מחליטים אם להגיש לפני שמשלימים את המסמכים.</b></div>`
      : `<div class="notice info"><b>* הערכה חלקית.</b> לא נכללו בחישוב:<ul>${li}</ul>לא ניחשנו את מה שחסר. כל אחד מהפריטים האלה יכול רק להגדיל את ההחזר (או להקטין את החוב), לכן התוצאה בפועל תהיה לפחות טובה כמו ההערכה.</div>`;
  }
  if (r.filingDocs?.length) html += `<div class="notice info"><b>לצרף בהגשה ל-${r.year}</b> (לא משנה את החישוב):<ul>${r.filingDocs.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></div>`;
  if (r.missingDocs?.length) html += `<div class="notice warn"><b>מסמכים שחסרים לנו ל-${r.year}:</b><ul>${r.missingDocs.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>${r.status === 'refund' ? `<button class="btn link" type="button" data-edit="${r.year}">להעלאת המסמכים ל-${r.year}</button>` : ''}</div>`;
  return html;
}
// שכר דירה מעל התקרה: כוכבית אדומה, וההסבר על הסיכון בהשמטה. לא חוסם את המעבר למדריך.
const rentTaxableOf = (r) => (r.results || []).reduce((t, p) => t + (p.lines?.rentTaxable || 0), 0);
const rentStar = (r) => (rentTaxableOf(r) ? '<sup class="red-star">*</sup>' : '');
function rentNotice(r) {
  const t = rentTaxableOf(r);
  if (!t) return '';
  return `<div class="notice bad"><b><span class="red-star">*</span> התוצאה כוללת מס על שכר הדירה.</b> שכר הדירה ב-${r.year} עבר את תקרת הפטור, ו-${fmt(t)} ₪ ממנו חייבים במס. בלי שכר הדירה ההחזר היה גבוה יותר, אבל בבקשה להחזר חותמים שכל ההכנסות דווחו: <b>השמטה של שכר הדירה היא הצהרה לא נכונה</b>. אם רשות המסים תגלה אותו, היא תפתח את השנה, תדרוש את המס עם הצמדה, ריבית וקנס, ויכולה לבטל את ההחזר. הצהרה לא נכונה בדו"ח היא גם עבירה לפי פקודת מס הכנסה. במדריך תמצא איפה מדווחים עליו (שדה 059) ומה מצרפים.</div>`;
}
function partialRec(r, rec) {
  if (!r.partial || r.status === 'blocked' || r.status === 'cpa') return rec;
  if (r.direction === 'either') return r.status === 'debt' ? `${rec} ההערכה חלקית, אז כדאי לבדוק שוב אחרי שמשלימים את המסמכים.` : 'כדאי להשלים את המסמכים לפני שמחליטים להגיש.';
  if (r.status === 'debt') return `${rec} הפריטים שלא נכללו יכולים להקטין את החוב, ואולי אפילו להפוך אותו להחזר. כדאי לבדוק שוב אחרי שמשיגים את המסמכים.`;
  if (r.status === 'refund' && r.missingDocs?.length) return 'מומלץ להגיש. כדאי קודם להשיג את המסמכים שחסרים, כדי שגם מה שלא נכלל ייכנס להחזר.';
  return rec;
}

function renderResults() {
  const sel = get('screen.selectedYears') || [];
  const rs = sel.map(resultFor);
  const tracked = state.ui.trackedResults || (state.ui.trackedResults = {});
  rs.forEach((r) => {
    const key = `${r.year}:${r.status}:${r.balance ?? ''}`;
    if (tracked[r.year] !== key) { track('year_result', { status: r.status, bucket: r.balance != null ? amountBucket(r.balance) : '-' }); tracked[r.year] = key; }
  });
  save();
  // בסכום הכולל: רק שנים שהתוצאה בהן יכולה רק לעלות. שנה שיכולה להשתנות לשני הכיוונים מוצגת בנפרד.
  const refunds = rs.filter((r) => r.status === 'refund' && r.direction !== 'either');
  const unsure = rs.filter((r) => r.status === 'refund' && r.direction === 'either');
  const total = refunds.reduce((s, r) => s + r.balance, 0);
  const totalIdx = refunds.reduce((s, r) => s + (r.indexation || 0), 0);
  const anyPartial = refunds.some((r) => r.partial);
  let html = `<h1>התוצאה</h1>`;
  if (refunds.length) html += `<div class="card result refund"><div class="muted">סה"כ צפוי לחזור אליך ${refunds.length === 1 ? 'בשנה אחת' : `ב-${refunds.length} שנים`}, כולל הצמדה וריבית</div><div class="amount">${anyPartial ? 'לפחות ' : 'כ-'}${fmt(total + totalIdx)} ₪${anyPartial ? '<sup>*</sup>' : ''}${refunds.some(rentTaxableOf) ? '<sup class="red-star">*</sup>' : ''}</div>${refunds.some(rentTaxableOf) ? `<div class="small"><span class="red-star">*</span> כולל מס על שכר דירה מעל התקרה ב-${refunds.filter(rentTaxableOf).map((r) => r.year).join(', ')}. ההסבר בשנה עצמה למטה.</div>` : ''}<div>החזר מס ${fmt(total)} ₪ + הצמדה וריבית כ-${fmt(totalIdx)} ₪ (הערכה עד היום. הסכום ממשיך לגדול עד יום התשלום)</div>${anyPartial ? `<div class="small">* הערכה חלקית ל-${refunds.filter((r) => r.partial).map((r) => r.year).join(', ')}: חלק מהנתונים חסרים ולא נכללו. הפירוט וההסבר בכל שנה למטה.</div>` : ''}${unsure.length ? `<div class="small">לא כולל את ${unsure.map((r) => r.year).join(', ')}, כי שם התוצאה עוד יכולה להשתנות לשני הכיוונים.</div>` : ''}</div>`;
  const forGuide = rs.filter(guideable);
  if (forGuide.length) html += `<div class="card"><h2 style="margin-top:0">המסמך המסכם להגשה</h2><p>כל מה שצריך כדי להגיש: אילו מסמכים להכין, איך נכנסים לאתר של רשות המסים, ואיזה ערך לכתוב בכל שדה. השנים במסמך: ${forGuide.map((r) => r.year).join(', ')}.${forGuide.some((r) => r.status === 'blocked') ? ' בשנה שלא חושבה, בודקים את התוצאה בכפתור "חישוב" באתר לפני שמשדרים.' : ''}${forGuide.some((r) => ['zero', 'debt', 'cpa'].includes(r.status)) ? ' גם שנה שלא יוצא בה החזר נמצאת במסמך, כדי שתוכל להחליט בעצמך.' : ''} אפשר להוריד אותו כ-PDF או להדפיס.</p><button class="btn" type="button" data-guide="all">פתיחת המסמך המסכם</button></div>`;
  if (!forGuide.length) html += `<div class="card"><h2 style="margin-top:0">המסמך המסכם להגשה</h2><p>המסמך מסביר שלב-אחר-שלב מה לכתוב בכל שדה באתר של רשות המסים. הוא נוצר לכל שנה שכל המסמכים שלה הועלו. ${rs.some((r) => r.status === 'blocked' || r.missingDocs?.length) ? 'עוד חסרים מסמכים (הרשימה מופיעה בכל שנה למטה). אחרי שתעלה אותם בשלב "שנים ומסמכים", המסמך ייווצר.</p><button class="btn secondary" type="button" data-go="years">להשלמת המסמכים</button>' : 'כרגע אין שנה שכדאי להגיש לה.</p>'}</div>`;
  html += '<div class="row"><button class="btn secondary" type="button" data-go="years">חזרה לתיקון התשובות</button></div>';
  html += '<p class="muted small">החישוב לפי מה שמסרת. לפני כל הגשה תלחצו על "חישוב" באתר רשות המסים ותשוו למספרים כאן.</p>';
  for (const r of rs) {
    const [title, baseRec] = STATUS_TEXT[r.status];
    const rec = partialRec(r, baseRec);
    html += `<div class="card result ${r.status}"><h2 style="margin-top:0">${r.year}: ${title}${r.partial && r.status !== 'blocked' ? ' (הערכה חלקית)' : ''}</h2>`;
    if (r.balance != null && r.status !== 'blocked') {
      if (r.indexation) {
        html += `<div class="amount">${r.partial ? 'לפחות ' : 'כ-'}${fmt(r.balance + r.indexation)} ₪${star(r)}${rentStar(r)}</div>`;
        html += `<div>החזר מס ${fmt(r.balance)} ₪ + הצמדה וריבית כ-${fmt(r.indexation)} ₪ (הערכה עד היום. הסכום ממשיך לגדול עד יום התשלום)</div>`;
      } else html += `<div class="amount">${r.balance < 0 ? '−' : ''}${fmt(Math.abs(r.balance))} ₪${star(r)}${rentStar(r)}</div>`;
      const L = (k) => r.results.reduce((s, p) => s + p.lines[k], 0);
      html += `<table class="calc">
        <tr><td>סה"כ הכנסות<div class="muted small">משכורת ותשלומי ביטוח לאומי${L('rentTaxable') ? ', ושכר הדירה החייב במס' : ''}</div></td><td class="num">${fmt(L('totalIncome'))}</td></tr>
        ${L('rentTaxable') ? `<tr><td><span class="red-star">*</span> מתוכן: שכר דירה מעל התקרה (שדה 059)<div class="muted small">החלק של שכר הדירה שחייב במס. המס עליו ${fmt(L('rentTax'))} ₪, ${caseFor(r.year).answers.rentAge60 ? 'לפי המדרגות, כי מלאו 60' : 'בשיעור של לפחות 31%, כי זו הכנסה שלא מעבודה'}</div></td><td class="num">${fmt(L('rentTaxable'))}</td></tr>` : ''}
        <tr><td>מס ברוטו<div class="muted small">לפי מדרגות המס של ${r.year}${L('rentTax') ? ', כולל המס על שכר הדירה' : ''}</div></td><td class="num">${fmt(L('grossTax'))}</td></tr>
        <tr><td>נקודות זיכוי<div class="muted small">${r.results.map((p) => p.lines.points).join(' + ')} נקודות × ערך נקודה בשנת ${r.year}. זיכוי מוריד מהמס, לא מההכנסה</div></td><td class="num">−${fmt(L('pointsCredit'))}</td></tr>
        ${L('pensionCredit') ? `<tr><td>זיכוי על הפקדות לפנסיה<div class="muted small">35% מההפקדות שלך (שדות 045/086 בטופס 106), עד 7% מההכנסה המזכה. ההכנסה המזכה מוגבלת לתקרה של השנה</div></td><td class="num">−${fmt(L('pensionCredit'))}</td></tr>` : ''}
        ${L('settlementCredit') ? `<tr><td>הטבת יישוב מזכה<div class="muted small">אחוז ההנחה של היישוב × ההכנסה, עד התקרה, לפי מספר החודשים שגרת שם</div></td><td class="num">−${fmt(L('settlementCredit'))}</td></tr>` : ''}
        ${L('capitalIncome') || L('capitalTax') ? `<tr><td>מס על שוק ההון<div class="muted small">רווח הון, דיבידנד וריבית מטופסי 867 (${fmt(L('capitalIncome'))} ₪ אחרי קיזוז הפסדים), לפי השיעור שכתוב בטופס</div></td><td class="num">${fmt(L('capitalTax'))}</td></tr>` : ''}
        <tr><td>מס שהיה צריך לשלם</td><td class="num">${fmt(L('taxDue'))}</td></tr>
        <tr><td>מס שנוכה בפועל<div class="muted small">מכל טופסי ה-106 ואישורי ביטוח לאומי${L('capitalWithheld') ? `, ועוד ${fmt(L('capitalWithheld'))} ₪ מטופסי 867` : ''}</div></td><td class="num">${fmt(L('withheld'))}</td></tr>
      </table>`;
      if (r.reasons?.length) html += `<p><b>למה?</b> ${r.reasons.join(' ')}</p>`;
      if (L('settlementCredit')) {
        const c = caseFor(r.year);
        c.people.forEach((p) => { p.settlement = { ...p.settlement, livedMonths: 0, rate: 0, ceiling: 0, missing: null }; });
        const alt = computeYear(r.year, c);
        if (alt.balance != null) html += `<div class="notice warn"><b>התוצאה תלויה בהטבת היישוב (${fmt(L('settlementCredit'))} ₪).</b> בלי ההטבה: ${alt.balance >= 0 ? `החזר של ${fmt(alt.balance)} ₪` : `<b>חוב של ${fmt(-alt.balance)} ₪</b>`}. ההטבה מגיעה רק למי שגר ביישוב בפועל (שם ישן, שם מרכז החיים), לא למי שרק רשום שם. רשות המסים בודקת את זה, ואם לא גרת שם, ענה "לא" בשאלה על היישוב.</div>`;
      }
    }
    if (rec) html += `<p>${rec}</p>`;
    html += rentNotice(r);
    html += partialNotice(r);
    if (r.stops?.length) html += `<div class="notice warn">${r.stops.join('<br>')}</div>`;
    if (r.status === 'blocked') html += `<div class="notice warn">${r.blocks.map(esc).join('<br>')}</div><p class="small muted">כשחסר מסמך, אפשר להשלים אותו ולחזור. כשהכלל עוד לא אומת אצלנו, נעדכן את האפליקציה בקרוב. לא נחשב שום דבר שלא בדקנו מול מקור רשמי.</p>`;
    if (r.status === 'out') html += `<div class="notice warn">${esc(r.blocks[0])}</div>`;
    if (r.status !== 'refund') html += `<button class="btn link" type="button" data-edit="${r.year}">תיקון התשובות ל-${r.year}</button>`;
    if (guideable(r)) html += `<p class="small muted">מועד אחרון להגשה: ${deadline(r.year)}</p><button class="btn${r.status === 'refund' ? '' : ' secondary'}" data-guide="${r.year}" type="button">${r.status === 'refund' ? `מדריך הגשה ל-${r.year}` : r.status === 'blocked' ? `מדריך מילוי ל-${r.year} (בלי תוצאה)` : `מדריך מילוי ל-${r.year}, אם בכל זאת תרצה להגיש`}</button>`;
    html += '</div>';
  }
  return html;
}

// ---------- step: guide (המסמך המסכם) ----------
// שנה שאי אפשר לחשב רק בגלל כלל שעוד לא אומת אצלנו, אבל כל המסמכים שלה הועלו: אפשר לתת מדריך מילוי,
// כי השדות ב-1301 מגיעים מהמסמכים ומהתשובות. את התוצאה בודקים בכפתור "חישוב" באתר, לפני השידור.
function docsCompleteFor(year) {
  const c = caseFor(year);
  return c.people.every((p) => get(`years.${year}.${p.role}.mode`) === 'manual' || docsState(`years.${year}.${p.role}`, year).complete)
    && !resultFor(year).blocks.some((b) => /חסר|מסמך|אישור/.test(b))
    && !(resultFor(year).excluded || []).some((e) => e.kind === 'doc');
}
// מחשבים כאן מהקבצים עצמם (ולא מסימון שנשמר במסך המסמכים), כדי שגם אחרי רענון הדף המדריך ייפתח.
// מדריך מילוי רק כשכל המסמכים הועלו: השדות במדריך מגיעים מהמסמכים, ובלעדיהם הם לא נכונים.
const guideable = (r) => ['refund', 'zero', 'debt', 'cpa', 'blocked'].includes(r.status) && docsCompleteFor(r.year);

// בטבלה מוצגים רק השדות שממלאים או מסמנים. סעיף שאין בו כלום כזה מקבל שורה אחת "אין מה למלא",
// כדי שהמשתמש ידע שלא דילג על משהו. הרשימה המלאה (כולל מה שלא נוגעים בו ולמה) מקופלת למטה.
function fieldRow(f) {
  const quiet = f.kind === 'skip' || f.kind === 'auto';
  const copy = (f.kind || 'fill') === 'fill' && (/^[\d,]+$/.test(f.value) || f.field === 'שמות המעבידים')
    ? `<button class="copy" type="button" data-copy="${esc(String(f.value).replace(/,/g, ''))}">העתקה</button>` : '';
  return `<tr class="${f.kind || 'fill'}"><td>${quiet ? esc(f.field) : `<b>${esc(f.field)}</b>`}<div class="src">${quiet ? '' : 'מקור: '}${esc(f.source)}</div></td><td>${quiet ? esc(f.value) : `<b>${esc(f.value)}</b>`}</td><td class="noprint">${copy}</td></tr>`;
}
function fieldsTable(fields) {
  const act = (f) => !f.kind || f.kind === 'fill' || f.kind === 'mark';
  const groups = [];
  for (const f of fields) {
    if (f.kind === 'section' || !groups.length) groups.push({ title: f.kind === 'section' ? f.field : null, rows: [] });
    if (f.kind !== 'section') groups.at(-1).rows.push(f);
  }
  const n = fields.filter(act).length;
  if (!fields.some((f) => f.kind)) return `<table class="fields">${fields.map(fieldRow).join('')}</table>`;
  let html = `<p class="small">בלשונית הזו ממלאים או מסמנים <b>${n}</b> ${n === 1 ? 'שורה' : 'שורות'}. כל השאר נשאר כמו שהוא.</p><table class="fields">`;
  for (const g of groups) {
    const rows = g.rows.filter(act);
    if (g.title) html += `<tr class="sec"><td colspan="3">${esc(g.title)}</td></tr>`;
    if (rows.length) html += rows.map(fieldRow).join('');
    else if (g.title) html += '<tr class="skip"><td colspan="3">אין מה למלא בסעיף הזה. משאירים אותו כמו שהוא.</td></tr>';
  }
  html += '</table>';
  if (fields.some((f) => !act(f) && f.kind !== 'section')) {
    html += `<details class="noprint small"><summary>להציג את כל השדות בלשונית, כולל מה שלא נוגעים בו ולמה</summary><table class="fields">${fields.map((f) => f.kind === 'section' ? `<tr class="sec"><td colspan="3">${esc(f.field)}</td></tr>` : fieldRow(f)).join('')}</table></details>`;
  }
  return html;
}

function guideTabs(year) {
  const r = resultFor(year);
  const g = buildGuide(year, caseFor(year), r.balance != null && r.status !== 'blocked' ? r : null);
  let html = '';
  g.tabs.forEach((t, i) => {
    html += `<div class="card"><h3 style="margin-top:0">${i + 1}. ${t.title}</h3>`;
    if (t.steps) html += `<ol>${t.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`;
    if (t.fields.length) html += fieldsTable(t.fields);
    if (t.note) html += `<p class="small muted">${esc(t.note)}</p>`;
    html += '</div>';
  });
  return { html, r };
}

function renderGuide() {
  const sel = get('screen.selectedYears') || [];
  const one = state.ui.guideYear !== 'all' && Number(state.ui.guideYear);
  const years = one ? [one] : sel.filter((y) => guideable(resultFor(y)));
  const all = years.map((y) => resultFor(y));
  const rs = all.filter((r) => r.status === 'refund');
  const unknown = all.filter((r) => r.status === 'blocked');
  const other = all.filter((r) => !['refund', 'blocked'].includes(r.status));
  const total = rs.reduce((t, r) => t + r.balance, 0);
  const today = new Date().toLocaleDateString('he-IL');
  let html = `<div class="row noprint"><button class="btn" type="button" id="printBtn">הורדה כ-PDF / הדפסה</button><button class="btn link" type="button" data-go="results">חזרה לתוצאות</button></div>
    <h1>${one ? `מדריך הגשה ל-${one}` : 'המסמך המסכם להגשת החזר מס'}</h1>
    <p class="muted small">הופק ב"מגיע לי" בתאריך ${today}, לפי התשובות והמסמכים שהעלית. זה לא ייעוץ מס. לפני כל הגשה לוחצים "חישוב" באתר רשות המסים ומשווים.</p>
    <div class="card"><h2 style="margin-top:0">סיכום</h2><table class="calc">
      ${rs.map((r) => `<tr><td>${r.year}<div class="muted small">מועד אחרון להגשה: ${deadline(r.year)}${r.partial ? '. * הערכה חלקית, ראו בפרק של השנה' : ''}</div></td><td class="num">${fmt(r.balance)} ₪${star(r)}</td></tr>`).join('')}
      ${other.map((r) => `<tr><td>${r.year}<div class="muted small">${r.balance < 0 ? 'לא מומלץ להגיש' : r.balance === 0 ? 'אין הפרש' : 'מומלץ רואה חשבון'}</div></td><td class="num">${r.balance < 0 ? `חוב ${fmt(-r.balance)} ₪` : `${fmt(r.balance)} ₪`}</td></tr>`).join('')}
      ${unknown.map((r) => `<tr><td>${r.year}<div class="muted small">מועד אחרון להגשה: ${deadline(r.year)}</div></td><td class="num">לא חושב</td></tr>`).join('')}
      ${rs.length > 1 ? `<tr><td><b>סה"כ</b><div class="muted small">ועוד כ-${fmt(rs.reduce((t, r) => t + (r.indexation || 0), 0))} ₪ הצמדה וריבית (הערכה)</div></td><td class="num"><b>${fmt(total)} ₪</b></td></tr>` : ''}
    </table>${unknown.length ? `<div class="notice warn"><b>${unknown.map((r) => r.year).join(', ')}: את התוצאה עוד לא חישבנו</b>, כי חסר לנו כלל שעוד לא אימתנו (${esc([...new Set(unknown.flatMap((r) => r.blocks))].join('; '))}). השדות במדריך נכונים, כי הם מגיעים מהמסמכים ומהתשובות שלך. לפני השידור לוחצים "חישוב" באתר: <b>אם יוצא "מס ששולם ביתר", משדרים. אם יוצאת "יתרת חוב", לא משדרים</b>, כי בקשת החזר לא מחייבת להגיש, והגשה הייתה יוצרת חוב.</div>` : ''}${other.length ? `<div class="notice warn"><b>${other.map((r) => r.year).join(', ')}: לפי החישוב לא יוצא החזר.</b> המדריך כאן למקרה שבכל זאת תרצה להגיש. לפני השידור לוחצים "חישוב" באתר: <b>אם יוצאת "יתרת חוב", לא משדרים</b>, כי הגשה הייתה יוצרת דרישת תשלום.</div>` : ''}</div>
    <div class="card"><h2 style="margin-top:0">לפני שמתחילים</h2><ul>
      <li>כמה זמן: בערך 40 דקות רצופות לכל שנה. המערכת מנתקת אחרי זמן, אז לוחצים "שמירה" אחרי כל לשונית.</li>
      <li>כניסה: <a href="https://www.gov.il/he/service/itc135" target="_blank" rel="noopener">השירות "הגשת דו"ח שנתי / בקשה להחזר מס" באתר רשות המסים</a>. מזדהים עם תעודת זהות, קוד משתמש וקוד חד-פעמי.</li>
      <li>מגישים כל שנה בנפרד, לפי הסדר במסמך הזה. כל שנה היא דו"ח משלה.</li>
      <li>את הקבצים שצריך לצרף לכל שנה תמצאו בסוף הפרק של אותה שנה. אפשר להוריד אותם מהאפליקציה בשם ברור (בשלב "שנים ומסמכים").</li></ul></div>`;
  for (const y of years) {
    const ry = resultFor(y);
    const gNote = ry.partial && ry.status !== 'blocked' ? `<div class="notice warn"><b>* לא נכלל בחישוב ובמדריך:</b><ul>${ry.excluded.map((e) => `<li>${esc(e.label)}${e.doc ? `. צריך: ${esc(e.doc)}` : ''}</li>`).join('')}</ul>את הסעיפים האלה האפליקציה עוד לא מכסה. אם תמלא אותם באתר לפי המסמך, ההחזר שיופיע ב"חישוב" באתר יהיה גבוה יותר מכאן, וזה בסדר.</div>` : '';
    html += `<section class="guide-year"><h2>שנת ${y}: ${ry.status === 'refund' ? `${fmt(ry.balance)} ₪${star(ry)}${rentStar(ry)}` : ry.status === 'blocked' ? 'התוצאה לא חושבה, בודקים ב"חישוב" באתר' : ry.balance < 0 ? `חוב ${fmt(-ry.balance)} ₪, לא מומלץ להגיש` : `${fmt(ry.balance)} ₪`}</h2>${gNote}${rentNotice(ry)}${guideTabs(y).html}</section>`;
  }
  html += `<section class="guide-year"><h2>אחרי ההגשה</h2>${afterBody()}</section>`;
  html += '<div class="row noprint"><button class="btn" type="button" data-go="after">הגשתי, מה עכשיו?</button> <button class="btn link" type="button" data-go="results">חזרה לתוצאות</button></div>';
  return html;
}

function afterBody() {
  return `<div class="card"><h3 style="margin-top:0">לשמור</h3><ul>
    <li>PDF של מסך "אישור הגשת הדו"ח" (תיק + שנה + גרסה = המזהה של ההגשה)</li>
    <li>PDF של נתוני הדיווח</li>
    <li>את כל המסמכים שצירפת, וקבלות תרומה אם יש</li></ul></div>
  <div class="card"><h3 style="margin-top:0">לעקוב</h3>
    <p>במסך הכניסה של 1301: מספר תיק + שנה, ואז "בדיקת מצב שידור דו"ח שנתי ליחיד". כשההחזר מאושר תופיע "הודעת שומה" עם הסכום. כדאי לבדוק כל 2–3 שבועות.</p>
    <p>אם פקיד השומה מבקש מסמך: מעלים אותו דרך "הוספת מסמכים לאחר הגשת הדו"ח".</p></div>`;
}

function renderAfter() {
  return `<h1>אחרי ההגשה</h1>
  ${afterBody()}
  <div class="card"><p>עזרנו? ספרו לחברים שכירים. רוב האנשים לא יודעים שמגיע להם.</p>
    <button class="btn" type="button" id="filedBtn">${state.ui.filed ? 'תודה! נרשם ✓' : 'סמנו שהגשתם (אנונימי)'}</button></div>
  <button class="btn link" type="button" data-go="results">חזרה לתוצאות</button>`;
}

// ---------- render loop ----------
function render(showMissing = false) {
  const focusPath = document.activeElement?.dataset?.path;
  const ctx = { req: [], showMissing };
  const step = state.step;
  const idx = STEPS.indexOf(step);
  let body = '';
  if (step === 'screen') body = renderScreen(ctx);
  else if (step === 'me') body = renderMe(ctx);
  else if (step === 'years') body = renderYears(ctx);
  else if (step === 'extras') body = renderExtras(ctx);
  else if (step === 'results') body = renderResults();
  else if (step === 'guide') body = renderGuide();
  else body = renderAfter();
  const nav = idx <= 3
    ? `<div class="row" style="margin-top:20px">${idx > 0 ? '<button class="btn secondary" type="button" data-nav="back">חזרה</button>' : '<a class="btn secondary" href="./">חזרה</a>'}<span class="spacer"></span><button class="btn" type="button" data-nav="next" ${ctx.blocked ? 'disabled' : ''}>${idx === 3 ? 'לתוצאה' : 'המשך'}</button></div>`
    : '';
  app.innerHTML = `<div class="brand"><a href="./" style="text-decoration:none">מגיע לי</a></div>
    <div class="progress">${STEPS.slice(0, 5).map((s, i) => `<span class="${i <= Math.min(idx, 4) ? 'on' : ''}" title="${STEP_NAMES[s]}"></span>`).join('')}</div>
    ${body}${nav}
    <footer>התשובות והקבצים שהעלית נשמרים רק במחשב הזה, כדי שתוכל לסגור את הדף ולהמשיך אחר כך. הן לא נשלחות לשום מקום. <button class="btn link" type="button" id="wipe">מחיקת התשובות שלי מהמחשב הזה</button> (למשל אם זה מחשב משותף, או כדי להתחיל מחדש)</footer>`;
  app._ctx = ctx;
  if (focusPath) document.querySelector(`[data-path="${CSS.escape(focusPath)}"]`)?.focus();
}

// צפייה בקובץ בתוך האפליקציה, בחלון מעל הדף.
async function showViewer(name, blob, url) {
  const box = document.createElement('div');
  box.className = 'viewer';
  box.innerHTML = `<div class="viewer-bar"><bdi dir="ltr">${esc(name)}</bdi><span class="spacer"></span><a class="btn link" href="${url}" target="_blank" rel="noopener">פתיחה בחלון חדש</a><button class="btn secondary" type="button" data-close>סגירה</button></div><div class="viewer-pages"><p class="muted">טוען…</p></div>`;
  document.body.appendChild(box);
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('[data-close]')) close(); });
  const pages = box.querySelector('.viewer-pages');
  try { pages.innerHTML = ''; await renderPdf(blob, pages); } catch { pages.innerHTML = '<p>לא הצלחנו להציג את הקובץ כאן. אפשר לפתוח אותו בחלון חדש.</p>'; }
}

// קריאת הקבצים בדפדפן. נשמרים רק סוג המסמך, השנה, המעסיק והמספרים. לא הטקסט, ולא מספר הזהות המלא.
async function readFiles(base, files) {
  if (!files.length) return;
  state.ui.reading = base; render();
  const docs = get(`${base}.docs`) || [];
  for (const f of files) {
    let d;
    try { d = /^image\//.test(f.type) ? { type: 'image' } : parseDocument(await pdfLines(f)); } catch { d = { type: 'error' }; }
    d.fileName = f.name;
    if (base.endsWith('.extra') && d.type === 'residency') d.tags = ['residency'];
    if (base === 'extras.bank' && d.type === 'bankProof') d.tags = ['bank'];
    await putFile(`${base}|${f.name}`, f);
    const i = docs.findIndex((x) => x.fileName === f.name);
    if (i >= 0) docs[i] = d; else docs.push(d);
    track('doc_read', { status: d.type });
  }
  set(`${base}.docs`, docs); set(`${base}.docsConfirmed`, '');
  state.ui.reading = null; save(); render();
}

// מעבר להקלדה ידנית: מתחילים מהמספרים שנקראו מהקבצים, כדי לתקן ולא להקליד הכול מחדש.
function prefillManual(base) {
  const year = Number(base.split('.')[1]);
  const { s, btl } = docsState(base, year);
  if (!s.employers.length && !btl.length) return;
  set(`${base}.employersCount`, s.employers.length);
  s.employers.forEach((e, i) => set(`${base}.employers.${i}`, { name: e.name, income: e.income ?? '', taxWithheld: e.taxWithheld, pensionDeposit: e.pensionDeposit, settlementCode: e.settlementCode }));
  set(`${base}.btlDirect`, btl.length ? 'yes' : 'no');
  for (const b of btl) if (BTL_LABELS[b.kind]) set(`${base}.btl.${b.kind}`, { received: 'yes', gross: b.gross, hasCert: b.taxWithheld == null ? 'no' : 'yes', tax: b.taxWithheld ?? '' });
}

function go(step) {
  state.step = step; save();
  track('step', { step });
  render();
  scrollTo(0, 0);
}

app.addEventListener('change', async (ev) => {
  const el = ev.target;
  if (el.dataset.upload) return readFiles(el.dataset.upload, [...el.files]);
  if (el.dataset.tag) {
    const [base, i, key] = el.dataset.tag.split('|');
    const docs = get(`${base}.docs`) || [];
    const d = docs[Number(i)];
    if (d) { const t = new Set(d.tags || []); el.checked ? t.add(key) : t.delete(key); d.tags = [...t]; }
    set(`${base}.docs`, docs); save(); render(); return;
  }
  const prevSig = app._ctx?.outSig;
  if (el.dataset.years) {
    const y = Number(el.dataset.years), path = el.dataset.yearlist || 'screen.selectedYears';
    const sel = new Set(get(path) || []);
    el.checked ? sel.add(y) : sel.delete(y);
    set(path, [...sel].sort());
  } else if (el.dataset.path) {
    set(el.dataset.path, el.dataset.num ? (el.value === '' ? '' : Number(el.value)) : el.value);
  } else return;
  save();
  render();
  // תשובה שהאפליקציה לא תומכת בה: גוללים להודעה שמסבירה למה.
  const sig = app._ctx?.outSig;
  if (state.step === 'screen' && sig && sig !== '#' && sig !== prevSig) document.getElementById('outNotice')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

app.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button');
  if (!t) return;
  if (t.dataset.residency) {
    const [base, i] = t.dataset.residency.split('|');
    const docs = get(`${base}.docs`) || [];
    if (docs[Number(i)]) docs[Number(i)] = { ...docs[Number(i)], type: 'residency', taggedByUser: true };
    set(`${base}.docs`, docs); save(); render(); return;
  }
  if (t.dataset.attach) {
    const [base, i, key] = t.dataset.attach.split('|');
    const docs = get(`${base}.docs`) || [];
    if (docs[Number(i)]) docs[Number(i)] = { ...docs[Number(i)], type: 'attach', attachKey: key, taggedByUser: true };
    set(`${base}.docs`, docs); save(); render(); return;
  }
  if (t.dataset.bank) {
    const [base, i] = t.dataset.bank.split('|');
    const docs = get(`${base}.docs`) || [];
    if (docs[Number(i)]) docs[Number(i)] = { ...docs[Number(i)], type: 'bankProof', taggedByUser: true };
    set(`${base}.docs`, docs); save(); render(); return;
  }
  if (t.dataset.rmdoc) {
    const [base, i] = t.dataset.rmdoc.split('|');
    const docs = get(`${base}.docs`) || [];
    const [gone] = docs.splice(Number(i), 1);
    if (gone) delFile(`${base}|${gone.fileName}`);
    set(`${base}.docs`, docs); set(`${base}.docsConfirmed`, ''); save(); render(); return;
  }
  if (t.dataset.view || t.dataset.saveas) {
    const [base, i] = (t.dataset.view || t.dataset.saveas).split('|');
    const d = (get(`${base}.docs`) || [])[Number(i)];
    if (!d) return;
    const blob = await getFile(`${base}|${d.fileName}`);
    if (!blob) { alert('הקובץ לא נשמר בדפדפן הזה (למשל אחרי מחיקה או בגלישה פרטית). אפשר להעלות אותו שוב.'); return; }
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    if (t.dataset.view) showViewer(d.fileName, blob, url);
    else {
      const year = Number(base.split('.')[1]);
      const a = Object.assign(document.createElement('a'), { href: url, download: suggestName(d, year, base.endsWith('.spouse') ? 'spouse' : 'self') });
      document.body.appendChild(a); a.click(); a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  if (t.dataset.mode) {
    const [base, mode] = t.dataset.mode.split('|');
    if (mode === 'manual' && get(`${base}.mode`) !== 'manual') prefillManual(base);
    set(`${base}.mode`, mode); set(`${base}.docsConfirmed`, ''); save(); render(); return;
  }
  if (t.dataset.year) { state.ui.year = Number(t.dataset.year); save(); render(); return; }
  if (t.dataset.nav === 'back') return go(STEPS[STEPS.indexOf(state.step) - 1]);
  if (t.dataset.nav === 'next') {
    const ctx = app._ctx;
    const missing = ctx.req.filter((p) => /Years$/.test(p) ? !(get(p) || []).length : !answered(get(p)));
    if (missing.length) {
      if (['years', 'extras'].includes(state.step) && ctx.firstIncompleteYear && ctx.firstIncompleteYear !== state.ui.year) state.ui.year = ctx.firstIncompleteYear;
      render(true);
      document.querySelector('.q.missing')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    return go(STEPS[STEPS.indexOf(state.step) + 1]);
  }
  if (t.dataset.edit) { state.ui.year = Number(t.dataset.edit); return go('years'); }
  if (t.id === 'printBtn') { track('guide_print'); window.print(); return; }
  if (t.dataset.guide) { state.ui.guideYear = t.dataset.guide === 'all' ? 'all' : Number(t.dataset.guide); track('guide_open'); return go('guide'); }
  if (t.dataset.go) return go(t.dataset.go);
  if (t.dataset.copy !== undefined) {
    try { await navigator.clipboard.writeText(t.dataset.copy); t.textContent = 'הועתק ✓'; } catch { t.textContent = 'לא הצלחתי'; }
    setTimeout(() => (t.textContent = 'העתקה'), 1500);
    return;
  }
  if (t.id === 'filedBtn' && !state.ui.filed) { state.ui.filed = true; save(); track('filed'); render(); return; }
  if (t.id === 'wipe' && confirm('למחוק את כל התשובות, המספרים והקבצים שהעלית?')) {
    try { localStorage.removeItem(STORE); } catch {}
    clearFiles();
    state = { step: 'screen', screen: {}, me: {}, years: {}, ui: {} };
    render();
  }
});

document.getElementById('stuck').addEventListener('click', (ev) => {
  track('stuck', { screen: state.step });
  ev.target.textContent = 'תודה, נרשם שנתקעת כאן';
});

track('app_open', { device: device() });
render();
