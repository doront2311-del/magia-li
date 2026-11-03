import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/worker.js';

function fakeEnv() {
  const rows = [];
  return {
    rows, ADMIN_TOKEN: 'secret',
    DB: { prepare: (sql) => ({ bind: (...a) => ({ run: async () => rows.push({ sql, a }) }), all: async () => ({ results: [] }) }) },
  };
}
const post = (body) => new Request('https://x/event', { method: 'POST', body: JSON.stringify(body) });

test('אירוע מותר נשמר, שדות לא מוכרים נזרקים', async () => {
  const env = fakeEnv();
  const r = await worker.fetch(post({ name: 'year_result', status: 'refund', bucket: '5k-10k', idNumber: '123456789' }), env);
  assert.equal(r.status, 200);
  assert.equal(env.rows.length, 1);
  assert.ok(!JSON.stringify(env.rows[0].a).includes('123456789'));
});

test('אירוע לא מוכר נדחה', async () => {
  const env = fakeEnv();
  assert.equal((await worker.fetch(post({ name: 'income', value: 70617 }), env)).status, 400);
  assert.equal(env.rows.length, 0);
});

test('stats דורש סיסמה', async () => {
  const env = fakeEnv();
  assert.equal((await worker.fetch(new Request('https://x/stats'), env)).status, 401);
  const ok = await worker.fetch(new Request('https://x/stats', { headers: { Authorization: 'Bearer secret' } }), env);
  assert.equal(ok.status, 200);
});
