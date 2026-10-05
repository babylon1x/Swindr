import fs from "fs/promises";
import { chromium, type Browser } from "playwright";
import {
  CONSENT_BUTTON_TEXTS,
  SCREENSHOT_CONCURRENCY,
  SCREENSHOT_DEVICE_SCALE_FACTOR,
  SCREENSHOT_JPEG_QUALITY,
  SCREENSHOT_SETTLE_MS,
  SCREENSHOT_TIMEOUT_MS,
  SCREENSHOT_VIEWPORT,
} from "@/lib/config/limits";
import { screenshotFile, briefImagesDir, ensureDir } from "@/lib/storage/paths";
import { mapWithConcurrency } from "@/lib/pool";

/**
 * Homepage screenshots via Playwright Chromium (spec section 7, step 4).
 *
 * Best-effort by design: a failure stores no image and never fails the brief.
 */

/**
 * One Chromium per batch, reused across the batch's contexts.
 *
 * The instance is cached so a batch does not relaunch per site, but a browser
 * that crashes mid-run would otherwise poison every later capture: `newContext`
 * throws forever and the brief silently ends up with no screenshots. Watching
 * for the disconnect drops the dead instance so the next capture relaunches.
 */
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const promise = chromium.launch({
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    browserPromise = promise;

    promise
      .then((browser) => {
        browser.once("disconnected", () => {
          if (browserPromise === promise) browserPromise = null;
        });
      })
      .catch(() => {
        if (browserPromise === promise) browserPromise = null;
      });
  }

  const browser = await browserPromise;
  if (!browser.isConnected()) {
    browserPromise = null;
    return getBrowser();
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch {
    // Ignore shutdown errors.
  }
  browserPromise = null;
}

/**
 * Clicks the first visible button whose text matches common consent wording.
 * Never throws: dismissal is an optimisation, not a requirement.
 */
async function dismissConsentBanner(page: import("playwright").Page): Promise<void> {
  const terms = CONSENT_BUTTON_TEXTS.map((term) =>
    term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const pattern = new RegExp(`^\\s*(${terms.join("|")})\\s*$`, "i");

  try {
    const candidates = page.locator(
      'button, [role="button"], a.button, input[type="button"], input[type="submit"]',
    );

    const count = await candidates.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const candidate = candidates.nth(index);
      if (!(await candidate.isVisible().catch(() => false))) continue;

      const text = (
        (await candidate.innerText().catch(() => "")) ||
        (await candidate.getAttribute("value").catch(() => "")) ||
        ""
      ).trim();

      if (!pattern.test(text)) continue;

      await candidate.click({ timeout: 2000 }).catch(() => undefined);
      await page.waitForTimeout(500);
      return;
    }
  } catch {
    // Best effort only.
  }
}

/**
 * Captures one site. Returns the saved filename, or null when the capture
 * failed for any reason.
 */
export async function captureScreenshot(
  briefId: string,
  domain: string,
  url: string,
): Promise<string | null> {
  const target = screenshotFile(briefId, domain);
  let context: Awaited<ReturnType<Browser["newContext"]>> | null = null;

  try {
    const browser = await getBrowser();

    context = await browser.newContext({
      viewport: { ...SCREENSHOT_VIEWPORT },
      deviceScaleFactor: SCREENSHOT_DEVICE_SCALE_FACTOR,
      acceptDownloads: false,
    });

    const page = await context.newPage();

    // Downloads and popups must never stall the run.
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (type === "media" || type === "font") {
        return route.abort().catch(() => undefined);
      }
      return route.continue().catch(() => undefined);
    });

    page.on("dialog", (dialog) => {
      dialog.dismiss().catch(() => undefined);
    });

    await page.goto(url, {
      waitUntil: "load",
      timeout: SCREENSHOT_TIMEOUT_MS,
    });

    await page.waitForTimeout(SCREENSHOT_SETTLE_MS);
    await dismissConsentBanner(page);

    await ensureDir(briefImagesDir(briefId));

    // Viewport only: no fullPage, so the capture matches 1440x900.
    const buffer = await page.screenshot({
      type: "jpeg",
      quality: SCREENSHOT_JPEG_QUALITY,
      fullPage: false,
    });

    await fs.writeFile(target, buffer);
    return `${domain}.jpg`;
  } catch (error) {
    // Best-effort by design, but never silent: a run where every capture fails
    // looks identical to one with no competitors, which is very confusing.
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.warn(`[screenshot] ${domain} failed: ${reason}`);
    return null;
  } finally {
    await context?.close().catch(() => undefined);
  }
}

/** Captures a batch with concurrency 3; failures become null entries. */
export async function captureAll(
  briefId: string,
  items: { domain: string; url: string }[],
): Promise<(string | null)[]> {
  if (items.length === 0) return [];
  try {
    return await mapWithConcurrency(items, SCREENSHOT_CONCURRENCY, (item) =>
      captureScreenshot(briefId, item.domain, item.url),
    );
  } finally {
    // Always shut the browser down: a long-lived Next process would otherwise
    // keep a Chromium tree alive between briefs and after failures.
    await closeBrowser();
  }
}
