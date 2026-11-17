import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";

export async function GET() {
  if (!await ensureDatabase()) return NextResponse.json([]);
  return NextResponse.json(await sql!`SELECT id, name, progress, status, owner, description, archived FROM projects WHERE archived = FALSE ORDER BY id`);
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.name) return NextResponse.json({ error: "Project name is required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ id: 0, ...body }, { status: 201 });
  const rows = await sql!`INSERT INTO projects (name, owner, description, status) VALUES (${body.name}, ${body.owner ?? "Maya"}, ${body.description ?? null}, 'On track') RETURNING id, name, progress, status, owner, description`;
  const project = rows[0] as { name: string; owner: string };
  await sql!`INSERT INTO notifications (employee_name, type, message) VALUES (${project.owner}, 'project_assigned', ${`You were assigned as owner of ${project.name}`})`;
  await sql!`INSERT INTO activity_events (employee_name, event_type, message) VALUES ('Maya', 'project_created', ${`Created project ${project.name} and assigned ${project.owner}`})`;
  return NextResponse.json(project, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "Project id is required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ok: true, persisted: false });
  const rows = await sql!`UPDATE projects SET owner = COALESCE(${body.owner ?? null}, owner), status = COALESCE(${body.status ?? null}, status), progress = COALESCE(${body.progress ?? null}, progress), description = COALESCE(${body.description ?? null}, description) WHERE id = ${Number(body.id)} RETURNING id, name, progress, status, owner, description`;
  const project = rows[0] as { name: string; owner: string } | undefined;
  if (project && body.owner) await sql!`INSERT INTO notifications (employee_name, type, message) VALUES (${project.owner}, 'project_assigned', ${`You are now the owner of ${project.name}`})`;
  return NextResponse.json(project ?? { error: "Project not found" }, { status: project ? 200 : 404 });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Project id is required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ok: true, persisted: false });
  const rows = await sql!`UPDATE projects SET archived = TRUE WHERE id = ${Number(id)} RETURNING id, name`;
  if (rows[0]) await sql!`INSERT INTO activity_events (employee_name, event_type, message) VALUES ('Maya', 'project_archived', ${`Archived project ${rows[0].name}`})`;
  return NextResponse.json({ ok: Boolean(rows[0]), project: rows[0] ?? null }, { status: rows[0] ? 200 : 404 });
}


