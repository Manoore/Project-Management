import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureDatabase, sql } from '@/lib/db';
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!await ensureDatabase()) return NextResponse.json({ error: 'Profile database unavailable' }, { status: 503 });
  const rows = await sql!`SELECT COALESCE(display_name, name) AS "displayName", initials, role AS "jobTitle", team, access_role AS "accessRole", COALESCE((SELECT email FROM password_accounts WHERE employee_name = employees.name), email) AS email, EXISTS(SELECT 1 FROM password_accounts WHERE employee_name = employees.name) AS "canChangePassword" FROM employees WHERE name = ${user.name} LIMIT 1`;
  return NextResponse.json(rows[0], { headers: { 'Cache-Control': 'no-store' } });
}
export async function PATCH(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  const user = await getCurrentUser(request);
  const body = await request.json().catch(() => ({}));
  if (Object.keys(body).some(key => !['displayName', 'jobTitle'].includes(key))) return NextResponse.json({ error: 'Only display name and job title can be edited here' }, { status: 400 });
  if (typeof body.displayName !== 'string' || body.displayName.trim().length < 2 || body.displayName.trim().length > 80 || typeof body.jobTitle !== 'string' || body.jobTitle.trim().length > 120) return NextResponse.json({ error: 'Enter a display name of 2–80 characters and a job title up to 120 characters' }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ error: 'Profile database unavailable' }, { status: 503 });
  const name = body.displayName.trim(), initials = name.split(/\s+/).map((part: string) => Array.from(part)[0]).join('').slice(0, 2).toUpperCase();
  await sql!`UPDATE employees SET display_name = ${name}, initials = ${initials}, role = ${body.jobTitle.trim()} WHERE name = ${user.name}`;
  return NextResponse.json({ ok: true });
}
