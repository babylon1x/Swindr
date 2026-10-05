import path from "path";
import { fileURLToPath } from "url";

/**
 * Vitest runs test files in parallel processes. Pointing every worker at its own
 * data directory stops storage, lock and cache tests from deleting each other's
 * files. Setup files run before the test module is imported, and
 * `DATA_DIR` is read at import time, so this has to happen here.
 */
const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const workerId = process.env.VITEST_WORKER_ID ?? "0";

process.env.SWIND_R_DATA_DIR = path.join(rootDir, ".test-data", `worker-${workerId}`);