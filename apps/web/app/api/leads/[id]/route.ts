/**
 * GET /api/leads/[id]
 *
 * Returns a single lead row. Used by Otto's workflow to fetch the full
 * qualification envelope before rendering the proposal, and by the
 * cockpit detail view.
 */
import { NextRequest, NextResponse } from "next/server";
import { getLeadById } from "@/lib/db";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const lead = getLeadById(id);
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });
  return NextResponse.json(lead);
}
