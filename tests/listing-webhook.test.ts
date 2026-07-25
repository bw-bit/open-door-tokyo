import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDemoPublishedCard } from "@/lib/fixtures";
import { syncPublishedCard } from "@/lib/listing-webhook";

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
      publicUrl: "https://open-door.example/c/demo-cafe"
    });
  });

  it("normalizes a remote rejection without retrying", async () => {
    process.env.LISTING_WEBHOOK_URL = "https://map.invalid/api/import";
    process.env.LISTING_WEBHOOK_SECRET = "test-only-listing-secret";
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await syncPublishedCard(getDemoPublishedCard())).toBe("rejected");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
