import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "./lib/auth";
export async function proxy(request: NextRequest) {
  try { await getCurrentUser(request); return NextResponse.next(); }
  catch {
    if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
    return NextResponse.redirect(new URL("/signin", request.url));
  }
}
export const config = { matcher: ["/workspace/:path*", "/api/((?!auth/).*)"] };

