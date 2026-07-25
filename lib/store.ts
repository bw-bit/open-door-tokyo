import "server-only";

import { get, put } from "@vercel/blob";
import { getDemoAnalysisCard, getDemoPublishedCard } from "./fixtures";
import type { AccessCard } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var __openDoorCards: Map<string, AccessCard> | undefined;
}

const memoryStore = globalThis.__openDoorCards ?? new Map<string, AccessCard>();
globalThis.__openDoorCards = memoryStore;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function pathname(cardId: string): string {
  return `cards/${cardId}.json`;
}

export async function saveCard(card: AccessCard): Promise<void> {
  memoryStore.set(card.brief.cardId, clone(card));

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return;
  }

  await put(pathname(card.brief.cardId), JSON.stringify(card), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60
  });
}

export async function getCard(
  cardId: string,
  options: { publishedFixture?: boolean } = {}
): Promise<AccessCard | null> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const result = await get(pathname(cardId), {
        access: "private",
        useCache: false
      });
      if (result?.statusCode === 200) {
        const raw = await new Response(result.stream).text();
        const card = JSON.parse(raw) as AccessCard;
        memoryStore.set(cardId, card);
        return clone(card);
      }
    } catch {
      // A transient Blob failure may still be recoverable from this process.
    }
  }

  const memoryCard = memoryStore.get(cardId);
  if (memoryCard) {
    return clone(memoryCard);
  }

  if (cardId === "demo-cafe") {
    return options.publishedFixture
      ? getDemoPublishedCard()
      : getDemoAnalysisCard();
  }

  return null;
}
