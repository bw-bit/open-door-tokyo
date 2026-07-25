import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const baseUrl = "https://open-door-tokyo.vercel.app";
const output = resolve("outputs/submission/open-door-tokyo-demo.mp4");
const rawDir = resolve("outputs/submission/.recording");

mkdirSync(dirname(output), { recursive: true });
rmSync(rawDir, { recursive: true, force: true });
mkdirSync(rawDir, { recursive: true });

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
const video = page.video();

const hold = (milliseconds = 1200) => page.waitForTimeout(milliseconds);
const scrollTo = async (locator) => {
  await locator.scrollIntoViewIfNeeded();
  await hold(700);
};

try {
  await page.goto(`${baseUrl}/capture`, { waitUntil: "networkidle" });
  await page.mouse.move(640, 340);
  await hold(2200);

  const extract = page.getByRole("button", { name: "証拠を抽出する" });
  await scrollTo(extract);
  await hold(900);
  await extract.click();
  await page.waitForURL("**/review/demo-cafe", { timeout: 30_000 });
  await page
    .getByRole("heading", { name: "AIの観察を、店舗の事実へ。" })
    .waitFor();
  await hold(1800);

  const blockedClaim = page.getByText("「車椅子で利用可能」");
  await scrollTo(blockedClaim);
  await hold(2200);

  const approval = page.getByText("HUMAN APPROVAL");
  await scrollTo(approval);
  await hold(1000);
  await page.getByRole("checkbox").check();
  await hold(800);

  const confirm = page.getByRole("button", {
    name: "店舗スタッフとして確認する"
  });
  await scrollTo(confirm);
  await confirm.click();
  await page
    .getByText("公開ゲート確認済み・Daytonaは未実行")
    .waitFor({ timeout: 30_000 });
  await hold(1800);

  const publish = page.getByRole("button", { name: "確認して公開する" });
  await publish.click();
  await page
    .getByRole("heading", { name: "来店前 Access Card を公開しました" })
    .waitFor({ timeout: 30_000 });
  await hold(2400);

  const publicCard = page.getByRole("link", { name: /公開カードを見る/ });
  const publicPath = await publicCard.getAttribute("href");
  if (!publicPath) throw new Error("public_card_path_missing");
  await page.goto(`${baseUrl}${publicPath}`, { waitUntil: "networkidle" });
  await page
    .getByText("これは認定や適合判定ではありません")
    .waitFor();
  await hold(2300);
  await page.getByText("まだ確認できていないこと").scrollIntoViewIfNeeded();
  await hold(1800);
  await page.getByText("We do not certify. We clarify.").scrollIntoViewIfNeeded();
  await hold(2200);
} finally {
  await page.close();
  await context.close();
  await browser.close();
}

const rawVideo = await video.path();
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
rmSync(rawDir, { recursive: true, force: true });
console.log(output);
