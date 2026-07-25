export type BillableSurface =
  | "qwen.chat"
  | "gmi.chat"
  | "aiand.chat"
  | "daytona.sandbox"
  | "nosana.job";

export type ReserveFailureCode =
  | "cap_unknown"
  | "price_unknown"
  | "estimate_unknown"
  | "hard_limit_unknown"
  | "cap_exhausted"
  | "store_unavailable"
  | "outstanding_unreconciled"
  | "concurrency_locked";

export type ReserveResult =
  | { ok: true; reservationId: string; slots: number }
  | { ok: false; code: ReserveFailureCode };

export type HardLimitState = "enabled" | "unavailable" | "unknown";

export interface GuardStatus {
  capKnown: boolean;
  priceKnown: boolean;
  hardLimit: HardLimitState;
  remainingSlots: number;
  outstanding: number;
}

