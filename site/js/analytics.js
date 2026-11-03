// אנליטיקס אנונימי בלבד: שם אירוע, שם שלב וטווח סכום. אף פעם לא שמות, ת.ז., מסמכים או סכומים מדויקים.
// מזהה הביקור אקראי, נוצר מחדש בכל טעינה, ולא נשמר בדפדפן.
import { ANALYTICS_URL } from './config.js';

const visit = Math.random().toString(36).slice(2, 10);
const ALLOWED_KEYS = new Set(['step', 'status', 'bucket', 'device', 'screen', 'years']);

export function track(name, props = {}) {
  const clean = {};
  for (const [k, v] of Object.entries(props)) if (ALLOWED_KEYS.has(k)) clean[k] = String(v).slice(0, 40);
  const event = { name, visit, ...clean };
  if (!ANALYTICS_URL) { console.debug('[analytics off]', event); return; }
  try {
    const body = JSON.stringify(event);
    if (!(navigator.sendBeacon && navigator.sendBeacon(`${ANALYTICS_URL}/event`, body))) {
      fetch(`${ANALYTICS_URL}/event`, { method: 'POST', body, keepalive: true }).catch(() => {});
    }
  } catch { /* analytics must never break the app */ }
}

export const device = () => (matchMedia('(max-width: 700px)').matches ? 'phone' : 'desktop');
