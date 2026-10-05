import fs from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createBrief,
  createBriefFromProfile,
  deleteBrief,
  getBrief,
  listBriefs,
  markAllRunningAsInterrupted,
  updateBrief,
} from "@/lib/storage/briefs";
import {
  acquireLock,
  getRunningBriefId,
  isBusy,
  refreshLock,
  releaseLock,
  BusyError,
} from "@/lib/pipeline/lock";
import { briefImagesDir, BRIEFS_DIR, DATA_DIR } from "@/lib/storage/paths";
import { INTERRUPTED_MESSAGE } from "@/lib/config/limits";

const input = { idea: "An app for collecting client feedback on portfolio work." };

beforeEach(async () => {
  await fs.rm(DATA_DIR, { recursive: true, force: true });
});

afterEach(async () => {
  await fs.rm(DATA_DIR, { recursive: true, force: true });
});

describe("brief storage", () => {
  it("creates a brief in the draft state with no results", async () => {
    const brief = await createBrief(input);

    expect(brief.status).toBe("draft");
    expect(brief.stage).toBe("draft");
    expect(brief.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(brief.stats).toEqual({
      tavilySearches: 0,
      tavilyCachedQueries: 0,
      aiRequests: 0,
    });
    expect(brief.profile).toBeUndefined();
  });

  it("round-trips a brief through disk", async () => {
    const created = await createBrief(input);
    const loaded = await getBrief(created.id);
    expect(loaded?.input.idea).toBe(input.idea);
  });

  it("returns null for an unknown id and for a traversal attempt", async () => {
    await expect(getBrief("does-not-exist")).resolves.toBeNull();
    await expect(getBrief("../../etc/passwd")).resolves.toBeNull();
    await expect(getBrief("..%2F..%2Fsecrets")).resolves.toBeNull();
  });

  it("patches fields and bumps updatedAt", async () => {
    const brief = await createBrief(input);
    const patched = await updateBrief(brief.id, {
      status: "running",
      stage: "verifying",
    });

    expect(patched?.status).toBe("running");
    expect(patched?.stage).toBe("verifying");
    expect(Date.parse(patched!.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(brief.updatedAt),
    );
  });

  it("lists newest first", async () => {
    const first = await createBrief(input);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await createBrief(input);

    const listed = await listBriefs();
    expect(listed.map((brief) => brief.id)).toEqual([second.id, first.id]);
  });

  it("clones a brief as a new draft, keeping the profile but dropping results", async () => {
    const source = await createBrief(input);
    await updateBrief(source.id, {
      profile: {
        summary: "s",
        problem: "p",
        targetCustomer: "t",
        solutionType: "st",
        keyFeatures: ["k"],
        category: "c",
        searchQueries: ["q"],
        clarity: "clear",
        clarifyingQuestions: [],
      },
      status: "done",
      stage: "done",
    });

    const clone = await createBriefFromProfile((await getBrief(source.id))!);

    expect(clone.id).not.toBe(source.id);
    expect(clone.status).toBe("draft");
    expect(clone.profile?.summary).toBe("s");
    expect(clone.result).toBeUndefined();
    expect((await getBrief(source.id))?.status).toBe("done");
  });

  it("deletes the JSON and the screenshot folder", async () => {
    const brief = await createBrief(input);
    await fs.mkdir(briefImagesDir(brief.id), { recursive: true });
    await fs.writeFile(
      `${briefImagesDir(brief.id)}/alpha.com.jpg`,
      "jpeg",
    );

    await expect(deleteBrief(brief.id)).resolves.toBe(true);
    await expect(getBrief(brief.id)).resolves.toBeNull();
    await expect(fs.stat(briefImagesDir(brief.id))).rejects.toThrow();
  });

  it("marks interrupted running briefs as failed on startup", async () => {
    const running = await createBrief(input);
    await updateBrief(running.id, { status: "running", stage: "searching" });
    const draft = await createBrief(input);

    const count = await markAllRunningAsInterrupted();

    expect(count).toBe(1);
    expect((await getBrief(running.id))?.status).toBe("failed");
    expect((await getBrief(running.id))?.error).toBe(INTERRUPTED_MESSAGE);
    expect((await getBrief(draft.id))?.status).toBe("draft");
  });

  it("only stores .json files in the briefs directory", async () => {
    await createBrief(input);
    await fs.writeFile(`${BRIEFS_DIR}/notes.txt`, "ignore me");

    const listed = await listBriefs();
    expect(listed).toHaveLength(1);
  });
});

describe("pipeline lock", () => {
  it("reports busy while held and free once released", async () => {
    await expect(isBusy()).resolves.toBe(false);

    await acquireLock("brief-1");
    await expect(getRunningBriefId()).resolves.toBe("brief-1");
    await expect(isBusy()).resolves.toBe(true);

    await releaseLock("brief-1");
    await expect(isBusy()).resolves.toBe(false);
  });

  it("refuses a different brief while held", async () => {
    await acquireLock("brief-1");
    await expect(acquireLock("brief-2")).rejects.toBeInstanceOf(BusyError);
  });

  it("is re-entrant for the same brief", async () => {
    await acquireLock("brief-1");
    await expect(acquireLock("brief-1")).resolves.toBeUndefined();
  });

  it("grants the lock to only one of two simultaneous requests", async () => {
    const outcomes = await Promise.allSettled([
      acquireLock("brief-a"),
      acquireLock("brief-b"),
    ]);

    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === "rejected")).toHaveLength(1);
  });

  it("extends the lock on refresh so a long run is not treated as stale", async () => {
    await acquireLock("brief-1");
    await refreshLock("brief-1");
    await expect(getRunningBriefId()).resolves.toBe("brief-1");
  });

  it("ignores a refresh from a different brief", async () => {
    await acquireLock("brief-1");
    await refreshLock("other");
    await expect(getRunningBriefId()).resolves.toBe("brief-1");
  });

  it("releases a stale lock left by a dead process", async () => {
    await acquireLock("brief-1");
    // Simulate a crash: the lock file stays but is far older than the TTL.
    const lockPath = `${DATA_DIR}/pipeline.lock`;
    const stale = JSON.parse(await fs.readFile(lockPath, "utf8")) as Record<string, string>;
    stale.startedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    stale.refreshedAt = stale.startedAt;
    await fs.writeFile(lockPath, JSON.stringify(stale));

    await expect(getRunningBriefId()).resolves.toBeNull();
    await expect(acquireLock("brief-2")).resolves.toBeUndefined();
    await expect(getRunningBriefId()).resolves.toBe("brief-2");
  });

  it("does not release another brief's lock", async () => {
    await acquireLock("brief-1");
    await releaseLock("brief-2");
    await expect(getRunningBriefId()).resolves.toBe("brief-1");
  });
});