import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";

export async function GET(request: Request) {
  if (!await ensureDatabase()) return NextResponse.json([]);
  const taskId = new URL(request.url).searchParams.get("taskId");
  return NextResponse.json(await sql!`SELECT id, task_id AS "taskId", tag FROM task_tags WHERE task_id = ${Number(taskId ?? 0)} ORDER BY tag`);
}

export async function POST(request: Request) {
  const body = await request.json(); if (!body.taskId || !body.tag) return NextResponse.json({ error: "Task and tag are required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ...body, persisted: false }, { status: 201 });
  const rows = await sql!`INSERT INTO task_tags (task_id, tag) VALUES (${Number(body.taskId)}, ${body.tag}) ON CONFLICT DO NOTHING RETURNING id, task_id AS "taskId", tag`;
  return NextResponse.json(rows[0] ?? { ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const body = await request.json(); if (!body.taskId || !body.tag) return NextResponse.json({ error: "Task and tag are required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ok: true, persisted: false });
  await sql!`DELETE FROM task_tags WHERE task_id = ${Number(body.taskId)} AND tag = ${body.tag}`; return NextResponse.json({ ok: true });
}

