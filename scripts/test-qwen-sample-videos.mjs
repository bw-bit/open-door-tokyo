import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  stat,
  writeFile
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);

export const SAMPLE_VIDEOS = Object.freeze([
  Object.freeze({
    id: "entrance",
    sourcePath: "/Users/b/Downloads/IMG_0502.MOV",
    derivedFileName: "entrance-h264.mp4",
    venueName: "入口サンプル動画"
  }),
  Object.freeze({
    id: "restroom",
    sourcePath:
      "/Users/b/Downloads/9868b716-06a1-49bc-a672-2167e777b34d.mp4",
    derivedFileName: null,
    venueName: "トイレサンプル動画"
  })
]);

export const EXPECTED_FRAMES_PER_VIDEO = 4;
export const MAX_DIRECT_UPLOAD_BYTES = 7_000_000;
export const MAX_VIDEO_DATA_URL_BYTES = 10_000_000;
export const OUTPUT_DIRECTORY = resolve(
  "outputs/submission/sample-video-tests"
);
export const DERIVED_DIRECTORY = join(OUTPUT_DIRECTORY, "derived");

const ANALYZE_TIMEOUT_MS = 90_000;
const REVIEW_TIMEOUT_MS = 45_000;
const FORBIDDEN_RESULT_KEY =
  /(?:authorization|cookie|secret|token|api.?key|request.?id|reservation.?id|raw|stack)/i;
const SECRET_VALUE_PATTERNS = [
  /\bBearer\s+\S+/gi,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}\b/g,
  /\b(?:api[_-]?key|access[_-]?token|secret)\s*[:=]\s*\S+/gi
];

export class HarnessError extends Error {
  constructor(code) {
    super(code);
    this.name = "HarnessError";
    this.code = code;
  }
}

export function normalizeLocalBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new HarnessError("invalid_base_url");
  }
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !localHosts.has(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new HarnessError("base_url_must_be_loopback");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new HarnessError("base_url_must_not_have_a_path");
  }
  return url.origin;
}

export function parseArguments(args) {
  const hasSampleFilter =
    args.length === 4 &&
    args[2] === "--sample" &&
    (args[3] === "entrance" || args[3] === "restroom");
  if (
    (args.length !== 2 && !hasSampleFilter) ||
    args[0] !== "--base-url" ||
    typeof args[1] !== "string" ||
    args[1].trim() === ""
  ) {
    throw new HarnessError("usage");
  }
  return {
    baseUrl: normalizeLocalBaseUrl(args[1]),
    sampleId: hasSampleFilter ? args[3] : null
  };
}

function sanitizeString(value) {
  if (/^data:image\//i.test(value)) return "[omitted image data]";
  return SECRET_VALUE_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, "[REDACTED]"),
    value
  );
}

export function sanitizeUnknown(value) {
  if (Array.isArray(value)) return value.map((entry) => sanitizeUnknown(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !FORBIDDEN_RESULT_KEY.test(key))
        .map(([key, entry]) => [key, sanitizeUnknown(entry)])
    );
  }
  return typeof value === "string" ? sanitizeString(value) : value;
}

export function summarizeAnalyzeRequest(payload, expectedUpload = null) {
  const frames = Array.isArray(payload?.frames) ? payload.frames : [];
  if (
    frames.length !== EXPECTED_FRAMES_PER_VIDEO ||
    frames.some(
      (frame) =>
        !frame ||
        typeof frame.frameId !== "string" ||
        typeof frame.tSec !== "number" ||
        !Number.isFinite(frame.tSec) ||
        typeof frame.dataUrl !== "string" ||
        !/^data:image\/(?:jpeg|jpg|webp);base64,/i.test(frame.dataUrl) ||
        frame.fixtureUrl !== undefined
    )
  ) {
    throw new HarnessError("client_did_not_extract_exactly_four_real_frames");
  }
  if (
    typeof payload.videoDataUrl !== "string" ||
    !/^data:video\/[a-z0-9.+-]+;base64,/i.test(payload.videoDataUrl) ||
    Buffer.byteLength(payload.videoDataUrl) > MAX_VIDEO_DATA_URL_BYTES
  ) {
    throw new HarnessError("direct_video_payload_invalid");
  }
  const comma = payload.videoDataUrl.indexOf(",");
  const videoBytes = Buffer.from(payload.videoDataUrl.slice(comma + 1), "base64");
  if (
    videoBytes.length <= 0 ||
    videoBytes.length > MAX_DIRECT_UPLOAD_BYTES ||
    (expectedUpload &&
      (videoBytes.length !== expectedUpload.bytes ||
        createHash("sha256").update(videoBytes).digest("hex") !==
          expectedUpload.sha256))
  ) {
    throw new HarnessError("direct_video_payload_mismatch");
  }
  return {
    cardId: typeof payload.cardId === "string" ? payload.cardId : "",
    venueName:
      typeof payload?.brief?.name === "string" ? payload.brief.name : "",
    useFixture: payload.useFixture === true,
    frameCount: frames.length,
    video: {
      mediaType: payload.videoDataUrl.slice(5, payload.videoDataUrl.indexOf(";")),
      decodedBytes: videoBytes.length,
      encodedBytes: Buffer.byteLength(payload.videoDataUrl)
    },
    frames: frames.map((frame) => ({
      frameId: frame.frameId,
      tSec: frame.tSec,
      mediaType: frame.dataUrl.slice(5, frame.dataUrl.indexOf(";")),
      encodedBytes: Buffer.byteLength(frame.dataUrl)
    }))
  };
}

