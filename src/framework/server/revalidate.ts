/**
 * ISR Revalidation Module
 * Handles background regeneration of stale pages with concurrency control
 */

import { getPageConfig, hasPageConfig } from "~/framework/shared/page";
import { matchRoute } from "~/framework/shared/router";
import { invalidateCache, setCache } from "./cache";
import { renderRouteToString } from "./render";
import { getRouteTree } from "./routes";

/**
 * Simple logger that only logs in development
 */
const isDev = process.env.NODE_ENV !== "production";
const log = isDev ? console.log : () => {};
const logError = console.error; // Always log errors
const logWarn = console.warn; // Always log warnings

/**
 * Maximum number of concurrent revalidations
 */
const MAX_CONCURRENT = 3;

/**
 * Queue of paths waiting to be revalidated
 */
const revalidationQueue: string[] = [];

/**
 * Set of paths currently being revalidated
 */
const inProgress = new Set<string>();

/**
 * Process the revalidation queue
 */
const processQueue = async (): Promise<void> => {
  // Don't process if we're at capacity or queue is empty
  if (inProgress.size >= MAX_CONCURRENT || revalidationQueue.length === 0) {
    return;
  }

  // Get next path from queue
  const pathname = revalidationQueue.shift();
  if (!pathname) {
    return;
  }

  // Mark as in progress
  inProgress.add(pathname);
  log(
    `[ISR] 🔄 Starting background revalidation: ${pathname} | In progress: ${inProgress.size}/${MAX_CONCURRENT}`
  );

  try {
    await revalidatePathInternal(pathname);
  } catch (error) {
    logError(`[ISR] ❌ Failed to revalidate ${pathname}:`, error);
  } finally {
    // Remove from in-progress set
    inProgress.delete(pathname);
    log(
      `[ISR] ✅ Completed background revalidation: ${pathname} | Remaining in queue: ${revalidationQueue.length}`
    );
    // Process next item in queue
    processQueue();
  }
};

/**
 * Internal revalidation logic
 */
const revalidatePathInternal = async (pathname: string): Promise<void> => {
  log(`[ISR] 🔄 Revalidating: ${pathname}`);

  const routeTree = getRouteTree();
  const matchResult = matchRoute(pathname, routeTree.routes);

  if (!matchResult) {
    logWarn(`[ISR] ⚠️  No route found for ${pathname}, skipping revalidation`);
    return;
  }

  const { route: routeInfo, params } = matchResult;

  // Only revalidate static pages with revalidate configured
  if (routeInfo.pageType !== "static" || !routeInfo.revalidate) {
    logWarn(
      `[ISR] ⚠️  Route ${pathname} is not ISR-enabled (type: ${routeInfo.pageType}, revalidate: ${routeInfo.revalidate})`
    );
    return;
  }

  // Resolve import path
  const resolveImportPath = (importPath: string): string => {
    if (importPath.startsWith("~/")) {
      const pathWithoutAlias = importPath.slice(2);
      return `../../${pathWithoutAlias}`;
    }
    return importPath;
  };

  // Load page component to check for loader
  const resolvedPagePath = resolveImportPath(routeInfo.filePath);
  log(`[ISR] 📦 Loading module: ${resolvedPagePath}`);
  const pageModule = await import(resolvedPagePath);
  const PageComponent = pageModule.default;

  if (!PageComponent) {
    throw new Error(`No default export found in ${routeInfo.filePath}`);
  }

  // Load page data if loader exists
  let pageData: unknown;
  if (hasPageConfig(PageComponent)) {
    const config = getPageConfig(PageComponent);
    if (config.loader) {
      log(`[ISR] 📥 Loading data for revalidation: ${pathname}`, params);
      pageData = await config.loader(params);
      log(`[ISR] ✅ Data loaded for revalidation: ${pathname}`);
    }
  }

  // Render the page
  log(`[ISR] 🖼️  Rendering HTML for revalidation: ${pathname}`);
  const html = await renderRouteToString(routeInfo, pageData, params);
  log(
    `[ISR] ✅ HTML rendered for revalidation: ${pathname} (${Math.round(html.length / 1024)}KB)`
  );

  // Update cache
  await setCache(pathname, {
    html,
    generatedAt: Date.now(),
    revalidate: routeInfo.revalidate,
  });

  log(
    `[ISR] ✅ Revalidated and cached: ${pathname} | Revalidate: ${routeInfo.revalidate}s`
  );
};

/**
 * Queue a path for revalidation (non-blocking)
 */
export const queueRevalidation = (pathname: string): void => {
  // Skip if already in queue or in progress
  if (revalidationQueue.includes(pathname) || inProgress.has(pathname)) {
    log(
      `[ISR] ⏭️  Revalidation already queued/in-progress, skipping: ${pathname}`
    );
    return;
  }

  log(
    `[ISR] 📋 Queued for background revalidation: ${pathname} | Queue size: ${revalidationQueue.length + 1} | In progress: ${inProgress.size}`
  );
  revalidationQueue.push(pathname);
  // Trigger queue processing
  processQueue();
};

/**
 * Revalidate a path immediately (blocking)
 * Used for on-demand revalidation via API
 */
export const revalidatePath = async (pathname: string): Promise<boolean> => {
  try {
    log(`[ISR] 🚀 On-demand revalidation triggered: ${pathname}`);
    // Invalidate existing cache first
    await invalidateCache(pathname);
    log(`[ISR] 🗑️  Cache invalidated: ${pathname}`);

    // Revalidate immediately
    await revalidatePathInternal(pathname);
    log(`[ISR] ✅ On-demand revalidation completed: ${pathname}`);
    return true;
  } catch (error) {
    logError(`[ISR] ❌ Failed to revalidate ${pathname}:`, error);
    return false;
  }
};
