/**
 * Client-side data fetching for route navigation
 * Fetches navigation payloads from /__data/* endpoints
 */

import type { NavigationPayload } from "~/framework/shared/navigation-payload";
import { preloadChunks } from "./preload-chunks";

/**
 * Custom error types for route data fetching
 */
export class RouteDataFetchError extends Error {
  status: number;
  path: string;

  constructor(message: string, status: number, path: string) {
    super(message);
    this.name = "RouteDataFetchError";
    this.status = status;
    this.path = path;
  }
}

export class RouteNotFoundError extends Error {
  path: string;

  constructor(path: string) {
    super(`Route not found: ${path}`);
    this.name = "RouteNotFoundError";
    this.path = path;
  }
}

export class RouteRedirectError extends Error {
  redirectUrl: string;

  constructor(redirectUrl: string) {
    super(`Redirect to: ${redirectUrl}`);
    this.name = "RouteRedirectError";
    this.redirectUrl = redirectUrl;
  }
}

/**
 * Map to track in-flight requests for deduplication
 */
const inFlightRequests = new Map<string, Promise<NavigationPayload>>();

/**
 * Cache entry with timestamp for TTL
 */
interface CacheEntry {
  payload: NavigationPayload;
  timestamp: number;
}

/**
 * Prefetch cache for storing prefetched route data
 * Key: normalized path, Value: cache entry with timestamp
 */
const prefetchCache = new Map<string, CacheEntry>();

/**
 * Cache TTL in milliseconds (30 seconds)
 */
const CACHE_TTL = 30 * 1000;

// Regex for trailing slash (defined at top level for performance)
const TRAILING_SLASH_REGEX = /\/$/;

/**
 * Normalize a path for consistent caching
 */
const normalizePath = (path: string): string =>
  path === "/" ? "/" : path.replace(TRAILING_SLASH_REGEX, "") || "/";

/**
 * Check if cache entry is still valid (not expired)
 */
const isCacheValid = (entry: CacheEntry): boolean => {
  const now = Date.now();
  return now - entry.timestamp < CACHE_TTL;
};

/**
 * Get cached route data if available and valid
 *
 * @param path - Route path to get cached data for
 * @returns Cached payload or null if not cached or expired
 */
export const getCachedData = (path: string): NavigationPayload | null => {
  const normalizedPath = normalizePath(path);
  const entry = prefetchCache.get(normalizedPath);

  if (!entry) {
    return null;
  }

  if (!isCacheValid(entry)) {
    prefetchCache.delete(normalizedPath);
    return null;
  }

  return entry.payload;
};

/**
 * Prefetch route data and cache it
 * Does not throw errors for redirect/notFound (silently caches them)
 *
 * @param path - Route path to prefetch
 */
export const prefetchRouteData = (path: string): void => {
  const normalizedPath = normalizePath(path);

  // Skip if already cached and valid
  const cached = getCachedData(normalizedPath);
  if (cached) {
    return;
  }

  // Skip if already in flight
  if (inFlightRequests.has(normalizedPath)) {
    return;
  }

  // Skip if data-saver mode is enabled
  if (typeof navigator !== "undefined") {
    const connection = (navigator as { connection?: { saveData?: boolean } })
      .connection;
    if (connection?.saveData === true) {
      return;
    }
  }

  const dataUrl = `/__data${normalizedPath}`;

  // Create prefetch request (fire and forget)
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  (async () => {
    try {
      const response = await fetch(dataUrl, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as NavigationPayload;

      // Preload chunks for faster navigation
      preloadChunks(payload.chunks);

      // Cache payload even if it's a redirect or notFound
      // This allows us to handle them faster when navigating
      prefetchCache.set(normalizedPath, {
        payload,
        timestamp: Date.now(),
      });
    } catch {
      // Silently ignore prefetch errors
    } finally {
      // Remove from in-flight map when done
      inFlightRequests.delete(normalizedPath);
    }
  })();
};

/**
 * Fetch route data from /__data/* endpoint
 * Includes request deduplication and cache checking
 *
 * @param path - Route path to fetch data for
 * @returns Navigation payload or throws error
 */
export const fetchRouteData = (path: string): Promise<NavigationPayload> => {
  const normalizedPath = normalizePath(path);

  // Check cache first
  const cached = getCachedData(normalizedPath);
  if (cached) {
    // Return cached data as resolved promise
    return Promise.resolve(cached);
  }

  const dataUrl = `/__data${normalizedPath}`;

  // Check if request is already in flight
  const existingRequest = inFlightRequests.get(normalizedPath);
  if (existingRequest) {
    return existingRequest;
  }

  // Create new request
  const requestPromise = (async () => {
    try {
      const response = await fetch(dataUrl, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new RouteDataFetchError(
          `Failed to fetch route data: ${response.statusText}`,
          response.status,
          normalizedPath
        );
      }

      const payload = (await response.json()) as NavigationPayload;

      // Cache successful responses
      prefetchCache.set(normalizedPath, {
        payload,
        timestamp: Date.now(),
      });

      // Handle redirect
      if (payload.redirect) {
        throw new RouteRedirectError(payload.redirect);
      }

      // Handle not found
      if (payload.notFound) {
        throw new RouteNotFoundError(normalizedPath);
      }

      return payload;
    } finally {
      // Remove from in-flight map when done
      inFlightRequests.delete(normalizedPath);
    }
  })();

  // Store in-flight request
  inFlightRequests.set(normalizedPath, requestPromise);

  return requestPromise;
};