function sanitizeCard(card) {
  if (!card || typeof card !== "object") return null;
  return sanitizeUnknown({
    schemaVersion: card.schemaVersion,
    brief: card.brief
      ? {
          cardId: card.brief.cardId,
          name: card.brief.name,
          category: card.brief.category,
          languages: card.brief.languages,
          createdAt: card.brief.createdAt
        }
      : null,
    state: card.state,
    items: Array.isArray(card.items)
      ? card.items.map((item) => ({
          id: item.id,
          field: item.field,
          section: item.section,
          label: item.label,
          description: item.description,
          value: item.value,
          unit: item.unit,
          status: item.status,
          confidence: item.confidence,
          provenance: Array.isArray(item.provenance)
            ? item.provenance.map((entry) => ({
                kind: entry.kind,
                frameId: entry.frameId,
                tSec: entry.tSec,
                capturedAt: entry.capturedAt
              }))
            : [],
          requiredForPublish: item.requiredForPublish,
          confirmedByStaff: item.confirmedByStaff,
          lastVerifiedAt: item.lastVerifiedAt
        }))
      : [],
    unknowns: Array.isArray(card.unknowns) ? card.unknowns : [],
    conflicts: Array.isArray(card.conflicts) ? card.conflicts : [],
    safetyAudit: card.safetyAudit,
    traces: Array.isArray(card.traces)
      ? card.traces.map((trace) => ({
          provider: trace.provider,
          mode: trace.mode,
          task: trace.task,
          model: trace.model,
          startedAt: trace.startedAt,
          latencyMs: trace.latencyMs,
          ok: trace.ok,
          errorCode: trace.errorCode,
          validation: trace.validation,
          detail: trace.detail
        }))
      : [],
    frames: Array.isArray(card.frames)
      ? card.frames.map((frame) => ({
          frameId: frame.frameId,
          tSec: frame.tSec,
          alt: frame.alt
        }))
      : [],
    publishedAt: card.publishedAt,
    lastVerifiedAt: card.lastVerifiedAt,
    updatedAt: card.updatedAt
  });
}

export function buildSanitizedSuccessResult({
  sample,
  source,
  request,
  status,
  responseBody,
  reviewPath,
  screenshotPath
}) {
  return {
    schemaVersion: 1,
    mode: "LOCAL_QWEN_UI_SAMPLE_TEST",
    outcome: "passed",
    sample: {
      id: sample.id,
      fileName: basename(sample.sourcePath),
      sourcePath: sample.sourcePath,
      sourceBytes: source.source.bytes,
      sourceSha256: source.source.sha256,
      uploadPath: source.upload.path,
      uploadBytes: source.upload.bytes,
      uploadSha: source.upload.sha256,
      derivedFromSource: source.derivedFromSource
    },
    request,
    response: {
      httpStatus: status,
      card: sanitizeCard(responseBody?.card)
    },
    review: {
      path: reviewPath,
      screenshotPath
    },
    safety: {
      browserExternalRequestsBlocked: true,
      publishAttempted: false,
      confirmationAttempted: false,
      rawProviderErrorsStored: false,
      secretsStored: false
    }
  };
}

