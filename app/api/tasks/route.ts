import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canAccessTask } from '@/lib/task-access';
import { validateTaskInput } from '@/lib/work-items';

export async function GET(request: Request) {
  if (!await ensureDatabase()) return NextResponse.json([]);
  const employee = (await getCurrentUser(request)).name;
  const requestedId = Number(new URL(request.url).searchParams.get('id'));
  if (requestedId) {
    if (!await canAccessTask(await getCurrentUser(request), requestedId)) return NextResponse.json({ error: 'Task unavailable' }, { status: 404 });
    const rows = await sql!`SELECT id, title, project_name AS "projectName", owner, priority, status, due_date AS "dueDate", completed FROM tasks WHERE id = ${requestedId}`;
    return NextResponse.json({ ...rows[0], canEdit: (await getCurrentUser(request)).accessRole !== 'viewer' });
  }
  const mine = new URL(request.url).searchParams.get("mine") === "true";
  const rows = await sql!`SELECT id, title, project_name AS "projectName", status, owner, priority, due_date AS "dueDate", completed FROM tasks WHERE (${!mine} OR owner = ${employee}) AND ((project_name = 'General' AND owner = ${employee}) OR project_name IN (SELECT name FROM projects WHERE archived = FALSE AND (owner = ${employee} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${employee}))) ) ORDER BY CASE status WHEN 'In progress' THEN 1 WHEN 'Review' THEN 2 WHEN 'To do' THEN 3 ELSE 4 END, due_date NULLS LAST, id`;
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (user.accessRole === 'viewer') return NextResponse.json({ error: 'Viewers cannot create work' }, { status: 403 });
  const body = await request.json();
  if (!body.title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  const validationError = validateTaskInput(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  body.title = body.title.trim();
  if (!await ensureDatabase()) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  body.owner = body.owner || user.name;
  if (!body.projectName || body.projectName === 'General') { body.projectName = 'General'; body.owner = user.name; }
  else {
    const projects = await sql!`SELECT id FROM projects WHERE name = ${body.projectName} AND NOT archived AND (owner = ${user.name} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${user.name}))`;
    if (!projects.length) return NextResponse.json({ error: 'Project unavailable or not shared with you' }, { status: 403 });
  }
  const rows = await sql!`INSERT INTO tasks (title, project_name, priority, status, completed, owner, due_date, start_date, task_type, estimate_minutes, recurring_rule) VALUES (${body.title}, ${body.projectName ?? "General"}, ${body.priority ?? "Normal"}, ${body.status ?? "To do"}, ${body.status === "Done"}, ${body.owner ?? "Maya"}, ${body.dueDate || null}, ${body.startDate || null}, ${body.taskType ?? "Task"}, ${body.estimateMinutes ?? null}, ${body.recurringRule ?? null}) RETURNING id, title, project_name AS "projectName", status, owner, priority, due_date AS "dueDate", start_date AS "startDate", task_type AS "taskType", estimate_minutes AS "estimateMinutes", recurring_rule AS "recurringRule", completed`;
  await sql!`INSERT INTO activity_events (employee_name, event_type, message) VALUES (${user.name}, 'task_created', ${`Created task: ${body.title}`})`;
  return NextResponse.json(rows[0], { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser(request);
  if (user.accessRole === 'viewer') return NextResponse.json({ error: 'Viewers cannot change work' }, { status: 403 });
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "Task id is required" }, { status: 400 });
  const validationError = validateTaskInput(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  if (typeof body.title === 'string') body.title = body.title.trim();
  if (body.status) body.completed = body.status === 'Done';
  else if (typeof body.completed === 'boolean') body.status = body.completed ? 'Done' : 'To do';
  if (!await ensureDatabase()) return NextResponse.json({ ok: true, persisted: false });
  if (!await canAccessTask(user, Number(body.id), true)) return NextResponse.json({ error: 'Task unavailable' }, { status: 404 });
  const rows = await sql!`UPDATE tasks SET title = COALESCE(${body.title ?? null}, title), status = COALESCE(${body.status ?? null}, status), owner = COALESCE(${body.owner ?? null}, owner), priority = COALESCE(${body.priority ?? null}, priority), due_date = CASE WHEN ${Object.prototype.hasOwnProperty.call(body, "dueDate")} THEN ${body.dueDate || null}::date ELSE due_date END, start_date = COALESCE(${body.startDate ?? null}, start_date), task_type = COALESCE(${body.taskType ?? null}, task_type), estimate_minutes = COALESCE(${body.estimateMinutes ?? null}, estimate_minutes), recurring_rule = COALESCE(${body.recurringRule ?? null}, recurring_rule), completed = COALESCE(${body.completed ?? null}, completed), updated_at = NOW() WHERE id = ${Number(body.id)} RETURNING id, title, project_name AS "projectName", status, owner, priority, due_date AS "dueDate", start_date AS "startDate", task_type AS "taskType", estimate_minutes AS "estimateMinutes", recurring_rule AS "recurringRule", completed`;
  const task = rows[0] as { title: string; status: string; owner: string } | undefined;
  if (task) await sql!`INSERT INTO activity_events (employee_name, event_type, message) VALUES (${user.name}, 'task_updated', ${`Updated ${task.title}: ${task.status} · owner ${task.owner}`})`;
  return NextResponse.json(task ?? { error: "Task not found" }, { status: task ? 200 : 404 });
}


