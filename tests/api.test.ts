import fs from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const afterCallbacks: (() => Promise<unknown>)[] = [];
const ranPipelines: string[] = [];

// `after()` needs a Next request context; capture the callback instead so the
// route can be exercised directly, and stub the pipeline so no AI/network runs.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (callback: () => Promise<unknown>) => {
      afterCallbacks.push(callback);
    },
  };
});

vi.mock("@/lib/pipeline/run", () => ({
  runPipeline: async (briefId: string) => {
    ranPipelines.push(briefId);
  },
}));

import {
  GET as getBriefRoute,
  PATCH as patchRoute,
  POST as cloneRoute,
  DELETE as deleteRoute,
} from "@/app/api/briefs/[id]/route";
import { POST as runRoute } from "@/app/api/briefs/[id]/run/route";
import { createBrief, getBrief, updateBrief } from "@/lib/storage/briefs";
import { acquireLock, releaseLock } from "@/lib/pipeline/lock";
import { DATA_DIR } from "@/lib/storage/paths";
import { BUSY_MESSAGE } from "@/lib/config/limits";

const idea = "An app for collecting client feedback on portfolio work.";

const profile = {
  summary: "A feedback hub for creatives.",
  problem: "Freelancers juggle scattered feedback.",
  targetCustomer: "Independent designers",
  solutionType: "web app",
  keyFeatures: ["boards", "annotations"],
  category: "productivity",
  searchQueries: ["portfolio feedback tool", "client review software"],
  clarity: "clear" as const,
  clarifyingQuestions: [],
};

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function stubResult() {
  return {
    landscapeSummary: "A quiet corner of the market.",
    direct: [],
    indirect: [],
    zeroCompetitors: true,
    designPatterns: [],
    opportunities: [],
  };
}

