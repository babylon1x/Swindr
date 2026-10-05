import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { briefImagesDir, isSafeId } from "@/lib/storage/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; file: string }> };

/** GET /api/briefs/[id]/images/[file] — serves a captured screenshot. */
export async function GET(_request: Request, context: Context) {
  const { id, file } = await context.params;

  if (!isSafeId(id) || !/^[A-Za-z0-9._-]+\.jpg$/i.test(file)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const target = path.join(briefImagesDir(id), file);

  try {
    const data = await fs.readFile(target);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
