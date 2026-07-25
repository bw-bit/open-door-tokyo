import { randomUUID } from "node:crypto";
import { blobGuardStore } from "./store-blob";
import { fileGuardStore, type GuardStore } from "./store-file";
import { policyPrefix, readPolicy } from "./policy";
import type { BillableSurface, GuardStatus, ReserveResult } from "./types";

export type { BillableSurface, GuardStatus, ReserveResult } from "./types";

interface Reservation {
  reservationId: string;
  surface: BillableSurface;
  idempotencyKey: string;
  slots: number[];
  reservedCostUsd?: number;
  state: "active" | "reconciled" | "unknown";
  actualCostUsd?: number;
  settlementMode?: "provider_usage" | "reserved_max_user_authorized";
  unknownReason?:
    | "missing_usage"
    | "overage"
    | "invalid_usage"
    | "missing_reserved_cost";
  observedActualCostUsd?: number | null | "non_finite";
}

const LOCK_PATH = "guard/global.lock";
const MAX_SAFE_COUNT = BigInt(Number.MAX_SAFE_INTEGER);

interface DecimalInteger {
  coefficient: bigint;
  scale: number;
}

function decimalInteger(value: number): DecimalInteger {
  const [mantissa, exponentText] = value.toString().toLowerCase().split("e");
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  const negative = mantissa.startsWith("-");
  const unsigned = negative ? mantissa.slice(1) : mantissa;
  const [whole, fraction = ""] = unsigned.split(".");
  let coefficient = BigInt(`${whole || "0"}${fraction}`);
  if (negative) coefficient = -coefficient;
  const scale = fraction.length - exponent;
  if (scale < 0) {
    return {
      coefficient: coefficient * 10n ** BigInt(-scale),
      scale: 0
    };
  }
  return { coefficient, scale };
}

function alignDecimals(values: number[]): bigint[] {
  const decimals = values.map(decimalInteger);
  const scale = Math.max(...decimals.map((value) => value.scale));
  return decimals.map(
    (value) =>
      value.coefficient * 10n ** BigInt(scale - value.scale)
  );
}

function safeCount(value: bigint): number {
  if (value < 0n || value > MAX_SAFE_COUNT) {
    throw new RangeError("guard slot count is outside the safe integer range");
  }
  return Number(value);
}

function maximumSlots(
  confirmedCapUsd: number,
  spentSnapshotUsd: number,
  slotCostUsd: number
): number {
  const [cap, spent, slot] = alignDecimals([
    confirmedCapUsd,
    spentSnapshotUsd,
    slotCostUsd
  ]);
  if (slot <= 0n || cap <= spent) return 0;
  return safeCount((cap - spent) / slot);
}

function requiredSlots(maxCostUsd: number, slotCostUsd: number): number {
  const [cost, slot] = alignDecimals([maxCostUsd, slotCostUsd]);
  if (cost <= 0n || slot <= 0n) {
    throw new RangeError("guard slot values must be positive");
  }
  return safeCount((cost + slot - 1n) / slot);
}

function store(): GuardStore {
  return process.env.NODE_ENV === "production" ? blobGuardStore : fileGuardStore;
}

