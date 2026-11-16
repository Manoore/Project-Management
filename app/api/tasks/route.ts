import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";

export async function GET() {
  if (!await ensureDatabase()) return NextResponse.json([]);
  const rows = await sql!`SELECT id, title, project_name AS "projectName", status, owner, priority, due_date AS "dueDate", completed FROM tasks ORDER BY CASE status WHEN 'In progress' THEN 1 WHEN 'Review' THEN 2 WHEN 'To do' THEN 3 ELSE 4 END, due_date NULLS LAST, id`;
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ id: 0, ...body });
  const rows = await sql!`INSERT INTO tasks (title, project_name, priority, status, owner, due_date) VALUES (${body.title}, ${body.projectName ?? "General"}, ${body.priority ?? "Normal"}, ${body.status ?? "To do"}, ${body.owner ?? "Maya"}, ${body.dueDate || null}) RETURNING id, title, project_name AS "projectName", status, owner, priority, due_date AS "dueDate", completed`;
  await sql!`INSERT INTO activity_events (employee_name, event_type, message) VALUES ('Maya', 'task_created', ${`Created task: ${body.title}`})`;
  return NextResponse.json(rows[0], { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "Task id is required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ok: true, persisted: false });
  const rows = await sql!`UPDATE tasks SET status = COALESCE(${body.status ?? null}, status), owner = COALESCE(${body.owner ?? null}, owner), completed = COALESCE(${body.completed ?? null}, completed), updated_at = NOW() WHERE id = ${Number(body.id)} RETURNING id, title, project_name AS "projectName", status, owner, priority, due_date AS "dueDate", completed`;
  const task = rows[0] as { title: string; status: string; owner: string } | undefined;
  if (task) await sql!`INSERT INTO activity_events (employee_name, event_type, message) VALUES ('Maya', 'task_updated', ${`Updated ${task.title}: ${task.status} · owner ${task.owner}`})`;
  return NextResponse.json(task ?? { error: "Task not found" }, { status: task ? 200 : 404 });
}
