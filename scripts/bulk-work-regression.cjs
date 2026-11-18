const ts = require('typescript'), fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
function load(file, mocks = {}) { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, Request, URL, console, require: id => mocks[id] ?? require(id) }); return exports; }
const work = load('lib/work-items.ts');
const { validateBulkWork } = load('lib/bulk-work.ts', { './work-items': work });
const good = { projectId: 1, ids: [1, 2], changes: { status: 'Review', labels: [], cycleId: null, dueDate: null } };
assert.equal(validateBulkWork(good), null);
for (const body of [null, [], {}, { ...good, projectId: '1' }, { ...good, ids: [] }, { ...good, ids: [1, 1] }, { ...good, ids: [2147483648] }, { ...good, ids: Array.from({ length: 101 }, (_, i) => i + 1) }, { ...good, changes: {} }, { ...good, changes: { title: 'Shared title' } }, { ...good, changes: { status: 'Unknown' } }, { ...good, changes: { labels: [''] } }, { ...good, changes: { dueDate: '2026-02-30' } }]) assert.ok(validateBulkWork(body));
(async () => {
  let role = 'viewer', loggedIn = true, transactionCalled = false;
  const api = load('app/api/tasks/bulk/route.ts', {
    '@/lib/auth': { getCurrentUser: async () => { if (!loggedIn) throw new Error('Unauthenticated'); return { name: 'Tester', accessRole: role }; } },
    '@/lib/bulk-work': { validateBulkWork }, '@/lib/work-items': work,
    '@/lib/db': { ensureDatabase: async () => false, sql: { transaction: () => { transactionCalled = true; } } },
  });
  const req = (body, origin = 'https://test.local') => new Request('https://test.local/api/tasks/bulk', { method: 'PATCH', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await api.PATCH(req(good, 'https://evil.test'))).status, 403);
  assert.equal((await api.PATCH(req(good))).status, 403);
  role = 'member'; loggedIn = false;
  assert.equal((await api.PATCH(req(good))).status, 401);
  loggedIn = true;
  assert.equal((await api.PATCH(req({ ...good, ids: [1, 1] }))).status, 400);
  assert.equal((await api.PATCH(req(good))).status, 503);
  assert.equal(transactionCalled, false);
  console.log('PASS: bulk limits, unique int4 IDs, allowed fields, date/status validation, origin checks, unauthenticated/viewer denial and unavailable-database handling');
})().catch(e => { console.error(e); process.exitCode = 1; });
