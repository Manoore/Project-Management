import { NextResponse } from "next/server";
import { clearSessionCookie, createDevelopmentSession, getCurrentUser, sessionCookie } from "@/lib/auth";

export async function GET(request: Request) {
  return NextResponse.json({ authenticated: true, provider: process.env.MICROSOFT_CLIENT_ID ? "microsoft" : "development", user: await getCurrentUser(request) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const employeeName = String(body.employeeName ?? "Maya");
  try {
    const session = await createDevelopmentSession(employeeName);
    const response = NextResponse.json({ authenticated: true, provider: "development", user: session.user });
    response.headers.set("Set-Cookie", sessionCookie(session.sessionId));
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to sign in" }, { status: 401 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.headers.set("Set-Cookie", clearSessionCookie());
  return response;
}

