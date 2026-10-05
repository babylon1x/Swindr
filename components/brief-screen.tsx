"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { IdeaProfile } from "@/lib/ai/schema";
import type { Brief } from "@/lib/storage/briefs";
import { POLL_INTERVAL_MS } from "@/lib/config/limits";
import { BriefView } from "./brief-view";
import { ProfileEditor } from "./profile-editor";
import { ProgressPanel } from "./progress-panel";

/**
 * One client screen for every brief state, so the page can move
 * draft -> running -> done without a full navigation.
 */
export function BriefScreen({ initialBrief }: { initialBrief: Brief }) {
  const router = useRouter();
  const [brief, setBrief] = useState<Brief>(initialBrief);
  const [actionError, setActionError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const response = await fetch(`/api/briefs/${initialBrief.id}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = (await response.json()) as { brief: Brief };
      setBrief(data.brief);
    } catch {
      // Keep polling; a transient failure is not fatal.
    }
  }, [initialBrief.id]);

  useEffect(() => {
    if (brief.status !== "running") return;
    void poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [brief.status, poll]);

  async function startRun() {
    setActionError(null);
    const response = await fetch(`/api/briefs/${initialBrief.id}/run`, {
      method: "POST",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setActionError(data.error ?? "Could not start the run.");
      return;
    }
    await poll();
  }

  async function editAndReRun() {
    setActionError(null);
    const response = await fetch(`/api/briefs/${initialBrief.id}`, {
      method: "POST",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setActionError(data.error ?? "Could not create a new draft.");
      return;
    }
    router.push(`/brief/${data.id}`);
  }

  return (
    <div className="space-y-8">
      <BriefHeader brief={brief} />

      {actionError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {actionError}
        </div>
      ) : null}

      {brief.status === "draft" && brief.profile ? (
        <ProfileEditor
          briefId={brief.id}
          initialProfile={brief.profile}
          onSaved={(profile: IdeaProfile) =>
            setBrief((current) => ({ ...current, profile }))
          }
          onStart={startRun}
        />
      ) : null}

      {brief.status === "running" ? <ProgressPanel brief={brief} /> : null}

      {brief.status === "failed" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <h2 className="text-sm font-semibold text-red-900">Run failed</h2>
          <p className="mt-1 text-sm text-red-800">{brief.error}</p>
        </div>
      ) : null}

      {brief.status === "done" ? <BriefView brief={brief} /> : null}

      {brief.status !== "running" && brief.status !== "draft" ? (
        <ProfileReadOnly profile={brief.profile} />
      ) : null}

      {brief.status !== "running" && brief.status !== "draft" ? (
        <div
          data-print="hide"
          className="flex flex-wrap items-center gap-3 border-t border-stone-200 pt-4"
        >
          <button
            type="button"
            onClick={editAndReRun}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:border-stone-900"
          >
            Edit profile &amp; re-run
          </button>
          <a
            href={`/api/briefs/${brief.id}/export`}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:border-stone-900"
          >
            Export Markdown
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:border-stone-900"
          >
            Print / Save as PDF
          </button>
          <Link
            href="/history"
            className="ml-auto text-xs text-stone-500 underline underline-offset-2 hover:text-stone-900"
          >
            Back to history
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/** Section (a): the profile as run, read-only once the brief has started. */
function ProfileReadOnly({ profile }: { profile?: Brief["profile"] }) {
  if (!profile) return null;

  return (
    <section data-print="keep">
      <h2 className="text-lg font-semibold tracking-tight">Idea profile</h2>
      <dl className="mt-3 space-y-2 text-sm">
        {[
          ["Summary", profile.summary],
          ["Problem", profile.problem],
          ["Target customer", profile.targetCustomer],
          ["Solution type", profile.solutionType],
          ["Category", profile.category],
        ].map(([label, value]) => (
          <div key={label} className="flex gap-3">
            <dt className="w-32 shrink-0 text-stone-500">{label}</dt>
            <dd className="text-stone-700">{value}</dd>
          </div>
        ))}
        {profile.keyFeatures.length > 0 ? (
          <div className="flex gap-3">
            <dt className="w-32 shrink-0 text-stone-500">Key features</dt>
            <dd className="text-stone-700">
              {profile.keyFeatures.join("; ")}
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function BriefHeader({ brief }: { brief: Brief }) {
  return (
    <header data-print="keep" className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-stone-400">
        {new Date(brief.createdAt).toLocaleString()}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">
        {brief.profile?.summary ?? brief.input.idea.slice(0, 120)}
      </h1>
      {brief.profile ? (
        <p className="max-w-3xl text-sm text-stone-600">
          <span className="font-medium">Category:</span>{" "}
          {brief.profile.category} ·{" "}
          <span className="font-medium">Customer:</span>{" "}
          {brief.profile.targetCustomer}
          {brief.input.market ? (
            <>
              {" · "}
              <span className="font-medium">Market:</span> {brief.input.market}
            </>
          ) : null}
        </p>
      ) : null}
    </header>
  );
}