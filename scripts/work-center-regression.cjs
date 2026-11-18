const ts = require('typescript'), fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
function load(path, overrides = {}) {
  const exports = {}; const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, console, Request, URL, require: id => overrides[id] ?? require(id) }); return exports;
}
(async () => {
  const input = load('lib/work-items.ts');
  assert.ok(input.validateTaskInput({ title: '   ' })); assert.ok(input.validateTaskInput({ priority: 'Unknown' }));
  assert.ok(input.validateTaskInput({ dueDate: '2026-02-30' })); assert.equal(input.validateTaskInput({ dueDate: null, title: 'Review handover', status: 'Done' }), null);
  let role = 'member', allowed = true; const calls = [];
  const db = { ensureDatabase: async () => true, sql: async (strings, ...values) => { calls.push({ text: strings.join('?'), values }); return [{ id: 10, title: 'Saved', status: 'Done', completed: true }]; } };
  const policy = load('lib/task-access.ts', { './db': db });
  assert.equal(await policy.canAccessTask({ name: 'User', accessRole: 'viewer' }, 10, true), false);
  assert.equal(await policy.canAccessTask({ name: 'User', accessRole: 'member' }, NaN), false);
  assert.equal(calls.length, 0, 'Invalid or viewer writes must not query task data');
  const mocks = { '@/lib/workflow-assignment': {resolveTaskWorkflow:async()=>null}, '@/lib/auth': { getCurrentUser: async () => ({ name: 'Signed In User', accessRole: role }) }, '@/lib/db': db, '@/lib/task-access': { canAccessTask: async () => allowed }, '@/lib/work-items': input };
  const request = body => new Request('https://example.com/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const tasks = load('app/api/tasks/route.ts', mocks);
  assert.equal((await tasks.PATCH(request({ id: 10, dueDate: 'wrong' }))).status, 400);
  assert.equal((await tasks.PATCH(request({ id: 10, title: 'New title', dueDate: null, status: 'Done' }))).status, 200);
  const update = calls.find(c => c.text.startsWith('UPDATE tasks'));
  assert.ok(update.text.includes('due_date = CASE WHEN'), 'Due date clearing must be supported');
  assert.ok(update.values.includes('New title')); assert.ok(update.values.includes(null));
  const comments = load('app/api/task-comments/route.ts', mocks); calls.length = 0;
  await comments.POST(request({ taskId: 10, body: 'Context', employeeName: 'Spoofed Admin' }));
  assert.ok(calls[0].values.includes('Signed In User')); assert.ok(!calls[0].values.includes('Spoofed Admin'));
  allowed = false; calls.length = 0;
  assert.equal((await comments.POST(request({ taskId: 10, body: 'Context' }))).status, 403);
  assert.equal(calls.length, 0, 'Inaccessible task comments must never be inserted');
  console.log('PASS: task field validation, viewer policy, invalid IDs, due-date clearing, task title edits, comment authorship and access checks');
})().catch(e => { console.error(e); process.exitCode = 1; });
