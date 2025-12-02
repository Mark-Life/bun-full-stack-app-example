import { serve } from "bun";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { discoverRoutes, matchRoute, type RouteInfo } from "./lib/router";
import { routesPlugin } from "./lib/routes-plugin";

/**
 * Check if a route has any client components (page, layouts, or imported)
 *
 * Returns true if:
 * - The page itself is a client component ("use client")
 * - Any layout is a client component
 * - The page imports any client components (client boundaries)
 */
const hasClientComponents = (routeInfo: RouteInfo): boolean => {
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
 * Discover routes on startup
 */
const routeTree = discoverRoutes("./src/app");
console.log(`📁 Discovered ${routeTree.routes.size} routes`);

/**
 * Render a route with its layout hierarchy
 */
const renderRoute = async (routeInfo: RouteInfo): Promise<Response> => {
  try {
    // Import the page component
    const pageModule = await import(routeInfo.filePath);
    const PageComponent = pageModule.default;

    if (!PageComponent) {
      throw new Error(`No default export found in ${routeInfo.filePath}`);
    }

    // Build layout hierarchy
    // Layouts should be applied from root to leaf (outermost to innermost)
    // So we collect: [root, parent1, parent2, ..., direct]
    const layouts: Array<{ component: React.ComponentType<any>; props?: any }> =
      [];

    // Add parent layouts first (root to direct parent)
    for (const layoutPath of routeInfo.parentLayouts) {
      try {
        const layoutModule = await import(layoutPath);
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
        const layoutModule = await import(routeInfo.layoutPath);
        const LayoutComponent = layoutModule.default;
        if (LayoutComponent) {
          layouts.push({ component: LayoutComponent });
        }
      } catch (error) {
        console.warn(`Failed to load layout ${routeInfo.layoutPath}:`, error);
      }
    }

    // Check if route has any client components
    const needsHydration = hasClientComponents(routeInfo);

    // Build the component tree
    // Apply layouts in reverse order (innermost first, then wrap with outer layouts)
    // So we wrap: page -> direct -> parent2 -> parent1 -> root
    let component: React.ReactElement = React.createElement(PageComponent);
    for (let i = layouts.length - 1; i >= 0; i--) {
      const layout = layouts[i];
      if (layout) {
        // Pass routePath and hasClientComponents to the root layout (first layout, which is at index 0)
        const props =
          i === 0
            ? {
                ...layout.props,
                routePath: routeInfo.path,
                hasClientComponents: needsHydration,
              }
            : layout.props || {};
        component = React.createElement(layout.component, props, component);
      }
    }

    // Render to stream with Suspense support
    // bootstrapModules injects scripts after content streams (for hydration)
    // onError handles errors during Suspense resolution
    const streamOptions: {
      bootstrapModules?: string[];
      onError: (error: unknown) => void;
    } = {
      onError: (error: unknown) => {
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
      },
    };

    if (needsHydration) {
      streamOptions.bootstrapModules = ["/hydrate.js"];
    }

    // Render to stream - React will handle Suspense boundaries automatically
    // For async Server Components with Suspense, React streams fallbacks first,
    // then streams resolved content as promises resolve. The key is that React
    // needs the stream to be actively consumed for it to continue streaming.
    const stream = await renderToReadableStream(component, streamOptions);

    // Create a wrapper stream that ensures React's stream is consumed actively
    // This is necessary for React to continue resolving Suspense boundaries
    // and stream content progressively. Without active consumption, React
    // may wait for all promises to resolve before streaming.
    const wrappedStream = new ReadableStream({
      async start(controller) {
        const reader = stream.getReader();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Immediately forward chunks to ensure React continues streaming
            controller.enqueue(value);
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });

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

/**
 * Build route handlers dynamically
 */
const buildRouteHandlers = () => {
  const handlers: Record<string, () => Promise<Response>> = {};

  // Add handlers for each discovered route
  for (const [path, routeInfo] of routeTree.routes.entries()) {
    handlers[path] = async () => renderRoute(routeInfo);
  }

  return handlers;
};

/**
 * Build and cache the hydration bundle
 */
let hydrateBundleCache: string | null = null;

const buildHydrateBundle = async (): Promise<string> => {
  if (hydrateBundleCache && process.env.NODE_ENV === "production") {
    return hydrateBundleCache;
  }

  const tailwindPlugin = await import("bun-plugin-tailwind");
  const result = await Bun.build({
    entrypoints: ["./src/hydrate.tsx"],
    plugins: [tailwindPlugin.default || tailwindPlugin, routesPlugin],
    target: "browser",
    minify: process.env.NODE_ENV === "production",
    sourcemap: process.env.NODE_ENV !== "production" ? "inline" : "none",
  });

  if (!result.success) {
    console.error("Failed to build hydrate bundle:", result.logs);
    throw new Error("Failed to build hydrate bundle");
  }

  const output = result.outputs[0];
  if (!output) {
    throw new Error("No output from hydrate bundle build");
  }

  const bundle = await output.text();
  hydrateBundleCache = bundle;
  return bundle;
};

const server = serve({
  routes: {
    "/hydrate.js": async () => {
      try {
        const bundle = await buildHydrateBundle();
        return new Response(bundle, {
          headers: { "Content-Type": "application/javascript" },
        });
      } catch (error) {
        console.error("Error serving hydrate bundle:", error);
        return new Response(
          "console.error('Failed to load hydration bundle')",
          {
            headers: { "Content-Type": "application/javascript" },
            status: 500,
          }
        );
      }
    },

    "/index.css": async () => {
      try {
        const tailwindPlugin = await import("bun-plugin-tailwind");
        const bundled = await Bun.build({
          entrypoints: ["./src/index.css"],
          plugins: [tailwindPlugin.default || tailwindPlugin],
          target: "browser",
        });

        if (bundled.success && bundled.outputs && bundled.outputs.length > 0) {
          const output = bundled.outputs[0];
          if (output) {
            const css = await output.text();
            return new Response(css, {
              headers: { "Content-Type": "text/css" },
            });
          }
        }
      } catch (error) {
        console.error("Failed to bundle CSS:", error);
      }

      // Fallback: return raw file if bundling fails
      const file = Bun.file("./src/index.css");
      return new Response(file, {
        headers: { "Content-Type": "text/css" },
      });
    },

    "/logo.svg": Bun.file("./src/logo.svg"),
    "/react.svg": Bun.file("./src/react.svg"),

    // API routes
    "/api/hello": {
      async GET() {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT() {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async (req) => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },

    // App routes - try to match discovered routes first
    "/*": async (req) => {
      const url = new URL(req.url);
      const pathname = url.pathname;

      // Skip paths handled by other routes (API and static assets)
      // These are handled by their specific route handlers above
      const skipPaths = [
        "/api/",
        "/index.css",
        "/hydrate.js",
        "/logo.svg",
        "/react.svg",
      ];
      if (skipPaths.some((p) => pathname.startsWith(p))) {
        // Let other handlers deal with these
        return new Response("Not found", { status: 404 });
      }

      // Try to match route
      const matchResult = matchRoute(pathname, routeTree.routes);
      if (matchResult) {
        return renderRoute(matchResult.route);
      }

      // Fallback to 404 for unknown routes
      return new Response("Page not found", {
        status: 404,
        headers: { "Content-Type": "text/html" },
      });
    },

    // Add discovered route handlers
    ...buildRouteHandlers(),
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
