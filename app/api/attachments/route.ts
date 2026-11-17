import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) { if (!await ensureDatabase()) return NextResponse.json([]); const taskId = new URL(request.url).searchParams.get("taskId"); return NextResponse.json(await sql!`SELECT id, task_id AS "taskId", file_name AS "fileName", file_url AS "fileUrl", uploaded_by AS "uploadedBy", created_at AS "createdAt" FROM task_attachments WHERE task_id = ${Number(taskId ?? 0)} ORDER BY created_at DESC`); }
export async function POST(request: Request) { const user = await getCurrentUser(request); const body = await request.json(); if (!body.taskId || !body.fileName || !body.fileUrl) return NextResponse.json({ error: "Task, file name, and file URL are required" }, { status: 400 }); if (!await ensureDatabase()) return NextResponse.json({ ...body, persisted: false }, { status: 201 }); const rows = await sql!`INSERT INTO task_attachments (task_id, file_name, file_url, uploaded_by) VALUES (${Number(body.taskId)}, ${body.fileName}, ${body.fileUrl}, ${user.name}) RETURNING id, task_id AS "taskId", file_name AS "fileName", file_url AS "fileUrl", uploaded_by AS "uploadedBy", created_at AS "createdAt"`; return NextResponse.json(rows[0], { status: 201 }); }

