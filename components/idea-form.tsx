"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  IDEA_MAX_CHARS,
  IDEA_MIN_CHARS,
  MARKET_MAX_CHARS,
  TARGET_CUSTOMER_MAX_CHARS,
} from "@/lib/config/limits";

export function IdeaForm() {
  const router = useRouter();

  const [idea, setIdea] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [market, setMarket] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);

  const ideaTooShort = idea.trim().length > 0 && idea.trim().length < IDEA_MIN_CHARS;
  const canSubmit = idea.trim().length >= IDEA_MIN_CHARS && !busy;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setError(null);
    setIssues([]);

    try {
      const response = await fetch("/api/ideas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea, targetCustomer, market }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not build the idea profile.");
        if (Array.isArray(data.issues)) setIssues(data.issues);
        return;
      }

      router.push(`/brief/${data.id}`);
    } catch {
      setError("Network error. Is the dev server still running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="idea"
          className="block text-sm font-medium text-stone-800"
        >
          Your idea
          <span className="ml-1 text-stone-400">(required)</span>
        </label>
        <p className="mt-1 text-xs text-stone-500">
          A raw description is fine. Minimum {IDEA_MIN_CHARS} characters.
        </p>
        <textarea
          id="idea"
          value={idea}
          onChange={(event) => setIdea(event.target.value.slice(0, IDEA_MAX_CHARS))}
          rows={7}
          placeholder="e.g. An app that helps freelance designers collect structured feedback on their portfolio pieces from clients, instead of scattered email threads."
          className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900"
        />
        <div className="mt-1 flex justify-between text-xs">
          <span className={ideaTooShort ? "text-amber-700" : "text-stone-400"}>
            {ideaTooShort
              ? `${IDEA_MIN_CHARS - idea.trim().length} more characters needed`
              : ""}
          </span>
          <span className="text-stone-400">
            {idea.length}/{IDEA_MAX_CHARS}
          </span>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label
            htmlFor="targetCustomer"
            className="block text-sm font-medium text-stone-800"
          >
            Target customer{" "}
            <span className="font-normal text-stone-400">(optional)</span>
          </label>
          <input
            id="targetCustomer"
            type="text"
            value={targetCustomer}
            onChange={(event) =>
              setTargetCustomer(event.target.value.slice(0, TARGET_CUSTOMER_MAX_CHARS))
            }
            placeholder="e.g. freelance designers, 1-10 person studios"
            className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900"
          />
        </div>

        <div>
          <label
            htmlFor="market"
            className="block text-sm font-medium text-stone-800"
          >
            Market / region{" "}
            <span className="font-normal text-stone-400">(optional)</span>
          </label>
          <input
            id="market"
            type="text"
            value={market}
            onChange={(event) =>
              setMarket(event.target.value.slice(0, MARKET_MAX_CHARS))
            }
            placeholder="Global"
            className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900"
          />
          <p className="mt-1 text-xs text-stone-400">
            Only add a region if you want region-specific competitors.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p>{error}</p>
          {issues.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              {issues.map((issue, index) => (
                <li key={index}>
                  {issue.path}: {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        {busy ? "Building idea profile…" : "Build idea profile"}
      </button>
    </form>
  );
}
