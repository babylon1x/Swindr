import fs from "fs/promises";
import path from "path";
import { DATA_DIR, ensureDataDirs } from "@/lib/storage/paths";

/**
 * Server-side lock: only one brief may run at a time (spec section 8).
 *
 * File-based rather than in-memory because Next.js dev HMR re-evaluates
 * modules, which would silently reset an in-memory lock. Acquisition is atomic
 * (`wx` fails if the file exists) so two simultaneous run requests cannot both
 * win, and the lock carries a timestamp so a crash cannot block the app
 * forever.
 */

const LOCK_FILE = path.join(DATA_DIR, "pipeline.lock");

/**
 * A lock not refreshed within this window is assumed to belong to a dead
 * process. `refreshLock()` keeps it alive while a pipeline is progressing.
 */
const STALE_LOCK_MS = 30 * 60 * 1000;

export interface LockState {
  briefId: string;
  startedAt: string;
  refreshedAt: string;
}

export class BusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusyError";
  }
}

async function readLock(): Promise<LockState | null> {
  try {
    const raw = await fs.readFile(LOCK_FILE, "utf8");
    const parsed = JSON.parse(raw) as LockState;
    if (!parsed?.briefId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isFresh(lock: LockState): boolean {
  const stamp = new Date(lock.refreshedAt ?? lock.startedAt).getTime();
  return Number.isFinite(stamp) && Date.now() - stamp <= STALE_LOCK_MS;
}

async function removeStaleLock(): Promise<void> {
  const lock = await readLock();
  if (lock && isFresh(lock)) return;
  try {
    await fs.unlink(LOCK_FILE);
  } catch {
    // Someone else removed it first.
  }
}

/** The brief id currently holding a fresh lock, or null. */
export async function getRunningBriefId(): Promise<string | null> {
  const lock = await readLock();
  if (!lock || !isFresh(lock)) return null;
  return lock.briefId;
}

export async function isBusy(): Promise<boolean> {
  return (await getRunningBriefId()) !== null;
}

/**
 * Takes the lock for `briefId`.
 *
 * Re-entrant: the same brief may re-acquire its own lock. Throws BusyError when
 * a different brief holds a fresh lock.
 */
export async function acquireLock(briefId: string): Promise<void> {
  await ensureDataDirs();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const now = new Date().toISOString();
    const state: LockState = { briefId, startedAt: now, refreshedAt: now };

    try {
      // Atomic create-or-fail: the loser of a race gets EEXIST.
      const handle = await fs.open(LOCK_FILE, "wx");
      try {
        await handle.writeFile(JSON.stringify(state, null, 2), "utf8");
      } finally {
        await handle.close();
      }
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }

    const existing = await readLock();
    if (existing && isFresh(existing)) {
      if (existing.briefId === briefId) return; // Re-entrant.
      throw new BusyError("Another brief is already running.");
    }

    // Missing or stale: drop it and try to claim the lock once more.
    await removeStaleLock();
  }

  throw new BusyError("Another brief is already running.");
}

/** Heartbeat: called between pipeline stages so long runs keep the lock. */
export async function refreshLock(briefId: string): Promise<void> {
  const existing = await readLock();
  if (!existing || existing.briefId !== briefId) return;
  const state: LockState = {
    ...existing,
    refreshedAt: new Date().toISOString(),
  };
  await fs.writeFile(LOCK_FILE, JSON.stringify(state, null, 2), "utf8");
}

export async function releaseLock(briefId?: string): Promise<void> {
  const existing = await readLock();
  if (existing && briefId && existing.briefId !== briefId) return;
  try {
    await fs.unlink(LOCK_FILE);
  } catch {
    // Already gone.
  }
}