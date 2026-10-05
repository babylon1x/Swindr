import Link from "next/link";
import { listBriefs } from "@/lib/storage/briefs";
import { DeleteButton } from "@/components/delete-button";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft profile",
  running: "Running",
  done: "Done",
  failed: "Failed",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-stone-100 text-stone-600",
  running: "bg-blue-100 text-blue-800",
  done: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
};

export default async function HistoryPage() {
  const briefs = await listBriefs();

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <Link
          href="/"
          className="text-sm text-stone-600 underline underline-offset-2 hover:text-stone-900"
        >
          New idea
        </Link>
      </div>

      {briefs.length === 0 ? (
        <p className="rounded-xl border border-stone-200 bg-white px-5 py-6 text-sm text-stone-500">
          No briefs yet. Start one from the{" "}
          <Link href="/" className="underline underline-offset-2">
            home page
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {briefs.map((brief) => {
            const competitors = brief.result
              ? brief.result.direct.length + brief.result.indirect.length
              : 0;

            return (
              <li
                key={brief.id}
                className="flex items-start justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`/brief/${brief.id}`}
                    className="block truncate text-sm font-medium underline decoration-stone-300 underline-offset-2 hover:text-stone-900"
                  >
                    {brief.profile?.summary ?? brief.input.idea.slice(0, 100)}
                  </Link>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                    <time dateTime={brief.createdAt}>
                      {new Date(brief.createdAt).toLocaleString()}
                    </time>
                    <span
                      className={`rounded-full px-2 py-0.5 ${
                        STATUS_STYLES[brief.status] ?? "bg-stone-100 text-stone-600"
                      }`}
                    >
                      {STATUS_LABELS[brief.status] ?? brief.status}
                    </span>
                    {brief.status === "done" ? (
                      <span>
                        {competitors} competitor{competitors === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    {brief.status === "failed" && brief.error ? (
                      <span className="text-red-700">{brief.error}</span>
                    ) : null}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-3 text-xs">
                  {brief.status === "done" ? (
                    <a
                      href={`/api/briefs/${brief.id}/export`}
                      className="text-stone-500 underline underline-offset-2 hover:text-stone-900"
                    >
                      MD
                    </a>
                  ) : null}
                  <DeleteButton
                    briefId={brief.id}
                    disabled={brief.status === "running"}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}