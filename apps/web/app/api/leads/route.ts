import { NextResponse } from "next/server";
import { getLeads } from "@/lib/db";

export async function GET() {
  const leads = getLeads();
  return NextResponse.json(leads);
}
