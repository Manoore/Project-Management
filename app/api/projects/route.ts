import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { canManageProjects, getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  if (!await ensureDatabase()) return NextResponse.json([]);
  const employee = (await getCurrentUser(request)).name;
  const team = new URL(request.url).searchParams.get("team");
  const owner = new URL(request.url).searchParams.get("owner");
  const product = new URL(request.url).searchParams.get("product");
  const response = NextResponse.json(await sql!`SELECT id, name, progress, status, owner, team, product, description, archived FROM projects WHERE archived = FALSE AND (owner = ${employee} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${employee})) AND (${team ?? null}::text IS NULL OR team = ${team ?? null}) AND (${owner ?? null}::text IS NULL OR owner = ${owner ?? null}) AND (${product ?? null}::text IS NULL OR product = ${product ?? null}) ORDER BY id`);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser(request);
  if (!canManageProjects(currentUser)) return NextResponse.json({ error: "Only managers can create projects" }, { status: 403 });
  const body = await request.json();
  if (!body.name) return NextResponse.json({ error: "Project name is required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ id: 0, ...body }, { status: 201 });
  const existing = await sql!`SELECT id FROM projects WHERE LOWER(name) = LOWER(${body.name}) AND archived = FALSE LIMIT 1`;
  if (existing[0]) return NextResponse.json({ error: "A project with this name already exists" }, { status: 409 });
  const rows = await sql!`INSERT INTO projects (name, owner, team, product, description, status) VALUES (${body.name}, ${body.owner ?? "Maya"}, ${body.team ?? "Product"}, ${body.product ?? "General"}, ${body.description ?? null}, 'On track') RETURNING id, name, progress, status, owner, team, product, description`;
  const project = rows[0] as { name: string; owner: string };
  await sql!`INSERT INTO project_members (project_name, employee_name, role) VALUES (${project.name}, ${project.owner}, 'Owner') ON CONFLICT (project_name, employee_name) DO NOTHING`;
  await sql!`INSERT INTO notifications (employee_name, type, message) VALUES (${project.owner}, 'project_assigned', ${`You were assigned as owner of ${project.name}`})`;
  await sql!`INSERT INTO activity_events (employee_name, event_type, message) VALUES ('Maya', 'project_created', ${`Created project ${project.name} and assigned ${project.owner}`})`;
  return NextResponse.json(project, { status: 201 });
}

export async function PATCH(request: Request) {
  const currentUser = await getCurrentUser(request);
  if (!canManageProjects(currentUser)) return NextResponse.json({ error: "Only managers can edit projects" }, { status: 403 });
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "Project id is required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ok: true, persisted: false });
  const rows = await sql!`UPDATE projects SET owner = COALESCE(${body.owner ?? null}, owner), team = COALESCE(${body.team ?? null}, team), product = COALESCE(${body.product ?? null}, product), status = COALESCE(${body.status ?? null}, status), progress = COALESCE(${body.progress ?? null}, progress), description = COALESCE(${body.description ?? null}, description) WHERE id = ${Number(body.id)} RETURNING id, name, progress, status, owner, team, product, description`;
  const project = rows[0] as { name: string; owner: string } | undefined;
  if (project && body.owner) await sql!`INSERT INTO notifications (employee_name, type, message) VALUES (${project.owner}, 'project_assigned', ${`You are now the owner of ${project.name}`})`;
  return NextResponse.json(project ?? { error: "Project not found" }, { status: project ? 200 : 404 });
}

export async function DELETE(request: Request) {
  const currentUser = await getCurrentUser(request);
  if (!canManageProjects(currentUser)) return NextResponse.json({ error: "Only managers can archive projects" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Project id is required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ok: true, persisted: false });
  const rows = await sql!`UPDATE projects SET archived = TRUE WHERE id = ${Number(id)} RETURNING id, name`;
  if (rows[0]) await sql!`INSERT INTO activity_events (employee_name, event_type, message) VALUES ('Maya', 'project_archived', ${`Archived project ${rows[0].name}`})`;
  return NextResponse.json({ ok: Boolean(rows[0]), project: rows[0] ?? null }, { status: rows[0] ? 200 : 404 });
}


