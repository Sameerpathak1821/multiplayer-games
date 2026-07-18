import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "./rateLimit";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it("allows up to max within the window, then blocks", () => {
    const rl = new RateLimiter(3, 1000);
    expect(rl.allow("a")).toBe(true);
    expect(rl.allow("a")).toBe(true);
    expect(rl.allow("a")).toBe(true);
    expect(rl.allow("a")).toBe(false);
    rl.destroy();
  });

  it("keys are independent", () => {
    const rl = new RateLimiter(1, 1000);
    expect(rl.allow("a")).toBe(true);
    expect(rl.allow("b")).toBe(true);
    expect(rl.allow("a")).toBe(false);
    rl.destroy();
  });

  it("window slides: old hits expire", () => {
    const rl = new RateLimiter(2, 1000);
    rl.allow("a");
    rl.allow("a");
    expect(rl.allow("a")).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(rl.allow("a")).toBe(true);
    rl.destroy();
  });
});
