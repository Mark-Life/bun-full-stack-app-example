import { existsSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToReadableStream, renderToString } from "react-dom/server";
import type { RouteInfo } from "@/framework/shared/router";
import {
  buildRSCPayload,
  clearCachedOutputRegistry,
} from "~/framework/shared/cache";
import { getPageConfig, hasPageConfig } from "~/framework/shared/page";
import { SSRRoutePathProvider } from "~/framework/shared/route-context";
import { serializePayload } from "~/framework/shared/serialize";

/**
 * Resolve import path, converting ~/ alias to actual file path
 * ~/ maps to ./src/ relative to project root
 * Since we're in framework/server/, we need to go up to src/
 */
const resolveImportPath = (importPath: string): string => {
  if (importPath.startsWith("~/")) {
    // Convert ~/app/page.tsx to ../../app/page.tsx (from framework/server/ to src/)
    const pathWithoutAlias = importPath.slice(2); // Remove ~/
    return `../../${pathWithoutAlias}`;
  }
  return importPath;
};

/**
 * Lazy-load route modules registry (handles case where file doesn't exist yet)
 */
let routeModulesCache: Map<string, { default: unknown }> | null = null;
let layoutModulesCache: Map<string, { default: unknown }> | null = null;

/**
 * Clear module caches - call this when routes are reloaded
 * This ensures fresh modules are loaded after changes
 */
export const clearModuleCache = (): void => {
  routeModulesCache = null;
  layoutModulesCache = null;
};

const getRouteModules = async (): Promise<
  Map<string, { default: unknown }>
> => {
  if (routeModulesCache) {
    return routeModulesCache;
  }
  try {
    const module = await import("./route-modules.generated");
    routeModulesCache = module.routeModules;
    layoutModulesCache = module.layoutModules;
    return routeModulesCache;
  } catch {
    // File doesn't exist yet - return empty map, fallback to dynamic import
    return new Map();
  }
};

const getLayoutModules = async (): Promise<
  Map<string, { default: unknown }>
> => {
  if (layoutModulesCache) {
    return layoutModulesCache;
  }
  await getRouteModules(); // This will populate both caches
  return layoutModulesCache || new Map();
};

/**
 * Get route module from registry, fallback to dynamic import for newly created files
 * This handles the brief window between file creation and registry regeneration
 */
const getRouteModule = async (
  filePath: string
): Promise<{ default: unknown }> => {
  // Try static registry first (Bun --hot tracks these)
  const routeModules = await getRouteModules();
  const cached = routeModules.get(filePath);
  if (cached) {
    return cached;
  }

  // Fallback for newly created files not yet in registry
  console.log(`[HMR] Dynamic import fallback for: ${filePath}`);
  const resolvedPath = resolveImportPath(filePath);
  return await import(resolvedPath);
};

/**
 * Get layout module from registry, fallback to dynamic import for newly created files
 */
const getLayoutModule = async (
  layoutPath: string
): Promise<{ default: unknown }> => {
  const layoutModules = await getLayoutModules();
  const cached = layoutModules.get(layoutPath);
  if (cached) {
    return cached;
  }

  // Fallback for newly created files not yet in registry
  console.log(`[HMR] Dynamic import fallback for layout: ${layoutPath}`);
  const resolvedPath = resolveImportPath(layoutPath);
  return await import(resolvedPath);
};

/**
 * HMR client script (dev mode only)
 */
const getHmrScript = (): string => {
  if (process.env.NODE_ENV === "production") {
    return "";
  }
  return `
    <script>
      (function() {
        if (typeof window === 'undefined') return;
        
        let ws;
        let reconnectTimeout;
        let wasConnected = false;
        
        const connectHMR = () => {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          ws = new WebSocket(protocol + '//' + window.location.host + '/hmr');
          
          ws.onopen = () => {
            console.log('[HMR] Connected');
            if (reconnectTimeout) {
              clearTimeout(reconnectTimeout);
              reconnectTimeout = null;
            }
            // If we were connected before, server restarted - reload page
            if (wasConnected) {
              console.log('[HMR] Server restarted, reloading...');
              window.location.reload();
              return;
            }
            wasConnected = true;
          };
          
          ws.onmessage = (event) => {
            try {
              const message = JSON.parse(event.data);
              if (message.type === 'hmr-update') {
                console.log('[HMR] File changed:', message.file);
                
                // Hot-swap CSS files without page reload
                if (message.file.endsWith('.css')) {
                  const links = document.querySelectorAll('link[rel="stylesheet"]');
                  links.forEach(link => {
                    const href = link.getAttribute('href');
                    if (href) {
                      const newHref = href.split('?')[0] + '?t=' + Date.now();
                      link.setAttribute('href', newHref);
                    }
                  });
                } else {
                  // Reload page for JS/TS/route changes
                  window.location.reload();
                }
              }
            } catch (e) {
              // Ignore non-JSON messages
            }
          };
          
          ws.onerror = (error) => {
            console.error('[HMR] WebSocket error:', error);
          };
          
          ws.onclose = () => {
            console.log('[HMR] Disconnected, reconnecting...');
            reconnectTimeout = setTimeout(() => {
              connectHMR();
            }, 1000);
          };
        };
        
        connectHMR();
      })();
    </script>`;
};

