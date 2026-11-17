const ts = require('typescript'), fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/workload.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject });
const { matchesWork, workloadDate } = exportsObject;
const task = { id: 1, completed: false, status: 'To do', dueDate: '2026-11-16' };
assert.equal(matchesWork(task, 'overdue', '2026-11-17', '2026-11-24'), true);
assert.equal(matchesWork({ ...task, dueDate: '2026-11-17' }, 'overdue', '2026-11-17', '2026-11-24'), false);
assert.equal(matchesWork({ ...task, dueDate: '2026-11-17' }, 'soon', '2026-11-17', '2026-11-24'), true);
assert.equal(matchesWork({ ...task, dueDate: '2026-11-24' }, 'soon', '2026-11-17', '2026-11-24'), true);
assert.equal(matchesWork({ ...task, dueDate: '2026-11-25' }, 'soon', '2026-11-17', '2026-11-24'), false);
assert.equal(matchesWork({ ...task, dueDate: null }, 'overdue', '2026-11-17', '2026-11-24'), false);
assert.equal(matchesWork({ ...task, dueDate: null, status: 'Review' }, 'review', '2026-11-17', '2026-11-24'), true);
assert.equal(matchesWork({ ...task, completed: true }, 'open', '2026-11-17', '2026-11-24'), false);
assert.equal(matchesWork({ ...task, status: 'Done' }, 'open', '2026-11-17', '2026-11-24'), false);
assert.equal(workloadDate(new Date(2026, 10, 17, 1)), '2026-11-17');
console.log('PASS: overdue boundaries, next-seven-day range, missing deadlines, review queue, completed task exclusion, local calendar dates');