function month(now = new Date()): string {
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function reservationPath(id: string): string {
  return `guard/reservations/${id}.json`;
}

function settlementPath(id: string): string {
  return `guard/conservative-settlements/${id}.json`;
}

function reconciliationPath(id: string): string {
  return `guard/reconciliations/${id}.json`;
}

function observedCost(actualCostUsd: number | null): number | null | "non_finite" {
  if (actualCostUsd === null) return null;
  return Number.isFinite(actualCostUsd) ? actualCostUsd : "non_finite";
}

function unknownReason(
  actualCostUsd: number | null,
  reservedCostUsd: number | undefined
): Reservation["unknownReason"] | undefined {
  if (actualCostUsd === null) return "missing_usage";
  if (!Number.isFinite(actualCostUsd) || actualCostUsd < 0) {
    return "invalid_usage";
  }
  if (
    reservedCostUsd === undefined ||
    !Number.isFinite(reservedCostUsd) ||
    reservedCostUsd <= 0
  ) {
    return "missing_reserved_cost";
  }
  if (actualCostUsd > reservedCostUsd) return "overage";
  return undefined;
}

function sameReconciliation(left: Reservation | null, right: Reservation): boolean {
  return (
    left?.reservationId === right.reservationId &&
    left.surface === right.surface &&
    left.idempotencyKey === right.idempotencyKey &&
    left.reservedCostUsd === right.reservedCostUsd &&
    left.state === right.state &&
    left.actualCostUsd === right.actualCostUsd &&
    left.settlementMode === right.settlementMode &&
    left.unknownReason === right.unknownReason &&
    left.observedActualCostUsd === right.observedActualCostUsd
  );
}

async function reservations(currentStore: GuardStore): Promise<Array<{ path: string; value: Reservation }>> {
  const paths = await currentStore.list("guard/reservations/");
  const values = await Promise.all(paths.map(async (path) => {
    const value = await currentStore.read<Reservation>(path);
    if (!value) return { path, value };
    const reconciliation = await currentStore.read<Reservation>(
      reconciliationPath(value.reservationId)
    );
    const conservativeSettlement = await currentStore.read<Reservation>(
      settlementPath(value.reservationId)
    );
    return { path, value: conservativeSettlement ?? reconciliation ?? value };
  }));
  return values.filter((entry): entry is { path: string; value: Reservation } => entry.value !== null);
}

export async function reserve(input: {
  surface: BillableSurface;
  maxCostUsd: number;
  idempotencyKey: string;
}): Promise<ReserveResult> {
  const configured = readPolicy(input.surface);
  if (!configured.ok) return configured;
  if (
    !Number.isFinite(input.maxCostUsd) ||
    input.maxCostUsd <= 0 ||
    input.maxCostUsd > configured.policy.maxActionCostUsd ||
    input.idempotencyKey.length === 0
  ) {
    return { ok: false, code: "estimate_unknown" };
  }

  const currentStore = store();
  try {
    const currentReservations = await reservations(currentStore);
    const existing = currentReservations.find(
      ({ value }) => value.surface === input.surface && value.idempotencyKey === input.idempotencyKey
    );
    if (existing?.value.state === "unknown") {
      return { ok: false, code: "outstanding_unreconciled" };
    }
    if (existing?.value.state === "active") {
      return { ok: false, code: "concurrency_locked" };
    }
    if (existing?.value.state === "reconciled") {
      return { ok: false, code: "cap_exhausted" };
    }
    if (
      currentReservations.some(
        ({ value }) => value.surface === input.surface && value.state === "unknown"
      )
    ) {
      return { ok: false, code: "outstanding_unreconciled" };
    }
    if (!(await currentStore.create(LOCK_PATH, { createdAt: new Date().toISOString() }))) {
      return { ok: false, code: "concurrency_locked" };
    }

    const policy = configured.policy;
    const maxSlots = maximumSlots(
      policy.confirmedCapUsd,
      policy.spentSnapshotUsd,
      policy.slotCostUsd
    );
    const needed = requiredSlots(input.maxCostUsd, policy.slotCostUsd);
    const acquired: number[] = [];
    const partition = month();
    for (let slot = 0; slot < maxSlots && acquired.length < needed; slot += 1) {
      const pathname = `guard/${input.surface}/${partition}/${String(slot).padStart(8, "0")}.json`;
      if (await currentStore.create(pathname, { reserved: true })) acquired.push(slot);
    }
    if (acquired.length !== needed) {
      if (acquired.length > 0) {
        await currentStore.create(`guard/abandoned/${randomUUID()}.json`, {
          surface: input.surface,
          month: partition,
          slots: acquired.length
        });
      }
      await currentStore.remove(LOCK_PATH);
      return { ok: false, code: "cap_exhausted" };
    }
    const reservationId = randomUUID();
    const record: Reservation = {
      reservationId,
      surface: input.surface,
      idempotencyKey: input.idempotencyKey,
      slots: acquired,
      reservedCostUsd: needed * policy.slotCostUsd,
      state: "active"
    };
    if (!(await currentStore.create(reservationPath(reservationId), record))) {
      await currentStore.create(`guard/abandoned/${reservationId}.json`, {
        surface: input.surface,
        month: partition,
        slots: acquired.length
      });
      return { ok: false, code: "store_unavailable" };
    }
    return { ok: true, reservationId, slots: acquired.length };
  } catch {
    return { ok: false, code: "store_unavailable" };
  }
}

export async function reconcile(input: {
  reservationId: string;
  actualCostUsd: number | null;
}): Promise<{ ok: true } | { ok: false; code: "unknown_usage" | "store_unavailable" }> {
  const currentStore = store();
  try {
    const original = await currentStore.read<Reservation>(reservationPath(input.reservationId));
    if (!original || original.state !== "active") return { ok: false, code: "store_unavailable" };
    const reservedCostUsd = original.reservedCostUsd;
    const reason = unknownReason(input.actualCostUsd, reservedCostUsd);
    const policy =
      process.env[
        `GUARD_${policyPrefix(original.surface)}_UNKNOWN_USAGE_POLICY`
      ];
    const settleAtReservedMaximum =
      reason === "missing_usage" &&
      reservedCostUsd !== undefined &&
      policy === "reserved_max";
    const effectiveCostUsd = settleAtReservedMaximum
      ? reservedCostUsd
      : input.actualCostUsd;
    const usageUnknown = reason !== undefined && !settleAtReservedMaximum;
    let next: Reservation;
    if (usageUnknown) {
      next = {
        ...original,
        state: "unknown",
        unknownReason: reason,
        observedActualCostUsd: observedCost(input.actualCostUsd)
      };
    } else {
      next = {
        ...original,
        state: "reconciled",
        actualCostUsd: effectiveCostUsd as number,
        settlementMode: settleAtReservedMaximum
          ? "reserved_max_user_authorized"
          : "provider_usage"
      };
    }
    const created = await currentStore.create(reconciliationPath(input.reservationId), next);
    if (!created) {
      const existing = await currentStore.read<Reservation>(
        reconciliationPath(input.reservationId)
      );
      if (!sameReconciliation(existing, next)) {
        return { ok: false, code: "store_unavailable" };
      }
    }
    if (usageUnknown) {
      await currentStore.remove(LOCK_PATH);
      return { ok: false, code: "unknown_usage" };
    }
    await currentStore.remove(LOCK_PATH);
    return { ok: true };
  } catch {
    return { ok: false, code: "store_unavailable" };
  }
}

export async function settleUnknownAtReservedMaximum(input: {
  reservationId: string;
  authorization: {
    type: "user_authorized_reserved_max";
    reservationId: string;
    surface: BillableSurface;
    idempotencyKey: string;
    reservedCostUsd: number;
  };
}): Promise<
  | { ok: true; settledCostUsd: number }
  | {
      ok: false;
      code: "authorization_mismatch" | "not_unknown" | "store_unavailable";
    }
> {
  const currentStore = store();
  try {
    const original = await currentStore.read<Reservation>(
      reservationPath(input.reservationId)
    );
    const reconciliation = await currentStore.read<Reservation>(
      reconciliationPath(input.reservationId)
    );
    const authorizationMatches =
      input.authorization.type === "user_authorized_reserved_max" &&
      input.authorization.reservationId === input.reservationId &&
      input.authorization.surface === original?.surface &&
      input.authorization.idempotencyKey === original?.idempotencyKey &&
      input.authorization.reservedCostUsd === original?.reservedCostUsd;
    if (!authorizationMatches) {
      return { ok: false, code: "authorization_mismatch" };
    }
    if (
      !original ||
      reconciliation?.state !== "unknown" ||
      reconciliation.unknownReason !== "missing_usage" ||
      reconciliation.observedActualCostUsd !== null ||
      original.reservedCostUsd === undefined ||
      !Number.isFinite(original.reservedCostUsd) ||
      original.reservedCostUsd <= 0
    ) {
      return { ok: false, code: "not_unknown" };
    }
    const settlement: Reservation = {
      ...reconciliation,
      state: "reconciled",
      actualCostUsd: original.reservedCostUsd,
      settlementMode: "reserved_max_user_authorized"
    };
    const created = await currentStore.create(
      settlementPath(input.reservationId),
      settlement
    );
    if (!created) {
      const existing = await currentStore.read<Reservation>(
        settlementPath(input.reservationId)
      );
      if (
        existing?.state === "reconciled" &&
        existing.reservationId === original.reservationId &&
        existing.surface === input.authorization.surface &&
        existing.idempotencyKey === input.authorization.idempotencyKey &&
        existing.reservedCostUsd === input.authorization.reservedCostUsd &&
        existing.actualCostUsd === input.authorization.reservedCostUsd &&
        existing.settlementMode === "reserved_max_user_authorized" &&
        existing.unknownReason === "missing_usage" &&
        existing.observedActualCostUsd === null
      ) {
        return { ok: true, settledCostUsd: original.reservedCostUsd };
      }
      return { ok: false, code: "store_unavailable" };
    }
    return { ok: true, settledCostUsd: original.reservedCostUsd };
  } catch {
    return { ok: false, code: "store_unavailable" };
  }
}

export async function guardStatus(surface: BillableSurface): Promise<GuardStatus> {
  const configured = readPolicy(surface);
  const fallback: GuardStatus = {
    capKnown: configured.ok || configured.code !== "cap_unknown",
    priceKnown: configured.ok || !["cap_unknown", "price_unknown"].includes(configured.code),
    hardLimit: configured.ok ? configured.policy.hardLimit : "unknown",
    remainingSlots: 0,
    outstanding: 0
  };
  if (!configured.ok) return fallback;
  try {
    const currentStore = store();
    const partition = month();
    const used = (await currentStore.list(`guard/${surface}/${partition}/`)).length;
    const allReservations = await reservations(currentStore);
    const maxSlots = maximumSlots(
      configured.policy.confirmedCapUsd,
      configured.policy.spentSnapshotUsd,
      configured.policy.slotCostUsd
    );
    return {
      capKnown: true,
      priceKnown: true,
      hardLimit: configured.policy.hardLimit,
      remainingSlots: Math.max(0, maxSlots - used),
      outstanding: allReservations.filter(
        ({ value }) => value.surface === surface && (value.state === "active" || value.state === "unknown")
      ).length
    };
  } catch {
    return fallback;
  }
}
