"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ProviderId } from "@/lib/types";
import {
  CLIENT_FRAME_PAYLOAD_TARGET_BYTES,
  MAX_VIDEO_FRAMES,
  framePayloadBytes,
  representativeFrameTimes,
  validateRealUploadFrames,
  validateSelectedVideo,
  type UploadFrame
} from "@/lib/video-upload";
import { ProviderTraceRail } from "./provider-trace";

const phases: Array<{ provider: ProviderId; text: string }> = [
  { provider: "qwen", text: "映像から入口・通路・設備を観察しています" },
  { provider: "gmi", text: "根拠のない断定表現を監査しています" },
  { provider: "nosana", text: "証拠フレームを時刻付きで索引化しています" }
];

const VIDEO_LOAD_TIMEOUT_MS = 15_000;
const FRAME_JPEG_QUALITIES = [0.72, 0.58, 0.44];

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: "loadedmetadata" | "seeked",
  errorMessage: string
) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(errorMessage));
    }, VIDEO_LOAD_TIMEOUT_MS);
    const onSuccess = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(errorMessage));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener(eventName, onSuccess);
      video.removeEventListener("error", onError);
    };
    video.addEventListener(eventName, onSuccess, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function canvasToDataUrl(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("フレーム画像を作成できませんでした"));
          return;
        }
        const reader = new FileReader();
        reader.onerror = () =>
          reject(new Error("フレーム画像を読み取れませんでした"));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      quality
    );
  });
}

async function seekVideo(video: HTMLVideoElement, time: number) {
  if (Math.abs(video.currentTime - time) < 0.01 && video.readyState >= 2) return;
  const ready = waitForVideoEvent(
    video,
    "seeked",
    "動画内の位置を読み込めませんでした。別のMP4またはMOVをお試しください。"
  );
  video.currentTime = time;
  await ready;
}

async function waitForDecodedFrame(video: HTMLVideoElement) {
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(fallback);
      resolve();
    };
    const fallback = window.setTimeout(finish, 250);
    if ("requestVideoFrameCallback" in video) {
      video.requestVideoFrameCallback(() => finish());
    } else {
      window.requestAnimationFrame(() => finish());
    }
  });
}

