"use client";

import { useState } from "react";
import type { IdeaProfile } from "@/lib/ai/schema";
import { MAX_SEARCH_QUERIES } from "@/lib/config/limits";

/**
 * Editable idea profile (spec section 7, step 1). Editing never calls the AI
 * again: the edited profile is what the pipeline consumes.
 */
export function ProfileEditor({
  briefId,
  initialProfile,
  onSaved,
  onStart,
}: {
  briefId: string;
  initialProfile: IdeaProfile;
  onSaved: (profile: IdeaProfile) => void;
  onStart: (profile: IdeaProfile) => Promise<void>;
}) {
  const [profile, setProfile] = useState<IdeaProfile>(initialProfile);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof IdeaProfile>(key: K, value: IdeaProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function setQuery(index: number, value: string) {
    setProfile((current) => {
      const next = [...current.searchQueries];
      next[index] = value;
      return { ...current, searchQueries: next };
    });
  }

  function removeQuery(index: number) {
    setProfile((current) => ({
      ...current,
      searchQueries: current.searchQueries.filter((_, i) => i !== index),
    }));
  }

  function addQuery() {
    setProfile((current) =>
      current.searchQueries.length >= MAX_SEARCH_QUERIES
        ? current
        : { ...current, searchQueries: [...current.searchQueries, ""] },
    );
  }

  function toggleFeature(index: number) {
    setProfile((current) => ({
      ...current,
      keyFeatures: current.keyFeatures.filter((_, i) => i !== index),
    }));
  }

  function setFeature(index: number, value: string) {
    setProfile((current) => {
      const next = [...current.keyFeatures];
      next[index] = value;
      return { ...current, keyFeatures: next };
    });
  }

  function addFeature() {
    setProfile((current) =>
      current.keyFeatures.length >= 6 ? current : {
        ...current,
        keyFeatures: [...current.keyFeatures, ""],
      },
    );
  }

  async function save(): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/briefs/${briefId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not save the profile.");
        if (Array.isArray(data.issues) && data.issues.length > 0) {
          setError(
            `${data.error} ${data.issues
              .map((issue: { path: string; message: string }) => `${issue.path}: ${issue.message}`)
              .join("; ")}`,
          );
        }
        return false;
      }
      onSaved(profile);
      return true;
    } catch {
      setError("Network error while saving.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const ok = await save();
      if (!ok) return;
      await onStart(profile);
    } finally {
      setStarting(false);
    }
  }

  const busy = saving || starting;

  return (
    <div className="space-y-6">
      {profile.clarity === "vague" && profile.clarifyingQuestions.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">
            This idea looks a little vague. Consider answering:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {profile.clarifyingQuestions.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-800">
            You can edit everything below and continue anyway.
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <TextField
          label="Summary"
          value={profile.summary}
          onChange={(value) => set("summary", value)}
          maxLength={200}
          hint={`${profile.summary.length}/200`}
        />
        <TextField
          label="Problem"
          value={profile.problem}
          onChange={(value) => set("problem", value)}
          multiline
        />
        <TextField
          label="Target customer"
          value={profile.targetCustomer}
          onChange={(value) => set("targetCustomer", value)}
        />
        <TextField
          label="Solution type"
          value={profile.solutionType}
          onChange={(value) => set("solutionType", value)}
          hint="e.g. mobile app, B2B SaaS, marketplace"
        />
        <TextField
          label="Category"
          value={profile.category}
          onChange={(value) => set("category", value)}
        />

        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-stone-800">Key features</span>
            <span className="text-xs text-stone-400">
              {profile.keyFeatures.length}/6
            </span>
          </div>
          <div className="mt-2 space-y-2">
            {profile.keyFeatures.map((feature, index) => (
              <div key={index} className="flex gap-2">
                <input
                  value={feature}
                  onChange={(event) => setFeature(index, event.target.value)}
                  className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900"
                />
                <button
                  type="button"
                  onClick={() => toggleFeature(index)}
                  className="rounded-lg border border-stone-300 px-2.5 text-xs text-stone-500 hover:border-stone-900 hover:text-stone-900"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          {profile.keyFeatures.length < 6 ? (
            <button
              type="button"
              onClick={addFeature}
              className="mt-2 text-xs text-stone-500 underline underline-offset-2 hover:text-stone-900"
            >
              Add feature
            </button>
          ) : null}
        </div>

        <div className="mt-5 border-t border-stone-200 pt-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-stone-800">
              Search queries
            </span>
            <span className="text-xs text-stone-400">
              {profile.searchQueries.length}/{MAX_SEARCH_QUERIES}
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            These decide what the tool searches. Each uncached query costs 1
            Tavily credit.
          </p>
          <div className="mt-2 space-y-2">
            {profile.searchQueries.map((query, index) => (
              <div key={index} className="flex gap-2">
                <input
                  value={query}
                  onChange={(event) => setQuery(index, event.target.value)}
                  className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900"
                />
                <button
                  type="button"
                  onClick={() => removeQuery(index)}
                  className="rounded-lg border border-stone-300 px-2.5 text-xs text-stone-500 hover:border-stone-900 hover:text-stone-900"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
          {profile.searchQueries.length < MAX_SEARCH_QUERIES ? (
            <button
              type="button"
              onClick={addQuery}
              className="mt-2 text-xs text-stone-500 underline underline-offset-2 hover:text-stone-900"
            >
              Add query
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={start}
          disabled={busy || profile.searchQueries.length === 0}
          className="rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {starting ? "Starting…" : "Find competitors"}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-lg border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 hover:border-stone-900 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  multiline,
  maxLength,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  maxLength?: number;
  hint?: string;
}) {
  const className =
    "mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900";

  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-stone-800">{label}</span>
        {hint ? <span className="text-xs text-stone-400">{hint}</span> : null}
      </div>
      {multiline ? (
        <textarea
          value={value}
          rows={3}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          className={className}
        />
      ) : (
        <input
          value={value}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          className={className}
        />
      )}
    </div>
  );
}
