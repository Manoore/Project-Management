const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
function load(path, overrides) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, process: { env: { DATABASE_URL: 'test-only' } }, console, Request, require: id => overrides[id] ?? require(id) });
  return exports;
}
(async () => {
  let queries = 0;
  const db = load('lib/db.ts', { '@neondatabase/serverless': { neon: () => async () => { queries++; return [{ version: 'ready' }]; } } });
  await Promise.all([db.ensureDatabase(), db.ensureDatabase(), db.ensureDatabase()]);
  assert.equal(queries, 1, 'Concurrent requests should share one initialization');
  await db.ensureDatabase(); assert.equal(queries, 1, 'Warm requests should not rerun migrations');
  let role = 'member'; const calls = [];
  const route = load('app/api/projects/route.ts', {
    '@/lib/auth': { getCurrentUser: async () => ({ name: 'Project Creator', team: 'Engineering', accessRole: role }), canManageProjects: u => u.accessRole === 'manager' || u.accessRole === 'admin' },
    '@/lib/db': { ensureDatabase: async () => true, sql: async (strings, ...values) => { calls.push({ text: strings.join('?'), values }); return strings.join('').includes('WITH created') ? [{ id: 42, name: 'Launch' }] : []; } }
  });
  const request = body => new Request('https://example.com/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await route.POST(request({ name: 'Launch' }))).status, 403);
  assert.equal(calls.length, 0, 'Members must not insert projects');
  role = 'manager'; assert.equal((await route.POST(request({ name: '   ' }))).status, 400);
  const response = await route.POST(request({ name: ' Launch ', owner: 'Other Owner' }));
  assert.equal(response.status, 201); assert.equal((await response.json()).id, 42);
  const mutation = calls.find(x => x.text.includes('WITH created'));
  assert.ok(mutation.text.includes('INSERT INTO project_members'));
  assert.ok(mutation.values.includes('Project Creator'), 'Creator must retain project access when assigning another owner');
  console.log('PASS: initialization cache, concurrent initialization, permission denial, blank-name validation, atomic creation and creator membership');
})().catch(error => { console.error(error); process.exitCode = 1; });

