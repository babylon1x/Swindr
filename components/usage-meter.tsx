"use client";

import { useEffect, useState } from "react";

interface Usage {
  month: string;
  day: string;
  tavilySearchesThisMonth: number;
  geminiRequestsToday: number;
  searchesPerBrief: number;
}

/**
 * Local usage meter (spec section 9). Counts are produced by this app, not by
 * reading a provider dashboard, so they are labelled a local estimate.
 */
export function UsageMeter() {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/usage", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as Usage;
        if (!cancelled) setUsage(data);
      } catch {
        // The meter is informational; failing to load is not an error.
      }
    }

    void load();
    const timer = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-stone-500">
      <span className="font-medium text-stone-600">Usage (local estimate)</span>
      <span>
        Tavily searches this month:{" "}
        <strong className="font-semibold text-stone-800">
          {usage ? usage.tavilySearchesThisMonth : "—"}
        </strong>
        {usage ? ` of ~1000 free credits (${usage.searchesPerBrief}/brief max)` : ""}
      </span>
      <span>
        Gemini requests today:{" "}
        <strong className="font-semibold text-stone-800">
          {usage ? usage.geminiRequestsToday : "—"}
        </strong>{" "}
        (3/brief)
      </span>
    </div>
  );
}
