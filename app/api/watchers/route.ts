import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";

export async function GET(request: Request) {
  if (!await ensureDatabase()) return NextResponse.json([]);
  const taskId = new URL(request.url).searchParams.get("taskId"); return NextResponse.json(await sql!`SELECT id, task_id AS "taskId", employee_name AS "employeeName" FROM task_watchers WHERE task_id = ${Number(taskId ?? 0)} ORDER BY employee_name`);
}

export async function POST(request: Request) {
  const body = await request.json(); if (!body.taskId || !body.employeeName) return NextResponse.json({ error: "Task and employee are required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ...body, persisted: false }, { status: 201 });
  const rows = await sql!`INSERT INTO task_watchers (task_id, employee_name) VALUES (${Number(body.taskId)}, ${body.employeeName}) ON CONFLICT DO NOTHING RETURNING id, task_id AS "taskId", employee_name AS "employeeName"`; return NextResponse.json(rows[0] ?? { ok: true }, { status: 201 });
}

