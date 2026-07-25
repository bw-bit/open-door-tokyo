import { expect, test } from "@playwright/test";

test("sample video becomes a reviewed and published evidence card", async ({
  page
}) => {
  await page.goto("/capture");
  await expect(
    page.getByRole("heading", { name: /入口から席までを/ })
  ).toBeVisible();
  await expect(page.getByText("測れない数値をAIが推測することはありません")).toBeVisible();

  await page.getByRole("button", { name: "証拠を抽出する" }).click();
  await page.waitForURL("**/review/demo-cafe");
  await expect(page.getByText("VERIFIED SAMPLE")).toHaveCount(2);
  await expect(page.getByText("FALLBACK")).toHaveCount(0);
  await expect(page.getByText("「車椅子で利用可能」")).toBeVisible();
  await expect(page.getByText("根拠のある表現へ書換")).toBeVisible();

  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "店舗スタッフとして確認する" })
    .click();
  await expect(
    page.getByText("公開ゲート確認済み・Daytonaは未実行")
  ).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "確認して公開する" }).click();
  await expect(
    page.getByRole("heading", { name: "来店前 Access Card を公開しました" })
  ).toBeVisible();

  const publicLink = page.getByRole("link", { name: /公開カードを見る/ });
  const href = await publicLink.getAttribute("href");
  expect(href).toBe("/c/demo-cafe");

  await page.goto(href!);
  await expect(page.getByText("これは認定や適合判定ではありません")).toBeVisible();
  await expect(page.getByText("まだ確認できていないこと")).toBeVisible();
  await expect(page.getByText("We do not certify. We clarify.")).toBeVisible();
});

test("publishing without explicit human confirmation is rejected", async ({
  request
}) => {
  const response = await request.post("/api/publish", {
    data: { cardId: "demo-cafe" }
  });
  expect(response.status()).toBe(400);
});

test("a real upload fails closed without borrowing demo facts or frames", async ({
  request
}, testInfo) => {
  const frameUrl = "data:image/jpeg;base64,REAL_UPLOAD_ONLY";
  const response = await request.post("/api/analyze", {
    data: {
      cardId: `real-upload-${testInfo.project.name}-${Date.now()}`,
      brief: {
        name: "REAL UPLOAD VENUE",
        category: "cafe",
        languages: ["ja", "en"]
      },
      frames: [{ frameId: "real-frame", tSec: 3, dataUrl: frameUrl }],
      transcript: "",
      useFixture: false
    }
  });

  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.card.frames).toHaveLength(1);
  expect(result.card.frames[0].url).toBe(frameUrl);
  expect(
    result.card.items.every(
      (item: { status: string; value: unknown; provenance: unknown[] }) =>
        item.status === "unknown" &&
        item.value === null &&
        item.provenance.length === 0
    )
  ).toBe(true);
});

test("useFixture with uploaded frame data is treated as a real upload", async ({
  request
}, testInfo) => {
  const frameUrl = "data:image/jpeg;base64,CLIENT_HINT_MUST_NOT_WIN";
  const response = await request.post("/api/analyze", {
    data: {
      cardId: `fixture-hint-upload-${testInfo.project.name}-${Date.now()}`,
      brief: {
        name: "REAL UPLOAD WITH FIXTURE HINT",
        category: "cafe",
        languages: ["ja", "en"]
      },
      frames: [{ frameId: "real-frame", tSec: 1, dataUrl: frameUrl }],
      transcript: "",
      useFixture: true
    }
  });

  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.card.brief.cardId).toContain("fixture-hint-upload-");
  expect(result.card.frames[0].url).toBe(frameUrl);
  expect(result.card.traces[0].mode).not.toBe("verified_sample");
  expect(
    result.card.items.every(
      (item: { status: string; value: unknown; provenance: unknown[] }) =>
        item.status === "unknown" &&
        item.value === null &&
        item.provenance.length === 0
    )
  ).toBe(true);
});
