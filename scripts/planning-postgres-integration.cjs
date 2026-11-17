// Opt-in integration test. Uses only a disposable local PostgreSQL database.
// npm install --prefix ../qa-runtime pg; then set PEOPLEFLOW_TEST_DATABASE_URL.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
const url = process.env.PEOPLEFLOW_TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Set PEOPLEFLOW_TEST_DATABASE_URL to a disposable local database');
const pg = require(path.resolve(process.env.PEOPLEFLOW_TEST_PG_MODULE || '../qa-runtime/node_modules/pg'));
pg.types.setTypeParser(1082, value => value);
const pool = new pg.Pool({ connectionString: url, max: 3 });
const queries = [];
function query(strings, ...values) {
  let text = strings[0]; for (let i = 0; i < values.length; i++) text += `$${i + 1}${strings[i + 1]}`;
  return { text, values, then(resolve, reject) { return pool.query(text, values).then(result => result.rows).then(resolve, reject); } };
}
query.transaction = async (input, options = {}) => {
  const client = await pool.connect();
  try { await client.query(`BEGIN ISOLATION LEVEL ${options.isolationLevel === 'Serializable' ? 'SERIALIZABLE' : 'READ COMMITTED'}`); const statements = typeof input === 'function' ? input(query) : input; const results = []; for (const statement of statements) results.push((await client.query(statement.text, statement.values)).rows); await client.query('COMMIT'); return results; }
  catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
};
const cache = new Map();
function load(file) {
  const full = path.resolve(file); if (cache.has(full)) return cache.get(full);
  const exports = {}; cache.set(full, exports);
  const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const customRequire = id => id === '@neondatabase/serverless' ? { neon: () => query } : id.startsWith('@/') ? load(`${id.slice(2)}.ts`) : id.startsWith('.') ? load(path.resolve(path.dirname(full), id + '.ts')) : require(id);
  vm.runInNewContext(code, { exports, process: { env: { DATABASE_URL: url } }, console, Request, URL, Buffer, require: customRequire }, { filename: full }); return exports;
}
const origin = 'https://peopleflow.test';
let cookie;
function request(route, body, method = 'POST', session = cookie) { return new Request(origin + route, { method, headers: { origin, 'content-type': 'application/json', ...(session ? { cookie: session } : {}) }, ...(method !== 'GET' ? { body: JSON.stringify(body || {}) } : {}) }); }
async function checked(response, status) { const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data; }
(async () => {
  const db = load('lib/db.ts'); assert.equal(await db.ensureDatabase(), true); console.log('PASS actual PostgreSQL: schema migration and demo seeds');
  const auth = load('app/api/auth/session/route.ts');
  const signin = await auth.POST(request('/api/auth/session', { email: 'admin@pmp.com', password: 'PeopleFlow!Demo2026' }));
  await checked(signin, 200); cookie = signin.headers.get('set-cookie').split(';')[0];
  const projects = load('app/api/projects/route.ts'), tasks = load('app/api/tasks/route.ts'), cycles = load('app/api/cycles/route.ts'), views = load('app/api/views/route.ts');
  const suffix = Date.now();
  const project = await checked(await projects.POST(request('/api/projects', { name: `Integration ${suffix}`, team: 'Engineering' })), 201);
  const cycle = await checked(await cycles.POST(request('/api/cycles', { projectId: project.id, name: 'Sprint One', startDate: '2026-11-17', endDate: '2026-11-30' })), 201);
  const task = await checked(await tasks.POST(request('/api/tasks', { title: 'Deliver onboarding', projectName: project.name, priority: 'High', description: 'Acceptance: keyboard support', labels: [' UX ', 'UX', 'QA'], cycleId: cycle.id })), 201);
  assert.deepEqual(task.labels, ['UX', 'QA']); assert.equal(task.cycleId, cycle.id);
  const detail = await checked(await tasks.GET(request(`/api/tasks?id=${task.id}`, null, 'GET')), 200); assert.equal(detail.projectId, project.id); assert.equal(detail.description, 'Acceptance: keyboard support');
  const completed = await checked(await tasks.PATCH(request('/api/tasks', { id: task.id, status: 'Done' }, 'PATCH')), 200); assert.equal(completed.completed, true);
  const cycleList = await checked(await cycles.GET(request(`/api/cycles?projectId=${project.id}`, null, 'GET')), 200); assert.equal(cycleList[0].taskCount, 1); assert.equal(cycleList[0].completedCount, 1);
  await checked(await views.POST(request('/api/views', { name: `QA ${suffix}`, viewType: 'project-work', filters: { projectId: project.id, layout: 'list', priority: 'High', cycleId: String(cycle.id) } })), 201);
  const saved = await checked(await views.GET(request('/api/views', null, 'GET')), 200); assert.ok(saved.some(view => view.filters.projectId === project.id && view.filters.layout === 'list'));
  const other = await checked(await projects.POST(request('/api/projects', { name: `Other ${suffix}` })), 201);
  await checked(await tasks.POST(request('/api/tasks', { title: 'Wrong cycle', projectName: other.name, cycleId: cycle.id })), 409);
  await checked(await cycles.PATCH(request('/api/cycles', { id: cycle.id, archived: true }, 'PATCH')), 200);
  const after = await checked(await tasks.GET(request(`/api/tasks?id=${task.id}`, null, 'GET')), 200); assert.equal(after.cycleId, null); assert.equal(after.id, task.id);
  await checked(await tasks.PATCH(request('/api/tasks', { id: task.id, cycleId: cycle.id }, 'PATCH')), 409);
  const cleared = await checked(await tasks.PATCH(request('/api/tasks', { id: task.id, description: '', labels: [], cycleId: null, status: 'To do' }, 'PATCH')), 200); assert.equal(cleared.description, ''); assert.deepEqual(cleared.labels, []); assert.equal(cleared.completed, false);
  const signup = await auth.POST(request('/api/auth/session', { mode: 'signup', email: `member-${suffix}@example.test`, name: 'Isolated Member', password: 'Local-integration-test-only' })); await checked(signup, 200); const memberCookie = signup.headers.get('set-cookie').split(';')[0];
  await checked(await cycles.GET(request(`/api/cycles?projectId=${project.id}`, null, 'GET', memberCookie)), 404);
  await checked(await tasks.GET(request(`/api/tasks?id=${task.id}`, null, 'GET', memberCookie)), 404);
  await checked(await cycles.POST(request('/api/cycles', { projectId: project.id, name: 'Forbidden', startDate: '2026-11-17', endDate: '2026-11-30' }, 'POST', memberCookie)), 403);
  const profile = load('app/api/profile/route.ts'); await checked(await profile.PATCH(request('/api/profile', { displayName: 'Demo QA Admin', jobTitle: 'Product Lead' }, 'PATCH')), 200);
  console.log('PASS actual PostgreSQL: password login, project/cycle/task creation, labels/description persistence, progress counts, saved view reload, cross-project cycle rejection, archive retention, clearing metadata, member access denial, profile update');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
