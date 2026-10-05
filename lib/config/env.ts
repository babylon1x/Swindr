/**
 * Environment access. Model names are only ever read here, never hardcoded
 * elsewhere (spec section 6).
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing environment variable ${name}. Add it to .env.local (see .env.example).`,
    );
  }
  return value.trim();
}

export function getGeminiApiKey(): string {
  return required("GEMINI_API_KEY");
}

export function getTavilyApiKey(): string {
  return required("TAVILY_API_KEY");
}

/** Used for AI requests 1 and 2. */
export function getFastModel(): string {
  return process.env.GEMINI_MODEL_FAST?.trim() || "gemini-3.5-flash-lite";
}

/** Used for AI request 3, which includes screenshots. Must accept image input. */
export function getSmartModel(): string {
  return process.env.GEMINI_MODEL_SMART?.trim() || "gemini-3.5-flash";
}

export function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function hasTavilyKey(): boolean {
  return Boolean(process.env.TAVILY_API_KEY?.trim());
}
