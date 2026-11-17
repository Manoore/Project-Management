import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";

export async function GET(request: Request) {
  if (!await ensureDatabase()) return NextResponse.json({ milestones: [], risks: [] });
  const project = new URL(request.url).searchParams.get("project");
  const [milestones, risks] = await Promise.all([
    sql!`SELECT id, project_name AS "projectName", title, due_date AS "dueDate", completed FROM project_milestones WHERE (${project ?? null}::text IS NULL OR project_name = ${project ?? null}) ORDER BY due_date NULLS LAST, id`,
    sql!`SELECT id, project_name AS "projectName", title, severity, owner, status, mitigation FROM project_risks WHERE (${project ?? null}::text IS NULL OR project_name = ${project ?? null}) ORDER BY CASE severity WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, id`,
  ]);
  return NextResponse.json({ milestones, risks });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.projectName || !body.title || !["milestone", "risk"].includes(body.type)) return NextResponse.json({ error: "Project, title, and type are required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ...body, persisted: false }, { status: 201 });
  if (body.type === "milestone") {
    const rows = await sql!`INSERT INTO project_milestones (project_name, title, due_date) VALUES (${body.projectName}, ${body.title}, ${body.dueDate || null}) RETURNING id, project_name AS "projectName", title, due_date AS "dueDate", completed`;
    return NextResponse.json(rows[0], { status: 201 });
  }
  const rows = await sql!`INSERT INTO project_risks (project_name, title, severity, owner, mitigation) VALUES (${body.projectName}, ${body.title}, ${body.severity ?? "Medium"}, ${body.owner ?? "Maya"}, ${body.mitigation ?? null}) RETURNING id, project_name AS "projectName", title, severity, owner, status, mitigation`;
  return NextResponse.json(rows[0], { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  if (!body.id || !["milestone", "risk"].includes(body.type)) return NextResponse.json({ error: "Id and type are required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ok: true, persisted: false });
  if (body.type === "milestone") return NextResponse.json((await sql!`UPDATE project_milestones SET completed = COALESCE(${body.completed ?? null}, completed), due_date = COALESCE(${body.dueDate ?? null}, due_date), title = COALESCE(${body.title ?? null}, title) WHERE id = ${Number(body.id)} RETURNING id, project_name AS "projectName", title, due_date AS "dueDate", completed`)[0] ?? { error: "Milestone not found" });
  return NextResponse.json((await sql!`UPDATE project_risks SET status = COALESCE(${body.status ?? null}, status), severity = COALESCE(${body.severity ?? null}, severity), mitigation = COALESCE(${body.mitigation ?? null}, mitigation) WHERE id = ${Number(body.id)} RETURNING id, project_name AS "projectName", title, severity, owner, status, mitigation`)[0] ?? { error: "Risk not found" });
}

