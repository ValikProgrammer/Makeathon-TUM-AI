import { NextRequest, NextResponse } from "next/server";
import { addDnc } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { type, value } = await req.json().catch(() => ({}));
  if (!type || !value) return NextResponse.json({ error: "type and value required" }, { status: 400 });
  addDnc(type, value);
  return NextResponse.json({ ok: true });
}
