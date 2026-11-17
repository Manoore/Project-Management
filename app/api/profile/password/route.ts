import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureDatabase, sql } from '@/lib/db';
import { hashPassword, checkPassword } from '@/lib/passwords';
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  const user = await getCurrentUser(request), body = await request.json().catch(() => ({}));
  if (typeof body.currentPassword !== 'string' || typeof body.newPassword !== 'string' || body.currentPassword.length > 128 || body.newPassword.length < 12 || body.newPassword.length > 128 || body.currentPassword === body.newPassword) return NextResponse.json({ error: 'Provide your current password and a different new password of 12–128 characters' }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  const key = `password-change:${user.name}`;
  const attempts = await sql!`INSERT INTO login_attempts (email, attempts) VALUES (${key}, 1) ON CONFLICT (email) DO UPDATE SET attempts = CASE WHEN login_attempts.window_start < NOW() - INTERVAL '15 minutes' THEN 1 ELSE login_attempts.attempts + 1 END, window_start = CASE WHEN login_attempts.window_start < NOW() - INTERVAL '15 minutes' THEN NOW() ELSE login_attempts.window_start END RETURNING attempts`;
  if (Number(attempts[0].attempts) > 10) return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 });
  const accounts = await sql!`SELECT password_hash FROM password_accounts WHERE employee_name = ${user.name}`;
  if (!accounts.length) return NextResponse.json({ error: 'This account uses Microsoft sign-in. Manage your password through Microsoft.' }, { status: 409 });
  if (!await checkPassword(body.currentPassword, accounts[0].password_hash)) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
  const hash = await hashPassword(body.newPassword), session = randomUUID();
  const rows = await sql!`WITH changed AS (UPDATE password_accounts SET password_hash = ${hash} WHERE employee_name = ${user.name} AND password_hash = ${accounts[0].password_hash} RETURNING employee_name), revoked AS (DELETE FROM auth_sessions WHERE employee_name IN (SELECT employee_name FROM changed)), reset AS (DELETE FROM login_attempts WHERE email = ${key} AND EXISTS(SELECT 1 FROM changed)) INSERT INTO auth_sessions (id, employee_name, provider, expires_at) SELECT ${session}::uuid, employee_name, 'password', NOW() + INTERVAL '7 days' FROM changed RETURNING id`;
  if (!rows.length) return NextResponse.json({ error: 'Your account changed during this request. Please sign in again.' }, { status: 409 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set('peopleflow_session', session, { httpOnly: true, secure: new URL(request.url).protocol === 'https:', sameSite: 'lax', maxAge: 604800, path: '/' });
  return response;
}
