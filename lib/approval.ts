import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

type ApprovalPayload = {
  cardId: string;
  reviewerName: string;
  approvedAt: number;
  expiresAt: number;
};

function secret(): string {
  const configured = process.env.PUBLISH_SIGNING_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") {
    return "open-door-local-development-signing-key";
  }
  throw new Error("publish_signing_secret_not_configured");
}

function signature(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createApprovalToken(input: {
  cardId: string;
  reviewerName: string;
}): string {
  const now = Date.now();
  const payload: ApprovalPayload = {
    cardId: input.cardId,
    reviewerName: input.reviewerName,
    approvedAt: now,
    expiresAt: now + 10 * 60 * 1000
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifyApprovalToken(
  token: string,
  expectedCardId: string
): ApprovalPayload | null {
  const [encoded, suppliedSignature] = token.split(".");
  if (!encoded || !suppliedSignature) return null;
  const expectedSignature = signature(encoded);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return null;
  }

  const payload = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8")
  ) as ApprovalPayload;
  if (
    payload.cardId !== expectedCardId ||
    payload.expiresAt < Date.now() ||
    !payload.reviewerName
  ) {
    return null;
  }
  return payload;
}

