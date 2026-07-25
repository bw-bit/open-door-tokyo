import { expect, test } from "@playwright/test";

test("sample video becomes a reviewed and published evidence card", async ({
  page
}) => {
  await page.goto("/capture");
  await expect(
    page.getByRole("heading", { name: /お店の入口を撮ると/ })
  ).toBeVisible();
  await expect(
    page.getByText(/映像から幅のある参考値を出すことがあります/)
  ).toBeVisible();
  await expect(page.getByLabel("住所（日本語）")).toHaveValue(
    "東京都千代田区架空1-2-3"
  );
  await expect(page.getByLabel("Google マップのURL")).toHaveValue(
    "https://maps.google.com/?q=35.6809,139.7671"
  );
  await expect(
    page.getByRole("img", { name: "AI分析用の自動キャプチャ 1" })
  ).toBeVisible();

  await page.getByRole("button", { name: "動画から情報をつくる" }).click();
  await page.waitForURL("**/review/demo-cafe");
  await expect(
    page.getByRole("heading", {
      name: "公開前に、お店の方が確かめてください。"
    })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "AIが見た画像を、そのまま根拠として表示"
    })
  ).toBeVisible();
  await expect(page.getByText("AI参考推定").first()).toBeVisible();
  await expect(
    page.getByText("映像からの参考推定：約6〜10cm（実測ではありません）")
  ).toBeVisible();
  await expect(page.getByText("検証済みサンプル")).toHaveCount(2);
  await expect(page.getByText("安全フォールバック")).toHaveCount(0);
  await expect(page.getByText("「車椅子で利用可能」")).toBeVisible();
  await expect(page.getByText("根拠のある表現へ書換")).toBeVisible();

  await page
    .getByRole("button", { name: "AI解析を手動で修正" })
    .nth(3)
    .click();
  await page
    .getByLabel("ドアの種類の日本語説明")
    .fill("スタッフ確認: 手動で開ける引き戸です");
  await page
    .getByLabel("ドアの種類の英語説明")
    .fill("Staff confirmed: this is a manually opened sliding door");

  await page
    .getByRole("checkbox", { name: /AI観察・参考推定・実測値・未確認項目を確認/ })
    .check();
  await page
    .getByRole("button", { name: "店舗スタッフとして確認する" })
    .click();
  await expect(
    page.getByText("公開ゲート確認済み・Daytonaは未実行")
  ).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "確認して公開する" }).click();
  await expect(
    page.getByRole("heading", { name: "来店前アクセス案内を公開しました" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "URLをコピー" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Google掲載文" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "埋め込みHTML" })
  ).toBeVisible();

  const publicLink = page.getByRole("link", { name: /公開カードを見る/ });
  const href = await publicLink.getAttribute("href");
  expect(href).toBe("/c/demo-cafe");

  await page.goto(href!);
  await expect(page.getByText("段差の高さは約8cmです")).toBeVisible();
  await expect(page.getByText("スタッフ確認済み").first()).toBeVisible();
  await expect(page.getByText(/これは認定や利用可否の判定ではありません/)).toBeVisible();
  await expect(
    page.getByText("スタッフ確認: 手動で開ける引き戸です")
  ).toBeVisible();
  await expect(page.getByText("まだ確認できていないこと")).toBeVisible();
  await expect(page.getByText("認定ではなく、判断材料を。")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "行く前に知りたい6項目" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "AIが見た画像を、そのまま根拠として表示"
    })
  ).toBeVisible();

  await page.goto(`${href!}?embed=1`);
  await expect(
    page.getByText("スタッフ確認: 手動で開ける引き戸です")
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "表示言語" })).toHaveCount(
    0
  );
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

test("mobile video selection extracts a bounded real-upload payload", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium");
  await page.goto("/capture");
  let analyzePayload: {
    frames: Array<{ dataUrl?: string; fixtureUrl?: string }>;
    useFixture: boolean;
  } | null = null;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/analyze") && request.method() === "POST") {
      analyzePayload = request.postDataJSON();
    }
  });

  await page
    .locator('input[type="file"]')
    .setInputFiles("public/demo/cafe-tour.mp4");
  await expect(page.getByText("選択動画")).toBeVisible();
  await expect(page.getByText("cafe-tour.mp4")).toBeVisible();
  await expect(page.getByText(/自動キャプチャ4枚/)).toBeVisible();
  await page.getByRole("button", { name: "動画から情報をつくる" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await page.waitForURL(/\/review\/venue-/, { timeout: 30_000 });

  expect(analyzePayload).not.toBeNull();
  expect(analyzePayload!.useFixture).toBe(false);
  expect(analyzePayload!.frames).toHaveLength(4);
  expect(
    analyzePayload!.frames.every((frame) =>
      frame.dataUrl?.startsWith("data:image/jpeg;base64,")
    )
  ).toBe(true);
  expect(
    analyzePayload!.frames.every((frame) => frame.fixtureUrl === undefined)
  ).toBe(true);
  expect(
    new TextEncoder().encode(JSON.stringify(analyzePayload!.frames)).byteLength
  ).toBeLessThan(8_000_000);
});

test("mobile upload gives a clear error for an unsupported file", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium");
  await page.goto("/capture");
  await page.locator('input[type="file"]').setInputFiles({
    name: "not-a-video.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a video")
  });
  await expect(page.locator(".error-message")).toHaveText(
    "MP4またはMOV形式の動画を選んでください。"
  );
  await expect(page.getByText("サンプル", { exact: true })).toBeVisible();
});

test("real upload API rejects fixture frame URLs", async ({ request }) => {
  const response = await request.post("/api/analyze", {
    data: {
      cardId: "real-upload-with-fixture-url",
      brief: {
        name: "REAL UPLOAD",
        category: "cafe",
        languages: ["ja", "en"]
      },
      frames: [
        {
          frameId: "fixture-frame",
          tSec: 1,
          fixtureUrl: "/demo/frames/01-entrance.png"
        }
      ],
      transcript: "",
      useFixture: false
    }
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toBe("invalid_upload_frames");
});