/**
 * Check if a route has any client components (page, layouts, or imported)
 *
 * Returns true if:
 * - The page itself is a client component ("use client")
 * - Any layout is a client component
 * - The page imports any client components (client boundaries)
 */
export const hasClientComponents = (routeInfo: RouteInfo): boolean => {
  // Check if page is a client component
  if (routeInfo.isClientComponent) {
    return true;
  }

  // Check if any layout is a client component
  if (routeInfo.layoutTypes.some((type) => type === "client")) {
    return true;
  }

  // Check if page imports any client components (has client boundaries)
  if (routeInfo.hasClientBoundaries) {
    return true;
  }

  // Return false for pure server component pages with no client imports
  return false;
};

/**
 * Load layouts for a route
 */
const loadLayouts = async (
  routeInfo: RouteInfo
): Promise<
  Array<{
    component: React.ComponentType<Record<string, unknown>>;
    props?: Record<string, unknown>;
  }>
> => {
  const layouts: Array<{
    component: React.ComponentType<Record<string, unknown>>;
    props?: Record<string, unknown>;
  }> = [];

  // Add parent layouts first (root to direct parent)
  for (const layoutPath of routeInfo.parentLayouts) {
    try {
      const layoutModule = await getLayoutModule(layoutPath);
      const LayoutComponent = layoutModule.default as
        | React.ComponentType<Record<string, unknown>>
        | undefined;
      if (LayoutComponent) {
        layouts.push({ component: LayoutComponent });
      }
    } catch (error) {
      console.warn(`Failed to load layout ${layoutPath}:`, error);
    }
  }

  // Add direct layout last (closest to the page)
  if (routeInfo.layoutPath) {
    try {
      const layoutModule = await getLayoutModule(routeInfo.layoutPath);
      const LayoutComponent = layoutModule.default as
        | React.ComponentType<Record<string, unknown>>
        | undefined;
      if (LayoutComponent) {
        layouts.push({ component: LayoutComponent });
      }
    } catch (error) {
      console.warn(`Failed to load layout ${routeInfo.layoutPath}:`, error);
    }
  }

  return layouts;
};

/**
 * Build component tree with layouts
 * Wraps the tree with SSRRoutePathProvider so client components can access
 * the current route path during server-side rendering (prevents hydration flash)
 */
const buildComponentTree = (
  PageComponent: React.ComponentType<Record<string, unknown>>,
  pageProps: Record<string, unknown>,
  layouts: Array<{
    component: React.ComponentType<Record<string, unknown>>;
    props?: Record<string, unknown>;
  }>,
  options: { routePath: string; needsHydration: boolean; pageData?: unknown }
): React.ReactElement => {
  let component: React.ReactElement = React.createElement(
    PageComponent,
    pageProps
  );
  for (let i = layouts.length - 1; i >= 0; i--) {
    const layout = layouts[i];
    if (layout) {
      const props =
        i === 0
          ? {
              ...layout.props,
              routePath: options.routePath,
              hasClientComponents: options.needsHydration,
              ...(options.pageData !== undefined && {
                pageData: options.pageData,
              }),
            }
          : layout.props || {};
      component = React.createElement(layout.component, props, component);
    }
  }

  // Wrap with SSRRoutePathProvider so client components can access
  // the current route path during SSR (before hydration completes)
  return React.createElement(
    SSRRoutePathProvider,
    { routePath: options.routePath } as React.ComponentProps<
      typeof SSRRoutePathProvider
    >,
    component
  );
};

/**
 * Create stream error handler
 */
