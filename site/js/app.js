// האשף: סינון → שאלות עליך → לכל שנה (שאלות + מסמכים) → תוצאה → מדריך הגשה → אחרי ההגשה.
// עיקרון אפס הנחות: אין ברירות מחדל. כל שאלה מוצגת היא שאלת חובה, ו"המשך" לא עובד עד שעונים על הכול.

import { computeYear, amountBucket } from './engine.js';
import { buildGuide } from './guide.js';
import { openYears, deadline, BOOKLET, RENT_CEILING } from './params.js';
import { track, device } from './analytics.js';
import { parseDocument, summarizeDocs, DOC_TYPES } from './docparse.js';
import { pdfLines, renderPdf } from './pdftext.js';
import { SETTLEMENTS } from './settlements.js';
import { putFile, getFile, delFile, clearFiles, suggestName } from './filestore.js';

const STORE = 'magia-li-v1';
const STEPS = ['screen', 'me', 'years', 'results', 'guide', 'after'];
const STEP_NAMES = { screen: 'סינון', me: 'שאלות עליך', years: 'שנים ומסמכים', results: 'תוצאה', guide: 'מדריך הגשה', after: 'אחרי ההגשה' };
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
  <p class="muted">הגרסה הזו מתאימה לשכירים. השאלות האלה בודקות שהאפליקציה מתאימה לך.</p>
  <div class="card">
    ${years('screen.selectedYears', 'אילו שנים לבדוק?', `אפשר לבדוק עד שש שנים אחורה. מומלץ לבדוק את כולן. השנה הכי ישנה נסגרת בסוף השנה הזו (${deadline(YEARS[0])}).`, YEARS)}
    ${q.yn('screen.selfEmployed', 'היה לך עסק עצמאי (עוסק פטור / מורשה) באחת השנים שתרצה לבדוק?')}
    ${q.yn('screen.resident', 'היית תושב/ת ישראל בכל השנים האלה?')}
    ${q.yn('screen.oleh', 'עלית לארץ או חזרת אחרי תקופה ארוכה בחו"ל (תושב חוזר) בעשר השנים האחרונות?')}`;
  if (sel.length) {
    html += q.yn('screen.otherIncome', 'היו לך (או לבן/בת הזוג) באחת השנים שבחרת הכנסות ממכירת מניות או קריפטו, דיבידנד, הכנסות מחו"ל, או שכר דירה על נכס שהוא לא דירת מגורים (למשל חנות או משרד)?',
      'על שכר דירה מדירת מגורים בישראל יש שאלה נפרדת מיד אחרי זו.');
    if (get('screen.otherIncome') === 'yes') html += `<div class="sub">${years('screen.otherYears', 'באילו שנים?', 'את השנים האלה האפליקציה עוד לא יודעת לחשב, ונמליץ עליהן על רואה חשבון. את שאר השנים נבדוק כרגיל.', sel)}</div>`;
    html += q.yn('screen.rent', 'קיבלת (או בן/בת הזוג) שכר דירה על דירת מגורים בישראל באחת השנים שבחרת?', 'גם אם לא שילמת על זה מס. לכל שנה נשאל אחר כך כמה קיבלת ובאיזה מסלול מס, כי זה קובע אם צריך לדווח ומה לצרף.');
    if (get('screen.rent') === 'yes') html += `<div class="sub">${years('screen.rentYears', 'באילו שנים?', '', sel)}</div>`;
  }
  html += '</div>';
  const out = [];
  if (get('screen.selfEmployed') === 'yes') out.push('עצמאים עדיין לא נתמכים באפליקציה.');
  if (get('screen.resident') === 'no') out.push('האפליקציה מתאימה רק לתושבי ישראל.');
  if (get('screen.oleh') === 'yes') out.push('לעולים חדשים ולתושבים חוזרים יש הטבות מיוחדות שעוד לא נתמכות.');
  if (out.length) html += `<div class="notice warn"><b>כרגע האפליקציה לא מתאימה למקרה שלך.</b><br>${out.join('<br>')}<br>מומלץ לפנות לרואה חשבון או ליועץ מס. רבים גובים מחיר קבוע ולא אחוזים, כדאי לשאול.</div>`;
  ctx.blocked = out.length > 0;
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
  html += q.choice('me.prevRefund', 'קיבלת בעבר החזר מרשות המסים לחשבון הבנק שאליו תבקש את ההחזר הפעם?', [['yes', 'כן'], ['no', 'לא'], ['unsure', 'לא בטוח/ה']], 'אם לא, או שלא בטוח, מצרפים אישור ניהול חשבון. מורידים אותו מהאפליקציה של הבנק, וזה לוקח דקה.');
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
const needsBank = (base) => base.endsWith('.self') && get('me.prevRefund') !== 'yes';
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
const needsResidency = (base, year) => base.endsWith('.self') && get(`years.${year}.settlement`) === 'yes' && get(`years.${year}.settlement12`) === 'yes';

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
  if (needsBank(base) && !s.bankProof) later.push('אישור ניהול חשבון מהבנק (כי ענית שלא קיבלת בעבר החזר לחשבון הזה, או שאתה לא בטוח)');
  if (needsResidency(base, year) && !s.residency) later.push('אישור תושבות (טופס 1312א) מהמועצה או מהעירייה של היישוב');
  for (const a of attachMissing(base, year)) later.push(`${a.doc} (${a.why})`);
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
  if (needsBank(base) && !s.bankProof) filingDocs.push('אישור ניהול חשבון מהבנק. צריך לצרף אותו, כי ענית שלא קיבלת בעבר החזר לחשבון הזה (או שאתה לא בטוח)');
  if (needsResidency(base, year) && !s.residency) filingDocs.push('אישור תושבות (טופס 1312א) מהמועצה או מהעירייה של היישוב. צריך לצרף אותו כשמבקשים את הטבת היישוב');
  for (const a of attachMissing(base, year)) filingDocs.push(`${a.doc}. צריך לצרף אותו, ${a.why}`);
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
  const bank = needsBank(base) ? `<tr><td colspan="2" class="small muted">מהבנק (כי ענית שלא קיבלת בעבר החזר לחשבון הזה, או שאתה לא בטוח)</td></tr><tr><td>${mark(!!s.bankProof)}</td><td><b>"אישור ניהול חשבון"</b></td></tr>` : '';
  const docsAll = get(`${base}.docs`) || [];
  const att = attachNeeds(base, year);
  const attach = att.length ? `<tr><td colspan="2" class="small muted">צרופות לפי התשובות שלך (מעתיקים מהן את הסכום לשאלה למעלה, ומעלים אותן כאן כדי לזכור לצרף)</td></tr>${att.map((a) => `<tr><td>${mark(docsAll.some((d) => d.type === 'attach' && d.attachKey === a.key))}</td><td><b>${esc(a.doc)}</b></td></tr>`).join('')}` : '';
  const res = needsResidency(base, year) ? `<tr><td colspan="2" class="small muted">מהמועצה האזורית או מהעירייה (כי ענית שגרת ביישוב מזכה)</td></tr><tr><td>${mark(!!s.residency)}</td><td><b>"אישור תושבות" (טופס 1312א) לשנת ${year}</b></td></tr>` : '';
  const rows = (list) => list.map(([n, ok]) => `<tr><td>${mark(ok)}</td><td><b>${esc(n)}</b></td></tr>`).join('');
  return `<div class="card sub checklist"><b>מה צריך להוריד ${who === 'spouse' ? 'לבן/בת הזוג' : ''} לשנת ${year}</b>
    <table class="files"><tr><td colspan="2" class="small muted">מרשות המסים (האזור האישי ← "טפסי 106" ← "מידע מרוכז מהמעסיקים")</td></tr>${rows(tax)}
    <tr><td colspan="2" class="small muted">מביטוח לאומי (האזור האישי ← "אישורים")</td></tr>${rows(bl)}${res}${bank}${attach}</table>
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
    ${HOWTO_SUMMARY}${howtoBtl(base, year)}${needsBank(base) ? HOWTO_BANK : ''}${NAMING_TIP}
    <label class="drop"><input type="file" accept="application/pdf,.pdf" multiple data-upload="${base}" data-upyear="${year}">
      <b>בחירת קבצי PDF</b><span class="small muted">אפשר לבחור כמה קבצים ביחד, ולהוסיף עוד אחר כך</span></label>`;
  if (state.ui.reading === base) html += '<div class="notice info">קורא את הקבצים…</div>';
  // קובץ שלא זוהה. "טופס 106 ישן" נחשב כאן לא מזוהה רק כשלא חסר אף טופס 106, כי אז כנראה זה מסמך אחר (למשל מהבנק).
  const missing106 = summarizeDocs(docs, year).missing.length > 0;
  const isUnk = (d) => ['unknown', 'scanned'].includes(d.type) || (d.type === 'legacy106' && !missing106);
  if (docs.length) {
    html += `<table class="files">${docs.map((d, i) => {
      const ok = !['unknown', 'scanned', 'legacy106', 'error'].includes(d.type) && (!d.year || d.year === year);
      const what = d.type === 'error' ? 'לא הצלחנו לפתוח את הקובץ' : d.type === 'attach' ? (attachNeeds(base, year).find((a) => a.key === d.attachKey)?.doc || 'צרופה') : (DOC_TYPES[d.type] || d.type) + (d.year ? `, ${d.year}` : '') + (d.employer?.name ? `, ${d.employer.name}` : '');
      const better = ok ? suggestName(d, year, who) : null;
      const rename = better && better !== d.fileName ? `<div class="small">שם מומלץ: <bdi>${esc(better)}</bdi> <button class="btn link" type="button" data-saveas="${base}|${i}">שמירת עותק בשם הזה</button></div>` : '';
      const unk = isUnk(d);
      const tag = (needsResidency(base, year) && unk ? `<div class="small"><button class="btn link" type="button" data-residency="${base}|${i}">זה אישור התושבות מהמועצה</button></div>` : '')
        + (needsBank(base) && unk ? `<div class="small"><button class="btn link" type="button" data-bank="${base}|${i}">זה אישור ניהול החשבון מהבנק</button></div>` : '')
        + (unk ? attachNeeds(base, year).map((a) => `<div class="small"><button class="btn link" type="button" data-attach="${base}|${i}|${a.key}">זה ${esc(a.tag)}</button></div>`).join('') : '');
      return `<tr><td>${ok ? '✓' : '⚠'}</td><td><bdi dir="ltr">${esc(d.fileName)}</bdi><div class="small muted">${esc(what)}</div>${rename}${tag}</td><td class="actions"><button class="btn link" type="button" data-view="${base}|${i}">צפייה</button> <button class="btn link" type="button" data-rmdoc="${base}|${i}">הסרה</button></td></tr>`;
    }).join('')}</table>`;
  }
  const { s, need, later, btl, complete } = docsState(base, year);
  set(`${base}.docsOk`, complete ? 'yes' : '');
  // קובץ שלא זיהינו אבל אולי הוא אישור מהבנק או מהמועצה (כל אחד נראה אחרת): בלי אזהרה, רק שאלה ליד הקובץ.
  const canTag = needsBank(base) || needsResidency(base, year) || attachNeeds(base, year).length > 0;
  const bad = docs.filter((d) => d.type === 'error' || (!(canTag && isUnk(d)) && ['unknown', 'scanned', 'legacy106'].includes(d.type)));
  const askTag = canTag ? docs.filter(isUnk) : [];
  if (askTag.length) html += `<div class="notice info">לא זיהינו לבד את ${askTag.map((d) => `"${esc(d.fileName)}"`).join(', ')}. אישורים מהבנק, מהמועצה, מחברות ביטוח ומעמותות נראים כל פעם אחרת, אז לוחצים ליד הקובץ ברשימה למעלה על הכפתור שאומר מה הוא.</div>`;
  if (bad.length) html += `<div class="notice warn">לא הצלחנו לקרוא: ${bad.map((d) => `"${esc(d.fileName)}"`).join(', ')}. טפסים סרוקים, או טפסים ישנים שהמעסיק שלח, לפעמים לא נקראים. במקומם מורידים את טופס ה-106 מהאזור האישי ברשות המסים (נספח ב'), כמו בהסבר למעלה.</div>`;
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
  html += `
    ${q.yn(`${y}.severance`, `קיבלת${couple ? ' (או בן/בת הזוג)' : ''} בשנת ${year} כסף לחשבון הבנק מפיצויים, או משכת כסף מקופת פנסיה, גמל או קרן השתלמות לפני הזמן?`, 'אם עזבת עבודה והפיצויים נשארו בקרן הפנסיה ולא משכת אותם, עונים "לא". המעסיק אולי נתן לך טופס 161, אבל אם הכסף לא יצא מהקרן אין כאן הכנסה לדווח עליה. קרן השתלמות אחרי 6 שנים: גם "לא".')}
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
    if (get(`${y}.settlement12`) === 'yes') html += `<div class="notice info small"><b>מסמך שצריך להשיג: "אישור תושבות" (טופס 1312א).</b> הוא לא נמצא אצל רשות המסים, ואין להורדה באזור האישי. מבקשים אותו מהמועצה האזורית או מהעירייה של היישוב: באתר המועצה (בדרך כלל תחת "אישור תושבות" או "טפסים") או במשרדי המועצה. אומרים שזה "אישור תושבות לצורך הנחה במס הכנסה, לשנת ${year}". כשיש לך אותו, מעלים אותו בשלב המסמכים, והוא יצורף לדו"ח. אם המעסיק כבר נתן לך את ההנחה בתלוש, כנראה כבר מסרת לו עותק, ואפשר לבקש ממנו.</div>`;
    html += '</div>';
  }
  if ((get('screen.rentYears') || []).includes(year) && get('screen.rent') === 'yes') {
    html += q.choice(`${y}.rentTrack`, `באיזה מסלול מס היה שכר הדירה בשנת ${year}?`, [
      ['exempt', 'פטור: לא שילמתי על זה מס'], ['ten', '10%: שילמתי לרשות המסים 10% משכר הדירה'], ['regular', 'רגיל: דיווחתי ושילמתי מס לפי המדרגות'], ['unsure', 'לא בטוח/ה']],
      'רוב מי שמשכיר דירה אחת ולא שילם על זה כלום נמצא במסלול הפטור. המסלול נקבע לכל שנה בנפרד.');
    if (get(`${y}.rentTrack`) === 'exempt') {
      const c = RENT_CEILING[year];
      html += `<div class="sub">${q.num(`${y}.rentMax`, `מה הסכום הכי גבוה שקיבלת בחודש אחד בשנת ${year}, מכל הדירות ביחד?`, c ? `הפטור המלא הוא לכל חודש שבו שכר הדירה לא עבר ${fmt(c.value)} ₪ (התקרה של ${year}).` : '')}</div>`;
    }
    const r = rentState(year);
    if (r?.ok) html += `<div class="notice info small"><b>שכר הדירה פטור ממס, ולא משנה את החישוב.</b> אבל מי שמגיש בקשה להחזר צריך להצהיר בה על ההכנסה הזו ועל הבחירה במסלול הפטור, ולצרף את חוזה השכירות (שכתוב בו שהדירה למגורים בלבד), או הצהרה בכתב מהשוכרים שהדירה משמשת למגורים בלבד. נוסיף את זה לרשימת המסמכים ולמדריך.</div>`;
  }
  html += q.yn(`${y}.lifeIns`, `שילמת בעצמך בשנת ${year} על ביטוח חיים, כולל ביטוח חיים של משכנתא?`, 'הכוונה לביטוח שאתה משלם, למשל בהוראת קבע לחברת הביטוח או דרך הבנק של המשכנתא. ביטוח שהמעסיק מפריש לך דרך התלוש לא נחשב כאן. אם כן, תצטרך להוריד "אישור שנתי למס הכנסה" מהאזור האישי באתר של חברת הביטוח שלך.');
  if (get(`${y}.lifeIns`) === 'yes') html += `<div class="sub">${q.num(`${y}.lifeInsAmount`, 'סכום הפרמיות בשנה לפי האישור', 'מעתיקים מהאישור השנתי. את האישור מעלים בשלב המסמכים, כי מצרפים אותו לבקשה.')}</div>`;
  html += q.yn(`${y}.disability`, `שילמת בשנת ${year} ביטוח אובדן כושר עבודה פרטי (לא דרך המעסיק)?`);
  if (get(`${y}.disability`) === 'yes') html += `<div class="sub">${q.num(`${y}.disabilityAmount`, 'סכום ששילמת בשנה', 'מעתיקים מהאישור השנתי של חברת הביטוח. את האישור מעלים בשלב המסמכים, כי מצרפים אותו לבקשה.')}</div>`;
  html += q.yn(`${y}.privatePension`, `הפקדת בעצמך לפנסיה או לקופת גמל בשנת ${year} (לא דרך המעסיק)?`);
  html += q.yn(`${y}.donations`, `תרמת בשנת ${year} למוסד מוכר (סעיף 46) עם קבלה?`);
  if (get(`${y}.donations`) === 'yes') html += `<div class="sub">${q.num(`${y}.donationsAmount`, 'סכום התרומות בשנה', 'סוכמים את הקבלות. את הקבלות מעלים בשלב המסמכים, כי מצרפים אותן לבקשה.')}</div>`;
  html += q.yn(`${y}.institution`, `שילמת בשנת ${year} על אחזקת קרוב משפחה במוסד (ילד, בן/בת זוג או הורה)?`);
  if (get(`${y}.institution`) === 'yes') html += `<div class="sub">${q.num(`${y}.institutionAmount`, 'סכום ששילמת בשנה', 'סוכמים את הקבלות מהמוסד. את הקבלות מעלים בשלב המסמכים, כי מצרפים אותן לבקשה.')}</div>`;

  const out = yearOut(year);
  if (out) {
    html += `<div class="notice warn"><b>את ${year} האפליקציה לא תחשב.</b> ${out}<br>אפשר להמשיך בתהליך: את שאר השנים שבחרת נחשב כרגיל. לשנה הזו לא נבקש מסמכים, ובתוצאה היא תסומן "מחוץ להיקף". טעית בתשובה? פשוט משנים אותה כאן.</div></div>`;
    return html;
  }
  html += renderPersonDocs(q, `${y}.self`, 'self', year);
  if (couple && get(`${y}.spouseIncome`) === 'yes') html += renderPersonDocs(q, `${y}.spouse`, 'spouse', year);
  html += '</div>';
  return html;
}

