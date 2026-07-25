import type { BillableSurface, HardLimitState, ReserveFailureCode } from "./types";

export const ALLOW_PAID_FALLBACK = false;
export const ALLOW_AUTO_TOPUP = false;
export const MAX_BILLABLE_CONCURRENCY = 1;

export interface GuardPolicy {
  nativeUnit: string;
  confirmedCapUsd: number;
  spentSnapshotUsd: number;
  slotCostUsd: number;
  maxActionCostUsd: number;
  priceSourceUrl: string;
  priceEffectiveDate: string;
  hardLimit: HardLimitState;
}

const PREFIX: Record<BillableSurface, string> = {
  "qwen.chat": "QWEN_CHAT",
  "gmi.chat": "GMI_CHAT",
  "aiand.chat": "AIAND_CHAT",
  "daytona.sandbox": "DAYTONA_SANDBOX",
  "nosana.job": "NOSANA_JOB"
};

function finiteNonNegative(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function readPolicy(
  surface: BillableSurface,
  env: NodeJS.ProcessEnv = process.env
): { ok: true; policy: GuardPolicy } | { ok: false; code: ReserveFailureCode } {
  const prefix = PREFIX[surface];
  const get = (name: string) => env[`GUARD_${prefix}_${name}`];
  const cap = finiteNonNegative(get("CONFIRMED_CAP_USD"));
  const spent = finiteNonNegative(get("SPENT_SNAPSHOT_USD"));
  if (!present(get("NATIVE_UNIT")) || cap === null || spent === null) {
    return { ok: false, code: "cap_unknown" };
  }

  const slotCost = finiteNonNegative(get("SLOT_COST_USD"));
  if (
    slotCost === null ||
    slotCost === 0 ||
    !present(get("PRICE_SOURCE_URL")) ||
    !present(get("PRICE_EFFECTIVE_DATE"))
  ) {
    return { ok: false, code: "price_unknown" };
  }

  const maxAction = finiteNonNegative(get("MAX_ACTION_COST_USD"));
  if (maxAction === null || maxAction === 0) {
    return { ok: false, code: "estimate_unknown" };
  }

  const hardLimitValue = get("HARD_LIMIT");
  if (
    hardLimitValue !== "enabled" &&
    hardLimitValue !== "unavailable" &&
    hardLimitValue !== "unknown"
  ) {
    return { ok: false, code: "hard_limit_unknown" };
  }
  if (
    hardLimitValue !== "enabled" &&
    !(hardLimitValue === "unavailable" && get("HARD_LIMIT_ACKNOWLEDGED") === "true")
  ) {
    return { ok: false, code: "hard_limit_unknown" };
  }
  const nativeUnit = get("NATIVE_UNIT");
  const priceSourceUrl = get("PRICE_SOURCE_URL");
  const priceEffectiveDate = get("PRICE_EFFECTIVE_DATE");
  if (!present(nativeUnit) || !present(priceSourceUrl) || !present(priceEffectiveDate)) {
    return { ok: false, code: "store_unavailable" };
  }

  return {
    ok: true,
    policy: {
      nativeUnit: nativeUnit.trim(),
      confirmedCapUsd: cap,
      spentSnapshotUsd: spent,
      slotCostUsd: slotCost,
      maxActionCostUsd: maxAction,
      priceSourceUrl: priceSourceUrl.trim(),
      priceEffectiveDate: priceEffectiveDate.trim(),
      hardLimit: hardLimitValue
    }
  };
}

export function policyPrefix(surface: BillableSurface): string {
  return PREFIX[surface];
}
