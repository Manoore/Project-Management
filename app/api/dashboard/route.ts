import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const fallback = { employee: "Maya", focus: "Finalize mobile onboarding handoff", completed: 4, total: 6, projects: [{ name: "Atlas Mobile", progress: 82, status: "On track" }, { name: "Customer Insight Hub", progress: 57, status: "Needs review" }, { name: "Q4 Brand Refresh", progress: 64, status: "On track" }], schedule: [{ time: "10:00", title: "Focus block", detail: "Mobile onboarding handoff" }, { time: "12:30", title: "Design stand-up", detail: "Product team · 25 min" }, { time: "15:00", title: "1:1 with Riya", detail: "Growth & support" }] };

export async function GET(request: Request) {
  try {
    if (!await ensureDatabase()) return NextResponse.json(fallback);
    const employeeName = (await getCurrentUser(request)).name;
    const [employeeRows, projectRows, taskRows] = await Promise.all([
      sql!`SELECT name, initials FROM employees ORDER BY id LIMIT 1`,
      sql!`SELECT id, name, progress, status, owner, team FROM projects WHERE archived = FALSE AND (owner = ${employeeName} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${employeeName})) ORDER BY id`,
      sql!`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE completed)::int AS completed FROM tasks`,
    ]);
    const employee = employeeRows[0] as { name: string; initials: string };
    const taskSummary = taskRows[0] as { total: number; completed: number };
    return NextResponse.json({ ...fallback, employee: employee?.name ?? fallback.employee, completed: taskSummary?.completed ?? 0, total: taskSummary?.total ?? 0, projects: projectRows });
  } catch (error) {
    console.error("Dashboard database read failed", error);
    return NextResponse.json(fallback);
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    if (!await ensureDatabase()) return NextResponse.json({ ok: true, persisted: false, type: body.type ?? "event" });
    if (body.type === "mood") await sql!`INSERT INTO checkins (employee_name, mood) VALUES ('Maya', ${String(body.value ?? "🙂")})`;
    if (body.type === "task") await sql!`UPDATE tasks SET completed = ${Boolean(body.completed)} WHERE id = ${Number(body.taskId ?? 1)}`;
    if (body.type === "clock") {
      if (body.action === "out") await sql!`UPDATE time_entries SET clocked_out_at = NOW() WHERE employee_name = 'Maya' AND clocked_out_at IS NULL`;
      else await sql!`INSERT INTO time_entries (employee_name) VALUES ('Maya')`;
    }
    return NextResponse.json({ ok: true, persisted: true, type: body.type ?? "event", savedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Dashboard database write failed", error);
    return NextResponse.json({ ok: false, error: "Database write failed" }, { status: 500 });
  }
}


