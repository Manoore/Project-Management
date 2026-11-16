import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";

export async function GET(request: Request) {
  if (!await ensureDatabase()) return NextResponse.json([]);
  const taskId = new URL(request.url).searchParams.get("taskId");
  return NextResponse.json(await sql!`SELECT id, task_id AS "taskId", title, completed, owner FROM subtasks WHERE task_id = ${Number(taskId ?? 0)} ORDER BY id`);
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.taskId || !body.title) return NextResponse.json({ error: "Task and title are required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ...body, persisted: false }, { status: 201 });
  const rows = await sql!`INSERT INTO subtasks (task_id, title, owner) VALUES (${Number(body.taskId)}, ${body.title}, ${body.owner ?? "Maya"}) RETURNING id, task_id AS "taskId", title, completed, owner`;
  return NextResponse.json(rows[0], { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "Subtask id is required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ok: true, persisted: false });
  const rows = await sql!`UPDATE subtasks SET completed = COALESCE(${body.completed ?? null}, completed), owner = COALESCE(${body.owner ?? null}, owner), title = COALESCE(${body.title ?? null}, title) WHERE id = ${Number(body.id)} RETURNING id, task_id AS "taskId", title, completed, owner`;
  return NextResponse.json(rows[0] ?? { error: "Subtask not found" }, { status: rows[0] ? 200 : 404 });
}