function patchBody(payload: unknown = { profile }) {
  return new Request("http://x", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

beforeEach(async () => {
  afterCallbacks.length = 0;
  ranPipelines.length = 0;
  await fs.rm(DATA_DIR, { recursive: true, force: true });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(DATA_DIR, { recursive: true, force: true });
});

describe("GET /api/briefs/[id]", () => {
  it("returns the brief", async () => {
    const brief = await createBrief({ idea });
    const response = await getBriefRoute(new Request("http://x"), context(brief.id));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { brief: { id: string } };
    expect(body.brief.id).toBe(brief.id);
  });

  it("404s for an unknown id", async () => {
    const response = await getBriefRoute(new Request("http://x"), context("nope"));
    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/briefs/[id]", () => {
  it("saves profile edits on a draft without calling the AI", async () => {
    const brief = await createBrief({ idea });
    const response = await patchRoute(patchBody(), context(brief.id));

    expect(response.status).toBe(200);
    expect((await getBrief(brief.id))?.profile?.summary).toBe(profile.summary);
  });

  it("refuses to edit a brief that has already run", async () => {
    const brief = await createBrief({ idea });
    await updateBrief(brief.id, { status: "done", stage: "done" });

    const response = await patchRoute(patchBody(), context(brief.id));
    expect(response.status).toBe(409);
    expect((await getBrief(brief.id))?.profile).toBeUndefined();
  });

  it("refuses to edit while running", async () => {
    const brief = await createBrief({ idea });
    await updateBrief(brief.id, { status: "running", stage: "searching" });

    const response = await patchRoute(patchBody(), context(brief.id));
    expect(response.status).toBe(409);
  });

  it("400s on an invalid profile and lists the issues", async () => {
    const brief = await createBrief({ idea });
    const response = await patchRoute(
      patchBody({ profile: { summary: "x" } }),
      context(brief.id),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { issues: { path: string }[] };
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("400s on more search queries than allowed", async () => {
    const brief = await createBrief({ idea });
    const response = await patchRoute(
      patchBody({ profile: { ...profile, searchQueries: Array(12).fill("query") } }),
      context(brief.id),
    );

    expect(response.status).toBe(400);
  });
});

describe("POST /api/briefs/[id]", () => {
  it("clones a finished brief into a new draft and leaves the original alone", async () => {
    const source = await createBrief({ idea });
    await updateBrief(source.id, {
      profile,
      status: "done",
      stage: "done",
      result: stubResult(),
    });

    const response = await cloneRoute(new Request("http://x"), context(source.id));
    expect(response.status).toBe(201);

    const { id } = (await response.json()) as { id: string };
    expect(id).not.toBe(source.id);
    expect((await getBrief(id))?.status).toBe("draft");
    expect((await getBrief(id))?.profile?.summary).toBe(profile.summary);
    expect((await getBrief(source.id))?.status).toBe("done");
  });

  it("reuses the same id when the brief has not run yet", async () => {
    const brief = await createBrief({ idea });
    await updateBrief(brief.id, { profile });

    const response = await cloneRoute(new Request("http://x"), context(brief.id));
    expect(response.status).toBe(200);
    expect(((await response.json()) as { id: string }).id).toBe(brief.id);
  });

  it("refuses to clone while the source is running", async () => {
    const brief = await createBrief({ idea });
    await updateBrief(brief.id, { profile, status: "running", stage: "searching" });

    const response = await cloneRoute(new Request("http://x"), context(brief.id));
    expect(response.status).toBe(409);
  });

  it("400s when there is no saved profile", async () => {
    const brief = await createBrief({ idea });
    const response = await cloneRoute(new Request("http://x"), context(brief.id));
    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/briefs/[id]", () => {
  it("removes a finished brief", async () => {
    const brief = await createBrief({ idea });
    const response = await deleteRoute(new Request("http://x"), context(brief.id));

    expect(response.status).toBe(200);
    expect(await getBrief(brief.id)).toBeNull();
  });

  it("refuses to delete a running brief", async () => {
    const brief = await createBrief({ idea });
    await updateBrief(brief.id, { status: "running", stage: "searching" });

    const response = await deleteRoute(new Request("http://x"), context(brief.id));
    expect(response.status).toBe(409);
    expect(await getBrief(brief.id)).not.toBeNull();
  });
});

describe("POST /api/briefs/[id]/run", () => {
  it("marks the brief running, locks it, and starts the pipeline in after()", async () => {
    const brief = await createBrief({ idea });
    await updateBrief(brief.id, { profile });

    const response = await runRoute(new Request("http://x"), context(brief.id));

    expect(response.status).toBe(200);
    expect((await getBrief(brief.id))?.status).toBe("running");
    // Nothing has run yet: the callback is deferred.
    expect(ranPipelines).toHaveLength(0);

    await afterCallbacks[0]();

    expect(ranPipelines).toEqual([brief.id]);
    // The stubbed pipeline does not finish the brief; the lock is still ours
    // only while the real pipeline runs, so nothing else may start now.
    const { acquireLock: acquire } = await import("@/lib/pipeline/lock");
    await expect(acquire("another-brief")).rejects.toThrow();
    await releaseLock(brief.id);
  });

  it("404s for an unknown brief", async () => {
    const response = await runRoute(new Request("http://x"), context("nope"));
    expect(response.status).toBe(404);
  });

  it("400s when the brief has no profile", async () => {
    const brief = await createBrief({ idea });
    const response = await runRoute(new Request("http://x"), context(brief.id));
    expect(response.status).toBe(400);
  });

  it("409s and stays a draft when the brief is already running", async () => {
    const brief = await createBrief({ idea });
    await updateBrief(brief.id, { profile, status: "running", stage: "searching" });

    const response = await runRoute(new Request("http://x"), context(brief.id));

    expect(response.status).toBe(409);
    expect(afterCallbacks).toHaveLength(0);
  });

  it("409s and keeps results when a finished brief is re-run in place", async () => {
    const brief = await createBrief({ idea });
    await updateBrief(brief.id, {
      profile,
      status: "done",
      stage: "done",
      result: stubResult(),
    });

    const response = await runRoute(new Request("http://x"), context(brief.id));

    expect(response.status).toBe(409);
    expect((await getBrief(brief.id))?.status).toBe("done");
    expect((await getBrief(brief.id))?.result).toBeDefined();
  });

  it("409s while another brief holds the lock, leaving this brief a draft", async () => {
    const brief = await createBrief({ idea });
    await updateBrief(brief.id, { profile });
    await acquireLock("other-brief");

    const response = await runRoute(new Request("http://x"), context(brief.id));

    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toBe(BUSY_MESSAGE);
    // The bug this guards: the loser of a race must not be left as "running".
    expect((await getBrief(brief.id))?.status).toBe("draft");
    await releaseLock("other-brief");
  });

  it("lets exactly one of two racing runs through", async () => {
    const first = await createBrief({ idea });
    const second = await createBrief({ idea });
    await updateBrief(first.id, { profile });
    await updateBrief(second.id, { profile });

    const responses = await Promise.all([
      runRoute(new Request("http://x"), context(first.id)),
      runRoute(new Request("http://x"), context(second.id)),
    ]);
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 409]);

    const states = await Promise.all([getBrief(first.id), getBrief(second.id)]);
    expect(states.filter((brief) => brief?.status === "running")).toHaveLength(1);
    expect(states.filter((brief) => brief?.status === "draft")).toHaveLength(1);
    expect(afterCallbacks).toHaveLength(1);

    await afterCallbacks[0]();
    await releaseLock((await getBrief(first.id))?.status === "running" ? first.id : second.id);
  });
});