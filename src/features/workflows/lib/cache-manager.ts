/**
 * Phase 86 — Workflow Cache Manager
 * Pure utilities for caching workflow node results with TTL,
 * key generation, invalidation strategies, and eviction policies.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type EvictionPolicy = "lru" | "lfu" | "ttl" | "fifo";
export type CacheScope = "node" | "workflow" | "global" | "user";

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  scope: CacheScope;
  createdAt: number;
  expiresAt: number | null;   // null = no expiry
  lastAccessedAt: number;
  accessCount: number;
  tags: string[];
  sizeBytes?: number;
}

export interface CacheStore<T = unknown> {
  entries: Map<string, CacheEntry<T>>;
  maxSize: number;            // max number of entries
  evictionPolicy: EvictionPolicy;
  hits: number;
  misses: number;
  evictions: number;
}

export interface CacheConfig {
  maxSize?: number;
  evictionPolicy?: EvictionPolicy;
  defaultTtlMs?: number;
  scope?: CacheScope;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
  expiredCount: number;
  byScope: Record<CacheScope, number>;
  byTag: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache Store Creation
// ─────────────────────────────────────────────────────────────────────────────

export function createCache<T>(config: CacheConfig = {}): CacheStore<T> {
  return {
    entries: new Map(),
    maxSize: config.maxSize ?? 1000,
    evictionPolicy: config.evictionPolicy ?? "lru",
    hits: 0,
    misses: 0,
    evictions: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Key Generation
// ─────────────────────────────────────────────────────────────────────────────

export function makeCacheKey(
  prefix: string,
  ...parts: Array<string | number | boolean | null | undefined>
): string {
  return [prefix, ...parts.map((p) => (p === null || p === undefined ? "_null_" : String(p)))].join(":");
}

export function makeNodeCacheKey(
  nodeId: string,
  inputHash: string
): string {
  return makeCacheKey("node", nodeId, inputHash);
}

/**
 * Simple deterministic hash of an object for use as cache key.
 * Not cryptographic — just for cache keying.
 */