async function extractFrames(
  file: File,
  onProgress: (completed: number, total: number) => void
): Promise<UploadFrame[]> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  try {
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = objectUrl;
    const metadataReady = waitForVideoEvent(
      video,
      "loadedmetadata",
      "この動画を読み込めませんでした。iPhone/AndroidのMP4またはMOVをお試しください。"
    );
    video.load();
    await metadataReady;

    if (
      !Number.isFinite(video.duration) ||
      video.duration <= 0 ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    ) {
      throw new Error("動画の長さまたは映像サイズを確認できませんでした");
    }

    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("この端末ではフレームを抽出できませんでした");

    const times = representativeFrameTimes(video.duration);
    const frames: UploadFrame[] = [];
    const perFrameBudget = Math.floor(
      CLIENT_FRAME_PAYLOAD_TARGET_BYTES / MAX_VIDEO_FRAMES
    );
    for (let index = 0; index < times.length; index += 1) {
      await seekVideo(video, times[index]);
      await waitForDecodedFrame(video);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      let dataUrl = "";
      for (const quality of FRAME_JPEG_QUALITIES) {
        dataUrl = await canvasToDataUrl(canvas, quality);
        if (new TextEncoder().encode(dataUrl).byteLength <= perFrameBudget) break;
      }
      if (new TextEncoder().encode(dataUrl).byteLength > perFrameBudget) {
        throw new Error(
          "動画フレームが大きすぎます。短い動画または低い解像度でお試しください。"
        );
      }
      frames.push({
        frameId: `frame-${String(index + 1).padStart(2, "0")}`,
        tSec: times[index],
        dataUrl
      });
      onProgress(index + 1, times.length);
    }
    if (
      validateRealUploadFrames(frames) !== "ok" ||
      framePayloadBytes(frames) > CLIENT_FRAME_PAYLOAD_TARGET_BYTES
    ) {
      throw new Error("抽出データが送信上限を超えました。別の動画をお試しください。");
    }
    return frames;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

export function CaptureClient() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [fileName, setFileName] = useState("cafe-tour.mp4");
  const [venueName, setVenueName] = useState("CAFÉ OPEN DOOR");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState("/demo/cafe-tour.mp4");
  const [phase, setPhase] = useState(-1);
  const [progressText, setProgressText] = useState("");
  const [error, setError] = useState("");
  const busy = progressText.length > 0;

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    []
  );

  async function analyze() {
    setError("");
    if (!venueName.trim()) {
      setError("店舗名を入力してください");
      return;
    }
    setProgressText(
      selectedFile ? "動画を読み込んでいます…" : "サンプルデータを準備しています…"
    );
    let phaseTimer: number | undefined;

    try {
      const cardId = selectedFile
        ? `venue-${Date.now().toString(36)}`
        : "demo-cafe";
      const frames = selectedFile
        ? await extractFrames(selectedFile, (completed, total) =>
            setProgressText(`証拠フレームを抽出しています… ${completed} / ${total}`)
          )
        : [
            { frameId: "frame-01", tSec: 4, fixtureUrl: "/demo/frames/01-entrance.png" },
            { frameId: "frame-02", tSec: 7, fixtureUrl: "/demo/frames/02-step-measurement.png" },
            { frameId: "frame-03", tSec: 11, fixtureUrl: "/demo/frames/03-door-width.png" },
            { frameId: "frame-04", tSec: 16, fixtureUrl: "/demo/frames/04-seating.png" }
          ];
      setPhase(0);
      setProgressText("安全に解析リクエストを送信しています…");
      phaseTimer = window.setInterval(
        () => setPhase((value) => Math.min(value + 1, phases.length - 1)),
        900
      );
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId,
          brief: {
            name: venueName.trim(),
            category: "cafe",
            languages: ["ja", "en"]
          },
          frames,
          transcript: selectedFile
            ? ""
            : "スロープはレジの後ろに置いてあります。使用するときはスタッフを呼んでください。",
          useFixture: !selectedFile
        })
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(
          failure?.error === "payload_too_large"
            ? "抽出データが送信上限を超えました。短い動画でお試しください。"
            : "解析を開始できませんでした。動画を確認してもう一度お試しください。"
        );
      }
      await response.json();
      setProgressText("解析が完了しました。確認画面へ移動します…");
      window.setTimeout(() => router.push(`/review/${cardId}`), 500);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "解析に失敗しました");
      setPhase(-1);
      setProgressText("");
    } finally {
      if (phaseTimer !== undefined) window.clearInterval(phaseTimer);
    }
  }

  function selectVideo(file: File | null) {
    setError("");
    if (!file) {
      setSelectedFile(null);
      setFileName("cafe-tour.mp4");
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      setVideoSrc("/demo/cafe-tour.mp4");
      return;
    }
    const validation = validateSelectedVideo(file);
    if (validation !== "ok") {
      setError(
        validation === "file_too_large"
          ? "動画が大きすぎます。500MB以下のMP4またはMOVを選んでください。"
          : validation === "empty_file"
            ? "空の動画ファイルは使用できません。"
            : "MP4またはMOV形式の動画を選んでください。"
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const previewUrl = URL.createObjectURL(file);
    previewUrlRef.current = previewUrl;
    setSelectedFile(file);
    setFileName(file.name);
    setVideoSrc(previewUrl);
  }

  const currentPhase = phase >= 0 ? phases[phase] : null;

  return (
    <div className="capture-grid">
      <section className="capture-main">
        <div className="eyebrow">VIDEO-TO-EVIDENCE AGENT</div>
        <h1>
          入口から席までを、
          <br />
          <em>行く前に分かる情報</em>へ。
        </h1>
        <p className="lede">
          店舗を20秒撮影すると、AIが段差・入口幅・通路・コミュニケーション方法を整理。
          根拠がない項目は「未確認」のまま、証拠付きの日英カードにします。
        </p>

        <div className="capture-card">
          <div className="card-heading">
            <span className="number-label">01</span>
            <div>
              <h2>店舗ツアー動画</h2>
              <p>入口 → ドア → 通路 → 席を、止まらずゆっくり撮影</p>
            </div>
          </div>

          <div className="video-shell">
            <div className="venue-field">
              <label htmlFor="venue-name">店舗名</label>
              <input
                id="venue-name"
                value={venueName}
                onChange={(event) => setVenueName(event.target.value)}
                disabled={busy}
              />
              <span>東京 · カフェ / 飲食店</span>
            </div>
            <video
              src={videoSrc}
              poster={selectedFile ? undefined : "/demo/frames/01-entrance.png"}
              controls
              muted
              playsInline
              aria-label={
                selectedFile
                  ? "選択した店舗ツアー動画"
                  : "架空カフェの20秒店舗ツアー動画"
              }
            />
            <div className="video-meta">
              <span className="sample-tag">{selectedFile ? "UPLOAD" : "SAMPLE"}</span>
              <span>{fileName}</span>
              <span>
                {selectedFile
                  ? `${(selectedFile.size / 1_000_000).toFixed(1)}MB · 最大4フレーム`
                  : "00:20 · 4 evidence frames"}
              </span>
            </div>
          </div>

          <div className="upload-row">
            <input
              ref={inputRef}
              type="file"
              accept=".mp4,.mov,video/mp4,video/quicktime,video/*"
              className="visually-hidden"
              onChange={(event) => selectVideo(event.target.files?.[0] ?? null)}
            />
            <button
              className="button secondary"
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              動画を選び直す
            </button>
            <button
              className="button primary"
              type="button"
              onClick={analyze}
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? "処理中…" : "証拠を抽出する"}
              <span aria-hidden="true">→</span>
            </button>
          </div>
          {progressText && (
            <div className="run-status" role="status">
              <span className="run-indicator" />
              <strong>{currentPhase?.text ?? progressText}</strong>
              <span>
                {currentPhase ? `${phase + 1} / ${phases.length}` : "準備中"}
              </span>
            </div>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="capture-guidance">
          <strong>撮影ガイド</strong>
          <ol>
            <li>入口全体と段差を正面から</li>
            <li>ドアを開け、最も狭い幅を撮影</li>
            <li>入口から利用する席まで歩く</li>
            <li>設備は声に出して説明する</li>
          </ol>
          <p>測れない数値をAIが推測することはありません。</p>
        </div>
      </section>

      <ProviderTraceRail activeProvider={currentPhase?.provider} />
    </div>
  );
}
