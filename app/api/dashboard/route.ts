import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!await ensureDatabase()) return NextResponse.json({ error: "Dashboard database unavailable" }, { status: 503 });
    let timeZone = new URL(request.url).searchParams.get('timeZone') || 'UTC';
    try { new Intl.DateTimeFormat('en', { timeZone }); } catch { timeZone = 'UTC'; }
    const [projects, summary, focus, time, mood, upcoming, activity] = await Promise.all([
      sql!`SELECT p.id, p.name, p.status, p.owner, p.team, CASE WHEN COUNT(t.id) = 0 THEN 0 ELSE ROUND(100.0 * COUNT(t.id) FILTER (WHERE t.completed) / COUNT(t.id)) END::int AS progress FROM projects p LEFT JOIN tasks t ON t.project_name = p.name WHERE p.archived = FALSE AND (p.owner = ${user.name} OR p.name IN (SELECT project_name FROM project_members WHERE employee_name = ${user.name})) GROUP BY p.id ORDER BY p.id`,
      sql!`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE completed)::int AS completed, COUNT(*) FILTER (WHERE NOT completed AND due_date < CURRENT_DATE)::int AS overdue, COALESCE(SUM(estimate_minutes) FILTER (WHERE NOT completed), 0)::int AS "plannedMinutes" FROM tasks WHERE owner = ${user.name} AND (project_name = 'General' OR project_name IN (SELECT name FROM projects WHERE NOT archived AND (owner = ${user.name} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${user.name}))))`,
      sql!`SELECT t.id, t.title, t.project_name AS "projectName", t.priority, t.owner, t.status, t.due_date AS "dueDate", (SELECT COUNT(*)::int FROM subtasks WHERE task_id = t.id) AS "subtaskCount" FROM tasks t WHERE t.owner = ${user.name} AND NOT t.completed AND (t.project_name = 'General' OR t.project_name IN (SELECT name FROM projects WHERE NOT archived AND (owner = ${user.name} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${user.name})))) ORDER BY CASE t.priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Normal' THEN 2 ELSE 3 END, t.due_date NULLS LAST, t.id LIMIT 1`,
      sql!`SELECT COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (LEAST(COALESCE(clocked_out_at, NOW()), NOW()) - GREATEST(clocked_in_at, date_trunc('day', NOW() AT TIME ZONE ${timeZone}) AT TIME ZONE ${timeZone}))))), 0)::int AS seconds, BOOL_OR(clocked_out_at IS NULL) AS active FROM time_entries WHERE employee_name = ${user.name} AND clocked_in_at <= NOW() AND COALESCE(clocked_out_at, NOW()) >= (date_trunc('day', NOW() AT TIME ZONE ${timeZone}) AT TIME ZONE ${timeZone})`,
      sql!`SELECT mood FROM checkins WHERE employee_name = ${user.name} ORDER BY created_at DESC LIMIT 1`,
      sql!`SELECT title, project_name AS detail, TO_CHAR(due_date, 'Mon DD') AS time FROM tasks WHERE owner = ${user.name} AND NOT completed AND due_date IS NOT NULL AND (project_name = 'General' OR project_name IN (SELECT name FROM projects WHERE NOT archived AND (owner = ${user.name} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${user.name})))) ORDER BY due_date, id LIMIT 5`,
      sql!`SELECT id, message, created_at AS "createdAt" FROM activity_events WHERE employee_name = ${user.name} ORDER BY created_at DESC LIMIT 5`,
    ]);
    return NextResponse.json({ employee: user.name, initials: user.initials, accessRole: user.accessRole, ...summary[0], projects, focusTask: focus[0] ?? null, focus: focus[0]?.title ?? "Your next step starts here", workingSeconds: time[0]?.seconds ?? 0, timeZone, clockedIn: Boolean(time[0]?.active), mood: mood[0]?.mood ?? "", schedule: upcoming, activity }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Dashboard could not load. Please retry." }, { status: 503 }); }
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  const body = await request.json().catch(() => ({}));
  if (!await ensureDatabase()) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  if (body.type === "mood") {
    if (!["😣", "😕", "🙂", "😊", "⚡"].includes(body.value)) return NextResponse.json({ error: "Choose a check-in" }, { status: 400 });
    await sql!`INSERT INTO checkins (employee_name, mood) VALUES (${user.name}, ${body.value})`;
  } else if (body.type === "task") {
    if (user.accessRole === 'viewer') return NextResponse.json({ error: 'Viewers cannot change tasks' }, { status: 403 });
    const rows = await sql!`UPDATE tasks SET completed = ${body.completed === true}, status = ${body.completed === true ? 'Done' : 'To do'}, updated_at = NOW() WHERE id = ${Number(body.taskId)} AND owner = ${user.name} RETURNING id`;
    if (!rows.length) return NextResponse.json({ error: "Task unavailable" }, { status: 404 });
  } else if (body.type === "clock" && ['in', 'out'].includes(body.action)) {
    // Serialize this employee's attendance changes across tabs and concurrent requests.
    await sql!.transaction(tx => [
      tx`SELECT pg_advisory_xact_lock(hashtext('attendance:' || ${user.name}))`,
      body.action === 'out'
        ? tx`UPDATE time_entries SET clocked_out_at = NOW() WHERE employee_name = ${user.name} AND clocked_out_at IS NULL`
        : tx`INSERT INTO time_entries (employee_name) SELECT ${user.name} WHERE NOT EXISTS (SELECT 1 FROM time_entries WHERE employee_name = ${user.name} AND clocked_out_at IS NULL)`
    ], { isolationLevel: 'ReadCommitted' });
  } else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  return NextResponse.json({ ok: true });
}

