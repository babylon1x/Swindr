import { NextResponse } from "next/server";
import { getBrief } from "@/lib/storage/briefs";
import { briefToMarkdown } from "@/lib/export/markdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** GET /api/briefs/[id]/export — Markdown download. */
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const brief = await getBrief(id);

  if (!brief) {
    return NextResponse.json({ error: "Brief not found." }, { status: 404 });
  }

  const markdown = briefToMarkdown(brief);
  const slug = (brief.profile?.summary ?? "competitor-brief")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return new NextResponse(markdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${slug || "competitor-brief"}.md"`,
    },
  });
}
