// שמירת הקבצים שהמשתמש העלה, רק בדפדפן שלו (IndexedDB), כדי שיוכל לפתוח אותם שוב מתוך האפליקציה.
// הקבצים לא נשלחים לשום מקום. אם IndexedDB חסום (מצב פרטי), שומרים בזיכרון עד שסוגרים את הדף.

const DB = 'magia-li-files';
const OS = 'files';
const mem = new Map();

function open() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(OS);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(OS, mode);
    const req = fn(t.objectStore(OS));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export async function putFile(key, blob) {
  mem.set(key, blob);
  try { await tx('readwrite', (s) => s.put(blob, key)); } catch { /* נשאר בזיכרון */ }
}
export async function getFile(key) {
  if (mem.has(key)) return mem.get(key);
  try { return (await tx('readonly', (s) => s.get(key))) || null; } catch { return null; }
}
export async function delFile(key) {
  mem.delete(key);
  try { await tx('readwrite', (s) => s.delete(key)); } catch {}
}
export async function clearFiles() {
  mem.clear();
  try { await tx('readwrite', (s) => s.clear()); } catch {}
}

// שם ברור לקובץ לפי מה שזיהינו בו, למשל "2021-106-הגר-רם.pdf".
const slug = (s) => String(s || '').replace(/בע"?מ|בעמ|\(.*?\)/g, '').replace(/["'״׳]/g, '').trim().replace(/[\s/\\:*?<>|]+/g, '-').replace(/-+$/, '');
const BTL = { unemployment: 'אבטלה', maternity: 'דמי-לידה', injury: 'פגיעה-בעבודה', miluim: 'מילואים' };
export function suggestName(d, year, who) {
  const y = d.year || year;
  const p = who === 'spouse' ? 'בן-זוג-' : '';
  const n = {
    payrollSummary: `ריכוז-נתוני-שכר`,
    form106: `106-${slug(d.employer?.name) || 'מעסיק'}`,
    btlAnnual: 'ביטוח-לאומי-אישור-תשלומים-שנתי',
    btlMiluim: 'ביטוח-לאומי-אישור-מס-מילואים',
    btlTaxCert: `ביטוח-לאומי-אישור-מס-${BTL[d.kind] || 'תשלום'}`,
    btlUnemployment: 'ביטוח-לאומי-אישור-תשלומי-אבטלה',
    residency: 'אישור-תושבות-1312א',
    bankProof: 'אישור-ניהול-חשבון',
  }[d.type];
  return n ? `${y}-${p}${n}.pdf` : null;
}