// שכר דירה למגורים בישראל: נתמך רק מסלול הפטור כשכל חודש מתחת לתקרה. שם ההכנסה פטורה ולא נכנסת לחישוב,
// אבל צריך להצהיר עליה בבקשה ולצרף חוזה. כל מסלול אחר משנה את המס, ועוד לא נתמך.
function rentState(year) {
  const y = `years.${year}`;
  if (get('screen.rent') !== 'yes' || !(get('screen.rentYears') || []).includes(year)) return null;
  const t = get(`${y}.rentTrack`);
  if (!answered(t)) return null;
  const CPA = 'מומלץ רואה חשבון.';
  if (t === 'ten') return { out: `במסלול 10% צריך לדווח על שכר הדירה ועל המס ששולם בדו"ח, וזה עוד לא נתמך באפליקציה. ${CPA}` };
  if (t === 'regular') return { out: `במסלול הרגיל שכר הדירה מתווסף להכנסה ומשנה את המס, וזה עוד לא נתמך באפליקציה. ${CPA}` };
  if (t === 'unsure') return { out: `בלי לדעת את מסלול המס של שכר הדירה אי אפשר לדעת אם הוא משנה את ההחזר. אם לא שילמת על שכר הדירה אף פעם מס ולא דיווחת עליו, כנראה שזה מסלול הפטור, ואז בוחרים "פטור". אם עדיין לא בטוח: ${CPA}` };
  const c = RENT_CEILING[year];
  if (!c) return { out: `עוד אין לנו תקרת פטור מאומתת לשכר דירה ב-${year}, ולכן השנה הזו לא תחושב. אנחנו עובדים על זה.` };
  const max = get(`${y}.rentMax`);
  if (!answered(max)) return null;
  if (Number(max) > c.value) return { out: `בחודש שבו שכר הדירה עבר ${fmt(c.value)} ₪ יש רק פטור חלקי, וחלק משכר הדירה חייב במס. זה עוד לא נתמך באפליקציה. ${CPA}` };
  return { ok: true, ceiling: c };
}
// צרופות שנובעות מתשובות בשאלון: אין להן מבנה אחד (כל חברת ביטוח, מוסד ועמותה מוציאים אחרת), ולכן
// לא קוראים מהן מספרים. המשתמש מעתיק את הסכום מהאישור, מעלה את הקובץ ומסמן ליד הקובץ מה הוא.
function attachNeeds(base, year) {
  if (!base.endsWith('.self')) return [];
  const y = (k) => get(`years.${year}.${k}`);
  const out = [];
  if (y('lifeIns') === 'yes') out.push({ key: 'lifeIns', tag: 'האישור על ביטוח החיים', doc: 'אישור שנתי למס הכנסה מחברת הביטוח על ביטוח החיים', why: 'כי ענית ששילמת ביטוח חיים' });
  if (y('disability') === 'yes') out.push({ key: 'disability', tag: 'האישור על אובדן כושר עבודה', doc: 'אישור שנתי למס הכנסה מחברת הביטוח על ביטוח אובדן כושר העבודה', why: 'כי ענית ששילמת ביטוח אובדן כושר עבודה פרטי' });
  if (y('donations') === 'yes') out.push({ key: 'donations', tag: 'קבלות על תרומות', doc: 'הקבלות על התרומות (סעיף 46)', why: 'כי ענית שתרמת' });
  if (y('institution') === 'yes') out.push({ key: 'institution', tag: 'קבלות מהמוסד', doc: 'הקבלות מהמוסד על התשלומים בשנה', why: 'כי ענית ששילמת על קרוב משפחה במוסד' });
  if (rentState(year)?.ok) out.push({ key: 'rent', tag: 'חוזה השכירות', doc: RENT_DOC, why: 'כי קיבלת שכר דירה במסלול הפטור' });
  return out;
}
function attachMissing(base, year) {
  const docs = get(`${base}.docs`) || [];
  return attachNeeds(base, year).filter((a) => !docs.some((d) => d.type === 'attach' && d.attachKey === a.key));
}
const RENT_DOC = 'חוזה השכירות (שכתוב בו שהדירה משמשת למגורים בלבד), או הצהרה בכתב מהשוכרים שהדירה משמשת למגורים בלבד';

