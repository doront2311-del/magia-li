// שרת אנליטיקס אנונימי ל"מגיע לי". Cloudflare Worker + D1.
// מקבל רק אירועים מרשימה סגורה, עם שדות מרשימה סגורה. בלי IP, בלי עוגיות, בלי מידע אישי.
//
// POST /event         – אירוע אחד (JSON)
// GET  /stats         – סיכום למסך הניהול. דורש כותרת Authorization: Bearer <ADMIN_TOKEN>

const EVENTS = new Set(['landing_view', 'flow_start', 'share_link', 'app_open', 'step', 'year_result', 'guide_open', 'filed', 'stuck']);
const KEYS = ['step', 'status', 'bucket', 'device', 'screen'];

const cors = (origin) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type',
});
const json = (data, status, origin) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = env.ALLOWED_ORIGIN || '*';
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });

    if (req.method === 'POST' && url.pathname === '/event') {
      let e;
      try { e = JSON.parse(await req.text()); } catch { return json({ ok: false }, 400, origin); }
      if (!EVENTS.has(e.name)) return json({ ok: false }, 400, origin);
      const clip = (v) => (v == null ? null : String(v).slice(0, 40));
      await env.DB.prepare('INSERT INTO events (ts, day, visit, name, step, status, bucket, device, screen) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(Date.now(), new Date().toISOString().slice(0, 10), clip(e.visit), e.name, ...KEYS.map((k) => clip(e[k])))
        .run();
      return json({ ok: true }, 200, origin);
    }

    if (req.method === 'GET' && url.pathname === '/stats') {
      if (!env.ADMIN_TOKEN || req.headers.get('Authorization') !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: 'unauthorized' }, 401, origin);
      const q = (sql) => env.DB.prepare(sql).all().then((r) => r.results);
      const [byName, funnel, buckets, statuses, stuck, daily, devices] = await Promise.all([
        q('SELECT name, COUNT(*) n, COUNT(DISTINCT visit) visits FROM events GROUP BY name'),
        q("SELECT step, COUNT(DISTINCT visit) visits FROM events WHERE name='step' GROUP BY step"),
        q("SELECT bucket, COUNT(*) n FROM events WHERE name='year_result' AND status='refund' GROUP BY bucket"),
        q("SELECT status, COUNT(*) n FROM events WHERE name='year_result' GROUP BY status"),
        q("SELECT screen, COUNT(*) n FROM events WHERE name='stuck' GROUP BY screen"),
        q("SELECT day, COUNT(DISTINCT CASE WHEN name='landing_view' THEN visit END) landing, COUNT(DISTINCT CASE WHEN name='app_open' THEN visit END) started, SUM(name='filed') filed FROM events GROUP BY day ORDER BY day DESC LIMIT 30"),
        q("SELECT device, COUNT(DISTINCT visit) visits FROM events WHERE name IN ('landing_view','app_open') GROUP BY device"),
      ]);
      return json({ byName, funnel, buckets, statuses, stuck, daily, devices }, 200, origin);
    }
    return json({ error: 'not found' }, 404, origin);
  },
};
