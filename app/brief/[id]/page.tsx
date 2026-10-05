import { notFound } from "next/navigation";
import { getBrief } from "@/lib/storage/briefs";
import { BriefScreen } from "@/components/brief-screen";

export const dynamic = "force-dynamic";

export default async function BriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const brief = await getBrief(id);
  if (!brief) notFound();

  return <BriefScreen initialBrief={brief} />;
}