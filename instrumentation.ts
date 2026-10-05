/**
 * Next.js runs `register()` once when the server starts. A brief that was
 * `running` when the process died can never finish, so it is marked failed on
 * boot instead of showing a spinner forever (spec section 8).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { markAllRunningAsInterrupted } = await import("@/lib/storage/briefs");
  const { releaseLock } = await import("@/lib/pipeline/lock");

  try {
    await releaseLock();
    await markAllRunningAsInterrupted();
  } catch {
    // Never block server start on housekeeping.
  }
}