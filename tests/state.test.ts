import { describe, expect, it } from "vitest";
import { canTransition } from "@/lib/status";

describe("card state machine", () => {
  it("allows the normal critical path", () => {
    expect(canTransition("draft", "uploading")).toBe(true);
    expect(canTransition("uploading", "frames_ready")).toBe(true);
    expect(canTransition("frames_ready", "analyzing")).toBe(true);
    expect(canTransition("analyzing", "auditing")).toBe(true);
    expect(canTransition("auditing", "review")).toBe(true);
    expect(canTransition("review", "staff_confirmed")).toBe(true);
    expect(canTransition("staff_confirmed", "card_built")).toBe(true);
    expect(canTransition("card_built", "published")).toBe(true);
  });

  it("does not allow draft to publish directly", () => {
    expect(canTransition("draft", "published")).toBe(false);
  });

  it("lets a degraded run recover to review", () => {
    expect(canTransition("degraded", "review")).toBe(true);
  });
});
