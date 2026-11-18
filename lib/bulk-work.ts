import { validateTaskInput } from './work-items';

const fields = ['status', 'priority', 'owner', 'dueDate', 'labels', 'cycleId', 'workflowStateId', 'moduleId'];
const validId = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2147483647;

export function validateBulkWork(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Provide a project, task IDs, and changes';
  const input = body as Record<string, unknown>;
  if (!validId(input.projectId)) return 'Choose a valid project';
  if (!Array.isArray(input.ids) || input.ids.length < 1 || input.ids.length > 100 || input.ids.some(id => !validId(id))) return 'Choose between 1 and 100 valid task IDs';
  if (new Set(input.ids).size !== input.ids.length) return 'Choose each task only once';
  if (!input.changes || typeof input.changes !== 'object' || Array.isArray(input.changes)) return 'Provide changes to apply';
  const changes = input.changes as Record<string, unknown>;
  const keys = Object.keys(changes);
  if (!keys.length || keys.some(key => !fields.includes(key))) return 'Bulk changes support status, priority, assignee, due date, labels, and cycle';
  return validateTaskInput(changes);
}
