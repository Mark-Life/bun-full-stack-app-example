/**
 * ISR Cache Module
 * Hybrid cache with in-memory primary and disk backup
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Cache entry structure for page-level caching
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
 * Component cache entry structure for component-level caching
 */
export interface ComponentCacheEntry {
  /** Rendered HTML fragment */
  html: string;
  /** Timestamp when this entry was generated (milliseconds since epoch) */
  generatedAt: number;
  /** Cache configuration */
  stale?: number;
  revalidate?: number;
  expire?: number;
  /** Cache tag for invalidation */
  tag?: string;
}

/**
 * In-memory cache for fast access (page-level)
 */
const memoryCache = new Map<string, CacheEntry>();

/**
 * In-memory cache for component-level caching
 */
const componentMemoryCache = new Map<string, ComponentCacheEntry>();

/**
 * Map of tags to component cache keys (for tag-based invalidation)
 */
const tagToComponentKeys = new Map<string, Set<string>>();

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

/**
 * Generate cache key for a component with props
 * Uses hash of component ID + serialized props
 */
const generateComponentCacheKey = (
  componentId: string,
  props: Record<string, unknown> = {}
): string => {
  const propsStr = JSON.stringify(props, Object.keys(props).sort());
  const hash = createHash("sha256")
    .update(`${componentId}:${propsStr}`)
    .digest("hex");
  return `component:${hash}`;
};

/**
 * Get component cache file path
 * dist/cache/components/{hash}.json
 */
const getComponentCachePath = (cacheKey: string): string =>
  join(process.cwd(), "dist", "cache", "components", `${cacheKey}.json`);

/**
 * Check if a component cache entry is stale
 */
export const isComponentStale = (entry: ComponentCacheEntry): boolean => {
  if (!entry.stale) {
    return false;
  }
  const age = Date.now() - entry.generatedAt;
  return age > entry.stale * 1000;
};

/**
 * Check if a component cache entry is expired
 */
export const isComponentExpired = (entry: ComponentCacheEntry): boolean => {
  if (!entry.expire) {
    return false;
  }
  const age = Date.now() - entry.generatedAt;
  return age > entry.expire * 1000;
};

/**
 * Get component cache entry from memory or disk
 */
export const getComponentCache = async (
  componentId: string,
  props: Record<string, unknown> = {}
): Promise<ComponentCacheEntry | null> => {
  const cacheKey = generateComponentCacheKey(componentId, props);

  // Try memory cache first
  const memoryEntry = componentMemoryCache.get(cacheKey);
  if (memoryEntry) {
    return memoryEntry;
  }

  // Try disk cache
  const cachePath = getComponentCachePath(cacheKey);
  if (existsSync(cachePath)) {
    try {
      const file = Bun.file(cachePath);
      const entry: ComponentCacheEntry = await file.json();

      // Load into memory cache for faster future access
      componentMemoryCache.set(cacheKey, entry);

      // Update tag mapping
      if (entry.tag) {
        if (!tagToComponentKeys.has(entry.tag)) {
          tagToComponentKeys.set(entry.tag, new Set());
        }
        tagToComponentKeys.get(entry.tag)?.add(cacheKey);
      }

      return entry;
    } catch (error) {
      console.warn(`Failed to read component cache for ${componentId}:`, error);
      return null;
    }
  }

  return null;
};

/**
 * Set component cache entry in both memory and disk
 */
export const setComponentCache = async (
  componentId: string,
  props: Record<string, unknown>,
  entry: ComponentCacheEntry
): Promise<void> => {
  const cacheKey = generateComponentCacheKey(componentId, props);

  // Update memory cache
  componentMemoryCache.set(cacheKey, entry);

  // Update tag mapping
  if (entry.tag) {
    if (!tagToComponentKeys.has(entry.tag)) {
      tagToComponentKeys.set(entry.tag, new Set());
    }
    tagToComponentKeys.get(entry.tag)?.add(cacheKey);
  }

  // Write to disk cache
  const cachePath = getComponentCachePath(cacheKey);
  try {
    await mkdir(dirname(cachePath), { recursive: true });
    await Bun.write(cachePath, JSON.stringify(entry, null, 2));
  } catch (error) {
    console.warn(`Failed to write component cache for ${componentId}:`, error);
    // Continue even if disk write fails - memory cache is still updated
  }
};

/**
 * Invalidate component cache entry (remove from memory and disk)
 */
export const invalidateComponentCache = async (
  componentId: string,
  props: Record<string, unknown> = {}
): Promise<void> => {
  const cacheKey = generateComponentCacheKey(componentId, props);

  // Remove from memory
  const entry = componentMemoryCache.get(cacheKey);
  componentMemoryCache.delete(cacheKey);

  // Remove from tag mapping
  if (entry?.tag) {
    tagToComponentKeys.get(entry.tag)?.delete(cacheKey);
  }

  // Remove from disk
  const cachePath = getComponentCachePath(cacheKey);
  if (existsSync(cachePath)) {
    try {
      await Bun.file(cachePath).unlink();
    } catch (error) {
      console.warn(
        `Failed to delete component cache for ${componentId}:`,
        error
      );
    }
  }
};

/**
 * Invalidate all component caches with a given tag
 */
export const invalidateComponentCacheByTag = async (
  tag: string
): Promise<number> => {
  const componentKeys = tagToComponentKeys.get(tag);
  if (!componentKeys || componentKeys.size === 0) {
    return 0;
  }

  let invalidated = 0;
  for (const cacheKey of componentKeys) {
    // Extract componentId from cache key (component:hash)
    // We need to find all entries with this tag and invalidate them
    const entry = componentMemoryCache.get(cacheKey);
    if (entry?.tag === tag) {
      componentMemoryCache.delete(cacheKey);
      invalidated++;
    }

    // Remove from disk
    const cachePath = getComponentCachePath(cacheKey);
    if (existsSync(cachePath)) {
      try {
        await Bun.file(cachePath).unlink();
      } catch (error) {
        console.warn(`Failed to delete component cache ${cacheKey}:`, error);
      }
    }
  }

  // Clear tag mapping
  tagToComponentKeys.delete(tag);

  return invalidated;
};
