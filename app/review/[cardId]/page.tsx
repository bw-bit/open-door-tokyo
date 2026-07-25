import { notFound } from "next/navigation";
import { ProcessSteps } from "@/components/process-steps";
import { ReviewClient } from "@/components/review-client";
import { SiteHeader } from "@/components/site-header";
import { getCard } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;
  const card = await getCard(cardId);
  if (!card) notFound();

  return (
    <>
      <SiteHeader />
      <main className="app-shell review-shell">
        <ProcessSteps current={2} />
        <ReviewClient initialCard={card} />
      </main>
    </>
  );
}

