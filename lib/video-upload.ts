export const MAX_VIDEO_FRAMES = 4;
export const MAX_QWEN_FRAME_PAYLOAD_BYTES = 8_000_000;
export const CLIENT_FRAME_PAYLOAD_TARGET_BYTES = 3_500_000;
export const MAX_LOCAL_VIDEO_BYTES = 500_000_000;

export interface UploadFrame {
  frameId: string;
  tSec: number;
  dataUrl?: string;
  fixtureUrl?: string;
}

const VIDEO_EXTENSION = /\.(mp4|mov)$/i;
const FRAME_DATA_URL = /^data:image\/(?:jpeg|jpg|webp);base64,/;

export function validateSelectedVideo(file: {
  name: string;
  type: string;
  size: number;
}): "ok" | "unsupported_type" | "file_too_large" | "empty_file" {
  if (!Number.isFinite(file.size) || file.size <= 0) return "empty_file";
  if (file.size > MAX_LOCAL_VIDEO_BYTES) return "file_too_large";
  const supportedMime =
    file.type === "" ||
    file.type === "video/mp4" ||
    file.type === "video/quicktime" ||
    file.type.startsWith("video/");
  if (!supportedMime || (!VIDEO_EXTENSION.test(file.name) && file.type === "")) {
    return "unsupported_type";
  }
  return "ok";
}

export function representativeFrameTimes(
  durationSeconds: number,
  count = MAX_VIDEO_FRAMES
): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || count <= 0) {
    return [];
  }
  const safeCount = Math.min(MAX_VIDEO_FRAMES, Math.floor(count));
  const end = Math.max(0, durationSeconds - Math.min(0.05, durationSeconds / 10));
  return Array.from({ length: safeCount }, (_, index) => {
    const fraction = (index + 1) / (safeCount + 1);
    return Math.round(Math.min(end, durationSeconds * fraction) * 10) / 10;
  });
}

export function framePayloadBytes(frames: UploadFrame[]): number {
  const encoder = new TextEncoder();
  return frames.reduce(
    (total, frame) =>
      total +
      encoder.encode(frame.dataUrl ?? frame.fixtureUrl ?? "").byteLength,
    0
  );
}

export function validateRealUploadFrames(
  frames: UploadFrame[]
): "ok" | "frame_count" | "invalid_frame" | "payload_too_large" {
  if (frames.length < 1 || frames.length > MAX_VIDEO_FRAMES) return "frame_count";
  if (
    frames.some(
      (frame) =>
        !frame.dataUrl ||
        !FRAME_DATA_URL.test(frame.dataUrl) ||
        frame.fixtureUrl !== undefined ||
        !Number.isFinite(frame.tSec) ||
        frame.tSec < 0
    )
  ) {
    return "invalid_frame";
  }
  if (framePayloadBytes(frames) > MAX_QWEN_FRAME_PAYLOAD_BYTES) {
    return "payload_too_large";
  }
  return "ok";
}
