import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureDatabase, sql } from '@/lib/db';
import { validateBulkWork } from '@/lib/bulk-work';
import { normalizeTaskLabels } from '@/lib/work-items';

// One project per request. Authorization, updates, and activity are checked and
// written in one SQL statement: an invalid selection changes no tasks.
export async function PATCH(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  let user;
  try { user = await getCurrentUser(request); }
  catch { return NextResponse.json({ error: 'Sign in to update work' }, { status: 401 }); }
  if (user.accessRole === 'viewer') return NextResponse.json({ error: 'Viewers cannot change work' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const invalid = validateBulkWork(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const { projectId, ids, changes } = body;
  const has = (field: string) => Object.prototype.hasOwnProperty.call(changes, field);
  const owner = has('owner') ? changes.owner.trim() : null;
  const labels = normalizeTaskLabels(changes.labels ?? []);
  try {
    if (!await ensureDatabase()) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    const result = await sql!.transaction([
      sql!`SELECT pg_advisory_xact_lock(hashtext('planning:' || ${String(projectId)}))`,
      sql!`WITH selected AS MATERIALIZED (
        SELECT t.id FROM tasks t JOIN projects p ON p.name = t.project_name
        WHERE p.id = ${projectId} AND NOT p.archived
          AND (p.owner = ${user.name} OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_name = p.name AND m.employee_name = ${user.name}))
          AND t.id IN (SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)::integer)
        ORDER BY t.id FOR UPDATE OF t
      ), changed AS (
        UPDATE tasks t SET
          status = COALESCE((SELECT category FROM project_workflow_states WHERE id=${changes.workflowStateId ?? null}),${changes.status ?? null}, t.status),
          completed = CASE WHEN ${has('workflowStateId') && changes.workflowStateId != null} THEN (SELECT category='Done' FROM project_workflow_states WHERE id=${changes.workflowStateId ?? null}) WHEN ${has('status')} THEN ${changes.status === 'Done'} ELSE t.completed END,
          priority = COALESCE(${changes.priority ?? null}, t.priority),
          owner = COALESCE(${owner}, t.owner),
          due_date = CASE WHEN ${has('dueDate')} THEN ${changes.dueDate || null}::date ELSE t.due_date END,
          labels = CASE WHEN ${has('labels')} THEN ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(labels)}::jsonb)) ELSE t.labels END,
          cycle_id = CASE WHEN ${has('cycleId')} THEN ${changes.cycleId ?? null}::integer ELSE t.cycle_id END,
          workflow_state_id = CASE WHEN ${has('workflowStateId')} THEN ${changes.workflowStateId ?? null}::integer WHEN ${has('status')} AND t.status IS DISTINCT FROM ${changes.status ?? null} THEN NULL ELSE t.workflow_state_id END,
          module_id = CASE WHEN ${has('moduleId')} THEN ${changes.moduleId ?? null}::integer ELSE t.module_id END,
          updated_at = NOW()
        FROM selected s WHERE t.id = s.id AND (SELECT COUNT(*) FROM selected) = ${ids.length}
          AND (${owner}::text IS NULL OR EXISTS (SELECT 1 FROM projects p WHERE p.id = ${projectId} AND (p.owner = ${owner} OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_name = p.name AND m.employee_name = ${owner}))))
          AND (${changes.cycleId ?? null}::integer IS NULL OR EXISTS (SELECT 1 FROM project_cycles c WHERE c.id = ${changes.cycleId ?? null} AND c.project_id = ${projectId} AND NOT c.archived))
        AND (${changes.workflowStateId ?? null}::integer IS NULL OR EXISTS(SELECT 1 FROM project_workflow_states WHERE id=${changes.workflowStateId ?? null} AND project_id=${projectId}))
        AND (${changes.moduleId ?? null}::integer IS NULL OR EXISTS(SELECT 1 FROM project_modules WHERE id=${changes.moduleId ?? null} AND project_id=${projectId} AND NOT archived))
        RETURNING t.id, t.workflow_state_id AS "workflowStateId", t.module_id AS "moduleId", t.title, t.project_name AS "projectName", t.owner, t.status, t.completed, t.priority, t.due_date AS "dueDate", t.labels, t.description, t.cycle_id AS "cycleId"
      ), audited AS (
        INSERT INTO activity_events (employee_name, event_type, message)
        SELECT ${user.name}, 'task_bulk_updated', 'Bulk updated PF-' || id::text || ': ' || title FROM changed
      ) SELECT * FROM changed ORDER BY id`
    ], { isolationLevel: 'ReadCommitted' });
    const tasks = result[1];
    if (tasks.length !== ids.length) return NextResponse.json({ error: 'No tasks changed. Check project access, task selection, assignee membership, and cycle availability.' }, { status: 409 });
    return NextResponse.json({ updatedCount: tasks.length, tasks }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Bulk update failed. No partial update was committed.' }, { status: 503 }); }
}
