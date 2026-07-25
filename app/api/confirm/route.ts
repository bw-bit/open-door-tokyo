import { NextResponse } from "next/server";
import { z } from "zod";
import { createApprovalToken } from "@/lib/approval";
import { applyStaffConfirmations } from "@/lib/confirmation";
import { auditInDaytona, phraseWithAiAnd } from "@/lib/providers";
import { auditClaim } from "@/lib/safety/deterministic";
import { getCard, saveCard } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  cardId: z.string().min(1).max(80),
  reviewerName: z.string().min(2).max(80),
  attestation: z.literal(true),
  confirmations: z.array(
    z.object({
      field: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()]),
      method: z.enum(["staff_stated", "staff_measured"])
    })
  ).min(1),
  corrections: z.array(
    z.object({
      field: z.string().min(1).max(80),
      descriptionJa: z.string().trim().min(1).max(240),
      descriptionEn: z.string().trim().min(1).max(240),
      markUnknown: z.boolean()
    }).strict()
  ).max(24).default([])
}).refine(
  (value) =>
    value.confirmations.some(
      (confirmation) => confirmation.field === "entrance.step_presence"
    ),
  {
    message: "entrance.step_presence confirmation is required",
    path: ["confirmations"]
  }
);

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const previous = await getCard(parsed.data.cardId);
  if (!previous) {
    return NextResponse.json({ error: "card_not_found" }, { status: 404 });
  }

  const correctionFields = parsed.data.corrections.map(({ field }) => field);
  if (
    new Set(correctionFields).size !== correctionFields.length ||
    correctionFields.some(
      (field) => !previous.items.some((item) => item.field === field)
    ) ||
    parsed.data.corrections.some(
      (correction) =>
        auditClaim(correction.descriptionJa) ||
        auditClaim(correction.descriptionEn)
    )
  ) {
    return NextResponse.json(
      { error: "invalid_or_unsupported_correction" },
      { status: 400 }
    );
  }

  const card = applyStaffConfirmations(
    previous,
    parsed.data.confirmations,
    parsed.data.reviewerName,
    parsed.data.corrections
  );

  const phrased = await phraseWithAiAnd(card);
  phrased.data.traces.push(phrased.trace);
  const audited = await auditInDaytona(phrased.data);
  audited.data.traces.push(audited.trace);
  audited.data.updatedAt = new Date().toISOString();
  await saveCard(audited.data);

  try {
    const approvalToken = createApprovalToken({
      cardId: audited.data.brief.cardId,
      reviewerName: parsed.data.reviewerName
    });
    return NextResponse.json({ card: audited.data, approvalToken });
  } catch {
    return NextResponse.json(
      { error: "approval_token_creation_failed" },
      { status: 503 }
    );
  }
}
