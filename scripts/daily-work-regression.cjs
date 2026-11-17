const ts = require('typescript'), fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
function load(path, overrides) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, console, Request, URL, require: id => overrides[id] ?? require(id) });
  return exports;
}
(async () => {
  const calls = []; let allowed = false;
  const mocks = { '@/lib/auth': { getCurrentUser: async () => ({ name: 'Real User', initials: 'RU', accessRole: 'member' }) }, '@/lib/db': { ensureDatabase: async () => true, sql: async (strings, ...values) => {
    const query = strings.join('?'); calls.push({ query, values });
    if (query.startsWith('SELECT id FROM tasks')) return allowed ? [{ id: 7 }] : [];
    if (query.startsWith('UPDATE tasks')) return [{ id: 7, completed: false, status: 'To do' }];
    return [];
  } } };
  const dashboard = load('app/api/dashboard/route.ts', mocks);
  const request = body => new Request('https://example.com/api/dashboard', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const transactions = [];
  mocks['@/lib/db'].sql.transaction = async (callback, options) => {
    const statements = [];
    callback((strings, ...values) => { statements.push({ text: strings.join('?'), values }); return {}; });
    transactions.push({ statements, options });
  };
  assert.equal((await dashboard.POST(request({ type: 'clock', action: 'in' }))).status, 200);
  assert.equal((await dashboard.POST(request({ type: 'clock', action: 'out' }))).status, 200);
  assert.equal(transactions.length, 2);
  assert.ok(transactions[0].statements[0].text.includes('pg_advisory_xact_lock'));
  assert.ok(transactions[0].statements[1].text.includes('NOT EXISTS'));
  assert.ok(transactions[1].statements[1].text.includes('clocked_out_at = NOW()'));
  assert.equal(transactions[0].options.isolationLevel, 'ReadCommitted');
  assert.ok(transactions.every(t => t.statements.every(s => s.values.includes('Real User'))));
  assert.equal((await dashboard.POST(request({ type: 'mood', value: '😊' }))).status, 200);
  assert.ok(calls[0].values.includes('Real User'));
  assert.ok(!calls[0].values.includes('Maya'));
  const before = calls.length;
  assert.equal((await dashboard.POST(request({ type: 'mood', value: 'invalid' }))).status, 400);
  assert.equal(calls.length, before, 'Invalid mood must not be saved');
  mocks['@/lib/task-access'] = { canAccessTask: async () => allowed };
  mocks['@/lib/work-items'] = load('lib/work-items.ts', {});
  const tasks = load('app/api/tasks/route.ts', mocks);
  assert.equal((await tasks.PATCH(request({ id: 7, completed: false, status: 'To do' }))).status, 404, 'Task access must be checked before mutation');
  allowed = true;
  const reopened = await tasks.PATCH(request({ id: 7, completed: false, status: 'To do' }));
  assert.equal(reopened.status, 200); assert.equal((await reopened.json()).completed, false);
  await tasks.GET(new Request('https://example.com/api/tasks?mine=true'));
  const personalQuery = calls.find(c => c.query.includes('ORDER BY CASE status'));
  assert.ok(personalQuery.values.includes(false), 'Personal query must enforce owner filter');
  console.log('PASS: signed-in check-ins, invalid mood rejection, task access denial, reopening tasks, personal queue owner filter');
})().catch(error => { console.error(error); process.exitCode = 1; });