const createStreamErrorHandler = (): ((error: unknown) => void) => {
  return (error: unknown) => {
    // Ignore abort/close errors - these are normal when clients disconnect or navigate away
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (
        msg.includes("aborted") ||
        msg.includes("abort") ||
        msg.includes("closed") ||
        msg.includes("cancelled") ||
        msg.includes("canceled") ||
        error.name === "AbortError"
      ) {
        // Client disconnected or navigated away - this is expected, don't log as error
        return;
      }
    }
    // Log actual errors
    console.error("Error during Suspense streaming:", error);
    // Let React handle error boundaries
  };
};

/**
 * Check if an error is a stream cancellation error (user navigated away)
 */
const isStreamCancelError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  const msg = error.message.toLowerCase();
  return (
    msg.includes("closed") ||
    msg.includes("cancelled") ||
    msg.includes("canceled") ||
    msg.includes("aborted")
  );
};

/**
 * Safely close a stream controller
 */
const safeCloseController = (
  controller: ReadableStreamDefaultController<Uint8Array>
): void => {
  try {
    controller.close();
  } catch {
    // Controller may already be closed
  }
};

/**
 * Get shell HTML path for a route
 */
const getShellPath = (pathname: string): string => {
  const normalizedPath = pathname === "/" ? "index" : pathname.slice(1);
  return join(process.cwd(), "dist", "shells", normalizedPath, "index.html");
};

/**
 * Check if shell exists for a route
 */
export const hasShell = (pathname: string): boolean => {
  const shellPath = getShellPath(pathname);
  return existsSync(shellPath);
};

/**
 * Load shell HTML for a route
 */
export const loadShell = async (pathname: string): Promise<string | null> => {
  const shellPath = getShellPath(pathname);
  if (!existsSync(shellPath)) {
    return null;
  }

  try {
    const file = Bun.file(shellPath);
    return await file.text();
  } catch (error) {
    console.warn(`Failed to load shell for ${pathname}:`, error);
    return null;
  }
};

/**
 * Create a composite stream that stitches shell HTML with dynamic stream
 * Used for PPR where static shell is pre-rendered and dynamic parts stream in
 *
 * React's streaming format works by:
 * 1. Sending initial HTML (shell with fallbacks)
 * 2. Then sending replacement chunks: <template id="B:X">content</template><script>$RC("B:X")</script>
 *
 * Since we already have the shell, we:
 * 1. Send the shell HTML
 * 2. Append only the Suspense replacement chunks from dynamicStream
 * 3. React's hydration will handle replacing fallbacks with resolved content
 *
 * @param shellHtml - Pre-rendered shell HTML (with Suspense fallbacks)
 * @param dynamicStream - React stream containing only Suspense boundary replacements
 * @returns Composite stream
 */
export const compositeStream = (
  shellHtml: string,
  dynamicStream: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  let shellSent = false;
  const reader = dynamicStream.getReader();

  return new ReadableStream({
    async pull(controller) {
      // Send shell first (contains fallback UI)
      if (!shellSent) {
        controller.enqueue(encoder.encode(shellHtml));
        shellSent = true;
        return; // Return to allow streaming to continue
      }

      // Then stream dynamic content (Suspense replacements)
      // renderDynamicParts already filters to only Suspense boundary chunks
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },

    cancel() {
      reader.cancel();
    },
  });
};

/**
 * Create a stream that actively consumes React's stream and forwards chunks
 * This ensures React continues processing Suspense boundaries
 * Also handles cancellation gracefully when user navigates away
 *
 * @param reactStream - The stream from renderToReadableStream
 * @param abortController - AbortController to signal React to stop processing
 */
const createActiveStream = (
  reactStream: ReadableStream<Uint8Array>,
  abortController: AbortController
): ReadableStream<Uint8Array> => {
  const reader = reactStream.getReader();
  let cancelled = false;

  const handlePullError = (
    error: unknown,
    controller: ReadableStreamDefaultController<Uint8Array>
  ): void => {
    if (cancelled) {
      return;
    }

    if (isStreamCancelError(error)) {
      safeCloseController(controller);
    } else {
      controller.error(error);
    }
  };

  const handleCancel = async (_reason: unknown): Promise<void> => {
    cancelled = true;
    // Signal React to abort - this is the key to preventing the error
    // React will clean up its internal state properly when aborted
    abortController.abort();
    try {
      await reactStream.cancel();
    } catch {
      // Ignore cancel errors - stream may already be closed
    }
    try {
      reader.releaseLock();
    } catch {
      // Ignore release errors - reader may already be released
    }
  };

  return new ReadableStream({
    async pull(controller) {
      if (cancelled) {
        return;
      }

      try {
        const { done, value } = await reader.read();
        if (done) {
          if (!cancelled) {
            safeCloseController(controller);
          }
          return;
        }
        if (!cancelled) {
          controller.enqueue(value);
        }
      } catch (error) {
        handlePullError(error, controller);
      }
    },
    cancel: handleCancel,
  });
};

