import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  statSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { chromium } from "playwright";

const videoPath = process.argv[2] ? resolve(process.argv[2]) : "";
const venueName = process.argv[3]?.trim() || "Agent Forge Tokyo サンプル会場";
const output = resolve(
  process.argv[4] || "outputs/submission/open-door-tokyo-qwen-live-proof.mp4"
);
const screenshot = resolve(
  "outputs/submission/open-door-tokyo-qwen-live-review.png"
);
const baseUrl =
  process.env.DEMO_BASE_URL || "https://open-door-tokyo.vercel.app";

if (!videoPath || !existsSync(videoPath) || !statSync(videoPath).isFile()) {
  throw new Error(
    "Usage: node scripts/analyze-live-video-once.mjs <video> [venue] [output]"
  );
}

const healthResponse = await fetch(`${baseUrl}/api/health/providers`, {
  cache: "no-store"
});
if (!healthResponse.ok) throw new Error("provider_health_unavailable");
const health = await healthResponse.json();
const qwenGuard = health?.guards?.["qwen.chat"];
if (
  health?.qwen?.configured !== true ||
  qwenGuard?.capKnown !== true ||
  qwenGuard?.priceKnown !== true ||
  qwenGuard?.remainingSlots < 1 ||
  qwenGuard?.outstanding !== 0 ||
  health?.paidFallback !== false ||
  health?.autoTopup !== false ||
  health?.maxBillableConcurrency !== 1
) {
  throw new Error("qwen_live_guard_not_ready");
}

mkdirSync(dirname(output), { recursive: true });
const rawDir = mkdtempSync(join(tmpdir(), "open-door-qwen-proof-"));
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

let reviewUrl = "";
try {
  await page.goto(`${baseUrl}/capture`, { waitUntil: "networkidle" });
  await page.getByLabel("店舗名").fill(venueName);
  await page.locator('input[type="file"]').setInputFiles(videoPath);
  await page.getByText(basename(videoPath), { exact: true }).waitFor();
  await hold(1200);

  await page.getByRole("button", { name: "証拠を抽出する" }).click();
  await page.waitForURL("**/review/venue-*", { timeout: 60_000 });
  reviewUrl = page.url();
  await page
    .getByRole("heading", { name: "AIの観察を、店舗の事実へ。" })
    .waitFor();
  await page.getByText("LIVE", { exact: true }).waitFor({ timeout: 10_000 });
  await hold(1800);

  await page.getByText("「車椅子で利用可能」").scrollIntoViewIfNeeded();
  await hold(1400);
  const correction = page
    .getByRole("button", { name: "AI解析を手動で修正" })
    .first();
  await correction.scrollIntoViewIfNeeded();
  await correction.click();
  await hold(1800);
  await page.screenshot({ path: screenshot, fullPage: true });

  await page.getByText("AGENT TRACE").scrollIntoViewIfNeeded();
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
  { stdio: "ignore" }
);

process.stdout.write(
  `${JSON.stringify({
    mode: "ONE_SHOT_LIVE_QWEN_REVIEW_ONLY",
    output,
    screenshot,
    reviewUrl
  })}\n`
);
