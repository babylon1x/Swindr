"use client";

import Link from "next/link";
import {
  FOOTER_DISCLAIMER,
  MAX_DIRECT_CARDS,
  MAX_INDIRECT_CARDS,
  NO_COMPETITORS_MESSAGE,
} from "@/lib/config/limits";
import type { Brief } from "@/lib/storage/briefs";
import { CompetitorCard } from "./competitor-card";

export function BriefView({ brief }: { brief: Brief }) {
  const result = brief.result;

  if (!result) return null;

  const more = [
    ...result.direct.slice(MAX_DIRECT_CARDS),
    ...result.indirect.slice(MAX_INDIRECT_CARDS),
  ];

  const withShots = [...result.direct, ...result.indirect].filter(
    (competitor) => competitor.screenshotFile,
  );

  return (
    <div className="space-y-12">
      {/* b. Landscape summary */}
      <section data-print="keep">
        <h2 className="text-lg font-semibold tracking-tight">Landscape summary</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-stone-700">
          {result.landscapeSummary}
        </p>
        {result.zeroCompetitors ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {NO_COMPETITORS_MESSAGE}
          </p>
        ) : null}
      </section>

      {/* c. Direct competitors */}
      <section>
        <h2 className="text-lg font-semibold tracking-tight">
          Direct competitors
          <span className="ml-2 text-sm font-normal text-stone-500">
            {result.direct.length}
          </span>
        </h2>
        {result.direct.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">None found.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {result.direct.slice(0, MAX_DIRECT_CARDS).map((competitor) => (
              <CompetitorCard
                key={competitor.domain}
                briefId={brief.id}
                competitor={competitor}
              />
            ))}
          </div>
        )}
      </section>

      {/* d. Indirect competitors */}
      <section>
        <h2 className="text-lg font-semibold tracking-tight">
          Indirect competitors
          <span className="ml-2 text-sm font-normal text-stone-500">
            {result.indirect.length}
          </span>
        </h2>
        {result.indirect.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">None found.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {result.indirect.slice(0, MAX_INDIRECT_CARDS).map((competitor) => (
              <CompetitorCard
                key={competitor.domain}
                briefId={brief.id}
                competitor={competitor}
              />
            ))}
          </div>
        )}
      </section>

      {/* e. More */}
      {more.length > 0 ? (
        <section data-print="keep">
          <h2 className="text-lg font-semibold tracking-tight">
            More
            <span className="ml-2 text-sm font-normal text-stone-500">
              {more.length}
            </span>
          </h2>
          <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
            {more.map((competitor) => (
              <li
                key={competitor.domain}
                className="flex items-center justify-between gap-4 px-4 py-2.5"
              >
                <a
                  href={`https://${competitor.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-sm font-medium underline decoration-stone-300 underline-offset-2 hover:text-stone-900"
                >
                  {competitor.name}
                </a>
                <span className="flex shrink-0 items-center gap-3 text-xs text-stone-500">
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 capitalize">
                    {competitor.classification}
                  </span>
                  <span className="tabular-nums">
                    {competitor.overlapScore} overlap
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* f. Visual gallery */}
      {withShots.length > 0 ? (
        <section data-print="page-break">
          <h2 className="text-lg font-semibold tracking-tight">Visual gallery</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {withShots.map((competitor) => (
              <figure
                key={competitor.domain}
                data-print="keep"
                className="overflow-hidden rounded-lg border border-stone-200 bg-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  data-print="shot"
                  src={`/api/briefs/${brief.id}/images/${competitor.screenshotFile}`}
                  alt={`${competitor.name} homepage screenshot`}
                  className="aspect-[1440/900] w-full object-cover object-top"
                />
                <figcaption className="px-3 py-2 text-xs text-stone-600">
                  {competitor.name}
                </figcaption>
              </figure>
            ))}
          </div>

          {result.designPatterns.length > 0 ? (
            <div className="mt-6 rounded-xl border border-stone-200 bg-white p-5">
              <h3 className="text-sm font-semibold">Shared design patterns</h3>
              <ul className="mt-3 space-y-3">
                {result.designPatterns.map((pattern, index) => (
                  <li key={index} className="text-sm">
                    <span className="font-medium">{pattern.pattern}</span>
                    <span className="ml-2 text-xs text-stone-500">
                      {pattern.domains.join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* g. Opportunities */}
      <section data-print="keep">
        <h2 className="text-lg font-semibold tracking-tight">
          Opportunities to stand out
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {result.opportunities.map((opportunity, index) => (
            <li
              key={index}
              className="rounded-xl border border-stone-200 bg-white p-4"
            >
              <h3 className="text-sm font-semibold">{opportunity.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-600">
                {opportunity.explanation}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* h. Footer note */}
      <p className="border-t border-stone-200 pt-4 text-xs text-stone-400">
        {FOOTER_DISCLAIMER}
      </p>

      <div data-print="hide">
        <Link
          href="/history"
          className="text-xs text-stone-500 underline underline-offset-2 hover:text-stone-900"
        >
          Back to history
        </Link>
      </div>
    </div>
  );
}
