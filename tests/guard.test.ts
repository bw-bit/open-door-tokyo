import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardStatus, reconcile, reserve } from "@/lib/guard";
import { GET } from "@/app/api/health/providers/route";
import { providerPresence } from "@/lib/env";

const prefix = "GUARD_QWEN_CHAT_";
let directory: string;

function configure(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string> = {
    NATIVE_UNIT: "usd",
    CONFIRMED_CAP_USD: "1",
    SPENT_SNAPSHOT_USD: "0",
    SLOT_COST_USD: "1",
    MAX_ACTION_COST_USD: "2",
    PRICE_SOURCE_URL: "https://example.invalid/pricing",
    PRICE_EFFECTIVE_DATE: "2026-07-25",
    HARD_LIMIT: "enabled"
  };
  for (const [name, value] of Object.entries({ ...values, ...overrides })) {
    if (value === undefined) delete process.env[`${prefix}${name}`];
    else process.env[`${prefix}${name}`] = value;
  }
}

function configureGmi() {
  const values = {
    NATIVE_UNIT: "usd",
    CONFIRMED_CAP_USD: "1",
    SPENT_SNAPSHOT_USD: "0",
    SLOT_COST_USD: "1",
    MAX_ACTION_COST_USD: "1",
    PRICE_SOURCE_URL: "https://example.invalid/gmi-pricing",
    PRICE_EFFECTIVE_DATE: "2026-07-25",
    HARD_LIMIT: "enabled"
  };
  for (const [name, value] of Object.entries(values)) {
    process.env[`GUARD_GMI_CHAT_${name}`] = value;
  }
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "odt-guard-"));
  process.env.GUARD_STORE_DIR = directory;
  configure();
});

afterEach(async () => {
  vi.restoreAllMocks();
  delete process.env.GUARD_STORE_DIR;
  for (const name of Object.keys(process.env)) {
    if (name.startsWith("GUARD_")) delete process.env[name];
  }
  await rm(directory, { recursive: true, force: true });
});

