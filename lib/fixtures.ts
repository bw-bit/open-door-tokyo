import analysisJson from "@/fixtures/demo-analysis.json";
import publishedJson from "@/fixtures/demo-published.json";
import {
  encodeReferenceEstimate,
  referenceEstimateDescription
} from "./reference-estimate";
import type { AccessCard } from "./types";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getDemoAnalysisCard(): AccessCard {
  const card = clone(analysisJson as AccessCard);
  const estimates: Record<string, { minCm: number; maxCm: number; confidence: number }> = {
    "entrance.step_height_cm": { minCm: 6, maxCm: 10, confidence: 0.64 },
    "entrance.threshold_height_cm": { minCm: 1, maxCm: 3, confidence: 0.58 },
    "entrance.door_width_cm": { minCm: 75, maxCm: 90, confidence: 0.66 },
    "path_to_seat.narrowest_passage_cm": {
      minCm: 70,
      maxCm: 85,
      confidence: 0.61
    }
  };
  for (const item of card.items) {
    const estimate = estimates[item.field];
    if (!estimate) continue;
    item.description = referenceEstimateDescription(estimate);
    item.value = encodeReferenceEstimate(estimate);
    item.status = "ai_observed";
    item.confidence = estimate.confidence;
    item.confirmedByStaff = false;
    item.lastVerifiedAt = null;
  }
  card.unknowns = card.items
    .filter((item) => item.status === "unknown")
    .map((item) => item.field);
  return card;
}

export function getDemoPublishedCard(): AccessCard {
  const card = clone(publishedJson as AccessCard);
  const proactiveFields = new Set([
    "entrance.threshold_height_cm",
    "entrance.door_operation",
    "entrance.approach_space",
    "entrance.handle_type",
    "entrance.obstruction",
    "entrance.glass_visibility",
    "entrance.lighting",
    "entrance.signage",
    "path_to_seat.turning_space",
    "restroom.signage_type",
    "restroom.entrance_threshold_height_cm",
    "restroom.path_clear_width_cm",
    "restroom.visible_fixture_types",
    "restroom.grab_bars",
    "restroom.accessible_stall",
    "restroom.diaper_changing_station",
    "restroom.emergency_call_button",
    "restroom.sink_approach_clearance",
    "restroom.turning_space"
  ]);
  for (const item of getDemoAnalysisCard().items) {
    if (!proactiveFields.has(item.field)) continue;
    const index = card.items.findIndex(
      (candidate) => candidate.field === item.field
    );
    if (index === -1) card.items.push(clone(item));
    else if (card.items[index].status === "unknown") card.items[index] = clone(item);
  }
  card.unknowns = card.items
    .filter((item) => item.status === "unknown")
    .map((item) => item.field);
  return card;
}

export const RESTROOM_LIVE_PROOF_CARD_ID = "restroom-live-proof";

