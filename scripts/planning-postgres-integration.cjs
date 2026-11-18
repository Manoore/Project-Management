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
  try { await client.query(`BEGIN ISOLATION LEVEL ${options.isolationLevel === 'Serializable' ? 'SERIALIZABLE' : options.isolationLevel === 'RepeatableRead' ? 'REPEATABLE READ' : 'READ COMMITTED'}${options.readOnly?' READ ONLY':''}`); const statements = typeof input === 'function' ? input(query) : input; const results = []; for (const statement of statements) results.push((await client.query(statement.text, statement.values)).rows); await client.query('COMMIT'); return results; }
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
  const bulk = load('app/api/tasks/bulk/route.ts');
  const second = await checked(await tasks.POST(request('/api/tasks', { title: 'Bulk companion', projectName: project.name })), 201);
  const selection = { projectId: project.id, ids: [task.id, second.id], changes: { status: 'Done', labels: [' QA ', 'QA'] } };
  const bulkResult = await checked(await bulk.PATCH(request('/api/tasks/bulk', selection, 'PATCH')), 200);
  assert.equal(bulkResult.updatedCount, 2); assert.ok(bulkResult.tasks.every(t => t.completed && t.status === 'Done')); assert.deepEqual(bulkResult.tasks[0].labels, ['QA']);
  await checked(await bulk.PATCH(request('/api/tasks/bulk', { ...selection, ids: [task.id, 2147483647], changes: { status: 'Review' } }, 'PATCH')), 409);
  assert.equal((await checked(await tasks.GET(request(`/api/tasks?id=${task.id}`, null, 'GET')), 200)).status, 'Done');
  await checked(await bulk.PATCH(request('/api/tasks/bulk', { ...selection, changes: { owner: 'Unshared Person' } }, 'PATCH')), 409);
  await checked(await bulk.PATCH(request('/api/tasks/bulk', { ...selection, changes: { cycleId: cycle.id } }, 'PATCH')), 409);
  const foreign = await checked(await tasks.POST(request('/api/tasks', { title: 'Other project work', projectName: other.name })), 201);
  await checked(await bulk.PATCH(request('/api/tasks/bulk', { ...selection, ids: [task.id, foreign.id], changes: { status: 'Review' } }, 'PATCH')), 409);
  const auditBefore = (await pool.query("SELECT COUNT(*)::int AS count FROM activity_events WHERE event_type = 'task_bulk_updated' AND message LIKE $1", [`%PF-${task.id}:%`])).rows[0].count;
  assert.equal(auditBefore, 1);
  await pool.query("CREATE OR REPLACE FUNCTION qa_reject_bulk_activity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type = 'task_bulk_updated' THEN RAISE EXCEPTION 'Simulated activity failure'; END IF; RETURN NEW; END $$");
  await pool.query('CREATE TRIGGER qa_reject_bulk BEFORE INSERT ON activity_events FOR EACH ROW EXECUTE FUNCTION qa_reject_bulk_activity()');
  try {
    await checked(await bulk.PATCH(request('/api/tasks/bulk', { ...selection, changes: { status: 'Review' } }, 'PATCH')), 503);
    assert.equal((await checked(await tasks.GET(request(`/api/tasks?id=${task.id}`, null, 'GET')), 200)).status, 'Done', 'Audit failure must roll back task changes');
  } finally { await pool.query('DROP TRIGGER qa_reject_bulk ON activity_events'); await pool.query('DROP FUNCTION qa_reject_bulk_activity()'); }
  const reset = await checked(await bulk.PATCH(request('/api/tasks/bulk', { ...selection, changes: { status: 'To do', labels: [], dueDate: null, cycleId: null } }, 'PATCH')), 200);
  assert.ok(reset.tasks.every(t => !t.completed && t.labels.length === 0 && t.cycleId === null && t.dueDate === null));
  console.log('PASS actual PostgreSQL: atomic bulk changes, cross-project/missing ID rejection, assignee/cycle guards, audit rollback and explicit field clearing');
  const workflow=load('app/api/workflow/route.ts'), documents=load('app/api/project-documents/route.ts'), modules=load('app/api/project-modules/route.ts'), analytics=load('app/api/project-analytics/route.ts');
  const stages=await checked(await workflow.GET(request(`/api/workflow?projectId=${project.id}`,null,'GET')),200);assert.equal(stages.length,4);
  const stage=await checked(await workflow.POST(request('/api/workflow',{projectId:project.id,name:'Ready for release',category:'Review',position:3})),201);
  await checked(await tasks.PATCH(request('/api/tasks',{id:task.id,workflowStateId:stage.id},'PATCH')),200);
  let stageTask=await checked(await tasks.GET(request(`/api/tasks?id=${task.id}`,null,'GET')),200);assert.equal(stageTask.workflowStateId,stage.id);assert.equal(stageTask.status,'Review');assert.equal(stageTask.completed,false);
  await pool.query('UPDATE tasks SET completed=TRUE WHERE id=$1',[task.id]);
  const legacyComplete=await checked(await tasks.GET(request(`/api/tasks?id=${task.id}`,null,'GET')),200);assert.equal(legacyComplete.status,'Done');assert.equal(legacyComplete.workflowStateId,null,'Legacy completion must not leave a task stuck in a custom open stage');
  await checked(await tasks.PATCH(request('/api/tasks',{id:task.id,workflowStateId:stage.id},'PATCH')),200);
  await checked(await workflow.PATCH(request('/api/workflow',{projectId:project.id,id:stage.id,name:'Released',category:'Done',position:5},'PATCH')),200);
  stageTask=await checked(await tasks.GET(request(`/api/tasks?id=${task.id}`,null,'GET')),200);assert.equal(stageTask.status,'Done');assert.equal(stageTask.completed,true);
  await checked(await workflow.PATCH(request('/api/workflow',{projectId:project.id,id:stages[0].id,name:'Default invalid',category:'Done',position:0},'PATCH')),409);
  await checked(await tasks.PATCH(request('/api/tasks',{id:foreign.id,workflowStateId:stage.id},'PATCH')),409);
  const bulkStage=await checked(await bulk.PATCH(request('/api/tasks/bulk',{...selection,changes:{workflowStateId:stage.id}},'PATCH')),200);assert.ok(bulkStage.tasks.every(t=>t.status==='Done'&&t.completed&&t.workflowStateId===stage.id));
  await checked(await workflow.DELETE(request('/api/workflow',{projectId:project.id,id:stage.id},'DELETE')),200);
  stageTask=await checked(await tasks.GET(request(`/api/tasks?id=${task.id}`,null,'GET')),200);assert.equal(stageTask.workflowStateId,null);assert.equal(stageTask.completed,true);
  const document=await checked(await documents.POST(request('/api/project-documents',{projectId:project.id,title:'Launch decisions',body:'Release after accessibility review.'})),201);
  const revisions=await Promise.all(['A','B'].map(body=>documents.PATCH(request('/api/project-documents',{projectId:project.id,id:document.id,version:document.version,title:document.title,body},'PATCH'))));assert.deepEqual(revisions.map(r=>r.status).sort(),[200,409]);
  const history=await checked(await documents.GET(request(`/api/project-documents?projectId=${project.id}&history=${document.id}`,null,'GET')),200);assert.equal(history.length,2);assert.equal(history[0].version,2);
  await checked(await documents.PATCH(request('/api/project-documents',{projectId:other.id,id:document.id,version:2,title:'Forbidden edit',body:'No'},'PATCH')),409);
  const mod=await checked(await modules.POST(request('/api/project-modules',{projectId:project.id,name:'Accessibility release',description:'Complete the accessible portal.',owner:project.owner,targetDate:'2026-12-01'})),201);
  await checked(await modules.PATCH(request('/api/project-modules',{projectId:project.id,action:'assign',moduleId:mod.id,taskId:task.id},'PATCH')),200);
  await checked(await modules.PATCH(request('/api/project-modules',{projectId:other.id,action:'assign',moduleId:mod.id,taskId:foreign.id},'PATCH')),409);
  const moduleList=await checked(await modules.GET(request(`/api/project-modules?projectId=${project.id}`,null,'GET')),200);assert.equal(moduleList[0].taskCount,1);assert.equal(moduleList[0].completedCount,1);
  const moduleTask=await checked(await tasks.POST(request('/api/tasks',{title:'Work created inside a module',projectName:project.name,moduleId:mod.id})),201);assert.equal(moduleTask.moduleId,mod.id);
  await checked(await tasks.POST(request('/api/tasks',{title:'Wrong project module',projectName:other.name,moduleId:mod.id})),409);
  await checked(await tasks.PATCH(request('/api/tasks',{id:foreign.id,moduleId:mod.id},'PATCH')),409);
  await checked(await bulk.PATCH(request('/api/tasks/bulk',{...selection,changes:{moduleId:mod.id}},'PATCH')),200);
  const insights=await checked(await analytics.GET(request(`/api/project-analytics?projectId=${project.id}`,null,'GET')),200);assert.equal(insights.summary.total,3);assert.equal(insights.summary.completed,2);assert.equal(insights.trend.length,30);assert.ok(insights.trend.reduce((sum,r)=>sum+r.completed,0)>=2);
  await checked(await modules.DELETE(request('/api/project-modules',{projectId:project.id,id:mod.id,version:mod.version},'DELETE')),200);
  assert.equal((await checked(await tasks.GET(request(`/api/tasks?id=${task.id}`,null,'GET')),200)).moduleId,null);
  await checked(await documents.DELETE(request('/api/project-documents',{projectId:project.id,id:document.id,version:2},'DELETE')),200);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM project_document_versions WHERE document_id=$1',[document.id])).rows[0].count,2);
  console.log('PASS actual PostgreSQL: workflow stages/category changes, completion consistency, cross-project rejection, bulk custom stages, document revision conflicts/history, modules/allocation/archive retention, analytics and recorded delivery events');
  const signup = await auth.POST(request('/api/auth/session', { mode: 'signup', email: `member-${suffix}@example.test`, name: 'Isolated Member', password: 'Local-integration-test-only' })); await checked(signup, 200); const memberCookie = signup.headers.get('set-cookie').split(';')[0];
  await checked(await cycles.GET(request(`/api/cycles?projectId=${project.id}`, null, 'GET', memberCookie)), 404);
  await checked(await tasks.GET(request(`/api/tasks?id=${task.id}`, null, 'GET', memberCookie)), 404);
  await checked(await bulk.PATCH(request('/api/tasks/bulk', selection, 'PATCH', memberCookie)), 409);
  for(const [handler,path] of [[workflow,'workflow'],[modules,'project-modules'],[documents,'project-documents'],[analytics,'project-analytics']])await checked(await handler.GET(request(`/api/${path}?projectId=${project.id}`,null,'GET',memberCookie)),404);
  const member=await load('lib/auth.ts').getCurrentUser(request('/api/profile',null,'GET',memberCookie));
  await pool.query('INSERT INTO project_members(project_name,employee_name) VALUES($1,$2)',[project.name,member.name]);
  await checked(await documents.POST(request('/api/project-documents',{projectId:project.id,title:'Member collaboration',body:'Shared project notes.'},'POST',memberCookie)),201);
  await checked(await workflow.POST(request('/api/workflow',{projectId:project.id,name:'Forbidden config',category:'Review',position:4},'POST',memberCookie)),403);
  await checked(await modules.POST(request('/api/project-modules',{projectId:project.id,name:'Forbidden module'},'POST',memberCookie)),403);
  await checked(await modules.PATCH(request('/api/project-modules',{projectId:project.id,action:'assign',moduleId:null,taskId:task.id},'PATCH',memberCookie)),200);
  await pool.query("UPDATE employees SET access_role='viewer' WHERE name=$1",[member.name]);
  await checked(await documents.GET(request(`/api/project-documents?projectId=${project.id}`,null,'GET',memberCookie)),200);
  await checked(await documents.POST(request('/api/project-documents',{projectId:project.id,title:'Read only',body:'Must fail'},'POST',memberCookie)),403);
  await checked(await modules.PATCH(request('/api/project-modules',{projectId:project.id,action:'assign',moduleId:null,taskId:task.id},'PATCH',memberCookie)),403);
  await checked(await bulk.PATCH(request('/api/tasks/bulk',selection,'PATCH',memberCookie)),403);
  console.log('PASS actual PostgreSQL: outsider isolation, member collaboration/configuration limits, viewer read-only enforcement and legacy completion compatibility');
  await checked(await cycles.POST(request('/api/cycles', { projectId: project.id, name: 'Forbidden', startDate: '2026-11-17', endDate: '2026-11-30' }, 'POST', memberCookie)), 403);
  const profile = load('app/api/profile/route.ts'); await checked(await profile.PATCH(request('/api/profile', { displayName: 'Demo QA Admin', jobTitle: 'Product Lead' }, 'PATCH')), 200);
  console.log('PASS actual PostgreSQL: password login, project/cycle/task creation, labels/description persistence, progress counts, saved view reload, cross-project cycle rejection, archive retention, clearing metadata, member access denial, profile update');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