function buildSanitizedFailureResult({
  sample,
  source,
  errorCode,
  status,
  request,
  screenshotPath
}) {
  return {
    schemaVersion: 1,
    mode: "LOCAL_QWEN_UI_SAMPLE_TEST",
    outcome: "failed",
    sample: {
      id: sample.id,
      fileName: basename(sample.sourcePath),
      sourcePath: sample.sourcePath,
      sourceBytes: source?.source?.bytes,
      sourceSha256: source?.source?.sha256,
      uploadPath: source?.upload?.path,
      uploadBytes: source?.upload?.bytes,
      uploadSha: source?.upload?.sha256,
      derivedFromSource: source?.derivedFromSource
    },
    request: request ?? null,
    response: {
      httpStatus: status ?? null,
      errorCode
    },
    review: {
      path: null,
      screenshotPath
    },
    safety: {
      browserExternalRequestsBlocked: true,
      publishAttempted: false,
      confirmationAttempted: false,
      rawProviderErrorsStored: false,
      secretsStored: false
    }
  };
}

async function fileSha256(path) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", rejectHash);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

async function inspectSource(path) {
  await access(path);
  const details = await stat(path);
  if (!details.isFile() || details.size <= 0) {
    throw new HarnessError("sample_video_missing_or_empty");
  }
  return {
    bytes: details.size,
    sha256: await fileSha256(path)
  };
}

export function h264TranscodeArguments(inputPath, outputPath, compact = false) {
  return [
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-vf",
    compact
      ? "scale=min(960\\,iw):-2,fps=30"
      : "scale=min(1280\\,iw):-2,fps=30",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    compact ? "29" : "25",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "64k",
    "-movflags",
    "+faststart",
    "-map_metadata",
    "-1",
    outputPath
  ];
}

async function validateUploadMedia(path, metadata) {
  if (metadata.bytes > MAX_DIRECT_UPLOAD_BYTES) {
    throw new HarnessError("derived_video_exceeds_upload_limit");
  }
  let probe;
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name:format=format_name,duration",
        "-of",
        "json",
        path
      ],
      { maxBuffer: 1_000_000 }
    );
    probe = JSON.parse(stdout);
  } catch {
    throw new HarnessError("derived_video_probe_failed");
  }
  if (
    probe?.streams?.[0]?.codec_name !== "h264" ||
    !String(probe?.format?.format_name ?? "").includes("mp4") ||
    !Number.isFinite(Number(probe?.format?.duration)) ||
    Number(probe.format.duration) <= 0
  ) {
    throw new HarnessError("derived_video_format_invalid");
  }
  const media = await readFile(path);
  const moovOffset = media.indexOf(Buffer.from("moov"));
  const mdatOffset = media.indexOf(Buffer.from("mdat"));
  if (moovOffset < 0 || mdatOffset < 0 || moovOffset > mdatOffset) {
    throw new HarnessError("upload_video_is_not_faststart");
  }
}

async function prepareSample(sample) {
  const source = await inspectSource(sample.sourcePath);
  let uploadPath = sample.sourcePath;
  let derivedFromSource = null;

  if (sample.derivedFileName) {
    await mkdir(DERIVED_DIRECTORY, { recursive: true });
    uploadPath = join(DERIVED_DIRECTORY, sample.derivedFileName);
    try {
      await execFileAsync(
        "ffmpeg",
        h264TranscodeArguments(sample.sourcePath, uploadPath, false),
        { maxBuffer: 1_000_000 }
      );
      let candidate = await inspectSource(uploadPath);
      if (candidate.bytes > MAX_DIRECT_UPLOAD_BYTES) {
        await execFileAsync(
          "ffmpeg",
          h264TranscodeArguments(sample.sourcePath, uploadPath, true),
          { maxBuffer: 1_000_000 }
        );
        candidate = await inspectSource(uploadPath);
      }
    } catch {
      throw new HarnessError("derived_video_generation_failed");
    }
    derivedFromSource = sample.sourcePath;
  }

  const upload = {
    path: uploadPath,
    ...(await inspectSource(uploadPath))
  };
  await validateUploadMedia(uploadPath, upload);
  return { source, upload, derivedFromSource };
}

function safeErrorCode(error) {
  if (error instanceof HarnessError) return error.code;
  if (error && typeof error === "object" && error.name === "TimeoutError") {
    return "ui_or_analysis_timeout";
  }
  return "local_harness_failed";
}

