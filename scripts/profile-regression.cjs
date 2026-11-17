const ts = require('typescript'), fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
function load(path, overrides) { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, Request, URL, require: id => overrides[id] ?? require(id) }); return exports; }
(async () => {
  const calls = []; let validPassword = false;
  const mocks = { '@/lib/auth': { getCurrentUser: async () => ({ name: 'Account Key', accessRole: 'member' }) }, '@/lib/passwords': { hashPassword: async () => 'new-hash', checkPassword: async () => validPassword }, '@/lib/db': { ensureDatabase: async () => true, sql: async (strings, ...values) => { const query = strings.join('?'); calls.push({ query, values }); if (query.includes('RETURNING attempts')) return [{ attempts: 1 }]; if (query.startsWith('SELECT password_hash')) return [{ password_hash: 'old-hash' }]; if (query.startsWith('WITH changed')) return [{ id: 'new-session' }]; return []; } } };
  const request = (body, origin = 'https://example.com') => new Request('https://example.com/api/profile', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) });
  const profile = load('app/api/profile/route.ts', mocks);
  assert.equal((await profile.PATCH(request({ displayName: 'New Name', jobTitle: 'Designer', accessRole: 'admin' }))).status, 400);
  assert.equal(calls.length, 0, 'Privilege fields must be rejected before writes');
  assert.equal((await profile.PATCH(request({ displayName: 'New Name', jobTitle: 'Designer' }, 'https://other.example'))).status, 403);
  assert.equal((await profile.PATCH(request({ displayName: 'New Name', jobTitle: 'Designer' }))).status, 200);
  assert.ok(calls[0].query.includes('SET display_name')); assert.ok(!calls[0].query.includes('SET name ='));
  assert.equal(calls[0].values.at(-1), 'Account Key', 'Profile update must target the authenticated account');
  const password = load('app/api/profile/password/route.ts', mocks); calls.length = 0;
  const body = { currentPassword: 'previous-secret', newPassword: 'different-new-secret' };
  assert.equal((await password.POST(request(body))).status, 400);
  assert.ok(!calls.some(c => c.query.startsWith('WITH changed')), 'Wrong password must never trigger a credential update');
  validPassword = true;
  const response = await password.POST(request(body));
  assert.equal(response.status, 200); assert.ok(response.headers.get('set-cookie').includes('HttpOnly'));
  const update = calls.find(c => c.query.startsWith('WITH changed'));
  assert.ok(update.query.includes('DELETE FROM auth_sessions')); assert.ok(update.query.includes('password_hash ='));
  assert.ok(!JSON.stringify(await response.json()).includes('hash'));
  console.log('PASS: profile ownership, blocked privilege edits, origin validation, stable account identity, current-password verification, session rotation');
})().catch(e => { console.error(e); process.exitCode = 1; });
