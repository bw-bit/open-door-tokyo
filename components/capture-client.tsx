"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ProviderId } from "@/lib/types";
import { ProviderTraceRail } from "./provider-trace";

const phases: Array<{ provider: ProviderId; text: string }> = [
  { provider: "qwen", text: "映像から入口・通路・設備を観察しています" },
  { provider: "gmi", text: "根拠のない断定表現を監査しています" },
  { provider: "nosana", text: "証拠フレームを時刻付きで索引化しています" }
];

async function extractFrames(file: File) {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("動画を読み込めませんでした"));
  });

  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 512 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("フレームを抽出できませんでした");

  const fractions = [0.12, 0.35, 0.58, 0.82];
  const frames = [];
  for (let index = 0; index < fractions.length; index += 1) {
    const time = Math.max(
      0,
      Math.min(video.duration - 0.05, video.duration * fractions[index])
    );
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("動画内を移動できませんでした"));
      video.currentTime = time;
    });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push({
      frameId: `frame-${String(index + 1).padStart(2, "0")}`,
      tSec: Math.round(time * 10) / 10,
      dataUrl: canvas.toDataURL("image/jpeg", 0.6)
    });
  }
  URL.revokeObjectURL(objectUrl);
  return frames;
}

export function CaptureClient() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("cafe-tour.mp4");
  const [venueName, setVenueName] = useState("CAFÉ OPEN DOOR");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState("/demo/cafe-tour.mp4");
  const [phase, setPhase] = useState(-1);
  const [error, setError] = useState("");

  async function analyze() {
    setError("");
    setPhase(0);
    const phaseTimer = window.setInterval(
      () => setPhase((value) => Math.min(value + 1, phases.length - 1)),
      900
    );

    try {
      const cardId = selectedFile
        ? `venue-${Date.now().toString(36)}`
        : "demo-cafe";
      const frames = selectedFile
        ? await extractFrames(selectedFile)
        : [
            { frameId: "frame-01", tSec: 4, fixtureUrl: "/demo/frames/01-entrance.png" },
            { frameId: "frame-02", tSec: 7, fixtureUrl: "/demo/frames/02-step-measurement.png" },
            { frameId: "frame-03", tSec: 11, fixtureUrl: "/demo/frames/03-door-width.png" },
            { frameId: "frame-04", tSec: 16, fixtureUrl: "/demo/frames/04-seating.png" }
          ];
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId,
          brief: {
            name: venueName,
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
      if (!response.ok) throw new Error("解析を開始できませんでした");
      await response.json();
      window.setTimeout(() => router.push(`/review/${cardId}`), 500);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "解析に失敗しました");
      setPhase(-1);
    } finally {
      window.clearInterval(phaseTimer);
    }
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
                disabled={phase >= 0}
              />
              <span>東京 · カフェ / 飲食店</span>
            </div>
            <video
              src={videoSrc}
              poster={selectedFile ? undefined : "/demo/frames/01-entrance.png"}
              controls
              muted
              playsInline
              aria-label="架空カフェの20秒店舗ツアー動画"
            />
            <div className="video-meta">
              <span className="sample-tag">{selectedFile ? "UPLOAD" : "SAMPLE"}</span>
              <span>{fileName}</span>
              <span>00:20 · 4 evidence frames</span>
            </div>
          </div>

          <div className="upload-row">
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              className="visually-hidden"
              onChange={(event) =>
                {
                  const file = event.target.files?.[0] ?? null;
                  setSelectedFile(file);
                  setFileName(file?.name ?? "cafe-tour.mp4");
                  if (file) {
                    setVideoSrc(URL.createObjectURL(file));
                  } else {
                    setVideoSrc("/demo/cafe-tour.mp4");
                  }
                }
              }
            />
            <button
              className="button secondary"
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={phase >= 0}
            >
              動画を選び直す
            </button>
            <button
              className="button primary"
              type="button"
              onClick={analyze}
              disabled={phase >= 0}
            >
              {phase >= 0 ? "エージェント実行中…" : "証拠を抽出する"}
              <span aria-hidden="true">→</span>
            </button>
          </div>
          {currentPhase && (
            <div className="run-status" role="status">
              <span className="run-indicator" />
              <strong>{currentPhase.text}</strong>
              <span>{phase + 1} / {phases.length}</span>
            </div>
          )}
          {error && <p className="error-message">{error}</p>}
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
