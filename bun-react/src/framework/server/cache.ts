/**
 * ISR Cache Module
 * Hybrid cache with in-memory primary and disk backup
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

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
 * In-memory cache for fast access
 */
const memoryCache = new Map<string, CacheEntry>();

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
 * Get cache entry from memory or disk
 */
export const getFromCache = async (
  pathname: string
): Promise<CacheEntry | null> => {
  // Try memory cache first
  const memoryEntry = memoryCache.get(pathname);
  if (memoryEntry) {
    return memoryEntry;
  }

  // Try disk cache
  const cachePath = getCachePath(pathname);
  if (existsSync(cachePath)) {
    try {
      const file = Bun.file(cachePath);
      const entry: CacheEntry = await file.json();

      // Load into memory cache for faster future access
      memoryCache.set(pathname, entry);

      return entry;
    } catch (error) {
      console.warn(`Failed to read cache for ${pathname}:`, error);
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
  // Update memory cache
  memoryCache.set(pathname, entry);

  // Write to disk cache
  const cachePath = getCachePath(pathname);
  try {
    await mkdir(dirname(cachePath), { recursive: true });
    await Bun.write(cachePath, JSON.stringify(entry, null, 2));
  } catch (error) {
    console.warn(`Failed to write cache for ${pathname}:`, error);
    // Continue even if disk write fails - memory cache is still updated
  }
};

/**
 * Invalidate cache entry (remove from memory and disk)
 */
export const invalidateCache = async (pathname: string): Promise<void> => {
  // Remove from memory
  memoryCache.delete(pathname);

  // Remove from disk
  const cachePath = getCachePath(pathname);
  if (existsSync(cachePath)) {
    try {
      await Bun.file(cachePath).unlink();
    } catch (error) {
      console.warn(`Failed to delete cache for ${pathname}:`, error);
    }
  }
};
