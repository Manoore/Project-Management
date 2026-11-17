import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { clearSessionCookie, getCurrentUser } from "@/lib/auth";
import { ensureDatabase, sql } from "@/lib/db";
import { hashPassword, checkPassword } from "@/lib/passwords";

export async function GET(request: Request) {
  try { return NextResponse.json({ authenticated: true, user: await getCurrentUser(request) }); }
  catch { return NextResponse.json({ authenticated: false }, { status: 401 }); }
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase(), password = String(body.password ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password || password.length > 128) return NextResponse.json({ error: "Enter a valid email and password" }, { status: 400 });
  try {
    if (!await ensureDatabase()) return NextResponse.json({ error: "Sign-in database is not configured" }, { status: 503 });
    const attempts = await sql!`INSERT INTO login_attempts (email, attempts) VALUES (${email}, 1) ON CONFLICT (email) DO UPDATE SET attempts = CASE WHEN login_attempts.window_start < NOW() - INTERVAL '15 minutes' THEN 1 ELSE login_attempts.attempts + 1 END, window_start = CASE WHEN login_attempts.window_start < NOW() - INTERVAL '15 minutes' THEN NOW() ELSE login_attempts.window_start END RETURNING attempts`;
    if (Number(attempts[0].attempts) > 10) return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
    let name: string;
    if (body.mode === "signup") {
      const displayName = String(body.name ?? "").trim();
      if (displayName.length < 2 || displayName.length > 80 || password.length < 12) return NextResponse.json({ error: "Use a name of 2–80 characters and a password of 12–128 characters" }, { status: 400 });
      name = `${displayName} (${randomUUID().slice(0, 8)})`;
      const hash = await hashPassword(password);
      const rows = await sql!`WITH account AS (INSERT INTO password_accounts (email, employee_name, password_hash) VALUES (${email}, ${name}, ${hash}) ON CONFLICT (email) DO NOTHING RETURNING employee_name) INSERT INTO employees (name, initials, email, role, team, access_role) SELECT employee_name, ${displayName.split(" ").map(x => x[0]).join("").slice(0, 2).toUpperCase()}, ${email}, 'Employee', 'Unassigned', 'member' FROM account RETURNING name`;
      if (!rows.length) return NextResponse.json({ error: "Unable to register. If you already have an account, sign in." }, { status: 409 });
    } else {
      const accounts = await sql!`SELECT employee_name, password_hash FROM password_accounts WHERE email = ${email}`;
      const valid = await checkPassword(password, accounts[0]?.password_hash ?? `00000000000000000000000000000000:${"0".repeat(128)}`);
      if (!accounts.length || !valid) return NextResponse.json({ error: "Email or password is incorrect" }, { status: 401 });
      name = accounts[0].employee_name;
    }
    const session = randomUUID();
    await sql!`INSERT INTO auth_sessions (id, employee_name, provider, expires_at) VALUES (${session}::uuid, ${name}, 'password', NOW() + INTERVAL '7 days')`;
    await sql!`DELETE FROM login_attempts WHERE email = ${email}`;
    const response = NextResponse.json({ authenticated: true });
    response.cookies.set("peopleflow_session", session, { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", maxAge: 604800, path: "/" });
    return response;
  } catch { return NextResponse.json({ error: "Sign-in is temporarily unavailable. Please retry." }, { status: 503 }); }
}

export async function DELETE(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  const sessionId = request.headers.get("cookie")?.match(/(?:^|;\s*)peopleflow_session=([^;]+)/)?.[1];
  if (sessionId && /^[0-9a-f-]{36}$/i.test(sessionId) && sql) await sql`DELETE FROM auth_sessions WHERE id = ${sessionId}::uuid`;
  const response = NextResponse.json({ authenticated: false });
  response.headers.set("Set-Cookie", clearSessionCookie());
  return response;
}

