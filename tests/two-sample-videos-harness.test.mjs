import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  EXPECTED_FRAMES_PER_VIDEO,
  HarnessError,
  MAX_DIRECT_UPLOAD_BYTES,
  SAMPLE_VIDEOS,
  buildSanitizedSuccessResult,
  h264TranscodeArguments,
  normalizeLocalBaseUrl,
  parseArguments,
  sanitizeUnknown,
  summarizeAnalyzeRequest
} from "../scripts/test-qwen-sample-videos.mjs";

function frame(index) {
  return {
    frameId: `frame-0${index}`,
    tSec: index * 1.5,
    dataUrl: `data:image/jpeg;base64,${"a".repeat(index + 8)}`
  };
}

const mockVideoBytes = Buffer.from("mock-mp4-video");
const mockVideoDataUrl = `data:video/mp4;base64,${mockVideoBytes.toString("base64")}`;

test("the harness has exactly the two requested fixed sample paths", () => {
  assert.deepEqual(
    SAMPLE_VIDEOS.map((sample) => sample.sourcePath),
    [
      "/Users/b/Downloads/IMG_0502.MOV",
      "/Users/b/Downloads/9868b716-06a1-49bc-a672-2167e777b34d.mp4"
    ]
  );
  assert.equal(SAMPLE_VIDEOS.length, 2);
  assert.equal(EXPECTED_FRAMES_PER_VIDEO, 4);
  assert.equal(MAX_DIRECT_UPLOAD_BYTES, 7_000_000);
});

test("base URL accepts loopback only and CLI accepts no video overrides", () => {
  assert.equal(
    normalizeLocalBaseUrl("http://127.0.0.1:3000/"),
    "http://127.0.0.1:3000"
  );
  assert.deepEqual(parseArguments(["--base-url", "http://localhost:3100"]), {
    baseUrl: "http://localhost:3100",
    sampleId: null
  });
  assert.deepEqual(
    parseArguments([
      "--base-url",
      "http://localhost:3100",
      "--sample",
      "restroom"
    ]),
    {
      baseUrl: "http://localhost:3100",
      sampleId: "restroom"
    }
  );
  assert.throws(
    () =>
      parseArguments([
        "--base-url",
        "http://localhost:3100",
        "--sample",
        "other"
      ]),
    (error) => error instanceof HarnessError && error.code === "usage"
  );
  assert.throws(
    () => normalizeLocalBaseUrl("https://example.com"),
    (error) =>
      error instanceof HarnessError &&
      error.code === "base_url_must_be_loopback"
  );
  assert.throws(
    () =>
      parseArguments([
        "--base-url",
        "http://127.0.0.1:3000",
        "/tmp/other.mp4"
      ]),
    (error) => error instanceof HarnessError && error.code === "usage"
  );
});

test("request summary requires exactly four real client frames", () => {
  const expectedUpload = {
    bytes: mockVideoBytes.length,
    sha256: createHash("sha256").update(mockVideoBytes).digest("hex")
  };
  const summary = summarizeAnalyzeRequest({
    cardId: "venue-test",
    brief: { name: "test" },
    frames: [frame(1), frame(2), frame(3), frame(4)],
    videoDataUrl: mockVideoDataUrl,
    useFixture: false
  }, expectedUpload);
  assert.equal(summary.frameCount, 4);
  assert.equal(summary.video.decodedBytes, mockVideoBytes.length);
  assert.deepEqual(
    summary.frames.map((entry) => entry.frameId),
    ["frame-01", "frame-02", "frame-03", "frame-04"]
  );
  assert.throws(
    () =>
      summarizeAnalyzeRequest({
        frames: [frame(1), frame(2), frame(3)],
        videoDataUrl: mockVideoDataUrl
      }),
    (error) =>
      error instanceof HarnessError &&
      error.code === "client_did_not_extract_exactly_four_real_frames"
  );
  assert.throws(
    () =>
      summarizeAnalyzeRequest({
        frames: [
          frame(1),
          frame(2),
          frame(3),
          { ...frame(4), fixtureUrl: "/fixture.png" }
        ],
        videoDataUrl: mockVideoDataUrl
      }),
    HarnessError
  );
  assert.throws(
    () =>
      summarizeAnalyzeRequest({
        frames: [frame(1), frame(2), frame(3), frame(4)],
        videoDataUrl: "data:image/jpeg;base64,bad"
      }),
    (error) =>
      error instanceof HarnessError &&
      error.code === "direct_video_payload_invalid"
  );
  assert.throws(
    () =>
      summarizeAnalyzeRequest(
        {
          frames: [frame(1), frame(2), frame(3), frame(4)],
          videoDataUrl: mockVideoDataUrl
        },
        { ...expectedUpload, sha256: "wrong-sha" }
      ),
    (error) =>
      error instanceof HarnessError &&
      error.code === "direct_video_payload_mismatch"
  );
});

