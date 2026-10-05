import { builtinModules } from "node:module";
import type { NextConfig } from "next";

/**
 * Node built-ins must never be resolved by the bundler: they are provided by
 * the runtime. Next normally externalises them for server bundles, but with the
 * WASM SWC fallback this project's `node:` imports reach webpack's file resolver
 * and fail ("UnhandledSchemeError") or cannot be found. Marking them external
 * for server builds keeps `fs/promises`, `crypto`, `path`, ... working.
 */
const isNodeBuiltin = (request: string): boolean => {
  const bare = request.startsWith("node:") ? request.slice(5) : request;
  return builtinModules.includes(bare);
};

const nextConfig: NextConfig = {
  // Playwright and the AI/verification stack need the Node.js runtime, never Edge.
  serverExternalPackages: ["playwright", "@google/genai", "cheerio", "tldts"],
  typescript: { ignoreBuildErrors: false },
  webpack: (config, { isServer }) => {
    if (!isServer) return config;

    const externals = Array.isArray(config.externals) ? config.externals : [];
    config.externals = [
      ...externals,
      ({ request }: { request?: string }, callback: (error?: unknown, result?: string) => void) => {
        if (request && isNodeBuiltin(request)) {
          callback(undefined, `commonjs ${request}`);
          return;
        }
        callback();
      },
    ];

    return config;
  },
};

export default nextConfig;