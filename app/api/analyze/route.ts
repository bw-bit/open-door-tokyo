import { NextResponse } from "next/server";
import { z } from "zod";
import {
  analyzeWithQwen,
  auditWithGmi,
  indexWithNosana
} from "@/lib/providers";
import { saveCard } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  cardId: z.string().min(1).max(80),
  brief: z.object({
    name: z.string().min(1).max(120),
    category: z.enum(["cafe", "restaurant", "other"]),
    sourceUrl: z.string().url().optional(),
    languages: z.array(z.enum(["ja", "en"])).min(1)
  }),
  frames: z.array(
    z.object({
      frameId: z.string(),
      tSec: z.number().nonnegative(),
      dataUrl: z.string().optional(),
      fixtureUrl: z.string().optional()
    })
  ).min(1).max(8),
  transcript: z.string().optional(),
  useFixture: z.boolean().optional()
});

const SAMPLE_CARD_IDS = new Set(["demo-cafe"]);

function isVerifiedSample(input: z.infer<typeof schema>) {
  return (
    input.useFixture === true &&
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
