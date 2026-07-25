import "server-only";

import { createHmac } from "node:crypto";
import type { AccessCard } from "./types";

export type ListingSyncStatus =
  | "not_configured"
  | "delivered"
  | "rejected"
  | "timeout"
  | "transport_failed";

export async function syncPublishedCard(
  card: AccessCard
): Promise<ListingSyncStatus> {
  const endpoint = process.env.LISTING_WEBHOOK_URL;
  const secret = process.env.LISTING_WEBHOOK_SECRET;
  if (!endpoint || !secret) return "not_configured";

  let publicUrl: string;
  try {
    publicUrl = new URL(
      `/c/${encodeURIComponent(card.brief.cardId)}`,
      process.env.NEXT_PUBLIC_APP_URL ||
        "https://open-door-tokyo.vercel.app"
    ).toString();
    new URL(endpoint);
  } catch {
    return "not_configured";
  }

  const body = JSON.stringify({
    event: "access_card.published",
    schemaVersion: 1,
    cardId: card.brief.cardId,
    publicUrl,
    card
  });
  const signature = createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `open-door:${card.brief.cardId}`,
        "x-open-door-event": "access_card.published",
        "x-open-door-signature": `sha256=${signature}`
      },
      body,
      signal: AbortSignal.timeout(5_000),
      cache: "no-store"
    });
    return response.ok ? "delivered" : "rejected";
  } catch (error) {
    return error instanceof DOMException && error.name === "TimeoutError"
      ? "timeout"
      : "transport_failed";
  }
}