export function hashInput(input: unknown): string {
  const json = JSON.stringify(input, Object.keys(input as object ?? {}).sort());
  let hash = 5381;
  for (let i = 0; i < json.length; i++) {
    hash = ((hash << 5) + hash) + json.charCodeAt(i);
    hash = hash & hash; // to 32-bit int
  }
  return `h${Math.abs(hash).toString(16)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache Operations (Immutable returns)
// ─────────────────────────────────────────────────────────────────────────────

function cloneStore<T>(store: CacheStore<T>): CacheStore<T> {
  return {
    ...store,
    entries: new Map(store.entries),
  };
}

export function cacheSet<T>(
  store: CacheStore<T>,
  key: string,
  value: T,
  options: {
    ttlMs?: number | null;
    scope?: CacheScope;
    tags?: string[];
    sizeBytes?: number;
  } = {},
  now = Date.now()
): CacheStore<T> {
  const next = cloneStore(store);
  const expiresAt = options.ttlMs != null ? now + options.ttlMs : null;

  // Evict if at capacity and key is new
  if (!next.entries.has(key) && next.entries.size >= next.maxSize) {
    const evictedKey = selectEviction(next, now);
    if (evictedKey) {
      next.entries.delete(evictedKey);
      next.evictions++;
    }
  }

  next.entries.set(key, {
    key,
    value,
    scope: options.scope ?? "global",
    createdAt: now,
    expiresAt,
    lastAccessedAt: now,
    accessCount: 0,
    tags: options.tags ?? [],
    sizeBytes: options.sizeBytes,
  });

  return next;
}

export function cacheGet<T>(
  store: CacheStore<T>,
  key: string,
  now = Date.now()
): { store: CacheStore<T>; value: T | undefined; hit: boolean } {
  const entry = store.entries.get(key);

  // Check expiry
  if (!entry || (entry.expiresAt !== null && now >= entry.expiresAt)) {
    const next = { ...store, misses: store.misses + 1 };
    if (entry) {
      // Remove expired entry
      next.entries = new Map(store.entries);
      next.entries.delete(key);
    }
    return { store: next, value: undefined, hit: false };
  }

  // Hit — update access metadata
  const next = cloneStore(store);
  next.hits++;
  next.entries.set(key, {
    ...entry,
    lastAccessedAt: now,
    accessCount: entry.accessCount + 1,
  });

  return { store: next, value: entry.value, hit: true };
}

export function cacheHas<T>(
  store: CacheStore<T>,
  key: string,
  now = Date.now()
): boolean {
  const entry = store.entries.get(key);
  if (!entry) return false;
  if (entry.expiresAt !== null && now >= entry.expiresAt) return false;
  return true;
}

export function cacheDelete<T>(store: CacheStore<T>, key: string): CacheStore<T> {
  const next = cloneStore(store);
  next.entries.delete(key);
  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// Eviction
// ─────────────────────────────────────────────────────────────────────────────

function selectEviction<T>(store: CacheStore<T>, now: number): string | undefined {
  const entries = [...store.entries.values()];
  if (entries.length === 0) return undefined;

  switch (store.evictionPolicy) {
    case "lru":
      return entries.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)[0].key;
    case "lfu":
      return entries.sort((a, b) => a.accessCount - b.accessCount)[0].key;
    case "ttl": {
      // Evict entry expiring soonest (or oldest if no expiry)
      const expiring = entries.filter((e) => e.expiresAt !== null);
      if (expiring.length > 0) {
        return expiring.sort((a, b) => (a.expiresAt ?? 0) - (b.expiresAt ?? 0))[0].key;
      }
      return entries.sort((a, b) => a.createdAt - b.createdAt)[0].key;
    }
    case "fifo":
      return entries.sort((a, b) => a.createdAt - b.createdAt)[0].key;
  }
}

export function evictExpired<T>(store: CacheStore<T>, now = Date.now()): CacheStore<T> {
  const next = cloneStore(store);
  let evictions = 0;
  for (const [key, entry] of next.entries) {
    if (entry.expiresAt !== null && now >= entry.expiresAt) {
      next.entries.delete(key);
      evictions++;
    }
  }
  return { ...next, evictions: next.evictions + evictions };
}

// ─────────────────────────────────────────────────────────────────────────────
// Invalidation
// ─────────────────────────────────────────────────────────────────────────────

export function invalidateByTag<T>(store: CacheStore<T>, tag: string): CacheStore<T> {
  const next = cloneStore(store);
  for (const [key, entry] of next.entries) {
    if (entry.tags.includes(tag)) next.entries.delete(key);
  }
  return next;
}

export function invalidateByScope<T>(store: CacheStore<T>, scope: CacheScope): CacheStore<T> {
  const next = cloneStore(store);
  for (const [key, entry] of next.entries) {
    if (entry.scope === scope) next.entries.delete(key);
  }
  return next;
}

export function invalidateByPrefix<T>(store: CacheStore<T>, prefix: string): CacheStore<T> {
  const next = cloneStore(store);
  for (const key of next.entries.keys()) {
    if (key.startsWith(prefix)) next.entries.delete(key);
  }
  return next;
}

export function clearCache<T>(store: CacheStore<T>): CacheStore<T> {
  return { ...store, entries: new Map() };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk Operations
// ─────────────────────────────────────────────────────────────────────────────

export function getOrSet<T>(
  store: CacheStore<T>,
  key: string,
  compute: () => T,
  options: { ttlMs?: number | null; scope?: CacheScope; tags?: string[] } = {},
  now = Date.now()
): { store: CacheStore<T>; value: T; hit: boolean } {
  const { store: afterGet, value, hit } = cacheGet(store, key, now);
  if (hit && value !== undefined) {
    return { store: afterGet, value, hit: true };
  }
  const computed = compute();
  const afterSet = cacheSet(afterGet, key, computed, options, now);
  return { store: afterSet, value: computed, hit: false };
}

export function cacheSetMany<T>(
  store: CacheStore<T>,
  entries: Array<{ key: string; value: T; ttlMs?: number | null; tags?: string[] }>,
  now = Date.now()
): CacheStore<T> {
  let current = store;
  for (const e of entries) {
    current = cacheSet(current, e.key, e.value, { ttlMs: e.ttlMs, tags: e.tags }, now);
  }
  return current;
}

export function cacheGetMany<T>(
  store: CacheStore<T>,
  keys: string[],
  now = Date.now()
): { store: CacheStore<T>; results: Record<string, T | undefined> } {
  let current = store;
  const results: Record<string, T | undefined> = {};
  for (const key of keys) {
    const { store: next, value } = cacheGet(current, key, now);
    current = next;
    results[key] = value;
  }
  return { store: current, results };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────────────────────────────────────

export function getCacheStats<T>(store: CacheStore<T>, now = Date.now()): CacheStats {
  const byScope: Record<CacheScope, number> = { node: 0, workflow: 0, global: 0, user: 0 };
  const byTag: Record<string, number> = {};
  let expiredCount = 0;

  for (const entry of store.entries.values()) {
    byScope[entry.scope]++;
    if (entry.expiresAt !== null && now >= entry.expiresAt) expiredCount++;
    for (const tag of entry.tags) {
      byTag[tag] = (byTag[tag] ?? 0) + 1;
    }
  }

  const total = store.hits + store.misses;
  return {
    size: store.entries.size,
    maxSize: store.maxSize,
    hits: store.hits,
    misses: store.misses,
    evictions: store.evictions,
    hitRate: total === 0 ? 0 : store.hits / total,
    expiredCount,
    byScope,
    byTag,
  };
}

export function getCacheKeys<T>(store: CacheStore<T>): string[] {
  return [...store.entries.keys()];
}
