"use client";

import type { Brief } from "@/lib/storage/briefs";
import { POLL_INTERVAL_MS } from "@/lib/config/limits";

const STAGES: { key: Brief["stage"]; label: string }[] = [
  { key: "searching", label: "Searching the web" },
  { key: "extracting", label: "Extracting candidate companies" },
  { key: "verifying", label: "Verifying websites load" },
  { key: "screenshotting", label: "Capturing screenshots" },
  { key: "analyzing", label: "Scoring and analysing" },
  { key: "done", label: "Done" },
];

export function ProgressPanel({ brief }: { brief: Brief }) {
  const activeIndex = STAGES.findIndex((stage) => stage.key === brief.stage);
  const progress =
    activeIndex < 0 ? 5 : Math.round(((activeIndex + 1) / STAGES.length) * 100);

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold">
          {STAGES[activeIndex]?.label ?? "Working"}
        </h2>
        <span className="text-xs tabular-nums text-stone-400">{progress}%</span>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
        <div
          className="h-full rounded-full bg-stone-900 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ol className="mt-4 space-y-1.5">
        {STAGES.map((stage, index) => {
          const state =
            index < activeIndex
              ? "done"
              : index === activeIndex
                ? "active"
                : "pending";
          return (
            <li
              key={stage.key}
              className={`flex items-center gap-2 text-xs ${
                state === "pending"
                  ? "text-stone-400"
                  : state === "done"
                    ? "text-stone-600"
                    : "font-medium text-stone-900"
              }`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  state === "done"
                    ? "bg-stone-500"
                    : state === "active"
                      ? "animate-pulse bg-stone-900"
                      : "bg-stone-200"
                }`}
              />
              {stage.label}
            </li>
          );
        })}
      </ol>

      {brief.stats.tavilySearches > 0 || brief.stats.tavilyCachedQueries > 0 ? (
        <p className="mt-4 border-t border-stone-100 pt-3 text-xs text-stone-500">
          {brief.stats.tavilySearches} credit-billing searches
          {brief.stats.tavilyCachedQueries > 0
            ? `, ${brief.stats.tavilyCachedQueries} served from cache`
            : ""}
        </p>
      ) : null}

      <p className="mt-3 text-xs text-stone-400">
        This page refreshes every {POLL_INTERVAL_MS / 1000} seconds.
      </p>
    </div>
  );
}
