import type { WorkItem } from './work-items';
export type WorkFilter = 'open' | 'overdue' | 'soon' | 'review';
export function workloadDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export function matchesWork(item: WorkItem, filter: WorkFilter, today: string, soon: string) {
  if (item.completed || item.status === 'Done') return false;
  const due = item.dueDate?.slice(0, 10);
  if (filter === 'overdue') return Boolean(due && due < today);
  if (filter === 'soon') return Boolean(due && due >= today && due <= soon);
  if (filter === 'review') return item.status === 'Review';
  return true;
}

