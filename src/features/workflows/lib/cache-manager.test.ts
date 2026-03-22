import { describe, it, expect } from "vitest";
import {
  createCache,
  makeCacheKey,
  makeNodeCacheKey,
  hashInput,
  cacheSet,
  cacheGet,
  cacheHas,
  cacheDelete,
  evictExpired,
  invalidateByTag,
  invalidateByScope,
  invalidateByPrefix,
  clearCache,
  getOrSet,
  cacheSetMany,
  cacheGetMany,
  getCacheStats,
  getCacheKeys,
  type CacheStore,
} from "./cache-manager";

const NOW = 1_700_000_000_000;
const TTL = 60_000; // 60 seconds

// ─────────────────────────────────────────────────────────────────────────────
// createCache
// ─────────────────────────────────────────────────────────────────────────────

describe("createCache", () => {
  it("creates empty cache with defaults", () => {
    const cache = createCache();
    expect(cache.entries.size).toBe(0);
    expect(cache.maxSize).toBe(1000);
    expect(cache.evictionPolicy).toBe("lru");
    expect(cache.hits).toBe(0);
    expect(cache.misses).toBe(0);
  });

  it("respects config options", () => {
    const cache = createCache({ maxSize: 10, evictionPolicy: "lfu" });
    expect(cache.maxSize).toBe(10);
    expect(cache.evictionPolicy).toBe("lfu");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Key Generation
// ─────────────────────────────────────────────────────────────────────────────

describe("makeCacheKey", () => {
  it("joins parts with colons", () => {
    expect(makeCacheKey("prefix", "a", "b", 1)).toBe("prefix:a:b:1");
  });

  it("handles null/undefined", () => {
    expect(makeCacheKey("k", null, undefined)).toBe("k:_null_:_null_");
  });
});

describe("makeNodeCacheKey", () => {
  it("creates prefixed key", () => {
    expect(makeNodeCacheKey("n1", "abc")).toBe("node:n1:abc");
  });
});

describe("hashInput", () => {
  it("returns consistent hash", () => {
    const h1 = hashInput({ a: 1, b: 2 });
    const h2 = hashInput({ a: 1, b: 2 });
    expect(h1).toBe(h2);
  });

  it("returns different hashes for different inputs", () => {
    expect(hashInput({ a: 1 })).not.toBe(hashInput({ a: 2 }));
  });

  it("starts with h", () => {
    expect(hashInput("test")).toMatch(/^h/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cacheSet / cacheGet / cacheHas / cacheDelete
// ─────────────────────────────────────────────────────────────────────────────

describe("cacheSet / cacheGet", () => {
  it("stores and retrieves a value", () => {
    let cache = createCache<string>();
    cache = cacheSet(cache, "key1", "hello", {}, NOW);
    const { value, hit } = cacheGet(cache, "key1", NOW);
    expect(value).toBe("hello");
    expect(hit).toBe(true);
  });

  it("increments hits on cache hit", () => {
    let cache = createCache<number>();
    cache = cacheSet(cache, "k", 42, {}, NOW);
    const { store } = cacheGet(cache, "k", NOW);
    expect(store.hits).toBe(1);
  });

  it("increments misses on cache miss", () => {
    const cache = createCache<number>();
    const { store, hit } = cacheGet(cache, "missing", NOW);
    expect(hit).toBe(false);
    expect(store.misses).toBe(1);
  });

  it("returns expired entry as miss", () => {
    let cache = createCache<string>();
    cache = cacheSet(cache, "k", "val", { ttlMs: TTL }, NOW);
    const { value, hit } = cacheGet(cache, "k", NOW + TTL + 1);
    expect(hit).toBe(false);
    expect(value).toBeUndefined();
  });

  it("no-expiry entry lives forever", () => {
    let cache = createCache<string>();
    cache = cacheSet(cache, "k", "val", { ttlMs: null }, NOW);
    const { hit } = cacheGet(cache, "k", NOW + 999_999_999);
    expect(hit).toBe(true);
  });

  it("updates access metadata on hit", () => {
    let cache = createCache<number>();
    cache = cacheSet(cache, "k", 1, {}, NOW);
    const { store } = cacheGet(cache, "k", NOW + 5000);
    expect(store.entries.get("k")!.lastAccessedAt).toBe(NOW + 5000);
    expect(store.entries.get("k")!.accessCount).toBe(1);
  });

  it("is immutable — original store unchanged", () => {
    const original = createCache<string>();
    const next = cacheSet(original, "k", "v", {}, NOW);
    expect(original.entries.size).toBe(0);
    expect(next.entries.size).toBe(1);
  });
});

describe("cacheHas", () => {
  it("true for existing entry", () => {
    const cache = cacheSet(createCache<string>(), "k", "v", {}, NOW);
    expect(cacheHas(cache, "k", NOW)).toBe(true);
  });

  it("false for missing entry", () => {
    expect(cacheHas(createCache(), "k", NOW)).toBe(false);
  });

  it("false for expired entry", () => {
    const cache = cacheSet(createCache<string>(), "k", "v", { ttlMs: 1000 }, NOW);
    expect(cacheHas(cache, "k", NOW + 2000)).toBe(false);
  });
});

describe("cacheDelete", () => {
  it("removes the entry", () => {
    const cache = cacheSet(createCache<string>(), "k", "v", {}, NOW);
    expect(cacheDelete(cache, "k").entries.size).toBe(0);
  });

  it("no-op for missing key", () => {
    const cache = createCache<string>();
    expect(cacheDelete(cache, "missing").entries.size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Eviction
// ─────────────────────────────────────────────────────────────────────────────

describe("LRU eviction", () => {
  it("evicts least recently used entry when at capacity", () => {
    let cache = createCache<number>({ maxSize: 2, evictionPolicy: "lru" });
    cache = cacheSet(cache, "a", 1, {}, NOW);
    cache = cacheSet(cache, "b", 2, {}, NOW + 1000);
    // Access "a" to make it more recently used
    cache = cacheGet(cache, "a", NOW + 2000).store;
    // Add "c" — "b" should be evicted (LRU)
    cache = cacheSet(cache, "c", 3, {}, NOW + 3000);
    expect(cache.entries.has("b")).toBe(false);
    expect(cache.entries.has("a")).toBe(true);
    expect(cache.evictions).toBe(1);
  });
});

describe("FIFO eviction", () => {
  it("evicts oldest entry", () => {
    let cache = createCache<number>({ maxSize: 2, evictionPolicy: "fifo" });
    cache = cacheSet(cache, "first", 1, {}, NOW);
    cache = cacheSet(cache, "second", 2, {}, NOW + 1000);
    cache = cacheSet(cache, "third", 3, {}, NOW + 2000);
    expect(cache.entries.has("first")).toBe(false);
  });
});

describe("evictExpired", () => {
  it("removes all expired entries", () => {
    let cache = createCache<string>();
    cache = cacheSet(cache, "a", "v", { ttlMs: 1000 }, NOW);
    cache = cacheSet(cache, "b", "v", { ttlMs: 5000 }, NOW);
    cache = cacheSet(cache, "c", "v", {}, NOW);
    cache = evictExpired(cache, NOW + 2000);
    expect(cache.entries.has("a")).toBe(false);
    expect(cache.entries.has("b")).toBe(true);
    expect(cache.entries.has("c")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Invalidation
// ─────────────────────────────────────────────────────────────────────────────

describe("invalidateByTag", () => {
  it("removes entries with matching tag", () => {
    let cache = createCache<string>();
    cache = cacheSet(cache, "a", "v", { tags: ["billing"] }, NOW);
    cache = cacheSet(cache, "b", "v", { tags: ["auth"] }, NOW);
    cache = cacheSet(cache, "c", "v", { tags: ["billing", "auth"] }, NOW);
    cache = invalidateByTag(cache, "billing");
    expect(cache.entries.has("a")).toBe(false);
    expect(cache.entries.has("b")).toBe(true);
    expect(cache.entries.has("c")).toBe(false);
  });
});

describe("invalidateByScope", () => {
  it("removes entries with matching scope", () => {
    let cache = createCache<string>();
    cache = cacheSet(cache, "a", "v", { scope: "node" }, NOW);
    cache = cacheSet(cache, "b", "v", { scope: "global" }, NOW);
    cache = invalidateByScope(cache, "node");
    expect(cache.entries.has("a")).toBe(false);
    expect(cache.entries.has("b")).toBe(true);
  });
});

describe("invalidateByPrefix", () => {
  it("removes entries with matching key prefix", () => {
    let cache = createCache<string>();
    cache = cacheSet(cache, "node:n1:abc", "v", {}, NOW);
    cache = cacheSet(cache, "node:n2:def", "v", {}, NOW);
    cache = cacheSet(cache, "global:xyz", "v", {}, NOW);
    cache = invalidateByPrefix(cache, "node:n1");
    expect(cache.entries.has("node:n1:abc")).toBe(false);
    expect(cache.entries.has("node:n2:def")).toBe(true);
    expect(cache.entries.has("global:xyz")).toBe(true);
  });
});

describe("clearCache", () => {
  it("removes all entries", () => {
    let cache = createCache<string>();
    cache = cacheSet(cache, "a", "v", {}, NOW);
    cache = cacheSet(cache, "b", "v", {}, NOW);
    expect(clearCache(cache).entries.size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bulk Operations
// ─────────────────────────────────────────────────────────────────────────────

describe("getOrSet", () => {
  it("returns cached value on hit", () => {
    let cache = cacheSet(createCache<number>(), "k", 42, {}, NOW);
    let called = false;
    const { value, hit } = getOrSet(cache, "k", () => { called = true; return 99; }, {}, NOW);
    expect(hit).toBe(true);
    expect(value).toBe(42);
    expect(called).toBe(false);
  });

  it("computes and caches on miss", () => {
    const { value, hit, store } = getOrSet(createCache<number>(), "k", () => 99, {}, NOW);
    expect(hit).toBe(false);
    expect(value).toBe(99);
    expect(store.entries.has("k")).toBe(true);
  });
});

describe("cacheSetMany", () => {
  it("sets multiple entries", () => {
    const cache = cacheSetMany(createCache<number>(), [
      { key: "a", value: 1 },
      { key: "b", value: 2 },
    ], NOW);
    expect(cache.entries.size).toBe(2);
  });
});

describe("cacheGetMany", () => {
  it("gets multiple entries", () => {
    let cache = cacheSet(createCache<number>(), "a", 1, {}, NOW);
    cache = cacheSet(cache, "b", 2, {}, NOW);
    const { results } = cacheGetMany(cache, ["a", "b", "missing"], NOW);
    expect(results.a).toBe(1);
    expect(results.b).toBe(2);
    expect(results.missing).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────────────────────────────────────

describe("getCacheStats", () => {
  it("computes basic stats", () => {
    let cache = createCache<string>({ maxSize: 10 });
    cache = cacheSet(cache, "a", "v", { scope: "node", tags: ["t1"] }, NOW);
    cache = cacheSet(cache, "b", "v", { scope: "global", tags: ["t1", "t2"] }, NOW);
    cache = cacheGet(cache, "a", NOW).store; // hit
    cache = cacheGet(cache, "missing", NOW).store; // miss

    const stats = getCacheStats(cache, NOW);
    expect(stats.size).toBe(2);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(0.5);
    expect(stats.byScope.node).toBe(1);
    expect(stats.byScope.global).toBe(1);
    expect(stats.byTag.t1).toBe(2);
    expect(stats.byTag.t2).toBe(1);
  });

  it("counts expired entries", () => {
    let cache = createCache<string>();
    cache = cacheSet(cache, "a", "v", { ttlMs: 1000 }, NOW);
    const stats = getCacheStats(cache, NOW + 2000);
    expect(stats.expiredCount).toBe(1);
  });
});

describe("getCacheKeys", () => {
  it("returns all keys", () => {
    let cache = createCache<number>();
    cache = cacheSet(cache, "a", 1, {}, NOW);
    cache = cacheSet(cache, "b", 2, {}, NOW);
    expect(getCacheKeys(cache).sort()).toEqual(["a", "b"]);
  });
});
