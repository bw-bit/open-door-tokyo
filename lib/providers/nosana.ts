import "server-only";

import { reconcile, reserve } from "../guard";
import type { AccessCard, ProviderResult } from "../types";
import {
  closedError,
  configuredMaxCost,
  ProviderCallError,
  providerTrace,
  reserveFailureCode
} from "./shared";

export async function indexWithNosana(
  card: AccessCard
): Promise<ProviderResult<AccessCard>> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const task = {
    ja: "既存の分散GPUジョブ状態を読取確認",
    en: "Read and validate an existing decentralized GPU job"
  };
  const apiKey = process.env.NOSANA_API_KEY;
  const jobId = process.env.NOSANA_JOB_ID;
  if (!apiKey || !jobId) {
    return {
      data: card,
      trace: providerTrace("nosana", "not_configured", task, startedAt, Date.now() - started, false, {
        errorCode: "config_missing",
        validation: "not_run",
        detail: { ja: "既存ジョブの読取設定がありません", en: "Existing-job read configuration is missing" }
      })
    };
  }
  try {
    const { createNosanaClient, NosanaNetwork } = await import("@nosana/kit");
    const client = createNosanaClient(NosanaNetwork.MAINNET, { api: { apiKey } });
    // Read-only proof must use get(). In @nosana/kit 2.7.0 jobs.list() is a
    // paid on-chain bulk-create surface despite its misleading name.
    const job = await client.api.jobs.get(jobId);
    if (typeof job !== "object" || job === null || !("state" in job)) {
      throw new ProviderCallError("schema_invalid");
    }
    const value = job as {
      state?: unknown;
      address?: unknown;
      job?: unknown;
      id?: unknown;
    };
    const state = value.state;
    const validState =
      (typeof state === "number" &&
        Number.isInteger(state) &&
        state >= 0 &&
        state <= 3) ||
      (typeof state === "string" &&
        ["queued", "running", "completed", "stopped"].includes(
          state.toLowerCase()
        ));
    if (!validState) {
      throw new ProviderCallError("semantic_invalid");
    }
    const returnedId = [value.address, value.job, value.id].find(
      (candidate) => typeof candidate === "string"
    );
    if (typeof returnedId === "string" && returnedId !== jobId) {
      throw new ProviderCallError("semantic_invalid");
    }
    return {
      data: card,
      trace: providerTrace("nosana", "live", task, startedAt, Date.now() - started, true, {
        requestId: jobId,
        validation: "schema_and_semantic_passed",
        detail: { ja: "既存ジョブを読取確認しました", en: "Validated the existing job by read-only lookup" }
      })
    };
  } catch (error) {
    return {
      data: card,
      trace: providerTrace("nosana", "fallback", task, startedAt, Date.now() - started, false, {
        requestId: jobId,
        errorCode: closedError(error),
        validation: "failed",
        detail: { ja: "既存ジョブを確認できませんでした", en: "Could not validate the existing job" }
      })
    };
  }
}

export function buildNosanaEvidenceJob(appUrl: string) {
  const base = appUrl.replace(/\/$/, "");
  const names = [
    "01-entrance.png",
    "02-step-measurement.png",
    "03-door-width.png",
    "04-seating.png"
  ];
  const urls = names.map((name) => `${base}/demo/frames/${name}`);
  const script = [
    "import hashlib,json,urllib.request,torch",
    `urls=${JSON.stringify(urls)}`,
    "rows=[{'url':u,'sha256':hashlib.sha256(urllib.request.urlopen(u,timeout=20).read()).hexdigest()} for u in urls]",
    "result={'gpu':torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'unavailable','frames':rows}",
    "print('OPEN_DOOR_RESULT='+json.dumps(result,separators=(',',':')))"
  ].join("; ");
  return {
    version: "0.1",
    type: "container",
    meta: { trigger: "open-door-tokyo", system_requirements: { required_vram: 4 } },
    ops: [{
      type: "container/run",
      id: "evidence-frame-index",
      args: {
        image: "pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime",
        gpu: true,
        cmd: `python -c ${JSON.stringify(script)}`
      }
    }]
  };
}

export async function postPaidNosanaJob(input: {
  appUrl: string;
  idempotencyKey: string;
  humanConfirmed: true;
  quoteUsd: number;
  market: string;
  bid: number;
  runtimeSeconds: number;
}) {
  const apiKey = process.env.NOSANA_API_KEY;
  const configuredMarket = process.env.NOSANA_MARKET;
  const maxCostUsd = configuredMaxCost(
    process.env.GUARD_NOSANA_JOB_MAX_ACTION_COST_USD
  );
  if (
    !apiKey || !configuredMarket || configuredMarket !== input.market ||
    maxCostUsd === null || input.humanConfirmed !== true ||
    !Number.isFinite(input.quoteUsd) || input.quoteUsd <= 0 ||
    input.quoteUsd > maxCostUsd || !Number.isFinite(input.bid) || input.bid <= 0 ||
    !Number.isInteger(input.runtimeSeconds) || input.runtimeSeconds < 1 ||
    input.runtimeSeconds > 600
  ) throw new ProviderCallError("config_missing");

  const reserved = await reserve({
    surface: "nosana.job",
    maxCostUsd: input.quoteUsd,
    idempotencyKey: input.idempotencyKey
  });
  if (!reserved.ok) throw new ProviderCallError(reserveFailureCode(reserved.code));
  let actualCost: number | null = null;
  try {
    const { createNosanaClient, NosanaNetwork } = await import("@nosana/kit");
    const client = createNosanaClient(NosanaNetwork.MAINNET, { api: { apiKey } });
    const ipfsHash = await client.ipfs.pin(buildNosanaEvidenceJob(input.appUrl));
    // WARNING: in the installed SDK jobs.list() submits a paid job; it is
    // intentionally confined to this explicitly named, confirmed paid path.
    const result = await client.api.jobs.list(
      { ipfsHash, market: input.market, timeout: input.runtimeSeconds },
      { idempotencyKey: input.idempotencyKey }
    );
    if (
      typeof result !== "object" || result === null ||
      typeof result.job !== "string" ||
      typeof result.run !== "string" ||
      typeof result.tx !== "string" ||
      typeof result.credits?.costUSD !== "number" ||
      !Number.isFinite(result.credits.costUSD)
    ) throw new ProviderCallError("schema_invalid");
    actualCost = result.credits.costUSD;
    return {
      job: result.job,
      run: result.run,
      transaction: result.tx,
      ipfsHash,
      creditsUsed: result.credits.creditsUsed,
      costUSD: actualCost
    };
  } finally {
    await reconcile({ reservationId: reserved.reservationId, actualCostUsd: actualCost });
  }
}
