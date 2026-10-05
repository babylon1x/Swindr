import { NextResponse } from "next/server";
import { generateIdeaProfile } from "@/lib/ai/idea-profile";
import { AiOutputError, AiQuotaError, AiRequestError } from "@/lib/ai/client";
import { ideaInputSchema } from "@/lib/ai/schema";
import { createBrief, updateBrief } from "@/lib/storage/briefs";
import { GEMINI_QUOTA_MESSAGE } from "@/lib/config/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ideas — AI request 1. Turns a raw idea into an idea profile and
 * stores it as a draft brief so the profile editor can render it.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = ideaInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Check the idea details.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const { idea, targetCustomer, market } = parsed.data;

  try {
    const profile = await generateIdeaProfile({
      idea,
      targetCustomer: targetCustomer || undefined,
      market: market || undefined,
    });

    const brief = await createBrief({
      idea,
      ...(targetCustomer ? { targetCustomer } : {}),
      ...(market ? { market } : {}),
    });

    await updateBrief(brief.id, { profile });

    return NextResponse.json({ id: brief.id, profile });
  } catch (error) {
    return NextResponse.json({ error: messageFor(error) }, { status: statusFor(error) });
  }
}

function messageFor(error: unknown): string {
  if (error instanceof AiQuotaError) {
    return error.retryAt
      ? `${GEMINI_QUOTA_MESSAGE} (retry after ${error.retryAt.toLocaleTimeString()})`
      : GEMINI_QUOTA_MESSAGE;
  }
  if (error instanceof AiOutputError) {
    return `The AI returned unusable output twice. ${error.issues}`;
  }
  if (error instanceof AiRequestError) return error.message;
  if (error instanceof Error) {
    if (error.message.includes("Missing environment variable")) return error.message;
    return error.message;
  }
  return "Could not build the idea profile.";
}

function statusFor(error: unknown): number {
  if (error instanceof AiQuotaError) return 429;
  if (error instanceof AiRequestError) return 502;
  return 500;
}
