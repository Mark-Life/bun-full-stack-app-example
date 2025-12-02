import React from "react";
import { renderToReadableStream, renderToString } from "react-dom/server";
import type { RouteInfo } from "@/framework/shared/router";
import { getPageConfig, hasPageConfig } from "~/framework/shared/page";

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
        
        const connectHMR = () => {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          ws = new WebSocket(protocol + '//' + window.location.host + '/hmr');
          
          ws.onopen = () => {
            console.log('[HMR] Connected');
            if (reconnectTimeout) {
              clearTimeout(reconnectTimeout);
              reconnectTimeout = null;
            }
          };
          
          ws.onmessage = (event) => {
            try {
              const message = JSON.parse(event.data);
              if (message.type === 'hmr-update') {
                console.log('[HMR] File changed:', message.file);
                
                // Reload CSS files
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
                  // Reload page for JS/TS/HTML/route changes
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
      const resolvedLayoutPath = resolveImportPath(layoutPath);
      const layoutModule = await import(resolvedLayoutPath);
      const LayoutComponent = layoutModule.default;
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
      const resolvedLayoutPath = resolveImportPath(routeInfo.layoutPath);
      const layoutModule = await import(resolvedLayoutPath);
      const LayoutComponent = layoutModule.default;
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
  return component;
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
 * Render a route to HTML string (for build-time static generation)
 */
export const renderRouteToString = async (
  routeInfo: RouteInfo,
  data: unknown,
  params: Record<string, string> = {}
): Promise<string> => {
  try {
    // Import the page component
    const resolvedPagePath = resolveImportPath(routeInfo.filePath);
    const pageModule = await import(resolvedPagePath);
    const PageComponent = pageModule.default;

    if (!PageComponent) {
      throw new Error(`No default export found in ${routeInfo.filePath}`);
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
 * Render a route with its layout hierarchy
 */
export const renderRoute = async (
  routeInfo: RouteInfo,
  params: Record<string, string> = {}
): Promise<Response> => {
  try {
    // Import the page component
    const resolvedPagePath = resolveImportPath(routeInfo.filePath);
    const pageModule = await import(resolvedPagePath);
    const PageComponent = pageModule.default;

    if (!PageComponent) {
      throw new Error(`No default export found in ${routeInfo.filePath}`);
    }

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
    const stream = createActiveStream(reactStream, abortController);

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
