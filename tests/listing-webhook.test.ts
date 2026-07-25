import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDemoAnalysisCard, getDemoPublishedCard } from "@/lib/fixtures";
import {
  syncPublishedCard,
  toListingAccessCard
} from "@/lib/listing-webhook";
import { listingPublishPayloadSchema } from "@/lib/listing-contract";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.LISTING_WEBHOOK_URL;
  delete process.env.LISTING_WEBHOOK_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("published-card listing sync", () => {
  it("is a no-op unless both webhook values are configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await syncPublishedCard(getDemoPublishedCard())).toBe(
      "not_configured"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends one signed idempotent upsert without exposing the secret", async () => {
    process.env.LISTING_WEBHOOK_URL = "https://map.invalid/api/import";
    process.env.LISTING_WEBHOOK_SECRET = "test-only-listing-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://open-door.example";
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await syncPublishedCard(getDemoPublishedCard())).toBe("delivered");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://map.invalid/api/import");
    expect(init.headers).toMatchObject({
      "idempotency-key": "open-door:demo-cafe",
      "x-open-door-event": "access_card.published"
    });
    const signature = String(
      (init.headers as Record<string, string>)["x-open-door-signature"]
    );
    expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(signature).not.toContain(process.env.LISTING_WEBHOOK_SECRET);
    expect(JSON.parse(String(init.body))).toMatchObject({
      event: "access_card.published",
      cardId: "demo-cafe",
      publicUrl: "https://open-door.example/c/demo-cafe",
      card: {
        id: "demo-cafe",
        address: {
          ja: "東京都千代田区架空1-2-3",
          en: "1-2-3 Kakuu, Chiyoda-ku, Tokyo"
        },
        location: { lat: 35.6809, lng: 139.7671 }
      }
    });
    const payload = JSON.parse(String(init.body));
    expect(listingPublishPayloadSchema.safeParse(payload).success).toBe(true);
    expect(payload.card).not.toHaveProperty("brief");
  });

  it("normalizes a remote rejection without retrying", async () => {
    process.env.LISTING_WEBHOOK_URL = "https://map.invalid/api/import";
    process.env.LISTING_WEBHOOK_SECRET = "test-only-listing-secret";
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await syncPublishedCard(getDemoPublishedCard())).toBe("rejected");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed without complete Tokyo location metadata", async () => {
    process.env.LISTING_WEBHOOK_URL = "https://map.invalid/api/import";
    process.env.LISTING_WEBHOOK_SECRET = "test-only-listing-secret";
    const card = getDemoPublishedCard();
    delete card.brief.address;
    delete card.brief.googleMapsUrl;
    delete card.brief.location;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await syncPublishedCard(card)).toBe("missing_location");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("confirms only features backed by video or staff evidence", () => {
    const card = toListingAccessCard(
      getDemoPublishedCard(),
      "https://open-door.example/c/demo-cafe"
    );
    expect(card).not.toBeNull();
    const statuses = Object.fromEntries(
      card!.features.map((feature) => [feature.key, feature.status])
    );
    expect(statuses).toMatchObject({
      wheelchair_access: "unconfirmed",
      stroller_access: "unconfirmed",
      hearing_writing_support: "confirmed",
      english_menu: "confirmed",
      step_free: "not_available",
      wide_entrance: "unconfirmed",
      movable_seating: "confirmed"
    });
    expect(
      card!.features
        .filter(({ status }) => status === "confirmed")
        .every(({ evidence }) =>
          ["staff_statement", "on_site_observation"].includes(
            evidence.sourceType
          )
        )
    ).toBe(true);
    expect(JSON.stringify(card)).not.toContain("車椅子対応");
    expect(JSON.stringify(card)).not.toContain("wheelchair accessible");
  });

  it("carries video-estimated width and door operation into the map summary", () => {
    const card = toListingAccessCard(
      getDemoAnalysisCard(),
      "https://open-door.example/c/demo-cafe"
    );
    expect(card?.accessCards.ja.summary).toContain("手前に引いて開ける");
    expect(card?.accessCards.ja.summary).toContain("約75〜90cm");
    expect(card?.accessCards.ja.summary).toContain("実測ではありません");
    const width = card?.features.find(({ key }) => key === "wide_entrance");
    expect(width).toMatchObject({
      status: "unconfirmed",
      evidence: { sourceType: "on_site_observation" }
    });
    expect(width?.detail.ja).toContain("動画から約75〜90cm");
  });

  it("maps evidenced boolean false to not_available, never confirmed", () => {
    const source = getDemoPublishedCard();
    const englishMenu = source.items.find(
      ({ field }) => field === "communication.english_menu"
    )!;
    englishMenu.status = "ai_observed";
    englishMenu.value = false;
    englishMenu.provenance = [{
      kind: "video_frame",
      frameId: source.frames[0].frameId,
      tSec: source.frames[0].tSec,
      capturedAt: "2026-07-25T01:00:00.000Z"
    }];
    const card = toListingAccessCard(
      source,
      "https://open-door.example/c/demo-cafe"
    )!;
    const feature = card.features.find(({ key }) => key === "english_menu")!;
    expect(feature.status).toBe("not_available");
    expect(feature.detail.en).toBe("An English menu is not available.");
  });

  it("keeps evidenced non-boolean values unconfirmed", () => {
    const source = getDemoPublishedCard();
    const movable = source.items.find(
      ({ field }) => field === "path_to_seat.chairs_movable"
    )!;
    movable.status = "ai_observed";
    movable.value = null;
    movable.provenance = [{
      kind: "video_frame",
      frameId: source.frames[0].frameId,
      tSec: source.frames[0].tSec,
      capturedAt: "2026-07-25T01:00:00.000Z"
    }];
    const card = toListingAccessCard(
      source,
      "https://open-door.example/c/demo-cafe"
    )!;
    expect(
      card.features.find(({ key }) => key === "movable_seating")?.status
    ).toBe("unconfirmed");
  });
});
