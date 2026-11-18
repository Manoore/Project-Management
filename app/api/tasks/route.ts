import { resolveTaskWorkflow } from '@/lib/workflow-assignment';
import { NextResponse } from 'next/server';
import { ensureDatabase, sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { canAccessTask } from '@/lib/task-access';
import { normalizeTaskLabels, validateTaskInput } from '@/lib/work-items';

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  try {
    if (!await ensureDatabase()) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    const params = new URL(request.url).searchParams;
    if (params.has('id')) {
      const id = Number(params.get('id'));
      if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'Choose a valid task' }, { status: 400 });
      if (!await canAccessTask(user, id)) return NextResponse.json({ error: 'Task unavailable' }, { status: 404 });
      const rows = await sql!`SELECT id, title, project_name AS "projectName", (SELECT p.id FROM projects p WHERE p.name = tasks.project_name AND tasks.project_name <> 'General' AND NOT p.archived ORDER BY p.id LIMIT 1) AS "projectId", owner, priority, status, due_date AS "dueDate", completed, description, labels, cycle_id AS "cycleId", workflow_state_id AS "workflowStateId", module_id AS "moduleId" FROM tasks WHERE id = ${id}`;
      if (!rows.length) return NextResponse.json({ error: 'Task unavailable' }, { status: 404 });
      return NextResponse.json({ ...rows[0], canEdit: user.accessRole !== 'viewer' });
    }
    const mine = params.get('mine') === 'true';
    const rows = await sql!`SELECT id, title, project_name AS "projectName", (SELECT p.id FROM projects p WHERE p.name = tasks.project_name AND tasks.project_name <> 'General' AND NOT p.archived ORDER BY p.id LIMIT 1) AS "projectId", status, owner, priority, due_date AS "dueDate", completed, description, labels, cycle_id AS "cycleId", workflow_state_id AS "workflowStateId", module_id AS "moduleId" FROM tasks WHERE (${!mine} OR owner = ${user.name}) AND ((project_name = 'General' AND owner = ${user.name}) OR project_name IN (SELECT name FROM projects WHERE NOT archived AND (owner = ${user.name} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${user.name})))) ORDER BY CASE status WHEN 'In progress' THEN 1 WHEN 'Review' THEN 2 WHEN 'To do' THEN 3 ELSE 4 END, due_date NULLS LAST, id`;
    return NextResponse.json(rows, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Tasks could not load. Please retry.' }, { status: 503 }); }
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (user.accessRole === 'viewer') return NextResponse.json({ error: 'Viewers cannot create work' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) || !body.title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  const validationError = validateTaskInput(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  try {
    if (!await ensureDatabase()) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    const projectName = body.projectName || 'General';
    let projectId: number | null = null;
    if (projectName !== 'General') {
      const projects = await sql!`SELECT id FROM projects WHERE name = ${projectName} AND NOT archived AND (owner = ${user.name} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${user.name})) ORDER BY id LIMIT 1`;
      if (!projects.length) return NextResponse.json({ error: 'Project unavailable or not shared with you' }, { status: 403 });
      projectId = Number(projects[0].id);
    }
    const workflowError = await resolveTaskWorkflow(body, projectName);
    if (workflowError) return NextResponse.json({error:workflowError},{status:409});
    const moduleId=body.moduleId??null;
    const cycleId = body.cycleId ?? null;
    if (cycleId !== null && projectId === null) return NextResponse.json({ error: 'Personal tasks cannot be assigned to project cycles' }, { status: 400 });
    if(moduleId!==null&&projectName==='General')return NextResponse.json({error:'Personal tasks cannot belong to project modules'},{status:400});
    const labels = normalizeTaskLabels(body.labels ?? []);
    const owner = typeof body.owner === 'string' ? body.owner.trim() : user.name;
    if (projectName === 'General' && owner !== user.name) return NextResponse.json({ error: 'Personal tasks must stay assigned to you. Use a shared project to assign work to someone else.' }, { status: 400 });
    if (projectId !== null && owner !== user.name) {
      const assigned = await sql!`SELECT id FROM projects WHERE id = ${projectId} AND NOT archived AND (owner = ${owner} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${owner})) LIMIT 1`;
      if (!assigned.length) return NextResponse.json({ error: 'Add this person to the project before assigning work' }, { status: 400 });
    }
    const insert = () => sql!`INSERT INTO tasks (title, project_name, priority, status, completed, owner, due_date, start_date, task_type, estimate_minutes, recurring_rule, description, labels, cycle_id, workflow_state_id, module_id) SELECT ${body.title.trim()}, ${projectName}, ${body.priority ?? 'Normal'}, COALESCE((SELECT category FROM project_workflow_states WHERE id=${body.workflowStateId ?? null}),${body.status ?? 'To do'}), COALESCE((SELECT category='Done' FROM project_workflow_states WHERE id=${body.workflowStateId ?? null}),${body.status === 'Done'}), ${owner}, ${body.dueDate || null}, ${body.startDate || null}, ${body.taskType ?? 'Task'}, ${body.estimateMinutes ?? null}, ${body.recurringRule ?? null}, ${body.description ?? ''}, ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(labels)}::jsonb)), ${cycleId}::integer, ${body.workflowStateId ?? null}::integer, ${moduleId}::integer WHERE (${cycleId}::integer IS NULL OR EXISTS(SELECT 1 FROM project_cycles WHERE id = ${cycleId} AND project_id = ${projectId} AND NOT archived)) AND (${moduleId}::integer IS NULL OR EXISTS(SELECT 1 FROM project_modules WHERE id=${moduleId} AND project_id=${projectId} AND NOT archived)) RETURNING id, title, project_name AS "projectName", ${projectId}::integer AS "projectId", status, owner, priority, due_date AS "dueDate", start_date AS "startDate", task_type AS "taskType", estimate_minutes AS "estimateMinutes", recurring_rule AS "recurringRule", completed, description, labels, cycle_id AS "cycleId", workflow_state_id AS "workflowStateId", module_id AS "moduleId"`;
    let rows;
    if (cycleId !== null || body.workflowStateId != null || moduleId !== null) {
      const results = await sql!.transaction([sql!`SELECT pg_advisory_xact_lock(hashtext('planning:' || ${String(projectId)}))`, insert()], { isolationLevel: 'ReadCommitted' });
      rows = results[1];
    } else rows = await insert();
    if (!rows.length) return NextResponse.json({ error: 'Cycle or module unavailable, archived, or belongs to another project' }, { status: 409 });
    await sql!`INSERT INTO activity_events (employee_name, event_type, message) VALUES (${user.name}, 'task_created', ${`Created task: ${body.title.trim()}`})`;
    return NextResponse.json(rows[0], { status: 201 });
  } catch { return NextResponse.json({ error: 'Task could not be saved. Refresh before retrying.' }, { status: 503 }); }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser(request);
  if (user.accessRole === 'viewer') return NextResponse.json({ error: 'Viewers cannot change work' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Number.isSafeInteger(Number(body.id)) || Number(body.id) < 1) return NextResponse.json({ error: 'Task id is required' }, { status: 400 });
  const validationError = validateTaskInput(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  if (typeof body.title === 'string') body.title = body.title.trim();
  if (body.status) body.completed = body.status === 'Done';
  else if (typeof body.completed === 'boolean') body.status = body.completed ? 'Done' : 'To do';
  try {
    if (!await ensureDatabase()) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    if (!await canAccessTask(user, Number(body.id), true)) return NextResponse.json({ error: 'Task unavailable' }, { status: 404 });
    if (typeof body.owner === 'string') {
      body.owner = body.owner.trim();
      if (body.owner !== user.name) {
        const taskProjects = await sql!`SELECT project_name FROM tasks WHERE id = ${Number(body.id)}`;
        if (!taskProjects.length) return NextResponse.json({ error: 'Task unavailable' }, { status: 404 });
        if (taskProjects[0].project_name === 'General') return NextResponse.json({ error: 'Personal tasks must stay assigned to you. Use a shared project to assign work to someone else.' }, { status: 400 });
        const assigned = await sql!`SELECT id FROM projects WHERE name = ${taskProjects[0].project_name} AND NOT archived AND (owner = ${body.owner} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${body.owner})) LIMIT 1`;
        if (!assigned.length) return NextResponse.json({ error: 'Add this person to the project before assigning work' }, { status: 400 });
      }
    }
    if (body.workflowStateId != null) {
      const current = await sql!`SELECT project_name FROM tasks WHERE id=${Number(body.id)}`;
      const workflowError = await resolveTaskWorkflow(body, current[0]?.project_name || 'General');
      if (workflowError) return NextResponse.json({error:workflowError},{status:409});
      body.completed = body.status === 'Done';
    }
    const moduleId=body.moduleId??null;
    const cycleId = body.cycleId ?? null;
    let projectId: number | null = null;
    if (cycleId !== null || body.workflowStateId != null || moduleId !== null) {
      const projects = await sql!`SELECT p.id FROM tasks t JOIN projects p ON p.name = t.project_name WHERE t.id = ${Number(body.id)} AND t.project_name <> 'General' AND NOT p.archived AND (p.owner = ${user.name} OR p.name IN (SELECT project_name FROM project_members WHERE employee_name = ${user.name})) ORDER BY p.id LIMIT 1`;
      if (!projects.length) return NextResponse.json({ error: 'Personal tasks cannot be assigned to project cycles' }, { status: 400 });
      projectId = Number(projects[0].id);
    }
    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
    const labels = normalizeTaskLabels(body.labels ?? []);
    const update = () => sql!`UPDATE tasks SET title = COALESCE(${body.title ?? null}, title), status = COALESCE((SELECT category FROM project_workflow_states WHERE id=${body.workflowStateId ?? null}),${body.status ?? null}, status), owner = COALESCE(${body.owner ?? null}, owner), priority = COALESCE(${body.priority ?? null}, priority), due_date = CASE WHEN ${has('dueDate')} THEN ${body.dueDate || null}::date ELSE due_date END, start_date = COALESCE(${body.startDate ?? null}, start_date), task_type = COALESCE(${body.taskType ?? null}, task_type), estimate_minutes = COALESCE(${body.estimateMinutes ?? null}, estimate_minutes), recurring_rule = COALESCE(${body.recurringRule ?? null}, recurring_rule), completed = COALESCE((SELECT category='Done' FROM project_workflow_states WHERE id=${body.workflowStateId ?? null}),${body.completed ?? null}, completed), description = COALESCE(${body.description ?? null}, description), labels = CASE WHEN ${has('labels')} THEN ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(labels)}::jsonb)) ELSE labels END, cycle_id = CASE WHEN ${has('cycleId')} THEN ${cycleId}::integer ELSE cycle_id END, workflow_state_id = CASE WHEN ${has('workflowStateId')} THEN ${body.workflowStateId ?? null}::integer WHEN ${has('status')} AND status IS DISTINCT FROM ${body.status ?? null} THEN NULL ELSE workflow_state_id END, module_id = CASE WHEN ${has('moduleId')} THEN ${moduleId}::integer ELSE module_id END, updated_at = NOW() WHERE id = ${Number(body.id)} AND (${cycleId}::integer IS NULL OR EXISTS(SELECT 1 FROM project_cycles WHERE id = ${cycleId} AND project_id = ${projectId} AND NOT archived)) AND (${moduleId}::integer IS NULL OR EXISTS(SELECT 1 FROM project_modules WHERE id=${moduleId} AND project_id=${projectId} AND NOT archived)) RETURNING id, title, project_name AS "projectName", (SELECT p.id FROM projects p WHERE p.name = tasks.project_name AND tasks.project_name <> 'General' AND NOT p.archived ORDER BY p.id LIMIT 1) AS "projectId", status, owner, priority, due_date AS "dueDate", start_date AS "startDate", task_type AS "taskType", estimate_minutes AS "estimateMinutes", recurring_rule AS "recurringRule", completed, description, labels, cycle_id AS "cycleId", workflow_state_id AS "workflowStateId", module_id AS "moduleId"`;
    let rows;
    if (cycleId !== null || body.workflowStateId != null || moduleId !== null) {
      const results = await sql!.transaction([sql!`SELECT pg_advisory_xact_lock(hashtext('planning:' || ${String(projectId)}))`, update()], { isolationLevel: 'ReadCommitted' });
      rows = results[1];
    } else rows = await update();
    if (!rows.length) return NextResponse.json({ error: 'Task or cycle unavailable. The cycle may be archived or belong to another project.' }, { status: 409 });
    const task = rows[0] as { title: string };
    await sql!`INSERT INTO activity_events (employee_name, event_type, message) VALUES (${user.name}, 'task_updated', ${`Updated ${task.title}`})`;
    return NextResponse.json({ ...rows[0], canEdit: true });
  } catch { return NextResponse.json({ error: 'Task could not be updated. Refresh before retrying.' }, { status: 503 }); }
}
