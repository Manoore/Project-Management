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
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120) return NextResponse.json({ error: "Enter a project name of 1–120 characters" }, { status: 400 });
  body.name = body.name.trim();
  if (!await ensureDatabase()) return NextResponse.json({ error: "Database unavailable. Project was not created." }, { status: 503 });
  const existing = await sql!`SELECT id FROM projects WHERE LOWER(name) = LOWER(${body.name}) AND archived = FALSE LIMIT 1`;
  if (existing[0]) return NextResponse.json({ error: "A project with this name already exists" }, { status: 409 });
  const owner = body.owner || currentUser.name;
  const rows = await sql!`WITH created AS (INSERT INTO projects (name, owner, team, product, description, status) VALUES (${body.name}, ${owner}, ${body.team || currentUser.team}, ${body.product || "General"}, ${body.description ?? null}, 'On track') RETURNING id, name, progress, status, owner, team, product, description), workflow AS (INSERT INTO project_workflow_states(project_id,name,category,position,is_default) SELECT id,d.name,d.name,d.position,TRUE FROM created CROSS JOIN (VALUES ('To do',0),('In progress',1),('Review',2),('Done',3)) d(name,position)), membership AS (INSERT INTO project_members (project_name, employee_name, role) SELECT name, owner, 'Owner' FROM created UNION SELECT name, ${currentUser.name}, 'Contributor' FROM created ON CONFLICT (project_name, employee_name) DO NOTHING), activity AS (INSERT INTO activity_events (employee_name, event_type, message) SELECT ${currentUser.name}, 'project_created', 'Created project ' || name FROM created) SELECT * FROM created`;
  return NextResponse.json(rows[0], { status: 201 });
}

export async function PATCH(request: Request) {
  const currentUser = await getCurrentUser(request);
  if (!canManageProjects(currentUser)) return NextResponse.json({ error: "Only managers can edit projects" }, { status: 403 });
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "Project id is required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ error: "Database unavailable" }, {status:503});
  const rows = await sql!`UPDATE projects SET owner = COALESCE(${body.owner ?? null}, owner), team = COALESCE(${body.team ?? null}, team), product = COALESCE(${body.product ?? null}, product), status = COALESCE(${body.status ?? null}, status), progress = COALESCE(${body.progress ?? null}, progress), description = COALESCE(${body.description ?? null}, description) WHERE id = ${Number(body.id)} AND NOT archived AND (owner=${currentUser.name} OR name IN(SELECT project_name FROM project_members WHERE employee_name=${currentUser.name})) RETURNING id, name, progress, status, owner, team, product, description`;
  const project = rows[0] as { name: string; owner: string } | undefined;
  return NextResponse.json(project ?? { error: "Project not found" }, { status: project ? 200 : 404 });
}

export async function DELETE(request: Request) {
  const currentUser = await getCurrentUser(request);
  if (!canManageProjects(currentUser)) return NextResponse.json({ error: "Only managers can archive projects" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Project id is required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ error: "Database unavailable" }, {status:503});
  const rows = await sql!`UPDATE projects SET archived = TRUE WHERE id = ${Number(id)} AND NOT archived AND (owner=${currentUser.name} OR name IN(SELECT project_name FROM project_members WHERE employee_name=${currentUser.name})) RETURNING id, name`;
  if (rows[0]) await sql!`INSERT INTO activity_events (employee_name, event_type, message) VALUES (${currentUser.name}, 'project_archived', ${`Archived project ${rows[0].name}`})`;
  return NextResponse.json({ ok: Boolean(rows[0]), project: rows[0] ?? null }, { status: rows[0] ? 200 : 404 });
}