function yearOut(year) {
  const y = `years.${year}`;
  if (get(`${y}.marital`) === 'separated') return 'נשואים שחיים בנפרד מגישים עם טופס 4440, וזה עוד לא נתמך. מומלץ רואה חשבון.';
  if (get('screen.otherIncome') === 'yes' && (get('screen.otherYears') || []).includes(year)) return 'ענית שבשנה הזו היו הכנסות ממניות, קריפטו, דיבידנד, מחו"ל או משכירות של נכס שאינו דירת מגורים. את זה האפליקציה עוד לא יודעת לחשב. מומלץ רואה חשבון.';
  const rent = rentState(year);
  if (rent?.out) return rent.out;
  if (get(`${y}.severance`) === 'yes') return 'משיכת פיצויים או כספים מקופות דורשת חישוב של פטורים ופריסה, וזה עוד לא נתמך. מומלץ רואה חשבון.';
  if (get(`${y}.privatePension`) === 'yes') return 'הפקדה עצמאית לפנסיה עוד לא נתמכת. מומלץ רואה חשבון.';
  return null;
}

function renderYears(ctx) {
  const sel = get('screen.selectedYears') || [];
  let cur = state.ui.year;
  if (!sel.includes(cur)) cur = state.ui.year = sel[0];
  const done = (yr) => { const c = { req: [] }; renderYear(c, yr); return c.req.every((p) => answered(get(p))); };
  let html = `<h1>שנים ומסמכים</h1>
    <p class="muted">לכל שנה: כמה שאלות, ואז הנתונים מהמסמכים. אפשר לעבור בין השנים בכל רגע. הנתונים נשמרים רק בדפדפן הזה.</p>
    <div class="year-tabs">${sel.map((yr) => `<button type="button" data-year="${yr}" class="${yr === cur ? 'on' : ''} ${done(yr) ? 'done' : ''}">${yr}</button>`).join('')}</div>`;
  html += renderYear(ctx, cur);
  // לוודא שכל השנים מלאות, לא רק המוצגת
  for (const yr of sel) if (yr !== cur) { const c = { req: [] }; renderYear(c, yr); ctx.req.push(...c.req); }
  ctx.firstIncompleteYear = sel.find((yr) => !done(yr));
  return html;
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
  // תשובות שהמדריך צריך כדי להגיד מה למלא בכל שדה (המנוע לא צריך אותן).
  const answers = {
    dischargeYear: get('me.dischargeYear'), dischargeMonth: get('me.dischargeMonth'), degreeYear: get('me.degreeYear'),
    settlementName: st?.name || y('settlementName'), rentExempt: !!rentState(year)?.ok, rentCeiling: rentState(year)?.ceiling?.value, lifeIns: self.credits.lifeInsurance, disability: self.credits.disabilityInsurance, institution: self.credits.institutionRelative,
  };
  return { maritalStatus: m, people, answers, needsBankProof: get('me.prevRefund') !== 'yes', attachments: attachNeeds(`years.${year}.self`, year).map((a) => ({ doc: a.doc, why: a.why })) };
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
  if (refunds.length) html += `<div class="card result refund"><div class="muted">סה"כ צפוי לחזור אליך ${refunds.length === 1 ? 'בשנה אחת' : `ב-${refunds.length} שנים`}, כולל הצמדה וריבית</div><div class="amount">${anyPartial ? 'לפחות ' : 'כ-'}${fmt(total + totalIdx)} ₪${anyPartial ? '<sup>*</sup>' : ''}</div><div>החזר מס ${fmt(total)} ₪ + הצמדה וריבית כ-${fmt(totalIdx)} ₪ (הערכה עד היום. הסכום ממשיך לגדול עד יום התשלום)</div>${anyPartial ? `<div class="small">* הערכה חלקית ל-${refunds.filter((r) => r.partial).map((r) => r.year).join(', ')}: חלק מהנתונים חסרים ולא נכללו. הפירוט וההסבר בכל שנה למטה.</div>` : ''}${unsure.length ? `<div class="small">לא כולל את ${unsure.map((r) => r.year).join(', ')}, כי שם התוצאה עוד יכולה להשתנות לשני הכיוונים.</div>` : ''}</div>`;
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
        html += `<div class="amount">${r.partial ? 'לפחות ' : 'כ-'}${fmt(r.balance + r.indexation)} ₪${star(r)}</div>`;
        html += `<div>החזר מס ${fmt(r.balance)} ₪ + הצמדה וריבית כ-${fmt(r.indexation)} ₪ (הערכה עד היום. הסכום ממשיך לגדול עד יום התשלום)</div>`;
      } else html += `<div class="amount">${r.balance < 0 ? '−' : ''}${fmt(Math.abs(r.balance))} ₪${star(r)}</div>`;
      const L = (k) => r.results.reduce((s, p) => s + p.lines[k], 0);
      html += `<table class="calc">
        <tr><td>סה"כ הכנסות<div class="muted small">משכורת ותשלומי ביטוח לאומי</div></td><td class="num">${fmt(L('totalIncome'))}</td></tr>
        <tr><td>מס ברוטו<div class="muted small">לפי מדרגות המס של ${r.year}</div></td><td class="num">${fmt(L('grossTax'))}</td></tr>
        <tr><td>נקודות זיכוי<div class="muted small">${r.results.map((p) => p.lines.points).join(' + ')} נקודות × ערך נקודה בשנת ${r.year}. זיכוי מוריד מהמס, לא מההכנסה</div></td><td class="num">−${fmt(L('pointsCredit'))}</td></tr>
        ${L('pensionCredit') ? `<tr><td>זיכוי על הפקדות לפנסיה<div class="muted small">35% מההפקדות שלך (שדות 045/086 בטופס 106), עד 7% מההכנסה המזכה. ההכנסה המזכה מוגבלת לתקרה של השנה</div></td><td class="num">−${fmt(L('pensionCredit'))}</td></tr>` : ''}
        ${L('settlementCredit') ? `<tr><td>הטבת יישוב מזכה<div class="muted small">אחוז ההנחה של היישוב × ההכנסה, עד התקרה, לפי מספר החודשים שגרת שם</div></td><td class="num">−${fmt(L('settlementCredit'))}</td></tr>` : ''}
        <tr><td>מס שהיה צריך לשלם</td><td class="num">${fmt(L('taxDue'))}</td></tr>
        <tr><td>מס שנוכה בפועל<div class="muted small">מכל טופסי ה-106 ואישורי ביטוח לאומי</div></td><td class="num">${fmt(L('withheld'))}</td></tr>
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
    html += `<section class="guide-year"><h2>שנת ${y}: ${ry.status === 'refund' ? `${fmt(ry.balance)} ₪${star(ry)}` : ry.status === 'blocked' ? 'התוצאה לא חושבה, בודקים ב"חישוב" באתר' : ry.balance < 0 ? `חוב ${fmt(-ry.balance)} ₪, לא מומלץ להגיש` : `${fmt(ry.balance)} ₪`}</h2>${gNote}${guideTabs(y).html}</section>`;
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
  else if (step === 'results') body = renderResults();
  else if (step === 'guide') body = renderGuide();
  else body = renderAfter();
  const nav = idx <= 2
    ? `<div class="row" style="margin-top:20px">${idx > 0 ? '<button class="btn secondary" type="button" data-nav="back">חזרה</button>' : '<a class="btn secondary" href="./">חזרה</a>'}<span class="spacer"></span><button class="btn" type="button" data-nav="next" ${ctx.blocked ? 'disabled' : ''}>${idx === 2 ? 'לתוצאה' : 'המשך'}</button></div>`
    : '';
  app.innerHTML = `<div class="brand"><a href="./" style="text-decoration:none">מגיע לי</a></div>
    <div class="progress">${STEPS.slice(0, 4).map((s, i) => `<span class="${i <= Math.min(idx, 3) ? 'on' : ''}" title="${STEP_NAMES[s]}"></span>`).join('')}</div>
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
    try { d = parseDocument(await pdfLines(f)); } catch { d = { type: 'error' }; }
    d.fileName = f.name;
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
      if (state.step === 'years' && ctx.firstIncompleteYear && ctx.firstIncompleteYear !== state.ui.year) state.ui.year = ctx.firstIncompleteYear;
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