function traceSummary(result, provider) {
  const trace = result.response?.card?.traces?.find(
    (entry) => entry.provider === provider
  );
  return trace
    ? {
        mode: trace.mode,
        ok: trace.ok,
        errorCode: trace.errorCode,
        validation: trace.validation,
        latencyMs: trace.latencyMs
      }
    : null;
}

async function runSample(context, baseUrl, sample, source) {
  const page = await context.newPage();
  const resultPath = join(OUTPUT_DIRECTORY, `${sample.id}-result.json`);
  const screenshotPath = join(OUTPUT_DIRECTORY, `${sample.id}-review.png`);
  let requestSummary = null;
  let responseStatus = null;
  let result;
  let analyzePostCount = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.origin === baseUrl &&
      url.pathname === "/api/analyze" &&
      request.method() === "POST"
    ) {
      analyzePostCount += 1;
    }
  });

  try {
    await page.goto(`${baseUrl}/capture`, {
      waitUntil: "networkidle",
      timeout: REVIEW_TIMEOUT_MS
    });
    await page.waitForFunction(
      () => {
        const input = document.querySelector("#venue-name");
        return (
          input instanceof HTMLInputElement &&
          Object.keys(input).some(
            (key) =>
              key.startsWith("__reactProps$") ||
              key.startsWith("__reactFiber$")
          )
        );
      },
      null,
      { timeout: REVIEW_TIMEOUT_MS }
    );
    await page.getByLabel("店舗名").fill(sample.venueName);
    if ((await page.getByLabel("店舗名").inputValue()) !== sample.venueName) {
      throw new HarnessError("hydrated_venue_name_fill_failed");
    }
    await page.locator('input[type="file"]').setInputFiles(source.upload.path);
    await page.getByText(basename(source.upload.path), { exact: true }).waitFor({
      timeout: REVIEW_TIMEOUT_MS
    });

    const analyzeResponsePromise = page.waitForResponse(
      (response) => {
        const url = new URL(response.url());
        return (
          url.origin === baseUrl &&
          url.pathname === "/api/analyze" &&
          response.request().method() === "POST"
        );
      },
      { timeout: ANALYZE_TIMEOUT_MS }
    );
    await page
      .getByRole("button", { name: "動画から情報をつくる" })
      .click();

    const analyzeResponse = await analyzeResponsePromise;
    responseStatus = analyzeResponse.status();
    let payload;
    try {
      payload = analyzeResponse.request().postDataJSON();
    } catch {
      throw new HarnessError("analyze_request_was_not_json");
    }
    requestSummary = summarizeAnalyzeRequest(payload, source.upload);
    if (
      requestSummary.cardId === "" ||
      requestSummary.venueName !== sample.venueName ||
      requestSummary.useFixture ||
      analyzePostCount !== 1
    ) {
      throw new HarnessError("analyze_request_identity_invalid");
    }
    if (!analyzeResponse.ok()) {
      throw new HarnessError("analyze_request_rejected");
    }

    let responseBody;
    try {
      responseBody = await analyzeResponse.json();
    } catch {
      throw new HarnessError("analyze_response_was_not_json");
    }
    if (
      !responseBody?.card ||
      responseBody.card.brief?.cardId !== requestSummary.cardId
    ) {
      throw new HarnessError("analyze_response_card_mismatch");
    }

    await page.waitForURL(
      (url) =>
        url.origin === baseUrl &&
        url.pathname === `/review/${requestSummary.cardId}`,
      { timeout: REVIEW_TIMEOUT_MS }
    );
    await page
      .getByRole("heading", {
        name: "公開前に、お店の方が確かめてください。"
      })
      .waitFor({ timeout: REVIEW_TIMEOUT_MS });
    await page.screenshot({ path: screenshotPath, fullPage: true });

    result = buildSanitizedSuccessResult({
      sample,
      source,
      request: requestSummary,
      status: responseStatus,
      responseBody,
      reviewPath: page.url().slice(baseUrl.length),
      screenshotPath
    });
    result.request.analyzePostCount = analyzePostCount;
    const qwenTrace = result.response.card?.traces?.find(
      (trace) => trace.provider === "qwen"
    );
    if (
      qwenTrace?.mode !== "live" ||
      qwenTrace.ok !== true ||
      qwenTrace.validation !== "schema_and_semantic_passed"
    ) {
      result.outcome = "failed";
      result.response.errorCode = "qwen_live_validation_failed";
    }
  } catch (error) {
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch {
      // A closed page has no safe screenshot to preserve.
    }
    result = buildSanitizedFailureResult({
      sample,
      source,
      errorCode: safeErrorCode(error),
      status: responseStatus,
      request: requestSummary,
      screenshotPath
    });
    if (result.request) result.request.analyzePostCount = analyzePostCount;
  } finally {
    await page.close().catch(() => {});
  }

  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return {
    sampleId: sample.id,
    fileName: basename(sample.sourcePath),
    outcome: result.outcome,
    sourceBytes: source.source.bytes,
    sourceSha256: source.source.sha256,
    uploadBytes: source.upload.bytes,
    uploadSha: source.upload.sha256,
    derivedFromSource: source.derivedFromSource,
    frameCount: result.request?.frameCount ?? null,
    analyzePostCount,
    httpStatus: result.response?.httpStatus ?? null,
    cardId: result.request?.cardId || null,
    qwen: traceSummary(result, "qwen"),
    gmi: traceSummary(result, "gmi"),
    nosana: traceSummary(result, "nosana"),
    resultPath,
    screenshotPath
  };
}

