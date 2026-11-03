// האשף: סינון → שאלות עליך → לכל שנה (שאלות + מסמכים) → תוצאה → מדריך הגשה → אחרי ההגשה.
// עיקרון אפס הנחות: אין ברירות מחדל. כל שאלה מוצגת היא שאלת חובה, ו"המשך" לא עובד עד שעונים על הכול.

import { computeYear, amountBucket } from './engine.js';
import { buildGuide } from './guide.js';
import { openYears, deadline } from './params.js';
import { track, device } from './analytics.js';
import { parseDocument, summarizeDocs, DOC_TYPES } from './docparse.js';
import { pdfLines } from './pdftext.js';

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
    text(path, label, h) {
      ctx.req.push(path);
      const v = get(path);
      return `<div class="q${miss(path)}" data-q="${path}"><label for="${path}">${label}</label>${help(h)}<input id="${path}" type="text" data-path="${path}" value="${esc(v)}"></div>`;
    },
  };
}

// ---------- step: screen (סינון) ----------
function renderScreen(ctx) {
  const q = mk(ctx);
  ctx.req.push('screen.selectedYears');
  const sel = get('screen.selectedYears') || [];
  const yearsMiss = ctx.showMissing && !sel.length ? ' missing' : '';
  let html = `<h1>כמה שאלות לפני שמתחילים</h1>
  <p class="muted">הגרסה הזו מתאימה לשכירים. השאלות האלה בודקות שהאפליקציה מתאימה לך.</p>
  <div class="card">
    ${q.yn('screen.selfEmployed', 'היה לך עסק עצמאי (עוסק פטור / מורשה) באחת השנים שתרצה לבדוק?')}
    ${q.yn('screen.resident', 'היית תושב/ת ישראל בכל השנים האלה?')}
    ${q.yn('screen.oleh', 'עלית לארץ או חזרת אחרי תקופה ארוכה בחו"ל (תושב חוזר) בעשר השנים האחרונות?')}
    <div class="q${yearsMiss}" data-q="screen.selectedYears"><div class="label">אילו שנים לבדוק?</div>
      <div class="help">אפשר לבדוק עד שש שנים אחורה. מומלץ לבדוק את כולן. השנה הכי ישנה נסגרת בסוף השנה הזו (${deadline(YEARS[0])}).</div>
      <div class="choices">${YEARS.map((y) => `<label><input type="checkbox" data-years="${y}" ${sel.includes(y) ? 'checked' : ''}>${y}</label>`).join('')}</div>
    </div>
  </div>`;
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
  if (get('me.hasKids') === 'yes') html += `<div class="sub">${q.text('me.kidsBirthYears', 'שנות הלידה של הילדים', 'מופרדות בפסיק, למשל: 2022, 2025')}</div>`;
  html += q.yn('me.degree', 'סיימת תואר אקדמי או תעודת מקצוע?', 'על סיום תואר מגיעה נקודת זיכוי לשנה אחת. מספיק לציין שנה.');
  if (get('me.degree') === 'yes') html += `<div class="sub">${q.num('me.degreeYear', 'באיזו שנה סיימת?', 'השנה שבה קיבלת זכאות לתואר', { min: 1960, max: 2030 })}</div>`;
  html += q.yn('me.served', 'שירתת בשירות צבאי סדיר (חובה) או בשירות לאומי?', 'הכוונה לשירות הסדיר, לא למילואים. חיילים משוחררים מקבלים נקודות זיכוי ל-3 שנים אחרי השחרור. על מילואים נשאל בהמשך, בתוך כל שנה.');
  if (get('me.served') === 'yes') {
    html += `<div class="sub">${q.num('me.dischargeYear', 'באיזו שנה השתחררת מהשירות הסדיר?', 'מספיק שנה. חודש נבקש רק אם הוא משנה את התוצאה.', { min: 1960, max: 2030 })}`;
    if (dischargeNeedsMonth()) html += q.num('me.dischargeMonth', 'באיזה חודש השתחררת? (1–12)', 'הזכאות נמשכת 36 חודשים מהשחרור, ולכן בשנה שבה היא מתחילה או נגמרת החודש קובע כמה נקודות מגיעות.', { min: 1, max: 12 });
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
const HOWTO_SUMMARY = `<details class="howto"><summary>איך מורידים את "ריכוז נתוני שכר מכלל המעסיקים" ואת טופסי ה-106</summary><ol>
  <li>נכנסים לאזור האישי של רשות המסים בלינק הזה: <a href="${TAX_LOGIN}" target="_blank" rel="noopener">כניסה לאזור האישי ←</a><br><span class="small muted">לא דרך החיפוש באתר gov.il. החיפוש שם לא מוצא את הטפסים.</span></li>
  <li>מזדהים: תעודת זהות, קוד משתמש וקוד חד-פעמי לטלפון. אין קוד משתמש? <a href="${TAX_REGISTER}" target="_blank" rel="noopener">רישום חד-פעמי</a> (צריך כרטיס אשראי ותאריך הנפקה של תעודת הזהות).</li>
  <li>בעמוד הראשי בוחרים "טפסי 106", ואז את השנה.</li>
  <li>מורידים את "ריכוז נתוני שכר מכלל המעסיקים" (PDF). זו הרשימה הרשמית של כל מי ששילם לך משכורת באותה שנה.</li>
  <li>באותו מסך, ליד כל מעסיק, מורידים את טופס ה-106 שלו (נספח ב'). את כל הקבצים מעלים כאן ביחד.</li></ol></details>`;
const HOWTO_BTL = `<details class="howto"><summary>איך מורידים את המסמכים מביטוח לאומי</summary><ol>
  <li>נכנסים <a href="${BTL_LOGIN}" target="_blank" rel="noopener">לאזור האישי של ביטוח לאומי ←</a> ובוחרים "אישורים".</li>
  <li><b>אישור תשלומים שנתי</b>: בוחרים את השנה ומורידים. כאן רואים אם קיבלת אבטלה, דמי לידה או דמי פגיעה. מעלים אותו גם אם לא קיבלת כלום, כדי שנדע בוודאות.</li>
  <li>אם באישור יש תשלום: מורידים גם את "אישור שנתי למס הכנסה" של אותו תשלום. רק בו כתוב כמה מס נוכה.</li>
  <li>מילואים לא מופיעים באישור התשלומים השנתי. אם עשית מילואים ושולם לך ישירות מביטוח לאומי, מורידים "אישור שנתי למס הכנסה על תשלום תגמולי מילואים".</li></ol></details>`;
const BTL_LABELS = { miluim: 'תגמולי מילואים', unemployment: 'דמי אבטלה', maternity: 'דמי לידה', injury: 'דמי פגיעה בעבודה' };

// מה המסמכים אומרים, ומה עוד חסר. משמש גם את התצוגה וגם את החישוב.
function docsState(base, year) {
  const docs = get(`${base}.docs`) || [];
  const s = summarizeDocs(docs, year);
  const need = [];
  if (!s.summary) need.push('ריכוז נתוני שכר מכלל המעסיקים (רשות המסים)');
  for (const e of s.missing) need.push(`טופס 106 של ${e.name} (תיק ניכויים ${e.taxFile})`);
  if (!s.btlAnnual) need.push('אישור תשלומים שנתי (ביטוח לאומי)');
  const btl = [];
  for (const b of s.btlAnnual?.benefits || []) {
    const cert = s.certs.find((c) => c.kind === b.kind);
    if (!cert) need.push(`אישור שנתי למס הכנסה על ${BTL_LABELS[b.kind]} (ביטוח לאומי)`);
    btl.push({ kind: b.kind, label: BTL_LABELS[b.kind], gross: cert?.gross ?? b.gross, taxWithheld: cert ? cert.tax : null, source: cert?.fileName || s.btlAnnual.fileName });
  }
  const miluim = s.certs.find((c) => c.kind === 'miluim');
  if (miluim) btl.push({ kind: 'miluim', label: BTL_LABELS.miluim, gross: miluim.gross, taxWithheld: miluim.tax, source: miluim.fileName });
  else if (get(`${base}.miluimDirect`) === 'yes') need.push('אישור שנתי למס הכנסה על תשלום תגמולי מילואים (ביטוח לאומי)');
  for (const c of s.certs) if (c.kind !== 'miluim' && !(s.btlAnnual?.benefits || []).some((b) => b.kind === c.kind)) {
    btl.push({ kind: c.kind || 'other', label: BTL_LABELS[c.kind] || 'תשלום מביטוח לאומי', gross: c.gross, taxWithheld: c.tax, source: c.fileName });
  }
  for (const e of s.employers) if (e.income == null) need.push(`לא הצלחנו לקרוא את ההכנסה בקובץ "${e.source}". נסו את טופס ה-106 מרשות המסים (נספח ב').`);
  return { s, need, btl, complete: need.length === 0 };
}

function renderPersonDocs(q, base, who, year) {
  if (get(`${base}.mode`) === 'manual') return renderManualDocs(q, base, who, year);
  const pron = who === 'spouse' ? 'של בן/בת הזוג' : 'שלך';
  const docs = get(`${base}.docs`) || [];
  let html = `<h3>מסמכים ${pron} לשנת ${year}</h3>
    <p>מעלים את הקבצים, והאפליקציה ממלאת את המספרים לבד. הקבצים נקראים בתוך הדפדפן ולא יוצאים מהמחשב.</p>
    <p class="small"><b>מה להעלות:</b> (1) ריכוז נתוני שכר מכלל המעסיקים, (2) טופס 106 מכל מעסיק שמופיע בריכוז, (3) אישור תשלומים שנתי מביטוח לאומי, ואישורי מס של ביטוח לאומי אם יש.</p>
    ${HOWTO_SUMMARY}${HOWTO_BTL}
    ${q.yn(`${base}.miluimDirect`, `עשית${who === 'spouse' ? ' (בן/בת הזוג)' : ''} מילואים בשנת ${year} ושולם ${who === 'spouse' ? 'לו/לה' : 'לך'} ישירות מביטוח לאומי (לא דרך המשכורת)?`, 'אם התגמול הגיע עם המשכורת, הוא כבר בטופס 106. אם הוא נכנס לבנק מביטוח לאומי, צריך את האישור השנתי על תגמולי מילואים.')}
    <label class="drop"><input type="file" accept="application/pdf,.pdf" multiple data-upload="${base}" data-upyear="${year}">
      <b>בחירת קבצי PDF</b><span class="small muted">אפשר לבחור כמה קבצים ביחד, ולהוסיף עוד אחר כך</span></label>`;
  if (state.ui.reading === base) html += '<div class="notice info">קורא את הקבצים…</div>';
  if (docs.length) {
    html += `<table class="files">${docs.map((d, i) => {
      const ok = !['unknown', 'scanned', 'legacy106', 'error'].includes(d.type) && (!d.year || d.year === year);
      const what = d.type === 'error' ? 'לא הצלחנו לפתוח את הקובץ' : (DOC_TYPES[d.type] || d.type) + (d.year ? `, ${d.year}` : '') + (d.employer?.name ? `, ${d.employer.name}` : '');
      return `<tr><td>${ok ? '✓' : '⚠'}</td><td><bdi dir="ltr">${esc(d.fileName)}</bdi><div class="small muted">${esc(what)}</div></td><td><button class="btn link" type="button" data-rmdoc="${base}|${i}">הסרה</button></td></tr>`;
    }).join('')}</table>`;
  }
  const { s, need, btl, complete } = docsState(base, year);
  set(`${base}.docsOk`, complete ? 'yes' : '');
  const bad = docs.filter((d) => ['unknown', 'scanned', 'legacy106', 'error'].includes(d.type));
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
  if (need.length) html += `<div class="q${q.missCls(`${base}.docsOk`)}" data-q="${base}.docsOk"><div class="notice warn"><b>עוד חסר:</b><ul>${need.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div></div>`;
  q.req(`${base}.docsOk`);
  if (complete) {
    html += q.choice(`${base}.docsConfirmed`, 'המספרים בטבלה תואמים למה שכתוב בטפסים?', [['yes', 'כן, תואמים'], ['no', 'לא, משהו לא נכון']], 'כדאי להציץ בטופס ה-106 ולהשוות לפחות את ההכנסה (158/172) ואת המס (042).');
    if (get(`${base}.docsConfirmed`) === 'no') {
      q.req(`${base}.fixNeeded`); // לא ממשיכים עם מספרים שהמשתמש אמר שהם לא נכונים
      html += `<div class="q${q.missCls(`${base}.fixNeeded`)}" data-q="${base}.fixNeeded"><div class="notice warn">אפשר לתקן את המספרים ידנית, ולספר לנו מה לא נקרא נכון (כפתור "נתקעתי כאן"). <button class="btn link" type="button" data-mode="${base}|manual">מעבר לעריכה ידנית, עם המספרים שמצאנו</button></div></div>`;
    }
  }
  html += `<p class="small"><button class="btn link" type="button" data-mode="${base}|manual">אין לי את הקבצים, אני רוצה להקליד ידנית</button></p>`;
  return html;
}

function renderManualDocs(q, base, who, year) {
  const pron = who === 'spouse' ? 'של בן/בת הזוג' : 'שלך';
  let html = `<h3>מסמכים ${pron} לשנת ${year}: הקלדה ידנית</h3>
    <p><button class="btn link" type="button" data-mode="${base}|upload">חזרה להעלאת קבצים (מומלץ)</button></p>
    ${HOWTO_SUMMARY}
    ${q.num(`${base}.employersCount`, `כמה מעסיקים מופיעים ב"ריכוז נתוני שכר מכלל המעסיקים" ${pron} לשנת ${year}?`,
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
  if (m === 'divorced') html += q.yn(`${y}.alimony`, `שילמת מזונות לבן/בת זוג לשעבר בשנת ${year}?`);
  html += `
    ${q.yn(`${y}.otherIncome`, `היו לך${couple ? ' או לבן/בת הזוג' : ''} בשנת ${year} הכנסות מהשכרת דירה, מכירת מניות או קריפטו, דיבידנד, או הכנסות מחו"ל?`)}
    ${q.yn(`${y}.severance`, `קיבלת${couple ? ' (או בן/בת הזוג)' : ''} בשנת ${year} כסף לחשבון הבנק מפיצויים, או משכת כסף מקופת פנסיה, גמל או קרן השתלמות לפני הזמן?`, 'אם עזבת עבודה והפיצויים נשארו בקרן הפנסיה ולא משכת אותם, עונים "לא". המעסיק אולי נתן לך טופס 161, אבל אם הכסף לא יצא מהקרן אין כאן הכנסה לדווח עליה. קרן השתלמות אחרי 6 שנים: גם "לא".')}
    ${q.yn(`${y}.settlement`, `גרת בפועל ביישוב מזכה בשנת ${year}?`, 'בפועל = מרכז החיים: שם ישנת, שם גרו הילדים. רישום בתעודת הזהות לבד לא מספיק.')}`;
  if (get(`${y}.settlement`) === 'yes') html += `<div class="sub">${q.num(`${y}.settlementMonths`, 'כמה חודשים בשנה הזו גרת שם בפועל?', '', { min: 1, max: 12 })}</div>`;
  html += q.yn(`${y}.lifeIns`, `שילמת בעצמך בשנת ${year} על ביטוח חיים, כולל ביטוח חיים של משכנתא?`, 'הכוונה לביטוח שאתה משלם, למשל בהוראת קבע לחברת הביטוח או דרך הבנק של המשכנתא. ביטוח שהמעסיק מפריש לך דרך התלוש לא נחשב כאן. אם כן, תצטרך להוריד "אישור שנתי למס הכנסה" מהאזור האישי באתר של חברת הביטוח שלך.');
  if (get(`${y}.lifeIns`) === 'yes') html += `<div class="sub">${q.num(`${y}.lifeInsAmount`, 'סכום הפרמיות בשנה לפי האישור')}</div>`;
  html += q.yn(`${y}.disability`, `שילמת בשנת ${year} ביטוח אובדן כושר עבודה פרטי (לא דרך המעסיק)?`);
  if (get(`${y}.disability`) === 'yes') html += `<div class="sub">${q.num(`${y}.disabilityAmount`, 'סכום ששילמת בשנה')}</div>`;
  html += q.yn(`${y}.privatePension`, `הפקדת בעצמך לפנסיה או לקופת גמל בשנת ${year} (לא דרך המעסיק)?`);
  html += q.yn(`${y}.donations`, `תרמת בשנת ${year} למוסד מוכר (סעיף 46) עם קבלה?`);
  if (get(`${y}.donations`) === 'yes') html += `<div class="sub">${q.num(`${y}.donationsAmount`, 'סכום התרומות בשנה')}</div>`;
  html += q.yn(`${y}.institution`, `שילמת בשנת ${year} על אחזקת קרוב משפחה במוסד (ילד, בן/בת זוג או הורה)?`);
  if (get(`${y}.institution`) === 'yes') html += `<div class="sub">${q.num(`${y}.institutionAmount`, 'סכום ששילמת בשנה')}</div>`;

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

function yearOut(year) {
  const y = `years.${year}`;
  if (get(`${y}.marital`) === 'separated') return 'נשואים שחיים בנפרד מגישים עם טופס 4440, וזה עוד לא נתמך. מומלץ רואה חשבון.';
  if (get(`${y}.otherIncome`) === 'yes') return 'הכנסות מנכסים, מניות, קריפטו או מחו"ל עוד לא נתמכות. מומלץ רואה חשבון.';
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
    const { s, btl } = docsState(base, year);
    const employers = s.employers.map((e) => ({ name: e.name, income: e.income, taxWithheld: e.taxWithheld, pensionDeposit: e.pensionDeposit, settlementCode: e.settlementCode }));
    return { gender, flags, employers, btl: btl.map((b) => ({ label: b.label, gross: b.gross, taxWithheld: b.taxWithheld })), credits: {}, settlement: { employerGave: employers.reduce((t, e) => t + (e.settlementCode || 0), 0) } };
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

function caseFor(year) {
  const y = (k) => get(`years.${year}.${k}`);
  const kids = kidsYears().some((b) => year - b >= 0 && year - b <= 18);
  const m = y('marital');
  const couple = m === 'married';
  const dy = Number(get('me.degreeYear')), sy = Number(get('me.dischargeYear'));
  const flags = {
    kids,
    singleParent: kids && !couple && m !== 'commonLaw',
    degree: get('me.degree') === 'yes' && (year === dy || year === dy + 1),
    dischargedSoldier: get('me.served') === 'yes' && year >= sy && year <= sy + 3,
    alimony: y('alimony') === 'yes',
    spousePoints: couple && y('spouseIncome') === 'no' && y('spouseSpecial') === 'yes',
  };
  const self = { role: 'self', ...personFrom(`years.${year}.self`, get('me.gender'), flags, year) };
  self.credits = {
    lifeInsurance: y('lifeIns') === 'yes' ? +y('lifeInsAmount') : 0,
    disabilityInsurance: y('disability') === 'yes' ? +y('disabilityAmount') : 0,
    donations: y('donations') === 'yes' ? +y('donationsAmount') : 0,
    institutionRelative: y('institution') === 'yes' ? +y('institutionAmount') : 0,
  };
  self.settlement.livedMonths = y('settlement') === 'yes' ? +y('settlementMonths') : 0;
  const people = [self];
  if (couple && y('spouseIncome') === 'yes') {
    const sp = { role: 'spouse', ...personFrom(`years.${year}.spouse`, y('spouseGender'), { kids }, year) };
    sp.settlement.livedMonths = self.settlement.livedMonths;
    people.push(sp);
  }
  return { maritalStatus: m, people, needsBankProof: get('me.prevRefund') !== 'yes' };
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

function renderResults() {
  const sel = get('screen.selectedYears') || [];
  const rs = sel.map(resultFor);
  const tracked = state.ui.trackedResults || (state.ui.trackedResults = {});
  rs.forEach((r) => {
    const key = `${r.year}:${r.status}:${r.balance ?? ''}`;
    if (tracked[r.year] !== key) { track('year_result', { status: r.status, bucket: r.balance != null ? amountBucket(r.balance) : '-' }); tracked[r.year] = key; }
  });
  save();
  const refunds = rs.filter((r) => r.status === 'refund');
  const total = refunds.reduce((s, r) => s + r.balance, 0);
  const totalIdx = refunds.reduce((s, r) => s + (r.indexation || 0), 0);
  let html = `<h1>התוצאה</h1>`;
  if (refunds.length) html += `<div class="card result refund"><div class="muted">סה"כ החזר צפוי ${refunds.length === 1 ? 'בשנה אחת' : `ב-${refunds.length} שנים`}</div><div class="amount">${fmt(total)} ₪</div><div>ועוד כ-${fmt(totalIdx)} ₪ הצמדה וריבית (הערכה)</div></div>`;
  html += '<div class="row"><button class="btn secondary" type="button" data-go="years">חזרה לתיקון התשובות</button></div>';
  html += '<p class="muted small">החישוב לפי מה שמסרת. לפני כל הגשה תלחצו על "חישוב" באתר רשות המסים ותשוו למספרים כאן.</p>';
  for (const r of rs) {
    const [title, rec] = STATUS_TEXT[r.status];
    html += `<div class="card result ${r.status}"><h2 style="margin-top:0">${r.year}: ${title}</h2>`;
    if (r.balance != null && r.status !== 'blocked') {
      html += `<div class="amount">${r.balance < 0 ? '−' : ''}${fmt(Math.abs(r.balance))} ₪</div>`;
      if (r.indexation) html += `<div>ועוד כ-${fmt(r.indexation)} ₪ הצמדה וריבית עד היום (הערכה, הסכום ממשיך לגדול עד התשלום)</div>`;
      const L = (k) => r.results.reduce((s, p) => s + p.lines[k], 0);
      html += `<table class="calc">
        <tr><td>סה"כ הכנסות<div class="muted small">משכורת ותשלומי ביטוח לאומי</div></td><td class="num">${fmt(L('totalIncome'))}</td></tr>
        <tr><td>מס ברוטו<div class="muted small">לפי מדרגות המס של ${r.year}</div></td><td class="num">${fmt(L('grossTax'))}</td></tr>
        <tr><td>זיכויים<div class="muted small">נקודות זיכוי (${r.results.map((p) => p.lines.points).join(' + ')}) × ערך נקודה. זיכוי מוריד מהמס, לא מההכנסה</div></td><td class="num">−${fmt(L('credits'))}</td></tr>
        <tr><td>מס שהיה צריך לשלם</td><td class="num">${fmt(L('taxDue'))}</td></tr>
        <tr><td>מס שנוכה בפועל<div class="muted small">מכל טופסי ה-106 ואישורי ביטוח לאומי</div></td><td class="num">${fmt(L('withheld'))}</td></tr>
      </table>`;
      if (r.reasons?.length) html += `<p><b>למה?</b> ${r.reasons.join(' ')}</p>`;
    }
    if (rec) html += `<p>${rec}</p>`;
    if (r.stops?.length) html += `<div class="notice warn">${r.stops.join('<br>')}</div>`;
    if (r.status === 'blocked') html += `<div class="notice warn">${r.blocks.map(esc).join('<br>')}</div><p class="small muted">כשחסר מסמך, אפשר להשלים אותו ולחזור. כשהכלל עוד לא אומת אצלנו, נעדכן את האפליקציה בקרוב. לא נחשב שום דבר שלא בדקנו מול מקור רשמי.</p>`;
    if (r.status === 'out') html += `<div class="notice warn">${esc(r.blocks[0])}</div>`;
    if (r.status !== 'refund') html += `<button class="btn link" type="button" data-edit="${r.year}">תיקון התשובות ל-${r.year}</button>`;
    if (r.status === 'refund') html += `<p class="small muted">מועד אחרון להגשה: ${deadline(r.year)}</p><button class="btn" data-guide="${r.year}" type="button">מדריך הגשה ל-${r.year}</button>`;
    html += '</div>';
  }
  return html;
}

// ---------- step: guide ----------
function renderGuide() {
  const year = state.ui.guideYear;
  const r = resultFor(year);
  const g = buildGuide(year, caseFor(year), r);
  let html = `<h1>מדריך הגשה ל-${year}</h1>
    <p>ממלאים את הטופס לפי הסדר כאן. רק השדות שכתובים כאן ממלאים, כל השאר נשארים ריקים. ליד כל ערך כתוב מאיפה הוא הגיע.</p>
    <div class="notice info">הכינו לפני שנכנסים: את כל הקבצים, פרטי חשבון בנק, ובערך 40 דקות רצופות. המערכת מנתקת אחרי זמן, אז לוחצים "שמירה" אחרי כל לשונית.</div>
    <p><a href="https://www.gov.il/he/service/itc135" target="_blank" rel="noopener">לאתר רשות המסים ←</a></p>`;
  g.tabs.forEach((t, i) => {
    html += `<div class="card"><h2 style="margin-top:0">${i + 1}. ${t.title}</h2>`;
    if (t.steps) html += `<ol>${t.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
    if (t.fields.length) {
      html += `<table class="fields">${t.fields.map((f) => `<tr><td><b>${esc(f.field)}</b><div class="src">מקור: ${esc(f.source)}</div></td><td>${esc(f.value)}</td><td><button class="copy" type="button" data-copy="${esc(String(f.value).replace(/,/g, ''))}">העתקה</button></td></tr>`).join('')}</table>`;
    }
    if (t.note) html += `<p class="small muted">${esc(t.note)}</p>`;
    html += '</div>';
  });
  html += '<button class="btn" type="button" data-go="after">הגשתי, מה עכשיו?</button> <button class="btn link" type="button" data-go="results">חזרה לתוצאות</button>';
  return html;
}

function renderAfter() {
  return `<h1>אחרי ההגשה</h1>
  <div class="card"><h3 style="margin-top:0">לשמור</h3><ul>
    <li>PDF של מסך "אישור הגשת הדו"ח" (תיק + שנה + גרסה = המזהה של ההגשה)</li>
    <li>PDF של נתוני הדיווח</li>
    <li>את כל המסמכים שצירפת, וקבלות תרומה אם יש</li></ul></div>
  <div class="card"><h3 style="margin-top:0">לעקוב</h3>
    <p>במסך הכניסה של 1301: מספר תיק + שנה, ואז "בדיקת מצב שידור דו"ח שנתי ליחיד". כשההחזר מאושר תופיע "הודעת שומה" עם הסכום. כדאי לבדוק כל 2–3 שבועות.</p>
    <p>אם פקיד השומה מבקש מסמך: מעלים אותו דרך "הוספת מסמכים לאחר הגשת הדו"ח".</p></div>
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
    <footer>התשובות נשמרות רק במחשב הזה, כדי שתוכל לסגור את הדף ולהמשיך אחר כך. הן לא נשלחות לשום מקום. <button class="btn link" type="button" id="wipe">מחיקת התשובות שלי מהמחשב הזה</button> (למשל אם זה מחשב משותף, או כדי להתחיל מחדש)</footer>`;
  app._ctx = ctx;
  if (focusPath) document.querySelector(`[data-path="${CSS.escape(focusPath)}"]`)?.focus();
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
    const y = Number(el.dataset.years);
    const sel = new Set(get('screen.selectedYears') || []);
    el.checked ? sel.add(y) : sel.delete(y);
    set('screen.selectedYears', [...sel].sort());
  } else if (el.dataset.path) {
    set(el.dataset.path, el.dataset.num ? (el.value === '' ? '' : Number(el.value)) : el.value);
  } else return;
  save();
  render();
});

app.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button');
  if (!t) return;
  if (t.dataset.rmdoc) {
    const [base, i] = t.dataset.rmdoc.split('|');
    const docs = get(`${base}.docs`) || [];
    docs.splice(Number(i), 1);
    set(`${base}.docs`, docs); set(`${base}.docsConfirmed`, ''); save(); render(); return;
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
    const missing = ctx.req.filter((p) => p === 'screen.selectedYears' ? !(get(p) || []).length : !answered(get(p)));
    if (missing.length) {
      if (state.step === 'years' && ctx.firstIncompleteYear && ctx.firstIncompleteYear !== state.ui.year) state.ui.year = ctx.firstIncompleteYear;
      render(true);
      document.querySelector('.q.missing')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    return go(STEPS[STEPS.indexOf(state.step) + 1]);
  }
  if (t.dataset.edit) { state.ui.year = Number(t.dataset.edit); return go('years'); }
  if (t.dataset.guide) { state.ui.guideYear = Number(t.dataset.guide); track('guide_open'); return go('guide'); }
  if (t.dataset.go) return go(t.dataset.go);
  if (t.dataset.copy !== undefined) {
    try { await navigator.clipboard.writeText(t.dataset.copy); t.textContent = 'הועתק ✓'; } catch { t.textContent = 'לא הצלחתי'; }
    setTimeout(() => (t.textContent = 'העתקה'), 1500);
    return;
  }
  if (t.id === 'filedBtn' && !state.ui.filed) { state.ui.filed = true; save(); track('filed'); render(); return; }
  if (t.id === 'wipe' && confirm('למחוק את כל התשובות והמספרים שהזנת?')) {
    try { localStorage.removeItem(STORE); } catch {}
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
