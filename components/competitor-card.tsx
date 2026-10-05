"use client";

import { useState } from "react";
import type { ScoredCompetitor } from "@/lib/storage/briefs";
import { ScoreBars } from "./score-bars";

function imageUrl(briefId: string, file: string): string {
  return `/api/briefs/${briefId}/images/${file}`;
}

export function CompetitorCard({
  briefId,
  competitor,
}: {
  briefId: string;
  competitor: ScoredCompetitor;
}) {
  const [enlarged, setEnlarged] = useState(false);

  return (
    <article
      data-print="keep"
      className="flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white"
    >
      <button
        type="button"
        data-print="hide"
        onClick={() => setEnlarged(true)}
        disabled={!competitor.screenshotFile}
        className="relative block aspect-[1440/900] w-full overflow-hidden border-b border-stone-200 bg-stone-100 text-left disabled:cursor-default"
      >
        {competitor.screenshotFile ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            data-print="shot"
            src={imageUrl(briefId, competitor.screenshotFile)}
            alt={`${competitor.name} homepage screenshot`}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-xs text-stone-400">
            No screenshot captured
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{competitor.name}</h3>
            <a
              href={`https://${competitor.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-xs text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-stone-900"
            >
              {competitor.domain}
            </a>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-lg font-semibold tabular-nums">
              {competitor.overlapScore}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-stone-400">
              overlap
            </div>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-stone-700">
          {competitor.positioning}
        </p>

        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">
            {competitor.pricingModel}
          </span>
          {competitor.limitedData ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
              limited data
            </span>
          ) : null}
        </div>

        <ScoreBars
          dimensions={[
            ["problemOverlap", competitor.problemOverlap],
            ["customerOverlap", competitor.customerOverlap],
            ["solutionSimilarity", competitor.solutionSimilarity],
          ]}
        />

        {competitor.strengths.length > 0 ? (
          <div>
            <h4 className="text-xs font-medium text-stone-600">Strengths</h4>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-stone-600">
              {competitor.strengths.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {competitor.gaps.length > 0 ? (
          <div>
            <h4 className="text-xs font-medium text-stone-600">Gaps</h4>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-stone-600">
              {competitor.gaps.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {competitor.evidenceUrl ? (
          <a
            href={competitor.evidenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto pt-1 text-xs text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-stone-900"
          >
            Evidence from search result
          </a>
        ) : null}
      </div>

      {enlarged && competitor.screenshotFile ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 p-6"
          onClick={() => setEnlarged(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${competitor.name} screenshot enlarged`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl(briefId, competitor.screenshotFile)}
            alt={`${competitor.name} homepage screenshot`}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setEnlarged(false)}
            className="absolute right-6 top-6 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-stone-900"
          >
            Close
          </button>
        </div>
      ) : null}
    </article>
  );
}
