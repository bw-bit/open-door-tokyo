import { NextResponse } from "next/server";
import { providerPresence } from "@/lib/env";
import { guardStatus, type BillableSurface } from "@/lib/guard";

export const runtime = "nodejs";

export async function GET() {
  const presence = providerPresence();
  const surfaces: BillableSurface[] = [
    "qwen.chat",
    "gmi.chat",
    "aiand.chat",
    "daytona.sandbox",
    "nosana.job"
  ];
  const guards = Object.fromEntries(
    await Promise.all(surfaces.map(async (surface) => [surface, await guardStatus(surface)]))
  );
  return NextResponse.json({
    qwen: { configured: presence.qwen },
    gmi: { configured: presence.gmi },
    aiand: { configured: presence.aiand },
    nosana: { configured: presence.nosana },
    daytona: { configured: presence.daytona },
    storage: { configured: presence.storage },
    providers: presence,
    guards,
    paidFallback: false,
    autoTopup: false,
    maxBillableConcurrency: 1
  });
}
