import { randomUUID } from "node:crypto";
import { blobGuardStore } from "./store-blob";
import { fileGuardStore, type GuardStore } from "./store-file";
import { readPolicy } from "./policy";
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
}

const LOCK_PATH = "guard/global.lock";

function store(): GuardStore {
  return process.env.NODE_ENV === "production" ? blobGuardStore : fileGuardStore;
}

function month(now = new Date()): string {
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function reservationPath(id: string): string {
  return `guard/reservations/${id}.json`;
}

async function reservations(currentStore: GuardStore): Promise<Array<{ path: string; value: Reservation }>> {
  const paths = await currentStore.list("guard/reservations/");
  const values = await Promise.all(paths.map(async (path) => {
    const value = await currentStore.read<Reservation>(path);
    if (!value) return { path, value };
    const reconciliation = await currentStore.read<Reservation>(
      `guard/reconciliations/${value.reservationId}.json`
    );
    return { path, value: reconciliation ?? value };
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
    const maxSlots = Math.max(0, Math.floor((policy.confirmedCapUsd - policy.spentSnapshotUsd) / policy.slotCostUsd));
    const needed = Math.ceil(input.maxCostUsd / policy.slotCostUsd);
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
    const usageUnknown =
      input.actualCostUsd === null ||
      reservedCostUsd === undefined ||
      input.actualCostUsd > reservedCostUsd ||
      !Number.isFinite(input.actualCostUsd) ||
      input.actualCostUsd < 0;
    let next: Reservation;
    if (usageUnknown) {
      next = { ...original, state: "unknown" };
    } else {
      next = { ...original, state: "reconciled", actualCostUsd: input.actualCostUsd as number };
    }
    await currentStore.create(`guard/reconciliations/${input.reservationId}.json`, next);
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
    const maxSlots = Math.max(
      0,
      Math.floor(
        (configured.policy.confirmedCapUsd - configured.policy.spentSnapshotUsd) /
          configured.policy.slotCostUsd
      )
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
