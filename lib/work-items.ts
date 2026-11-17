export type WorkItem = { id: number; title: string; projectName: string; projectId?: number | null; owner: string; priority: string; status: string; dueDate: string | null; completed: boolean; canEdit?: boolean; description?: string; labels?: string[]; cycleId?: number | null };
export const taskStatuses = ['To do', 'In progress', 'Review', 'Done'];
export const taskPriorities = ['Low', 'Normal', 'High', 'Urgent'];
export function validateTaskInput(body: Record<string, unknown>) {
  if ('owner' in body && (typeof body.owner !== 'string' || !body.owner.trim() || body.owner.trim().length > 200)) return 'Choose a valid assignee';
  if ('description' in body && (typeof body.description !== 'string' || body.description.length > 10000)) return 'Use a description up to 10,000 characters';
  if ('labels' in body && (!Array.isArray(body.labels) || body.labels.length > 10 || body.labels.some(label => typeof label !== 'string' || !label.trim() || label.trim().length > 30))) return 'Use up to 10 labels of 1–30 characters each';
  if ('cycleId' in body && body.cycleId !== null && (!Number.isSafeInteger(body.cycleId) || Number(body.cycleId) < 1)) return 'Choose a valid cycle';
  if ('title' in body && (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200)) return 'Use a task title of 1–200 characters';
  if ('priority' in body && !taskPriorities.includes(String(body.priority))) return 'Choose a valid priority';
  if ('status' in body && !taskStatuses.includes(String(body.status))) return 'Choose a valid status';
  if ('dueDate' in body && body.dueDate !== null && body.dueDate !== '') {
    if (typeof body.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) || !Number.isFinite(Date.parse(body.dueDate)) || new Date(body.dueDate).toISOString().slice(0, 10) !== body.dueDate) return 'Choose a valid due date';
  }
  return null;
}

export function normalizeTaskLabels(labels: string[]) { return Array.from(new Set(labels.map(label => label.trim()))); }
export function validCalendarDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validateCycleInput(body: Record<string, unknown>, partial = false) {
  if ((!partial || 'name' in body) && (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100)) return 'Use a cycle name of 1–100 characters';
  if ((!partial || 'startDate' in body) && !validCalendarDate(body.startDate)) return 'Choose a valid start date';
  if ((!partial || 'endDate' in body) && !validCalendarDate(body.endDate)) return 'Choose a valid end date';
  if (typeof body.startDate === 'string' && typeof body.endDate === 'string' && body.endDate < body.startDate) return 'End date must be on or after start date';
  if ('archived' in body && typeof body.archived !== 'boolean') return 'Archive state must be true or false';
  return null;
}
