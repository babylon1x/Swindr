import { NextResponse } from "next/server";
import { getUsageSummary } from "@/lib/storage/usage";
import { MAX_TAVILY_SEARCHES_PER_BRIEF } from "@/lib/config/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/usage — powers the local usage meter in the footer. */
export async function GET() {
  const usage = await getUsageSummary();
  return NextResponse.json({ ...usage, searchesPerBrief: MAX_TAVILY_SEARCHES_PER_BRIEF });
}
