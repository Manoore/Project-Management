import { NextResponse } from "next/server";

export async function GET() {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    return NextResponse.json({ configured: false, message: "Microsoft SSO is ready for configuration. Add MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_TENANT_ID." }, { status: 501 });
  }
  return NextResponse.json({ configured: true, message: "Microsoft callback placeholder reached. Wire the Entra authorization-code exchange here." });
}

