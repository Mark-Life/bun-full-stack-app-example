/**
 * ISR Cache Module
 * Hybrid cache with in-memory primary and disk backup
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Simple logger - always log warnings
 */
const logWarn = console.warn;

/**
 * Cache entry structure
 */
export interface CacheEntry {
  /** Rendered HTML content */
  html: string;
  /** Timestamp when this entry was generated (milliseconds since epoch) */
  generatedAt: number;
  /** Revalidation interval in seconds */
  revalidate: number;
}

/**
 * Maximum number of cache entries in memory (configurable via env)
 */
const MAX_CACHE_ENTRIES = Number.parseInt(
  process.env["MAX_CACHE_ENTRIES"] || "100",
  10
);

/**
 * In-memory cache for fast access
 */
const memoryCache = new Map<string, CacheEntry>();

/**
 * Track access order for LRU eviction (oldest first)
 */
const accessOrder: string[] = [];

/**
 * Evict oldest entries if cache exceeds max size
 */
const evictIfNeeded = (): void => {
  while (memoryCache.size >= MAX_CACHE_ENTRIES && accessOrder.length > 0) {
    const oldest = accessOrder.shift();
    if (oldest) {
      memoryCache.delete(oldest);
    }
  }
};

/**
 * Get cache file path for a given pathname
 * dist/cache/{path}/page.json
 * Example: /products/123 -> dist/cache/products/123/page.json
 * Example: / -> dist/cache/index/page.json
 */
const getCachePath = (pathname: string): string => {
  const normalizedPath = pathname === "/" ? "index" : pathname.slice(1);
  return join(process.cwd(), "dist", "cache", normalizedPath, "page.json");
};

/**
 * Check if a cache entry is stale
 */
export const isStale = (entry: CacheEntry): boolean => {
  const age = Date.now() - entry.generatedAt;
  return age > entry.revalidate * 1000;
};

/**
 * Get cache age in seconds
 */
export const getCacheAge = (entry: CacheEntry): number =>
  Math.floor((Date.now() - entry.generatedAt) / 1000);

/**
 * Format cache age for logging
 */
export const formatCacheAge = (entry: CacheEntry): string => {
  const ageSeconds = getCacheAge(entry);
  const revalidateSeconds = entry.revalidate;
  const ageMinutes = Math.floor(ageSeconds / 60);
  const revalidateMinutes = Math.floor(revalidateSeconds / 60);

  if (ageSeconds < 60) {
    return `${ageSeconds}s / ${revalidateSeconds}s`;
  }
  if (revalidateSeconds < 3600) {
    return `${ageMinutes}m / ${revalidateMinutes}m`;
  }
  const ageHours = Math.floor(ageMinutes / 60);
  const revalidateHours = Math.floor(revalidateMinutes / 60);
  return `${ageHours}h ${ageMinutes % 60}m / ${revalidateHours}h ${revalidateMinutes % 60}m`;
};

/**
 * Get cache entry from memory or disk
 */
export const getFromCache = async (
  pathname: string
): Promise<CacheEntry | null> => {
  // Try memory cache first
  const memoryEntry = memoryCache.get(pathname);
  if (memoryEntry) {
    // Update access order (move to end = most recently used)
    const index = accessOrder.indexOf(pathname);
    if (index !== -1) {
      accessOrder.splice(index, 1);
    }
    accessOrder.push(pathname);
    return memoryEntry;
  }

  // Try disk cache
  const cachePath = getCachePath(pathname);
  if (existsSync(cachePath)) {
    try {
      const file = Bun.file(cachePath);
      const entry: CacheEntry = await file.json();

      // Evict if needed before adding new entry
      evictIfNeeded();

      // Load into memory cache for faster future access
      memoryCache.set(pathname, entry);
      accessOrder.push(pathname);

      return entry;
    } catch (error) {
      logWarn(`Failed to read cache for ${pathname}:`, error);
      return null;
    }
  }

  return null;
};

/**
 * Set cache entry in both memory and disk
 */
export const setCache = async (
  pathname: string,
  entry: CacheEntry
): Promise<void> => {
  // Evict if needed before adding new entry
  evictIfNeeded();

  // Update memory cache
  const wasExisting = memoryCache.has(pathname);
  memoryCache.set(pathname, entry);

  // Update access order
  if (wasExisting) {
    // Move to end if already exists (most recently used)
    const index = accessOrder.indexOf(pathname);
    if (index !== -1) {
      accessOrder.splice(index, 1);
    }
  }
  accessOrder.push(pathname);

  // Write to disk cache
  const cachePath = getCachePath(pathname);
  try {
    await mkdir(dirname(cachePath), { recursive: true });
    await Bun.write(cachePath, JSON.stringify(entry, null, 2));
  } catch (error) {
    logWarn(`Failed to write cache for ${pathname}:`, error);
    // Continue even if disk write fails - memory cache is still updated
  }
};

/**
 * Invalidate cache entry (remove from memory and disk)
 */
export const invalidateCache = async (pathname: string): Promise<void> => {
  // Remove from memory
  memoryCache.delete(pathname);

  // Remove from access order
  const index = accessOrder.indexOf(pathname);
  if (index !== -1) {
    accessOrder.splice(index, 1);
  }

  // Remove from disk
  const cachePath = getCachePath(pathname);
  if (existsSync(cachePath)) {
    try {
      await Bun.file(cachePath).unlink();
    } catch (error) {
      logWarn(`Failed to delete cache for ${pathname}:`, error);
    }
  }
};
