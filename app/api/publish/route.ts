import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyApprovalToken } from "@/lib/approval";
import { syncPublishedCard } from "@/lib/listing-webhook";
import { canPublish } from "@/lib/safety/deterministic";
import { getCard, saveCard } from "@/lib/store";

export const runtime = "nodejs";

const schema = z.object({
  cardId: z.string().min(1).max(80),
  approvalToken: z.string().min(32)
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "signed_staff_approval_required" },
      { status: 400 }
    );
  }

  let approval;
  try {
    approval = verifyApprovalToken(
      parsed.data.approvalToken,
      parsed.data.cardId
    );
  } catch {
    approval = null;
  }
  if (!approval) {
    return NextResponse.json(
      { error: "invalid_or_expired_staff_approval" },
      { status: 403 }
    );
  }

  const card = await getCard(parsed.data.cardId);
  if (!card) {
    return NextResponse.json({ error: "card_not_found" }, { status: 404 });
  }

  const gate = canPublish(card);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "publish_blocked", reason: gate.reason },
      { status: 409 }
    );
  }

  const now = new Date();
  card.state = "published";
  card.publishedAt = now.toISOString();
  card.lastVerifiedAt = now.toISOString().slice(0, 10);
  card.updatedAt = now.toISOString();
  await saveCard(card);
  const listingSync = await syncPublishedCard(card);

  return NextResponse.json({
    card,
    approvedBy: approval.reviewerName,
    publicPath: `/c/${encodeURIComponent(card.brief.cardId)}`,
    listingSync
  });
}
