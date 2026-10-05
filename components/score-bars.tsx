"use client";

import type { ScoreField } from "@/lib/ai/schema";

const LABELS: Record<string, string> = {
  problemOverlap: "Problem overlap",
  customerOverlap: "Customer overlap",
  solutionSimilarity: "Solution similarity",
};

const COLORS = ["bg-stone-200", "bg-stone-400", "bg-stone-600", "bg-stone-900"];

/** Three small bars, one per rubric dimension, each with its reason. */
export function ScoreBars({
  dimensions,
}: {
  dimensions: [string, ScoreField][];
}) {
  return (
    <dl className="space-y-2">
      {dimensions.map(([key, value]) => (
        <div key={key}>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-xs font-medium text-stone-600">
              {LABELS[key] ?? key}
            </dt>
            <dd className="text-xs tabular-nums text-stone-500">
              {value.score}/3
            </dd>
          </div>
          <div className="mt-1 flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((step) => (
              <span
                key={step}
                className={`h-1.5 flex-1 rounded-full ${
                  step < value.score ? COLORS[value.score] : "bg-stone-100"
                }`}
              />
            ))}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            {value.reason}
          </p>
        </div>
      ))}
    </dl>
  );
}