/**
 * Build RSC payload script tag
 */
const buildRSCPayloadScript = (): string | null => {
  const payload = buildRSCPayload();
  const componentCount = Object.keys(payload.components).length;
  console.log(
    `[RSC] Building payload with ${componentCount} cached components`
  );
  if (componentCount === 0) {
    return null;
  }
  return `<script id="__RSC_PAYLOAD__" type="application/json">${serializePayload(payload)}</script>`;
};

/**
 * Inject script before </body> in HTML string
 */
const injectBeforeBodyClose = (html: string, script: string): string => {
  const idx = html.lastIndexOf("</body>");
  if (idx !== -1) {
    return html.slice(0, idx) + script + html.slice(idx);
  }
  return html + script;
};

/**
 * Create a stream wrapper that injects RSC payload before </body>
 * This ensures cached component outputs are available during hydration
 */
const createRSCPayloadStream = (
  sourceStream: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> => {
  const reader = sourceStream.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  let payloadInjected = false;

  const processBuffer = (): string => {
    const script = buildRSCPayloadScript();
    if (script) {
      payloadInjected = true;
      return injectBeforeBodyClose(buffer, script);
    }
    return buffer;
  };

  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();

        if (done) {
          if (buffer.length > 0 && !payloadInjected) {
            controller.enqueue(encoder.encode(processBuffer()));
          }
          safeCloseController(controller);
          return;
        }

        buffer += decoder.decode(value, { stream: true });

        if (!payloadInjected && buffer.includes("</body>")) {
          controller.enqueue(encoder.encode(processBuffer()));
          buffer = "";
          return;
        }

        // Flush large buffers, keep tail for </body> detection
        if (buffer.length > 65_536) {
          controller.enqueue(encoder.encode(buffer.slice(0, -100)));
          buffer = buffer.slice(-100);
        }
      } catch (error) {
        controller.error(error);
      }
    },

    async cancel(reason) {
      try {
        await sourceStream.cancel(reason);
      } catch {
        // Ignore cancel errors
      }
    },
  });
};

/**
 * Render a route to HTML string (for build-time static generation)
 */
