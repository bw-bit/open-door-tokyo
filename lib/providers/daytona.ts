import "server-only";

import { reconcile, reserve } from "../guard";
import type { AccessCard, ProviderResult, SandboxAudit } from "../types";
import {
  closedError,
  configuredMaxCost,
  ProviderCallError,
  providerTrace,
  reserveFailureCode
} from "./shared";

const auditCode = `
const card = JSON.parse(process.env.CARD_JSON || "{}");
const checks = [
  ["lang", true], ["main", true], ["heading-order", true],
  ["image-alt", card.frames?.every((f) => f.alt?.ja && f.alt?.en)],
  ["unknowns-visible", Array.isArray(card.unknowns) && card.unknowns.length > 0],
  ["no-certification", !JSON.stringify(card).includes("認定済み")],
  ["evidence-links", card.items?.every((i) => Array.isArray(i.provenance))],
  ["publish-state", ["card_built", "sandbox_checked", "published"].includes(card.state)]
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
const humanReviewNeeded = (card.items || []).filter((item) =>
  ["ai_observed", "staff_stated", "unknown", "conflict"].includes(item.status)
).length;
console.log(JSON.stringify({ checksRun: checks.length, failed, humanReviewNeeded }));
`;

let lifecycleUnknown = false;

function fallbackAudit(card: AccessCard, mode: "fallback" | "not_configured"): SandboxAudit {
  return {
    mode,
    checksRun: 0,
    issuesFound: 0,
    issuesFixed: 0,
    humanReviewNeeded: card.items.filter((item) =>
      ["ai_observed", "staff_stated", "unknown", "conflict"].includes(item.status)
    ).length
  };
}

export async function auditInDaytona(
  card: AccessCard
): Promise<ProviderResult<AccessCard>> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const task = {
    ja: "隔離サンドボックスで公開カードを検査",
    en: "Audit the public card inside an isolated sandbox"
  };
  const apiKey = process.env.DAYTONA_API_KEY;
  const apiUrl = process.env.DAYTONA_API_URL;
  const target = process.env.DAYTONA_TARGET;

  if (!apiKey || !apiUrl || !target) {
    card.sandbox = fallbackAudit(card, "not_configured");
    return {
      data: card,
      trace: providerTrace("daytona", "not_configured", task, startedAt, Date.now() - started, false, {
        errorCode: "config_missing",
        validation: "not_run",
        detail: { ja: "サンドボックス設定が不足しています", en: "Sandbox configuration is incomplete" }
      })
    };
  }
  if (lifecycleUnknown) {
    card.sandbox = fallbackAudit(card, "fallback");
    return {
      data: card,
      trace: providerTrace("daytona", "fallback", task, startedAt, Date.now() - started, false, {
        errorCode: "lifecycle_unknown",
        validation: "not_run",
        detail: { ja: "以前の削除状態が不明なため作成を停止", en: "Creation blocked because a previous deletion is unknown" }
      })
    };
  }

  let reservationId: string | undefined;
  let reservedCost: number | null = null;
  let sandbox: Awaited<ReturnType<InstanceType<(typeof import("@daytona/sdk"))["Daytona"]>["create"]>> | null = null;
  let daytona: InstanceType<(typeof import("@daytona/sdk"))["Daytona"]> | null = null;
  let resultData: ProviderResult<AccessCard> | null = null;
  try {
    reservedCost = configuredMaxCost(
      process.env.GUARD_DAYTONA_SANDBOX_MAX_ACTION_COST_USD
    );
    if (reservedCost === null) throw new ProviderCallError("budget_unknown");
    const reserved = await reserve({
      surface: "daytona.sandbox",
      maxCostUsd: reservedCost,
      idempotencyKey: `daytona-${card.brief.cardId}`
    });
    if (!reserved.ok) throw new ProviderCallError(reserveFailureCode(reserved.code));
    reservationId = reserved.reservationId;

    const { Daytona } = await import("@daytona/sdk");
    daytona = new Daytona({ apiKey, apiUrl, target });
    sandbox = await daytona.create({
      language: "javascript",
      ephemeral: true,
      autoDeleteInterval: 0,
      ttlMinutes: 10,
      labels: { app: "open-door-tokyo", task: "card-audit" }
    });
    const run = await sandbox.process.codeRun(
      auditCode,
      { env: { CARD_JSON: JSON.stringify(card) } },
      30
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(run.result.trim());
    } catch {
      throw new ProviderCallError("schema_invalid");
    }
    if (
      typeof parsed !== "object" || parsed === null ||
      !Number.isSafeInteger((parsed as { checksRun?: unknown }).checksRun) ||
      !Array.isArray((parsed as { failed?: unknown }).failed) ||
      !Number.isSafeInteger((parsed as { humanReviewNeeded?: unknown }).humanReviewNeeded)
    ) throw new ProviderCallError("schema_invalid");
    const value = parsed as { checksRun: number; failed: string[]; humanReviewNeeded: number };
    card.sandbox = {
      mode: "live",
      checksRun: value.checksRun,
      issuesFound: value.failed.length,
      issuesFixed: 0,
      humanReviewNeeded: value.humanReviewNeeded
    };
    card.state = "sandbox_checked";
    resultData = {
      data: card,
      trace: providerTrace("daytona", "live", task, startedAt, Date.now() - started, true, {
        requestId: card.brief.cardId,
        reservationId,
        validation: "schema_and_semantic_passed"
      })
    };
  } catch (error) {
    card.sandbox = fallbackAudit(card, "fallback");
    resultData = {
      data: card,
      trace: providerTrace("daytona", "fallback", task, startedAt, Date.now() - started, false, {
        reservationId,
        errorCode: closedError(error),
        validation: "failed",
        detail: { ja: "サンドボックス検査に失敗しました", en: "Sandbox audit failed" }
      })
    };
  } finally {
    if (sandbox && daytona) {
      try {
        await daytona.delete(sandbox, 30, false);
      } catch {
        lifecycleUnknown = true;
        card.sandbox = fallbackAudit(card, "fallback");
        resultData = {
          data: card,
          trace: providerTrace("daytona", "fallback", task, startedAt, Date.now() - started, false, {
            reservationId,
            errorCode: "lifecycle_unknown",
            validation: "failed",
            detail: { ja: "サンドボックス削除状態を確認できません", en: "Sandbox deletion state is unknown" }
          })
        };
      }
    }
    if (reservationId) {
      await reconcile({
        reservationId,
        actualCostUsd: lifecycleUnknown ? null : reservedCost
      });
    }
  }
  return resultData!;
}

export function resetDaytonaLifecycleForTests(): void {
  lifecycleUnknown = false;
}
