/**
 * In-memory sliding-window rate limiter, keyed by IP. Single-node by design —
 * matches the one-instance deployment. Swap for a Redis-backed limiter when
 * scaling out.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  private pruner: ReturnType<typeof setInterval>;

  constructor(
    private max: number,
    private windowMs: number,
  ) {
    this.pruner = setInterval(() => this.prune(), Math.max(windowMs, 60_000));
    if (typeof this.pruner.unref === "function") this.pruner.unref();
  }

  allow(key: string): boolean {
    const now = Date.now();
    const arr = this.hits.get(key) ?? [];
    while (arr.length > 0 && now - arr[0]! > this.windowMs) arr.shift();
    if (arr.length >= this.max) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, arr] of this.hits) {
      if (arr.length === 0 || now - arr[arr.length - 1]! > this.windowMs) {
        this.hits.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.pruner);
    this.hits.clear();
  }
}