export const renderRouteToString = async (
  routeInfo: RouteInfo,
  data: unknown,
  params: Record<string, string> = {}
): Promise<string> => {
  try {
    // Import the page component from registry
    const pageModule = await getRouteModule(routeInfo.filePath);
    const PageComponentRaw = pageModule.default as
      | React.ComponentType<Record<string, unknown>>
      | undefined;

    if (!PageComponentRaw) {
      throw new Error(`No default export found in ${routeInfo.filePath}`);
    }

    // TypeScript now knows PageComponent is defined
    const PageComponent: React.ComponentType<Record<string, unknown>> =
      PageComponentRaw;

    // Load layouts
    const layouts = await loadLayouts(routeInfo);

    // Check if route has any client components
    const needsHydration = hasClientComponents(routeInfo);

    // Build props with params and data
    // Always pass params for dynamic routes, default to empty object
    const pageProps: Record<string, unknown> = {
      params: params || {},
    };
    if (data !== undefined) {
      pageProps["data"] = data;
    }

    // Build the component tree
    const component = buildComponentTree(PageComponent, pageProps, layouts, {
      routePath: routeInfo.path,
      needsHydration,
      pageData: data !== undefined ? data : undefined,
    });

    // Render to string
    const html = renderToString(component);

    // Wrap in full HTML document
    const hydrationScript = needsHydration
      ? '<script type="module" src="/hydrate.js"></script>'
      : "";

    const hmrScript = getHmrScript();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page</title>
  <link rel="stylesheet" href="/index.css">
</head>
<body>
  <div id="root">${html}</div>
  ${hydrationScript}${hmrScript}
</body>
</html>`;
  } catch (error) {
    console.error(`Error rendering route ${routeInfo.path}:`, error);
    throw error;
  }
};

/**
 * Render shell with Suspense fallbacks for PPR
 * Uses renderToString which renders Suspense fallbacks synchronously
 * Wraps Suspense boundaries with markers for later dynamic content injection
 */
export const renderShellToString = async (
  routeInfo: RouteInfo,
  data: unknown,
  params: Record<string, string> = {}
): Promise<{ shell: string; hasSuspense: boolean }> => {
  try {
    // Import the page component from registry
    const pageModule = await getRouteModule(routeInfo.filePath);
    const PageComponentRaw = pageModule.default as
      | React.ComponentType<Record<string, unknown>>
      | undefined;

    if (!PageComponentRaw) {
      throw new Error(`No default export found in ${routeInfo.filePath}`);
    }

    const PageComponent: React.ComponentType<Record<string, unknown>> =
      PageComponentRaw;

    // Load layouts
    const layouts = await loadLayouts(routeInfo);

    // Check if route has any client components
    const needsHydration = hasClientComponents(routeInfo);

    // Build props with params and data
    const pageProps: Record<string, unknown> = {
      params: params || {},
    };
    if (data !== undefined) {
      pageProps["data"] = data;
    }

    // Build the component tree
    const component = buildComponentTree(PageComponent, pageProps, layouts, {
      routePath: routeInfo.path,
      needsHydration,
      pageData: data !== undefined ? data : undefined,
    });

    // Render to string - this will render Suspense fallbacks synchronously
    const html = renderToString(component);

    // Check if HTML contains Suspense fallback markers
    // React's renderToString outputs Suspense fallbacks, but we need to detect them
    // We'll look for common patterns or wrap Suspense boundaries ourselves
    // For now, detect by checking if there are async components that would suspend
    const hasSuspense = html.includes("Loading") || html.includes("fallback");

    // Wrap in full HTML document
    const hydrationScript = needsHydration
      ? '<script type="module" src="/hydrate.js"></script>'
      : "";

    const hmrScript = getHmrScript();

    const shell = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page</title>
  <link rel="stylesheet" href="/index.css">
</head>
<body>
  <div id="root">${html}</div>
  ${hydrationScript}${hmrScript}
</body>
</html>`;

    return { shell, hasSuspense };
  } catch (error) {
    console.error(`Error rendering shell for route ${routeInfo.path}:`, error);
    throw error;
  }
};

/**
 * Render only dynamic parts (Suspense boundaries) for PPR
 * This renders the full page but filters the stream to only include
 * Suspense boundary replacements, not the static shell content
 */
export const renderDynamicParts = async (
  routeInfo: RouteInfo,
  params: Record<string, string> = {}
): Promise<ReadableStream<Uint8Array>> => {
  try {
    // Import the page component from registry
    const pageModule = await getRouteModule(routeInfo.filePath);
    const PageComponentRaw = pageModule.default as
      | React.ComponentType<Record<string, unknown>>
      | undefined;

    if (!PageComponentRaw) {
      throw new Error(`No default export found in ${routeInfo.filePath}`);
    }

    const PageComponent: React.ComponentType<Record<string, unknown>> =
      PageComponentRaw;

    // Check if page has loader (for dynamic routes with data fetching)
    let pageData: unknown;
    if (hasPageConfig(PageComponent)) {
      const config = getPageConfig(PageComponent);
      if (config.loader) {
        pageData = await config.loader(params);
      }
    }

    // Load layouts
    const layouts = await loadLayouts(routeInfo);

    // Check if route has any client components
    const needsHydration = hasClientComponents(routeInfo);

    // Build props with params and data
    const pageProps: Record<string, unknown> = {
      params: params || {},
    };
    if (pageData !== undefined) {
      pageProps["data"] = pageData;
    }

    // Build the component tree
    const component = buildComponentTree(PageComponent, pageProps, layouts, {
      routePath: routeInfo.path,
      needsHydration,
      pageData: pageData !== undefined ? pageData : undefined,
    });

    // Create AbortController for cleanup
    const abortController = new AbortController();

    // Render to stream - React will stream Suspense boundaries
    const reactStream = await renderToReadableStream(component, {
      onError: createStreamErrorHandler(),
      signal: abortController.signal,
    });

    // Filter stream to only include Suspense boundary replacements
    // React's streaming format uses special markers:
    // - `<template id="B:0">...</template><script>$RC("B:0")</script>` for boundaries
    // - We want to capture these chunks and skip the initial shell content
    const reader = reactStream.getReader();
    let seenFirstBoundary = false;

    return new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }

          // Decode chunk to check for Suspense boundary markers
          const chunk = new TextDecoder().decode(value);

          // Look for React's Suspense boundary markers
          // Format: <template id="B:X"> or <script>$RC("B:X")
          const hasBoundaryMarker =
            chunk.includes('<template id="B:') ||
            chunk.includes('$RC("B:') ||
            chunk.includes("<script>");

          // Skip initial shell content, only stream Suspense replacements
          // Once we see a boundary marker, start streaming
          if (hasBoundaryMarker || seenFirstBoundary) {
            seenFirstBoundary = true;
            controller.enqueue(value);
          }
          // Otherwise, this is shell content - skip it
        } catch (error) {
          controller.error(error);
        }
      },

      cancel() {
        abortController.abort();
        reader.cancel();
      },
    });
  } catch (error) {
    console.error(
      `Error rendering dynamic parts for route ${routeInfo.path}:`,
      error
    );
    throw error;
  }
};