test("sanitizer drops secret-like keys, credentials, and frame data", () => {
  const sanitized = sanitizeUnknown({
    authorization: "Bearer top-secret",
    requestId: "provider-request",
    nested: {
      apiKey: "do-not-store",
      text: "Bearer still-secret",
      frame: "data:image/jpeg;base64,abc123"
    }
  });
  const serialized = JSON.stringify(sanitized);
  assert.doesNotMatch(serialized, /top-secret|still-secret|do-not-store/);
  assert.doesNotMatch(serialized, /authorization|requestId|apiKey/);
  assert.match(serialized, /omitted image data/);
});

test("saved success result is allowlisted and never stores raw response secrets", () => {
  const request = summarizeAnalyzeRequest({
    cardId: "venue-test",
    brief: { name: "入口サンプル動画" },
    frames: [frame(1), frame(2), frame(3), frame(4)],
    videoDataUrl: mockVideoDataUrl,
    useFixture: false
  });
  const result = buildSanitizedSuccessResult({
    sample: SAMPLE_VIDEOS[0],
    source: {
      source: { bytes: 123, sha256: "abc" },
      upload: {
        path: "/tmp/entrance-h264.mp4",
        bytes: mockVideoBytes.length,
        sha256: "upload-sha"
      },
      derivedFromSource: SAMPLE_VIDEOS[0].sourcePath
    },
    request,
    status: 200,
    responseBody: {
      apiKey: "root-secret",
      rawError: "raw-secret",
      card: {
        schemaVersion: 1,
        brief: {
          cardId: "venue-test",
          name: "入口サンプル動画",
          category: "cafe",
          languages: ["ja"],
          createdAt: "2026-07-25T00:00:00.000Z"
        },
        state: "review",
        items: [],
        unknowns: [],
        conflicts: [],
        safetyAudit: {},
        traces: [
          {
            provider: "qwen",
            mode: "live",
            ok: true,
            requestId: "provider-secret-id",
            reservationId: "billing-secret-id"
          }
        ],
        frames: [
          {
            frameId: "frame-01",
            tSec: 1,
            url: "data:image/jpeg;base64,raw-frame"
          }
        ],
        publishedAt: null,
        lastVerifiedAt: null,
        updatedAt: "2026-07-25T00:00:00.000Z"
      }
    },
    reviewPath: "/review/venue-test",
    screenshotPath: "/tmp/review.png"
  });
  const serialized = JSON.stringify(result);
  assert.equal(result.response.card.frames[0].frameId, "frame-01");
  assert.doesNotMatch(
    serialized,
    /root-secret|raw-secret|provider-secret-id|billing-secret-id|raw-frame/
  );
  assert.equal(result.safety.publishAttempted, false);
  assert.equal(result.sample.uploadBytes, mockVideoBytes.length);
  assert.equal(result.sample.uploadSha, "upload-sha");
  assert.equal(
    result.sample.derivedFromSource,
    "/Users/b/Downloads/IMG_0502.MOV"
  );
});

test("derived upload recipe is H.264 faststart with no overlay filter", () => {
  const args = h264TranscodeArguments(
    "/tmp/source.mov",
    "/tmp/derived.mp4",
    false
  );
  assert.ok(args.includes("libx264"));
  assert.ok(args.includes("+faststart"));
  assert.ok(args.includes("yuv420p"));
  assert.equal(args.some((entry) => /drawtext|overlay/i.test(entry)), false);
});