export function getRestroomLiveProofCard(): AccessCard {
  const card = getDemoAnalysisCard();
  const capturedAt = "2026-07-25T06:09:27.437Z";

  card.brief = {
    cardId: RESTROOM_LIVE_PROOF_CARD_ID,
    name: "トイレ動画・ライブ解析結果",
    category: "other",
    address: {
      ja: "東京都千代田区架空1-2-3（デモ地点）",
      en: "1-2-3 Kakuu, Chiyoda-ku, Tokyo (demo location)"
    },
    googleMapsUrl: "https://maps.google.com/?q=35.6809,139.7671",
    location: { lat: 35.6809, lng: 139.7671 },
    languages: ["ja", "en"],
    createdAt: "2026-07-25T06:09:05.190Z"
  };

  for (const item of card.items) {
    item.description = {
      ja: "この短い映像では確認できていないため要確認です",
      en: "Needs confirmation because it is not visible in this short video"
    };
    item.value = null;
    item.status = "unknown";
    item.confidence = 0;
    item.provenance = [];
    item.confirmedByStaff = false;
    item.lastVerifiedAt = null;
  }

  const observations = [
    {
      field: "restroom.signage_type",
      description: {
        ja: "男性用トイレの入口壁面に、緑色の人物ピクトグラムと「Men」の文字が記載された看板が設置されている。",
        en: "A sign with a green male pictogram and the text 'Men' is mounted on the wall at the restroom entrance."
      },
      value: "Men (text and pictogram)",
      confidence: 1,
      frameId: "frame-01",
      tSec: 1.5
    },
    {
      field: "restroom.entrance_threshold_height_cm",
      description: referenceEstimateDescription({ minCm: 1, maxCm: 3 }),
      value: encodeReferenceEstimate({ minCm: 1, maxCm: 3 }),
      confidence: 0.6,
      frameId: "frame-01",
      tSec: 1.5
    },
    {
      field: "restroom.path_clear_width_cm",
      description: referenceEstimateDescription({ minCm: 90, maxCm: 110 }),
      value: encodeReferenceEstimate({ minCm: 90, maxCm: 110 }),
      confidence: 0.65,
      frameId: "frame-02",
      tSec: 2.9
    },
    {
      field: "restroom.visible_fixture_types",
      description: {
        ja: "奥の仕切り内に小便器が複数並んで設置されているのが見える。",
        en: "Multiple urinals are visible installed in a row within the rear partitions."
      },
      value: "urinal",
      confidence: 1,
      frameId: "frame-04",
      tSec: 5.9
    },
    {
      field: "restroom.grab_bars",
      description: {
        ja: "小便器の仕切り壁にL字型の手すりが取り付けられているのが確認できる。",
        en: "An L-shaped grab bar is visible on the urinal partition wall."
      },
      value: "L-shaped bar on urinal partition",
      confidence: 0.9,
      frameId: "frame-04",
      tSec: 5.9
    }
  ] as const;

  for (const observation of observations) {
    const item = card.items.find(
      (candidate) => candidate.field === observation.field
    );
    if (!item) continue;
    item.description = clone(observation.description);
    item.value = observation.value;
    item.status = "ai_observed";
    item.confidence = observation.confidence;
    item.provenance = [
      {
        kind: "video_frame",
        frameId: observation.frameId,
        tSec: observation.tSec,
        capturedAt
      }
    ];
  }

  card.state = "review";
  card.frames = [
    {
      frameId: "frame-01",
      tSec: 1.5,
      url: "/demo/restroom-live/frame-01.jpg",
      alt: { ja: "トイレ入口の表示", en: "Restroom entrance sign" }
    },
    {
      frameId: "frame-02",
      tSec: 2.9,
      url: "/demo/restroom-live/frame-02.jpg",
      alt: { ja: "入口から内部への通路", en: "Route into the restroom" }
    },
    {
      frameId: "frame-03",
      tSec: 4.4,
      url: "/demo/restroom-live/frame-03.jpg",
      alt: { ja: "トイレ内部の床と通路", en: "Restroom floor and route" }
    },
    {
      frameId: "frame-04",
      tSec: 5.9,
      url: "/demo/restroom-live/frame-04.jpg",
      alt: { ja: "小便器と手すり", en: "Urinals and grab bar" }
    }
  ];
  card.unknowns = card.items
    .filter((item) => item.status === "unknown")
    .map((item) => item.field);
  card.traces = [
    {
      provider: "qwen",
      mode: "live",
      task: {
        ja: "Qwen 3.7 Plusが動画ファイルを直接解析",
        en: "Qwen 3.7 Plus directly analyzed the video file"
      },
      model: "qwen3.7-plus",
      startedAt: "2026-07-25T06:09:05.190Z",
      latencyMs: 22247,
      ok: true,
      validation: "schema_and_semantic_passed",
      detail: {
        ja: "実動画から5件を抽出（最新成功結果）",
        en: "Applied five observations from the real video (latest successful run)"
      }
    },
    {
      provider: "gmi",
      mode: "not_configured",
      task: {
        ja: "断定表現の安全確認",
        en: "Audit unsupported universal claims"
      },
      startedAt: capturedAt,
      latencyMs: 0,
      ok: false,
      errorCode: "config_missing",
      validation: "not_run"
    },
    {
      provider: "nosana",
      mode: "not_configured",
      task: {
        ja: "分散GPUジョブ状態の読取",
        en: "Read a decentralized GPU job"
      },
      startedAt: capturedAt,
      latencyMs: 0,
      ok: false,
      errorCode: "config_missing",
      validation: "not_run"
    }
  ];
  card.publishedAt = null;
  card.lastVerifiedAt = null;
  card.updatedAt = capturedAt;
  return card;
}
