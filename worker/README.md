# שרת אנליטיקס אנונימי

שרת קטן (Cloudflare Worker, חינמי בהיקף של בטא) שמקבל רק אירועים אנונימיים מהאתר: איזה שלב, טווח סכום ההחזר, טלפון או מחשב. בלי שמות, ת.ז., מסמכים, סכומים מדויקים, IP או עוגיות. רשימת האירועים והשדות סגורה בקוד (`worker.js`).

כל עוד `site/js/config.js` ריק, האתר לא שולח כלום.

## הקמה (פעם אחת, כ-10 דקות)
1. פותחים חשבון חינמי ב-Cloudflare.
2. במחשב: `npm i -g wrangler` ואז `wrangler login`.
3. מתוך התיקייה `worker/`:
   ```
   wrangler d1 create magia-li          # מעתיקים את database_id ל-wrangler.toml
   wrangler d1 execute magia-li --remote --file=schema.sql
   wrangler secret put ADMIN_TOKEN      # סיסמה ארוכה למסך הניהול
   wrangler deploy
   ```
4. את הכתובת שמתקבלת (למשל `https://magia-li-analytics.<name>.workers.dev`) כותבים ב-`site/js/config.js` ב-`ANALYTICS_URL`.
5. ב-`wrangler.toml` משנים את `ALLOWED_ORIGIN` לכתובת האתר (למשל `https://doront2311-del.github.io`).
6. מסך הניהול: `admin.html` באתר. מזינים את כתובת השרת ואת ה-ADMIN_TOKEN.
