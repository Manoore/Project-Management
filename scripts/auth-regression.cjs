const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
function load(path, overrides = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, Buffer, Request, require: id => overrides[id] ?? require(id) }, { filename: path });
  return exports;
}
(async () => {
  const p = load('lib/passwords.ts');
  const a = await p.hashPassword('correct-horse-very-long-password');
  const b = await p.hashPassword('correct-horse-very-long-password');
  assert.notEqual(a, b, 'Each password must receive a random salt');
  assert.equal(await p.checkPassword('correct-horse-very-long-password', a), true);
  assert.equal(await p.checkPassword('wrong-password', a), false);
  assert.equal(await p.checkPassword('anything', 'invalid'), false);
  const db = { sql: async () => [] };
  const auth = load('lib/auth.ts', { '@/lib/db': db, './demo-admin': load('lib/demo-admin.ts') });
  await assert.rejects(auth.getCurrentUser(new Request('https://example.com')));
  await assert.rejects(auth.getCurrentUser(new Request('https://example.com', { headers: { 'x-employee': 'Maya', 'x-session-id': 'development' } })));
  await assert.rejects(auth.getCurrentUser(new Request('https://example.com', { headers: { cookie: 'peopleflow_session=invalid' } })));
  await assert.rejects(auth.getCurrentUser(new Request('https://example.com', { headers: { cookie: 'peopleflow_session=00000000-0000-4000-8000-000000000000' } })));
  console.log('PASS: salted passwords, correct/incorrect password, malformed hash, missing/header-only/malformed/expired sessions');
})().catch(error => { console.error(error); process.exitCode = 1; });