describe("sponsor guard", () => {
  it("defaults Qwen to intl without requiring workspace and preserves the deprecated key alias", () => {
    const env = {
      QWEN_API_KEY: "present"
    };
    expect(providerPresence(env).qwen).toBe(true);
    expect(providerPresence({ ...env, QWEN_REGION: "intl" }).qwen).toBe(true);
    expect(providerPresence({ ...env, QWEN_REGION: "cn-beijing" }).qwen).toBe(false);
  });

  it.each([
    ["NATIVE_UNIT", "cap_unknown"],
    ["CONFIRMED_CAP_USD", "cap_unknown"],
    ["SLOT_COST_USD", "price_unknown"],
    ["PRICE_SOURCE_URL", "price_unknown"],
    ["MAX_ACTION_COST_USD", "estimate_unknown"],
    ["HARD_LIMIT", "hard_limit_unknown"]
  ])("fails closed when %s is absent", async (name, code) => {
    configure({ [name]: undefined });
    await expect(reserve({ surface: "qwen.chat", maxCostUsd: 1, idempotencyKey: name }))
      .resolves.toEqual({ ok: false, code });
  });

  it("requires acknowledgement when a provider hard limit is unavailable", async () => {
    configure({ HARD_LIMIT: "unavailable" });
    await expect(reserve({ surface: "qwen.chat", maxCostUsd: 1, idempotencyKey: "a" }))
      .resolves.toEqual({ ok: false, code: "hard_limit_unknown" });
    configure({ HARD_LIMIT: "unavailable", HARD_LIMIT_ACKNOWLEDGED: "true" });
    expect((await reserve({ surface: "qwen.chat", maxCostUsd: 1, idempotencyKey: "b" })).ok).toBe(true);
  });

  it("has exactly one winner in a real parallel wx race for the last slot", async () => {
    const results = await Promise.all([
      reserve({ surface: "qwen.chat", maxCostUsd: 1, idempotencyKey: "one" }),
      reserve({ surface: "qwen.chat", maxCostUsd: 1, idempotencyKey: "two" })
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
  });

  it("exhausts create-only slots and records a partial reservation as abandoned", async () => {
    const result = await reserve({ surface: "qwen.chat", maxCostUsd: 2, idempotencyKey: "partial" });
    expect(result).toEqual({ ok: false, code: "cap_exhausted" });
    const abandoned = await readdir(path.join(directory, "guard", "abandoned"));
    expect(abandoned).toHaveLength(1);
    await expect(reserve({ surface: "qwen.chat", maxCostUsd: 1, idempotencyKey: "later" }))
      .resolves.toEqual({ ok: false, code: "cap_exhausted" });
  });

  it("releases the global lock only after known reconciliation", async () => {
    configure({ CONFIRMED_CAP_USD: "2" });
    const first = await reserve({ surface: "qwen.chat", maxCostUsd: 1, idempotencyKey: "first" });
    expect(first.ok).toBe(true);
    await expect(reserve({ surface: "qwen.chat", maxCostUsd: 1, idempotencyKey: "locked" }))
      .resolves.toEqual({ ok: false, code: "concurrency_locked" });
    if (!first.ok) throw new Error("reservation failed");
    await expect(reconcile({ reservationId: first.reservationId, actualCostUsd: 0.5 }))
      .resolves.toEqual({ ok: true });
    expect((await reserve({ surface: "qwen.chat", maxCostUsd: 1, idempotencyKey: "second" })).ok).toBe(true);
  });

  it("refuses reuse of active and reconciled idempotency keys", async () => {
    configure({ CONFIRMED_CAP_USD: "2" });
    const first = await reserve({ surface: "qwen.chat", maxCostUsd: 1, idempotencyKey: "same" });
    if (!first.ok) throw new Error("reservation failed");
    await expect(reserve({ surface: "qwen.chat", maxCostUsd: 1, idempotencyKey: "same" }))
      .resolves.toEqual({ ok: false, code: "concurrency_locked" });
    await expect(reconcile({ reservationId: first.reservationId, actualCostUsd: 0.5 }))
      .resolves.toEqual({ ok: true });
    await expect(reserve({ surface: "qwen.chat", maxCostUsd: 1, idempotencyKey: "same" }))
      .resolves.toEqual({ ok: false, code: "cap_exhausted" });
  });

  it("retains unknown usage and blocks the next reservation", async () => {
    configure({ CONFIRMED_CAP_USD: "2" });
    const first = await reserve({ surface: "qwen.chat", maxCostUsd: 1, idempotencyKey: "unknown" });
    if (!first.ok) throw new Error("reservation failed");
    await expect(reconcile({ reservationId: first.reservationId, actualCostUsd: null }))
      .resolves.toEqual({ ok: false, code: "unknown_usage" });
    await expect(reserve({ surface: "qwen.chat", maxCostUsd: 1, idempotencyKey: "blocked" }))
      .resolves.toEqual({ ok: false, code: "outstanding_unreconciled" });
  });

  it("blocks only the unknown surface and permits another surface sequentially", async () => {
    configure({ CONFIRMED_CAP_USD: "2" });
    configureGmi();
    const qwen = await reserve({ surface: "qwen.chat", maxCostUsd: 1, idempotencyKey: "qwen-unknown" });
    if (!qwen.ok) throw new Error("reservation failed");
    await expect(reconcile({ reservationId: qwen.reservationId, actualCostUsd: null }))
      .resolves.toEqual({ ok: false, code: "unknown_usage" });
    await expect(reserve({ surface: "qwen.chat", maxCostUsd: 1, idempotencyKey: "qwen-blocked" }))
      .resolves.toEqual({ ok: false, code: "outstanding_unreconciled" });
    expect(
      (await reserve({ surface: "gmi.chat", maxCostUsd: 1, idempotencyKey: "gmi-allowed" })).ok
    ).toBe(true);
  });

  it("retains the lock when actual cost exceeds the reserved amount", async () => {
    configure({ CONFIRMED_CAP_USD: "3" });
    const first = await reserve({ surface: "qwen.chat", maxCostUsd: 1, idempotencyKey: "overage" });
    if (!first.ok) throw new Error("reservation failed");
    await expect(reconcile({ reservationId: first.reservationId, actualCostUsd: 1.01 }))
      .resolves.toEqual({ ok: false, code: "unknown_usage" });
    await expect(reserve({ surface: "qwen.chat", maxCostUsd: 1, idempotencyKey: "after-overage" }))
      .resolves.toEqual({ ok: false, code: "outstanding_unreconciled" });
  });

  it("partitions slots by UTC month", async () => {
    const result = await reserve({ surface: "qwen.chat", maxCostUsd: 1, idempotencyKey: "month" });
    expect(result.ok).toBe(true);
    const expected = `${new Date().getUTCFullYear()}${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
    const slots = await readdir(path.join(directory, "guard", "qwen.chat", expected));
    expect(slots).toHaveLength(1);
  });

  it("returns non-secret status and health scalar values without network access", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const status = await guardStatus("qwen.chat");
    expect(status).toMatchObject({ capKnown: true, priceKnown: true, hardLimit: "enabled" });
    const response = await GET();
    const json = await response.json();
    for (const provider of ["qwen", "gmi", "aiand", "nosana", "daytona", "storage"]) {
      expect(json[provider]).toEqual({ configured: expect.any(Boolean) });
    }
    const leaves: unknown[] = [];
    const visit = (value: unknown) => {
      if (value && typeof value === "object") Object.values(value).forEach(visit);
      else leaves.push(value);
    };
    visit(json);
    expect(leaves.every((value) => typeof value === "boolean" || Number.isInteger(value) || ["enabled", "unavailable", "unknown"].includes(String(value)))).toBe(true);
    expect(JSON.stringify(json)).not.toMatch(/key|token|secret|https?:\/\//i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
