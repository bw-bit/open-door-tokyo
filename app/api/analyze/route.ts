import { NextResponse } from "next/server";
import { z } from "zod";
import {
  analyzeWithQwen,
  auditWithGmi,
  indexWithNosana
} from "@/lib/providers";
import { saveCard } from "@/lib/store";
import {
  MAX_QWEN_VIDEO_DATA_URL_CHARS,
  validateQwenVideoDataUrl,
  validateRealUploadFrames
} from "@/lib/video-upload";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  cardId: z.string().min(1).max(80),
  brief: z.object({
    name: z.string().min(1).max(120),
    category: z.enum(["cafe", "restaurant", "other"]),
    sourceUrl: z.string().url().optional(),
    address: z.object({
      ja: z.string().trim().min(1).max(240),
      en: z.string().trim().min(1).max(240)
    }).optional(),
    googleMapsUrl: z.string().url().optional(),
    location: z.object({
      lat: z.number().min(35.4).max(35.95),
      lng: z.number().min(138.9).max(140.1)
    }).optional(),
    languages: z.array(z.enum(["ja", "en"])).min(1)
  }),
  frames: z.array(
    z.object({
      frameId: z.string().min(1).max(80),
      tSec: z.number().nonnegative(),
      dataUrl: z.string().max(8_000_000).optional(),
      fixtureUrl: z.string().max(2_048).optional()
    })
  ).min(1).max(4),
  videoDataUrl: z.string().max(MAX_QWEN_VIDEO_DATA_URL_CHARS).optional(),
  transcript: z.string().max(8_000).optional(),
  useFixture: z.boolean().optional()
}).superRefine((value, context) => {
  const frameIds = value.frames.map(({ frameId }) => frameId);
  if (new Set(frameIds).size !== frameIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "frame IDs must be unique",
      path: ["frames"]
    });
  }
  value.frames.forEach((frame, index) => {
    if (Boolean(frame.dataUrl) === Boolean(frame.fixtureUrl)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "exactly one frame source is required",
        path: ["frames", index]
      });
    }
  });
});

const SAMPLE_CARD_IDS = new Set(["demo-cafe"]);

function isVerifiedSample(input: z.infer<typeof schema>) {
  return (
    input.useFixture === true &&
    input.videoDataUrl === undefined &&
    SAMPLE_CARD_IDS.has(input.cardId) &&
    input.frames.every(
      (frame) => Boolean(frame.fixtureUrl) && frame.dataUrl === undefined
    )
  );
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const verifiedSample = isVerifiedSample(parsed.data);
  if (!verifiedSample) {
    const frameValidation = validateRealUploadFrames(parsed.data.frames);
    if (frameValidation !== "ok") {
      return NextResponse.json(
        {
          error:
            frameValidation === "payload_too_large"
              ? "payload_too_large"
              : "invalid_upload_frames"
        },
        { status: frameValidation === "payload_too_large" ? 413 : 400 }
      );
    }
    if (parsed.data.videoDataUrl !== undefined) {
      const videoValidation = validateQwenVideoDataUrl(
        parsed.data.videoDataUrl
      );
      if (videoValidation !== "ok") {
        return NextResponse.json(
          {
            error:
              videoValidation === "payload_too_large"
                ? "payload_too_large"
                : "invalid_upload_video"
          },
          { status: videoValidation === "payload_too_large" ? 413 : 400 }
        );
      }
    }
  }
  const input = {
    ...parsed.data,
    // A client hint is never sufficient to select fixture facts.
    useFixture: verifiedSample
  };

  const qwen = await analyzeWithQwen(input);
  if (verifiedSample) {
    qwen.trace.mode = "verified_sample";
    qwen.trace.validation = "verified_sample";
    qwen.trace.errorCode = undefined;
  }
  qwen.data.brief = {
    cardId: parsed.data.cardId,
    ...parsed.data.brief,
    createdAt: new Date().toISOString()
  };
  qwen.data.state = "auditing";
  qwen.data.traces = [qwen.trace];

  const gmi = await auditWithGmi(qwen.data);
  const nosana = await indexWithNosana(gmi.data);
  if (verifiedSample && nosana.trace.mode === "not_configured") {
    nosana.trace.mode = "verified_sample";
    nosana.trace.validation = "verified_sample";
    nosana.trace.errorCode = undefined;
  }
  const card = gmi.data;
  card.state = "review";
  card.traces = [qwen.trace, gmi.trace, nosana.trace];
  card.updatedAt = new Date().toISOString();
  await saveCard(card);

  return NextResponse.json({ card });
}