export async function main(args = process.argv.slice(2)) {
  const { baseUrl, sampleId } = parseArguments(args);
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const selectedSamples = sampleId
    ? SAMPLE_VIDEOS.filter((sample) => sample.id === sampleId)
    : SAMPLE_VIDEOS;

  const sources = [];
  for (const sample of selectedSamples) {
    sources.push(await prepareSample(sample));
  }

  const browser = await chromium.launch({
    // The bundled Playwright Chromium on macOS does not include every
    // smartphone-video codec. System Chrome can decode the supplied
    // iPhone MOV and H.264 MP4 while the app still extracts the same four
    // browser-side JPEG evidence frames.
    channel: "chrome",
    headless: true,
    args: ["--hide-scrollbars"]
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    colorScheme: "light"
  });
  let prohibitedMutationAttempted = false;
  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    if (requestUrl.startsWith("data:") || requestUrl.startsWith("blob:")) {
      await route.continue();
      return;
    }
    const url = new URL(requestUrl);
    if (url.origin !== baseUrl) {
      await route.abort("blockedbyclient");
      return;
    }
    if (
      url.pathname === "/api/publish" ||
      url.pathname === "/api/confirm"
    ) {
      prohibitedMutationAttempted = true;
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });

  const results = [];
  try {
    for (let index = 0; index < selectedSamples.length; index += 1) {
      results.push(
        await runSample(context, baseUrl, selectedSamples[index], sources[index])
      );
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const report = {
    schemaVersion: 1,
    mode: "LOCAL_QWEN_TWO_VIDEO_UI_TEST",
    createdAt: new Date().toISOString(),
    baseUrl,
    passed:
      !prohibitedMutationAttempted &&
      results.length === selectedSamples.length &&
      results.every(
        (result) =>
          result.outcome === "passed" &&
          result.frameCount === EXPECTED_FRAMES_PER_VIDEO &&
          result.analyzePostCount === 1 &&
          result.uploadBytes <= MAX_DIRECT_UPLOAD_BYTES
      ),
    constraints: {
      exactSampleCount: selectedSamples.length,
      expectedFramesPerVideo: EXPECTED_FRAMES_PER_VIDEO,
      exactAnalyzePostsPerVideo: 1,
      maxDirectUploadBytes: MAX_DIRECT_UPLOAD_BYTES,
      maxVideoDataUrlBytes: MAX_VIDEO_DATA_URL_BYTES,
      browserExternalRequestsBlocked: true,
      publishAttempted: prohibitedMutationAttempted,
      confirmationAttempted: prohibitedMutationAttempted,
      rawProviderErrorsStored: false,
      secretsStored: false
    },
    results
  };
  const reportPath = join(OUTPUT_DIRECTORY, "combined-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  process.stdout.write(
    `${JSON.stringify({
      passed: report.passed,
      reportPath,
      sampleCount: results.length
    })}\n`
  );
  if (!report.passed) process.exitCode = 1;
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({ passed: false, errorCode: safeErrorCode(error) })}\n`
    );
    process.exitCode = 1;
  });
}
