import { NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { postPaidNosanaJob } from "@/lib/providers/nosana";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  confirm: z.literal("POST_ONE_GPU_JOB"),
  appUrl: z.string().url(),
  idempotencyKey: z.string().uuid(),
  humanConfirmed: z.literal(true),
  quoteUsd: z.number().positive(),
  market: z.string().min(1).max(200),
  bid: z.number().positive(),
  runtimeSeconds: z.number().int().positive().max(600)
});

function secretsEqual(expected: string | undefined, supplied: string | null): boolean {
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.alloc(left.length);
  Buffer.from(supplied).copy(right, 0, 0, left.length);
  return timingSafeEqual(left, right) && Buffer.byteLength(supplied) === left.length;
}

export async function POST(request: Request) {
  const expectedSecret = process.env.NOSANA_SUBMIT_SECRET;
  const suppliedSecret = request.headers.get("x-open-door-admin");
  if (!secretsEqual(expectedSecret, suppliedSecret)) {
    return NextResponse.json({ error: "not_authorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "request_invalid" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "explicit_single_job_confirmation_required" },
      { status: 400 }
    );
  }

  try {
    const result = await postPaidNosanaJob(parsed.data);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      {
        error: "nosana_submit_failed"
      },
      { status: 502 }
    );
  }
}
