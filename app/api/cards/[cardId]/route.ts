import { NextResponse } from "next/server";
import { getCard } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await context.params;
  const card = await getCard(cardId, { publishedFixture: true });
  if (!card || card.state !== "published" || !card.publishedAt) {
    return NextResponse.json({ error: "card_not_found" }, { status: 404 });
  }
  return NextResponse.json({ card });
}
