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
  options: { routePath: string; needsHydration: boolean }
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
    // Ignore abort errors - these are normal when clients disconnect
    if (
      error instanceof Error &&
      (error.message.includes("aborted") ||
        error.message.includes("abort") ||
        error.name === "AbortError")
    ) {
      // Client disconnected - this is expected, don't log as error
      return;
    }
    // Log actual errors
    console.error("Error during Suspense streaming:", error);
    // Let React handle error boundaries
  };
};

/**
 * Process chunk and inject HMR script if body tag found
 */
const processChunkForHmr = (
  buffer: string,
  hmrScript: string,
  bodyClosed: { value: boolean }
): { injected: boolean; result: string; remaining: string } => {
  if (!bodyClosed.value && buffer.includes("</body>")) {
    const parts = buffer.split("</body>");
    if (parts.length === 2) {
      const beforeBody = parts[0];
      const afterBody = parts[1];
      bodyClosed.value = true;
      return {
        injected: true,
        result: `${beforeBody}${hmrScript}</body>${afterBody}`,
        remaining: "",
      };
    }
  }
  return { injected: false, result: "", remaining: buffer };
};

/**
 * Wrap stream with HMR script injection
 */
const wrapStreamWithHmr = (
  stream: ReadableStream<Uint8Array>,
  hmrScript: string
): ReadableStream<Uint8Array> => {
  return new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();
      let buffer = "";
      const bodyClosed = { value: false };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          const chunk = new TextDecoder().decode(value, { stream: true });
          buffer += chunk;

          const processed = processChunkForHmr(buffer, hmrScript, bodyClosed);
          if (processed.injected) {
            controller.enqueue(new TextEncoder().encode(processed.result));
            buffer = processed.remaining;
            continue;
          }
          buffer = processed.remaining;

          // Forward chunks as they come
          controller.enqueue(value);
        }

        // If we never found </body>, append HMR script at the end
        if (!bodyClosed.value && buffer) {
          const withHMR = `${buffer}${hmrScript}`;
          controller.enqueue(new TextEncoder().encode(withHMR));
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
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
    const pageProps: Record<string, unknown> = {};
    if (Object.keys(params).length > 0) {
      pageProps["params"] = params;
    }
    if (data !== undefined) {
      pageProps["data"] = data;
    }

    // Build the component tree
    const component = buildComponentTree(PageComponent, pageProps, layouts, {
      routePath: routeInfo.path,
      needsHydration,
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
        pageData = await config.loader();
      }
    }

    // Load layouts
    const layouts = await loadLayouts(routeInfo);

    // Check if route has any client components
    const needsHydration = hasClientComponents(routeInfo);

    // Build props with params and data
    const pageProps: Record<string, unknown> = {};
    if (Object.keys(params).length > 0) {
      pageProps["params"] = params;
    }
    if (pageData !== undefined) {
      pageProps["data"] = pageData;
    }

    // Build the component tree
    const component = buildComponentTree(PageComponent, pageProps, layouts, {
      routePath: routeInfo.path,
      needsHydration,
    });

    // Render to stream with Suspense support
    // bootstrapModules injects scripts after content streams (for hydration)
    // onError handles errors during Suspense resolution
    const streamOptions: {
      bootstrapModules?: string[];
      onError: (error: unknown) => void;
    } = {
      onError: createStreamErrorHandler(),
    };

    if (needsHydration) {
      streamOptions.bootstrapModules = ["/hydrate.js"];
    }

    // Render to stream - React will handle Suspense boundaries automatically
    // For async Server Components with Suspense, React streams fallbacks first,
    // then streams resolved content as promises resolve. The key is that React
    // needs the stream to be actively consumed for it to continue streaming.
    const stream = await renderToReadableStream(component, streamOptions);

    const hmrScript = getHmrScript();
    const wrappedStream = wrapStreamWithHmr(stream, hmrScript);

    return new Response(wrappedStream, {
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
