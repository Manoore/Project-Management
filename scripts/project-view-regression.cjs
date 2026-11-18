const ts = require('typescript'), fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const output = {};
const constants = { taskStatuses: ['To do', 'In progress', 'Review', 'Done'], taskPriorities: ['Low', 'Normal', 'High', 'Urgent'] };
const mocks = { './project-tools':{}, './bulk-work-controls':{}, './delivery-tools.module.css':{}, '@/lib/work-items': constants, './task-dialog': {}, './cycle-panel': {}, './project-workspace.module.css': {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/project-workspace.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: output, require: id => mocks[id] ?? require(id) });
const { filterProjectWork, normalizeProjectView } = output;
const defaults = normalizeProjectView(null);
const task = (overrides) => ({ id: 1, projectId: 10, projectName: 'Delivery', title: 'Plan launch', description: '', priority: 'Normal', status: 'To do', completed: false, owner: 'Alex', dueDate: null, labels: [], cycleId: null, ...overrides });
const items = [
  task({ id: 1, title: 'Write launch notes', labels: ['release'], dueDate: '2026-12-06', priority: 'High', cycleId: 7 }),
  task({ id: 2, title: 'Check accessibility', description: 'Keyboard navigation review', labels: ['quality'], dueDate: '2026-12-03', priority: 'Urgent', owner: 'Riya', status: 'Review' }),
  task({ id: 3, title: 'Close old follow-up', completed: true, status: 'In progress' }),
  task({ id: 4, projectId: 11, title: 'Other project with the same name' }),
];
const project = { id: 10, name: 'Delivery' };
const ids = filters => Array.from(filterProjectWork(items, project, { ...defaults, ...filters }), item => item.id);
assert.deepEqual(ids({}), [2, 1, 3], 'Date ordering must put undated tasks last and exclude a same-name different project');
assert.deepEqual(ids({ search: 'PF-1' }), [1], 'Work IDs should be searchable');
assert.deepEqual(ids({ search: 'keyboard' }), [2], 'Descriptions should be searchable');
assert.deepEqual(ids({ label: 'release', owner: 'Alex', priority: 'High', cycleId: '7' }), [1], 'Filters must compose');
assert.deepEqual(ids({ cycleId: 'none', status: 'Review' }), [2]);
assert.deepEqual(ids({ status: 'Done' }), [3], 'Legacy completed tasks must appear only in Done');
assert.deepEqual(ids({ sort: 'priority' }), [2, 1, 3]);
assert.equal(items[0].id, 1, 'Sorting a view must not mutate the source list');
const saved = normalizeProjectView({ layout: 'list', search: 'release', owner: 'Alex', cycleId: '7', sort: 'priority' });
assert.equal(saved.layout, 'list'); assert.equal(saved.cycleId, '7'); assert.equal(saved.sort, 'priority');
const invalid = normalizeProjectView({ layout: 'bad', status: 'bad', priority: 'bad', sort: 'bad', cycleId: 'NaN' });
assert.equal(invalid.layout, 'board'); assert.equal(invalid.status, 'bad', 'An unavailable saved status must stay explicit rather than masquerading as All statuses'); assert.equal(invalid.priority, ''); assert.equal(invalid.sort, 'due'); assert.equal(invalid.cycleId, '');
console.log('PASS: project isolation, Board/List filters, IDs and description search, cycle/owner/priority/label composition, sorting, saved-view normalization, completed-task consistency');
