import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  statSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const videoPath = process.argv[2] ? resolve(process.argv[2]) : "";
const venueName = process.argv[3]?.trim() || "OPEN DOOR TEST VENUE";
const stepPresence = process.argv[4];
const output = resolve(
  process.argv[5] || "outputs/submission/open-door-tokyo-live-demo.mp4"
);
const reviewScreenshot = resolve(
  "outputs/submission/open-door-tokyo-live-review.png"
);
const baseUrl =
  process.env.DEMO_BASE_URL || "https://open-door-tokyo.vercel.app";

if (!videoPath || !existsSync(videoPath) || !statSync(videoPath).isFile()) {
  throw new Error(
    "Usage: node scripts/record-live-video-demo.mjs <video> [venue] [true|false] [output]"
  );
}
if (stepPresence !== "true" && stepPresence !== "false") {
  throw new Error("Step presence must be true or false.");
}

const healthResponse = await fetch(`${baseUrl}/api/health/providers`, {
  cache: "no-store"
});
if (!healthResponse.ok) throw new Error("provider_health_unavailable");
const health = await healthResponse.json();
if (
  health?.qwen?.configured !== true ||
  health?.guards?.["qwen.chat"]?.capKnown !== true ||
  health?.guards?.["qwen.chat"]?.priceKnown !== true ||
  health?.guards?.["qwen.chat"]?.remainingSlots < 1 ||
  health?.guards?.["qwen.chat"]?.outstanding !== 0
) {
  throw new Error("qwen_live_guard_not_ready");
}

mkdirSync(dirname(output), { recursive: true });
const rawDir = mkdtempSync(join(tmpdir(), "open-door-live-"));

const browser = await chromium.launch({
  headless: true,
  args: ["--hide-scrollbars"]
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  colorScheme: "light",
  recordVideo: {
    dir: rawDir,
    size: { width: 1280, height: 720 }
  }
});
const page = await context.newPage();
const recording = page.video();
const hold = (milliseconds = 1000) => page.waitForTimeout(milliseconds);

let publicPath = "";
try {
  await page.goto(`${baseUrl}/capture`, { waitUntil: "networkidle" });
  await page.getByLabel("店舗名").fill(venueName);
  await page.locator('input[type="file"]').setInputFiles(videoPath);
  await page.getByText(basename(videoPath), { exact: true }).waitFor();
  await hold(1200);

  await page.getByRole("button", { name: "証拠を抽出する" }).click();
  await page.waitForURL("**/review/venue-*", { timeout: 45_000 });
  await page
    .getByRole("heading", { name: "AIの観察を、店舗の事実へ。" })
    .waitFor();
  await page.getByText("LIVE", { exact: true }).waitFor({ timeout: 10_000 });
  await page.screenshot({ path: reviewScreenshot, fullPage: true });
  await hold(2400);

  await page.getByText("「車椅子で利用可能」").scrollIntoViewIfNeeded();
  await hold(1800);
  await page.getByText("HUMAN APPROVAL").scrollIntoViewIfNeeded();
  await page.getByLabel("入口の段差 *").selectOption(stepPresence);
  await page.getByLabel("確認者名").fill("yuta");
  await page.getByRole("checkbox").check();
  await hold(1000);

  await page
    .getByRole("button", { name: "店舗スタッフとして確認する" })
    .click();
  await page
    .getByText("公開ゲート確認済み・Daytonaは未実行")
    .waitFor({ timeout: 30_000 });
  await hold(1800);

  await page.getByRole("button", { name: "確認して公開する" }).click();
  await page
    .getByRole("heading", { name: "来店前 Access Card を公開しました" })
    .waitFor({ timeout: 30_000 });
  publicPath = await page
    .getByRole("link", { name: /公開カードを見る/ })
    .getAttribute("href");
  if (!publicPath) throw new Error("public_card_path_missing");
  await hold(2000);

  await page.goto(`${baseUrl}${publicPath}`, { waitUntil: "networkidle" });
  await page
    .getByText("これは認定や適合判定ではありません")
    .waitFor();
  await hold(2200);
  await page.getByText("まだ確認できていないこと").scrollIntoViewIfNeeded();
  await hold(1800);
  await page.getByText("We do not certify. We clarify.").scrollIntoViewIfNeeded();
  await hold(1800);
} finally {
  await page.close();
  await context.close();
  await browser.close();
}

const rawVideo = await recording.path();
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-i",
    rawVideo,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    output
  ],
  { stdio: "inherit" }
);

process.stdout.write(
  `${JSON.stringify({
    mode: "ONE_SHOT_LIVE_QWEN",
    output,
    reviewScreenshot,
    publicUrl: `${baseUrl}${publicPath}`
  })}\n`
);
