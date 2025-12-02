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

  try {
    await revalidatePathInternal(pathname);
  } catch (error) {
    console.error(`Failed to revalidate ${pathname}:`, error);
  } finally {
    // Remove from in-progress set
    inProgress.delete(pathname);
    // Process next item in queue
    processQueue();
  }
};

/**
 * Internal revalidation logic
 */
const revalidatePathInternal = async (pathname: string): Promise<void> => {
  const routeTree = getRouteTree();
  const matchResult = matchRoute(pathname, routeTree.routes);

  if (!matchResult) {
    console.warn(`No route found for ${pathname}, skipping revalidation`);
    return;
  }

  const { route: routeInfo, params } = matchResult;

  // Only revalidate static pages with revalidate configured
  if (routeInfo.pageType !== "static" || !routeInfo.revalidate) {
    console.warn(
      `Route ${pathname} is not ISR-enabled (type: ${routeInfo.pageType}, revalidate: ${routeInfo.revalidate})`
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
      pageData = await config.loader(params);
    }
  }

  // Render the page
  const html = await renderRouteToString(routeInfo, pageData, params);

  // Update cache
  await setCache(pathname, {
    html,
    generatedAt: Date.now(),
    revalidate: routeInfo.revalidate,
  });

  console.log(`✅ Revalidated: ${pathname}`);
};

/**
 * Queue a path for revalidation (non-blocking)
 */
export const queueRevalidation = (pathname: string): void => {
  // Skip if already in queue or in progress
  if (revalidationQueue.includes(pathname) || inProgress.has(pathname)) {
    return;
  }

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
    // Invalidate existing cache first
    await invalidateCache(pathname);

    // Revalidate immediately
    await revalidatePathInternal(pathname);
    return true;
  } catch (error) {
    console.error(`Failed to revalidate ${pathname}:`, error);
    return false;
  }
};
