export type WorkItem = { id: number; title: string; projectName: string; owner: string; priority: string; status: string; dueDate: string | null; completed: boolean; canEdit?: boolean };
export const taskStatuses = ['To do', 'In progress', 'Review', 'Done'];
export const taskPriorities = ['Low', 'Normal', 'High', 'Urgent'];
export function validateTaskInput(body: Record<string, unknown>) {
  if ('title' in body && (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200)) return 'Use a task title of 1–200 characters';
  if ('priority' in body && !taskPriorities.includes(String(body.priority))) return 'Choose a valid priority';
  if ('status' in body && !taskStatuses.includes(String(body.status))) return 'Choose a valid status';
  if ('dueDate' in body && body.dueDate !== null && body.dueDate !== '') {
    if (typeof body.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) || !Number.isFinite(Date.parse(body.dueDate)) || new Date(body.dueDate).toISOString().slice(0, 10) !== body.dueDate) return 'Choose a valid due date';
  }
  return null;
}

