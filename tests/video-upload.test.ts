import { describe, expect, it } from "vitest";
import {
  MAX_QWEN_FRAME_PAYLOAD_BYTES,
  MAX_QWEN_VIDEO_DATA_URL_CHARS,
  framePayloadBytes,
  representativeFrameTimes,
  validateQwenVideoDataUrl,
  validateRealUploadFrames,
  validateSelectedVideo
} from "@/lib/video-upload";

describe("smartphone video upload boundaries", () => {
  it.each([
    ["tour.mp4", "video/mp4"],
    ["tour.MOV", "video/quicktime"],
    ["android-capture.mp4", ""]
  ])("accepts smartphone video %s", (name, type) => {
    expect(validateSelectedVideo({ name, type, size: 1_000_000 })).toBe("ok");
  });

  it("rejects unsupported, empty, and excessive local files", () => {
    expect(
      validateSelectedVideo({ name: "notes.txt", type: "text/plain", size: 10 })
    ).toBe("unsupported_type");
    expect(
      validateSelectedVideo({
        name: "tour.mov",
        type: "video/quicktime",
        size: 0
      })
    ).toBe("empty_file");
    expect(
      validateSelectedVideo({
        name: "tour.mp4",
        type: "video/mp4",
        size: 500_000_001
      })
    ).toBe("file_too_large");
  });

  it("chooses four ordered representative times inside the video", () => {
    const times = representativeFrameTimes(20);
    expect(times).toEqual([4, 8, 12, 16]);
    expect(times.every((time) => time >= 0 && time < 20)).toBe(true);
  });

  it("enforces data-only real frames, four-frame maximum, and byte accounting", () => {
    const valid = Array.from({ length: 4 }, (_, index) => ({
      frameId: `frame-${index}`,
      tSec: index,
      dataUrl: "data:image/jpeg;base64,AAAA"
    }));
    expect(validateRealUploadFrames(valid)).toBe("ok");
    expect(validateRealUploadFrames([...valid, valid[0]])).toBe("frame_count");
    expect(
      validateRealUploadFrames([
        { ...valid[0], fixtureUrl: "/demo/frames/01-entrance.png" }
      ])
    ).toBe("invalid_frame");
    expect(framePayloadBytes(valid)).toBe(
      valid.reduce((total, frame) => total + frame.dataUrl.length, 0)
    );
  });

  it("rejects a real-frame payload above 8MB", () => {
    const dataUrl =
      "data:image/jpeg;base64," + "A".repeat(MAX_QWEN_FRAME_PAYLOAD_BYTES);
    expect(
      validateRealUploadFrames([{ frameId: "large", tSec: 0, dataUrl }])
    ).toBe("payload_too_large");
  });

  it("accepts only base64 video data URLs whose encoded string is under 10MB", () => {
    expect(
      validateQwenVideoDataUrl("data:video/mp4;base64,QUJDRA==")
    ).toBe("ok");
    expect(
      validateQwenVideoDataUrl(
        "data:video/quicktime;base64,QUJDRA=="
      )
    ).toBe("ok");
    expect(
      validateQwenVideoDataUrl("data:application/mp4;base64,QUJDRA==")
    ).toBe("invalid_video");
    expect(
      validateQwenVideoDataUrl("data:video/mp4;base64,not base64")
    ).toBe("invalid_video");
    const prefix = "data:video/mp4;base64,";
    const oversized =
      prefix +
      "A".repeat(MAX_QWEN_VIDEO_DATA_URL_CHARS - prefix.length);
    expect(oversized).toHaveLength(MAX_QWEN_VIDEO_DATA_URL_CHARS);
    expect(validateQwenVideoDataUrl(oversized)).toBe("payload_too_large");
  });
});
