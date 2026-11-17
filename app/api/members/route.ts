import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { canManageProjects, getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  if (!await ensureDatabase()) return NextResponse.json([]);
  const project = new URL(request.url).searchParams.get("project");
  return NextResponse.json(await sql!`SELECT id, project_name AS "projectName", employee_name AS "employeeName", role FROM project_members WHERE project_name = ${project ?? ""} ORDER BY employee_name`);
}

export async function POST(request: Request) {
  if (!canManageProjects(await getCurrentUser(request))) return NextResponse.json({ error: "Only managers can manage project membership" }, { status: 403 });
  const body = await request.json();
  if (!body.projectName || !body.employeeName) return NextResponse.json({ error: "Project and employee are required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ...body, persisted: false }, { status: 201 });
  const rows = await sql!`INSERT INTO project_members (project_name, employee_name, role) VALUES (${body.projectName}, ${body.employeeName}, ${body.role ?? "Contributor"}) ON CONFLICT (project_name, employee_name) DO UPDATE SET role = EXCLUDED.role RETURNING id, project_name AS "projectName", employee_name AS "employeeName", role`;
  await sql!`INSERT INTO notifications (employee_name, type, message) VALUES (${body.employeeName}, 'project_member_added', ${`You were added to ${body.projectName}`})`;
  return NextResponse.json(rows[0], { status: 201 });
}

export async function PATCH(request: Request) {
  const currentUser = await getCurrentUser(request);
  if (currentUser.accessRole !== "admin") return NextResponse.json({ error: "Only admins can change access roles" }, { status: 403 });
  const body = await request.json();
  if (!body.employeeName || !["admin", "manager", "member", "viewer"].includes(body.accessRole)) return NextResponse.json({ error: "Employee and valid access role are required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ok: true, persisted: false });
  const rows = await sql!`UPDATE employees SET access_role = ${body.accessRole} WHERE name = ${body.employeeName} RETURNING name, role, team, access_role AS "accessRole"`;
  return NextResponse.json(rows[0] ?? { error: "Employee not found" }, { status: rows[0] ? 200 : 404 });
}