/**
 * Render a route with its layout hierarchy
 */
export const renderRoute = async (
  routeInfo: RouteInfo,
  params: Record<string, string> = {}
): Promise<Response> => {
  // Clear cached output registry before each render
  clearCachedOutputRegistry();

  try {
    // Import the page component from registry
    const pageModule = await getRouteModule(routeInfo.filePath);
    const PageComponentRaw = pageModule.default as
      | React.ComponentType<Record<string, unknown>>
      | undefined;

    if (!PageComponentRaw) {
      throw new Error(`No default export found in ${routeInfo.filePath}`);
    }

    // TypeScript now knows PageComponent is defined
    const PageComponent: React.ComponentType<Record<string, unknown>> =
      PageComponentRaw;

    // Check if page has loader (for dynamic routes with data fetching)
    let pageData: unknown;
    if (hasPageConfig(PageComponent)) {
      const config = getPageConfig(PageComponent);
      if (config.loader) {
        pageData = await config.loader(params);
      }
    }

    // Load layouts
    const layouts = await loadLayouts(routeInfo);

    // Check if route has any client components
    const needsHydration = hasClientComponents(routeInfo);

    // Build props with params and data
    // Always pass params for dynamic routes, default to empty object
    const pageProps: Record<string, unknown> = {
      params: params || {},
    };
    if (pageData !== undefined) {
      pageProps["data"] = pageData;
    }

    // Build the component tree
    const component = buildComponentTree(PageComponent, pageProps, layouts, {
      routePath: routeInfo.path,
      needsHydration,
      pageData: pageData !== undefined ? pageData : undefined,
    });

    // Create AbortController to signal React when the stream is cancelled
    // This allows React to clean up properly when user navigates away
    const abortController = new AbortController();

    // Render to stream with Suspense support
    // bootstrapModules injects scripts after content streams (for hydration)
    // onError handles errors during Suspense resolution
    // signal allows React to abort cleanly when user navigates away
    const streamOptions: {
      bootstrapModules?: string[];
      onError: (error: unknown) => void;
      signal: AbortSignal;
    } = {
      onError: createStreamErrorHandler(),
      signal: abortController.signal,
    };

    if (needsHydration) {
      streamOptions.bootstrapModules = ["/hydrate.js"];
    }

    // Render to stream - React will handle Suspense boundaries automatically
    // For async Server Components with Suspense, React streams fallbacks first,
    // then streams resolved content as promises resolve. The key is that React
    // needs the stream to be actively consumed for it to continue streaming.
    // Note: HMR script is injected directly in RootShell component to avoid
    // breaking React's streaming format by manipulating chunks
    const reactStream = await renderToReadableStream(component, streamOptions);

    // Wrap React's stream in an active consumer stream
    // This ensures React continues processing Suspense boundaries by actively
    // pulling chunks from the stream. Without this, Bun's Response may not
    // consume the stream fast enough for React to continue processing.
    // Pass the AbortController so we can signal React to abort when cancelled.
    const activeStream = createActiveStream(reactStream, abortController);

    // Wrap stream to inject RSC payload before closing
    // The payload is injected after </body> - browser will still parse it
    const stream = createRSCPayloadStream(activeStream);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    console.error(`Error rendering route ${routeInfo.path}:`, error);
    return new Response(
      `Error rendering route: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { status: 500 }
    );
  }
};
