import { notFound } from "next/navigation";
import { PublicCard } from "@/components/public-card";
import { getCard } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AccessCardPage({
  params,
  searchParams
}: {
  params: Promise<{ cardId: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ cardId }, query] = await Promise.all([params, searchParams]);
  const card = await getCard(cardId, { publishedFixture: true });
  if (!card) notFound();
  if (card.state !== "published" || !card.publishedAt) notFound();
  const lang = query.lang === "en" ? "en" : "ja";
  return <PublicCard card={card} lang={lang} />;
}
