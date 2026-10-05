import { IdeaForm } from "@/components/idea-form";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Find your competitors</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-stone-600">
          Paste a raw product idea. The tool turns it into an editable idea
          profile, searches the live web for real companies, checks that each
          website actually loads, screenshots every homepage, then scores each
          company against your idea with a fixed rubric. Every competitor shown
          comes from a live search result — nothing is invented.
        </p>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-6">
        <IdeaForm />
      </div>

      <p className="max-w-2xl text-xs leading-relaxed text-stone-400">
        Uses the Google Gemini free tier and the Tavily free tier. Nothing is
        paid for and no billing is configured. On the Gemini free tier, content
        you submit may be used to improve Google&apos;s products — do not paste
        confidential client ideas.
      </p>
    </div>
  );
}
