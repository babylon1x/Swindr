"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteButton({
  briefId,
  disabled,
}: {
  briefId: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/briefs/${briefId}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Could not delete.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error while deleting.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (disabled) return null;

  return (
    <span className="flex items-center gap-2">
      {confirming ? (
        <>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded border border-red-300 px-2 py-0.5 text-red-700 hover:border-red-600"
          >
            {busy ? "Deleting…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-stone-400 hover:text-stone-700"
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-stone-400 underline underline-offset-2 hover:text-red-700"
        >
          Delete
        </button>
      )}
      {error ? <span className="text-red-700">{error}</span> : null}
    </span>
  );
}