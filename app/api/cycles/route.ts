import { NextResponse } from 'next/server';
import { ensureDatabase, sql } from '@/lib/db';
import { canManageProjects, getCurrentUser } from '@/lib/auth';
import { getVisibleProject } from '@/lib/project-access';
import { validateCycleInput } from '@/lib/work-items';

function failure(error: unknown) {
  if ((error as { code?: string }).code === '23505') return NextResponse.json({ error: 'An active cycle with this name already exists in the project' }, { status: 409 });
  return NextResponse.json({ error: 'Planning data is temporarily unavailable. Please retry.' }, { status: 503 });
}

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  const params = new URL(request.url).searchParams, projectId = Number(params.get('projectId'));
  if (!Number.isSafeInteger(projectId) || projectId < 1) return NextResponse.json({ error: 'Choose a project' }, { status: 400 });
  try {
    if (!await ensureDatabase()) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    if (!await getVisibleProject(user, projectId)) return NextResponse.json({ error: 'Project unavailable or not shared with you' }, { status: 404 });
    const includeArchived = params.get('includeArchived') === 'true';
    const rows = await sql!`SELECT c.id, c.project_id AS "projectId", c.name, c.start_date AS "startDate", c.end_date AS "endDate", c.archived, COUNT(t.id)::int AS "taskCount", COUNT(t.id) FILTER (WHERE t.completed OR t.status = 'Done')::int AS "completedCount" FROM project_cycles c JOIN projects p ON p.id = c.project_id LEFT JOIN tasks t ON t.cycle_id = c.id AND t.project_name = p.name WHERE c.project_id = ${projectId} AND (${includeArchived} OR NOT c.archived) GROUP BY c.id ORDER BY c.start_date DESC, c.id DESC`;
    return NextResponse.json(rows, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!canManageProjects(user)) return NextResponse.json({ error: 'Only managers and admins can create project cycles' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Number.isSafeInteger(body.projectId) || body.projectId < 1) return NextResponse.json({ error: 'Choose a project' }, { status: 400 });
  const validationError = validateCycleInput(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  try {
    if (!await ensureDatabase()) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    if (!await getVisibleProject(user, body.projectId)) return NextResponse.json({ error: 'Project unavailable or not shared with you' }, { status: 404 });
    const rows = await sql!`INSERT INTO project_cycles (project_id, name, start_date, end_date) VALUES (${body.projectId}, ${body.name.trim()}, ${body.startDate}, ${body.endDate}) RETURNING id, project_id AS "projectId", name, start_date AS "startDate", end_date AS "endDate", archived`;
    return NextResponse.json({ ...rows[0], taskCount: 0, completedCount: 0 }, { status: 201 });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser(request);
  if (!canManageProjects(user)) return NextResponse.json({ error: 'Only managers and admins can edit project cycles' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Number.isSafeInteger(body.id) || body.id < 1) return NextResponse.json({ error: 'Choose a cycle' }, { status: 400 });
  if (Object.keys(body).some(key => !['id', 'name', 'startDate', 'endDate', 'archived'].includes(key))) return NextResponse.json({ error: 'Only cycle name, dates, and archive state can be changed' }, { status: 400 });
  const validationError = validateCycleInput(body, true);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  try {
    if (!await ensureDatabase()) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    const cycles = await sql!`SELECT id, project_id AS "projectId", start_date AS "startDate", end_date AS "endDate" FROM project_cycles WHERE id = ${body.id}`;
    const cycle = cycles[0];
    if (!cycle || !await getVisibleProject(user, Number(cycle.projectId))) return NextResponse.json({ error: 'Cycle unavailable or project not shared with you' }, { status: 404 });
    const startDate = body.startDate ?? String(cycle.startDate).slice(0, 10), endDate = body.endDate ?? String(cycle.endDate).slice(0, 10);
    if (endDate < startDate) return NextResponse.json({ error: 'End date must be on or after start date' }, { status: 400 });
    const update = sql!`UPDATE project_cycles SET name = COALESCE(${body.name?.trim() ?? null}, name), start_date = ${startDate}::date, end_date = ${endDate}::date, archived = COALESCE(${body.archived ?? null}, archived) WHERE id = ${body.id} RETURNING id, project_id AS "projectId", name, start_date AS "startDate", end_date AS "endDate", archived`;
    if (body.archived === true) {
      const results = await sql!.transaction([
        sql!`SELECT pg_advisory_xact_lock(hashtext('planning:' || ${String(cycle.projectId)}))`,
        update,
        sql!`UPDATE tasks SET cycle_id = NULL, updated_at = NOW() WHERE cycle_id = ${body.id}`,
      ], { isolationLevel: 'ReadCommitted' });
      return NextResponse.json({ ...results[1][0], taskCount: 0, completedCount: 0 });
    }
    const rows = await update;
    return NextResponse.json(rows[0]);
  } catch (error) { return failure(error); }
}
