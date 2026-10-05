import { NextResponse, after } from "next/server";
import { getBrief, updateBrief } from "@/lib/storage/briefs";
import { runPipeline } from "@/lib/pipeline/run";
import { BusyError, acquireLock, releaseLock } from "@/lib/pipeline/lock";
import { BUSY_MESSAGE } from "@/lib/config/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/briefs/[id]/run — starts the pipeline for a draft brief.
 *
 * Returns immediately; `after()` keeps the pipeline alive server-side past the
 * response so the browser is free to poll for status.
 *
 * The lock is taken BEFORE the status flips to `running`. Doing it the other way
 * round leaves a brief stuck in `running` whenever two requests race: the loser
 * of the lock would never reach the pipeline that resets the status. Re-running
 * a finished brief is not allowed here — POST /api/briefs/[id] clones the saved
 * profile into a new draft instead (spec section 8).
 */
export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  const brief = await getBrief(id);

  if (!brief) {
    return NextResponse.json({ error: "Brief not found." }, { status: 404 });
  }

  if (brief.status === "running") {
    return NextResponse.json(
      { error: "This brief is already running." },
      { status: 409 },
    );
  }

  if (brief.status !== "draft") {
    return NextResponse.json(
      {
        error:
          "This brief has already run. Create a copy to run it again so the original stays intact.",
      },
      { status: 409 },
    );
  }

  if (!brief.profile) {
    return NextResponse.json(
      { error: "This brief has no idea profile to run." },
      { status: 400 },
    );
  }

  // Only one brief may run at a time (spec section 8). acquireLock is atomic, so
  // concurrent requests cannot both pass this point.
  try {
    await acquireLock(id);
  } catch (error) {
    if (error instanceof BusyError) {
      return NextResponse.json({ error: BUSY_MESSAGE }, { status: 409 });
    }
    throw error;
  }

  try {
    await updateBrief(id, {
      status: "running",
      stage: "searching",
      error: undefined,
      result: undefined,
      verified: undefined,
      stats: { tavilySearches: 0, tavilyCachedQueries: 0, aiRequests: 0 },
    });
  } catch (error) {
    await releaseLock(id);
    throw error;
  }

  after(async () => {
    try {
      // runPipeline re-enters the lock we already hold for this id.
      await runPipeline(id);
    } catch (error) {
      // runPipeline records its own failures and releases the lock; this is the
      // last resort for an error thrown outside its own handling.
      await releaseLock(id);
      if (!(error instanceof BusyError)) {
        await updateBrief(id, {
          status: "failed",
          error: error instanceof Error ? error.message : "Unexpected error.",
        });
      }
    }
  });

  return NextResponse.json({ ok: true, id });
}