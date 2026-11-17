const ts = require('typescript'), fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
function load(path, overrides = {}) { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, console, Request, URL, require: id => overrides[id] ?? require(id) }); return exports; }
(async () => {
  const work = load('lib/work-items.ts');
  assert.ok(work.validateTaskInput({ description: 'x'.repeat(10001) }));
  assert.ok(work.validateTaskInput({ labels: ['   '] }));
  assert.ok(work.validateTaskInput({ labels: Array(11).fill('one') }));
  assert.ok(work.validateTaskInput({ cycleId: -1 }));
  assert.ok(work.validateTaskInput({ cycleId: '1' }));
  assert.equal(work.validateTaskInput({ description: '', labels: [], cycleId: null }), null);
  assert.deepEqual(Array.from(work.normalizeTaskLabels(['  design ', 'design', 'qa'])), ['design', 'qa']);
  assert.ok(work.validateCycleInput({ name: 'Cycle', startDate: '2026-02-30', endDate: '2026-03-01' }));
  assert.ok(work.validateCycleInput({ name: 'Cycle', startDate: '2026-12-10', endDate: '2026-12-01' }));
  assert.equal(work.validateCycleInput({ name: 'Cycle', startDate: '2026-12-01', endDate: '2026-12-10' }), null);
  let role = 'member', visible = true, assignmentAllowed = true, assigneeAllowed = true, taskProject = 'Project';
  const calls = [], transactions = [];
  const sql = (strings, ...values) => {
    const text = strings.join('?'); const query = { text, values }; calls.push(query);
    const result = text.startsWith('SELECT project_name FROM tasks') ? [{ project_name: taskProject }]
      : text.startsWith('SELECT id FROM projects WHERE id =') || (text.startsWith('SELECT id FROM projects WHERE name =') && !text.includes('ORDER BY id')) ? (assigneeAllowed ? [{ id: 3 }] : [])
      : text.startsWith('SELECT id, project_id') ? [{ id: 8, projectId: 3, startDate: '2026-12-01', endDate: '2026-12-10' }]
      : text.startsWith('SELECT id FROM projects') || text.startsWith('SELECT p.id FROM tasks') ? [{ id: 3 }]
      : text.startsWith('INSERT INTO tasks') || text.startsWith('UPDATE tasks SET title') ? (assignmentAllowed ? [{ id: 9, title: 'Task', projectName: 'Project', cycleId: 8 }] : [])
      : text.startsWith('INSERT INTO project_cycles') || text.startsWith('UPDATE project_cycles') ? [{ id: 8, projectId: 3, archived: true }]
      : [];
    const promise = Promise.resolve(result); promise.query = query; return promise;
  };
  sql.transaction = async (queries, options) => { transactions.push({ queries: queries.map(q => q.query), options }); return Promise.all(queries); };
  const mocks = {
    '@/lib/auth': { getCurrentUser: async () => ({ name: 'Signed In', team: 'Engineering', accessRole: role }), canManageProjects: u => ['manager', 'admin'].includes(u.accessRole) },
    '@/lib/db': { ensureDatabase: async () => true, sql }, '@/lib/work-items': work,
    '@/lib/task-access': { canAccessTask: async () => true }, '@/lib/project-access': { getVisibleProject: async () => visible ? { id: 3, name: 'Project', owner: 'Signed In' } : null },
  };
  const req = (body, url = 'https://example.com/api/cycles') => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const cycles = load('app/api/cycles/route.ts', mocks), tasks = load('app/api/tasks/route.ts', mocks);
  const cycle = { projectId: 3, name: 'December delivery', startDate: '2026-12-01', endDate: '2026-12-10' };
  assert.equal((await cycles.POST(req(cycle))).status, 403, 'Members cannot create cycles');
  role = 'manager'; visible = false;
  assert.equal((await cycles.GET(new Request('https://example.com/api/cycles?projectId=3'))).status, 404);
  assert.equal((await cycles.POST(req(cycle))).status, 404, 'Invisible projects cannot receive cycles');
  visible = true;
  assert.equal((await cycles.POST(req(cycle))).status, 201);
  assert.equal((await cycles.PATCH(req({ id: 8, startDate: '2026-12-20' }))).status, 400, 'Partial date updates must respect the retained end date');
  assert.equal((await cycles.PATCH(req({ id: 8, archived: true }))).status, 200);
  const archive = transactions.at(-1);
  assert.equal(archive.options.isolationLevel, 'ReadCommitted');
  assert.ok(archive.queries[0].text.includes('pg_advisory_xact_lock'));
  assert.ok(archive.queries[2].text.includes('cycle_id = NULL'), 'Archive retains tasks and clears assignments');
  assert.equal((await tasks.POST(req({ title: 'Personal', projectName: 'General', cycleId: 8 }))).status, 400);
  assignmentAllowed = false;
  assert.equal((await tasks.POST(req({ title: 'Task', projectName: 'Project', cycleId: 8 }))).status, 409, 'Unavailable or wrong-project cycle must not be assigned');
  assignmentAllowed = true;
  assert.equal((await tasks.PATCH(req({ id: 9, cycleId: 8, description: 'Acceptance criteria', labels: ['qa', ' qa '] }))).status, 200);
  assert.ok(transactions.at(-1).queries[1].text.includes('AND NOT archived'));
  assert.equal((await tasks.PATCH(req({ id: 9, cycleId: null, labels: [], description: '' }))).status, 200);
  const update = calls.filter(c => c.text.startsWith('UPDATE tasks SET title')).at(-1);
  assert.ok(update.text.includes('cycle_id = CASE WHEN'));
  assert.ok(update.text.includes('labels = CASE WHEN'));
  assert.ok(update.values.includes('[]'), 'Explicit empty labels must be persisted');
  assert.ok(work.validateTaskInput({ owner: '   ' }));
  assert.equal((await tasks.POST(req({ title: 'Private transfer', projectName: 'General', owner: 'Other User' }))).status, 400);
  assigneeAllowed = false;
  const deniedCreate = await tasks.POST(req({ title: 'Unshared work', projectName: 'Project', owner: 'Other User' }));
  assert.equal(deniedCreate.status, 400); assert.equal((await deniedCreate.json()).error, 'Add this person to the project before assigning work');
  taskProject = 'General';
  assert.equal((await tasks.PATCH(req({ id: 9, owner: 'Other User' }))).status, 400);
  taskProject = 'Project';
  assert.equal((await tasks.PATCH(req({ id: 9, owner: 'Other User' }))).status, 400);
  assigneeAllowed = true;
  assert.equal((await tasks.PATCH(req({ id: 9, owner: 'Other User' }))).status, 200);
  console.log('PASS: planning validation, label normalization, cycle permissions, date ranges, archive transaction, cycle and assignee access guards, General transfer rejection, clearing metadata');
})().catch(e => { console.error(e); process.exitCode = 1; });
