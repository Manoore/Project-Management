import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ employee: "Maya", focus: "Finalize mobile onboarding handoff", completed: 4, total: 6, projects: [{ name: "Atlas Mobile", progress: 82, status: "On track" }, { name: "Customer Insight Hub", progress: 57, status: "Needs review" }, { name: "Q4 Brand Refresh", progress: 64, status: "On track" }], schedule: [{ time: "10:00", title: "Focus block", detail: "Mobile onboarding handoff" }, { time: "12:30", title: "Design stand-up", detail: "Product team · 25 min" }, { time: "15:00", title: "1:1 with Riya", detail: "Growth & support" }] });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({ ok: true, type: body.type ?? "event", value: body.value ?? null, savedAt: new Date().toISOString() });
}
