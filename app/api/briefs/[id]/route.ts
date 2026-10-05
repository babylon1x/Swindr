import { NextResponse } from "next/server";
import {
  createBriefFromProfile,
  deleteBrief,
  getBrief,
  updateBrief,
} from "@/lib/storage/briefs";
import { ideaProfileSchema } from "@/lib/ai/schema";
import { MAX_SEARCH_QUERIES } from "@/lib/config/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** GET /api/briefs/[id] */
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const brief = await getBrief(id);
  if (!brief) {
    return NextResponse.json({ error: "Brief not found." }, { status: 404 });
  }
  return NextResponse.json({ brief });
}

/**
 * PATCH /api/briefs/[id] — saves profile edits. Editing never calls the AI
 * again (spec section 7, step 1); it is only allowed before the run starts.
 */
export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const brief = await getBrief(id);
  if (!brief) {
    return NextResponse.json({ error: "Brief not found." }, { status: 404 });
  }

  if (brief.status !== "draft") {
    const message =
      brief.status === "running"
        ? "This brief is running; the profile is read-only."
        : "This brief has already run; edit a copy instead.";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = ideaProfileSchema.safeParse(
    (body as { profile?: unknown })?.profile,
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "The profile is not valid.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const profile = parsed.data;
  if (profile.searchQueries.length > MAX_SEARCH_QUERIES) {
    return NextResponse.json(
      { error: `At most ${MAX_SEARCH_QUERIES} search queries are allowed.` },
      { status: 400 },
    );
  }

  const updated = await updateBrief(id, { profile });
  return NextResponse.json({ brief: updated });
}

/**
 * POST /api/briefs/[id] — "Edit profile & re-run".
 *
 * Re-running never mutates a finished brief: it clones the saved profile into
 * a NEW draft brief so the original stays intact and the new run benefits from
 * the Tavily cache (spec section 8).
 */
export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  const source = await getBrief(id);

  if (!source) {
    return NextResponse.json({ error: "Brief not found." }, { status: 404 });
  }

  if (source.status === "running") {
    return NextResponse.json(
      { error: "Cannot re-run a brief while it is running." },
      { status: 409 },
    );
  }

  if (!source.profile) {
    return NextResponse.json(
      { error: "This brief has no saved idea profile to reuse." },
      { status: 400 },
    );
  }

  // A brief with no results yet (still draft) already is the copy to re-run.
  if (source.status === "draft") {
    return NextResponse.json({ id: source.id });
  }

  const clone = await createBriefFromProfile(source);
  return NextResponse.json({ id: clone.id }, { status: 201 });
}

/** DELETE /api/briefs/[id] — removes the JSON and the screenshot folder. */
export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const brief = await getBrief(id);

  if (brief?.status === "running") {
    return NextResponse.json(
      { error: "Cannot delete a brief while it is running." },
      { status: 409 },
    );
  }

  const removed = await deleteBrief(id);
  if (!removed) {
    return NextResponse.json({ error: "Brief not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
