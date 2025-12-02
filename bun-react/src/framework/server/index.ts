import { existsSync, watch } from "node:fs";
import { join } from "node:path";
import { type ServerWebSocket, serve } from "bun";
import { routesPlugin } from "@/framework/shared/routes-plugin";
import { api } from "~/api";
import { generateRouteTypes } from "~/framework/shared/generate-route-types";
import { applyMiddleware } from "~/framework/shared/middleware";
import middlewareConfig from "~/middleware";
import { discoverPublicAssets } from "./public";
import {
  buildRouteHandlers,
  matchAndRenderRoute,
  rediscoverRoutes,
} from "./routes";

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
    entrypoints: ["./src/framework/client/hydrate.tsx"],
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

/**
 * Discover public assets at startup
 */
const publicAssets = await discoverPublicAssets("./src/public");
const publicAssetPaths = Object.keys(publicAssets);
if (publicAssetPaths.length > 0) {
  console.log(`📦 Discovered ${publicAssetPaths.length} public assets`);
}

/**
 * Get typed API handlers
 */
const apiHandlers = api.handlers();
console.log(`🔌 Loaded ${Object.keys(apiHandlers).length} API routes`);
console.log("API routes:", Object.keys(apiHandlers));

/**
 * Apply middleware to API handlers
 */
const wrappedApiHandlers = applyMiddleware(middlewareConfig, apiHandlers);

/**
 * Try to serve pre-rendered static HTML in production
 */
const tryServeStatic = (pathname: string): Response | null => {
  // Only serve static pages in production
  if (process.env.NODE_ENV !== "production") {
    return null;
  }

  // Determine static HTML path
  // / -> dist/pages/index.html
  // /about -> dist/pages/about/index.html
  const htmlPath =
    pathname === "/"
      ? join(process.cwd(), "dist", "pages", "index.html")
      : join(process.cwd(), "dist", "pages", pathname.slice(1), "index.html");

  if (existsSync(htmlPath)) {
    const file = Bun.file(htmlPath);
    return new Response(file, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return null;
};

// Build server config conditionally for dev/prod
const serverConfig = {
  routes: {
    // HMR WebSocket endpoint (dev mode only)
    // Will be handled by fetch handler after server creation
    "/hmr": () => {
      if (process.env.NODE_ENV === "production") {
        return new Response("Not Found", { status: 404 });
      }
      // Return a placeholder - actual upgrade handled in fetch
      return new Response("HMR WebSocket endpoint", { status: 200 });
    },

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

    // Public assets (discovered from src/public/)
    ...publicAssets,

    // Typed API routes (with middleware applied)
    ...wrappedApiHandlers,

    // App routes - try to match discovered routes first
    "/*": async (req: Request) => {
      const url = new URL(req.url);
      const pathname = url.pathname;

      // Skip paths handled by other routes (API and static assets)
      // These are handled by their specific route handlers above
      const skipPaths = [
        "/api/",
        "/index.css",
        "/hydrate.js",
        "/hmr",
        ...publicAssetPaths,
      ];
      if (skipPaths.some((p) => pathname.startsWith(p))) {
        // Let other handlers deal with these
        return new Response("Not found", { status: 404 });
      }

      // In production, try to serve pre-rendered static HTML first
      const staticResponse = tryServeStatic(pathname);
      if (staticResponse) {
        return staticResponse;
      }

      // Try to match route and render dynamically (SSR)
      const response = matchAndRenderRoute(pathname);
      if (response) {
        return await response;
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

  // Add WebSocket handler for HMR (dev mode only)
  ...(process.env.NODE_ENV !== "production"
    ? {
        websocket: {
          message() {
            // Handle incoming messages if needed
            // For now, we only send updates, not receive
          },
          open(ws: ServerWebSocket<unknown>) {
            // Subscribe to HMR topic when WebSocket opens
            ws.subscribe("hmr");
          },
          close(ws: ServerWebSocket<unknown>) {
            // Unsubscribe when WebSocket closes
            ws.unsubscribe("hmr");
          },
        },
      }
    : {}),
};

const server = serve(serverConfig as Parameters<typeof serve>[0]);

// Update /hmr route to handle WebSocket upgrades (dev mode only)
if (process.env.NODE_ENV !== "production") {
  server.reload({
    routes: {
      ...serverConfig.routes,
      "/hmr": (req: Request) => {
        // Manually upgrade WebSocket connection
        const upgraded = server.upgrade(req, {
          data: { type: "hmr" },
        });
        if (upgraded) {
          return new Response("HMR WebSocket upgraded", { status: 200 });
        }
        return new Response("HMR WebSocket upgrade failed", { status: 400 });
      },
    },
  });
}

console.log(`🚀 Server running at ${server.url}`);

/**
 * Reload routes and regenerate types (for dev mode hot reloading)
 */
const reloadRoutes = async (): Promise<void> => {
  try {
    // Regenerate route types
    await generateRouteTypes();

    // Rediscover routes
    rediscoverRoutes();

    // Invalidate hydrate bundle cache
    hydrateBundleCache = null;

    // Reload server with fresh routes
    server.reload({
      routes: {
        // HMR WebSocket endpoint
        "/hmr": (req: Request) => {
          if (process.env.NODE_ENV === "production") {
            return new Response("Not Found", { status: 404 });
          }
          const upgraded = server.upgrade(req, {
            data: { type: "hmr" },
          });
          if (upgraded) {
            return new Response("HMR WebSocket upgraded", { status: 200 });
          }
          return new Response("HMR WebSocket upgrade failed", { status: 400 });
        },

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

            if (
              bundled.success &&
              bundled.outputs &&
              bundled.outputs.length > 0
            ) {
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

        // Public assets
        ...publicAssets,

        // Typed API routes (with middleware applied)
        ...wrappedApiHandlers,

        // App routes - try to match discovered routes first
        "/*": async (req) => {
          const url = new URL(req.url);
          const pathname = url.pathname;

          // Skip paths handled by other routes (API and static assets)
          const skipPaths = [
            "/api/",
            "/index.css",
            "/hydrate.js",
            "/hmr",
            ...publicAssetPaths,
          ];
          if (skipPaths.some((p) => pathname.startsWith(p))) {
            return new Response("Not found", { status: 404 });
          }

          // Try to match route and render dynamically (SSR)
          const response = matchAndRenderRoute(pathname);
          if (response) {
            return await response;
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
    });

    console.log("✅ Routes reloaded");
  } catch (error) {
    console.error("❌ Failed to reload routes:", error);
  }
};

/**
 * Send HMR update to all connected WebSocket clients
 */
const sendHMRUpdate = (changedFile: string) => {
  const update = JSON.stringify({
    type: "hmr-update",
    file: changedFile,
    timestamp: Date.now(),
  });

  // Send to all connected WebSocket clients via "hmr" topic
  server.publish("hmr", update);
  console.log(`🔄 HMR: File changed - ${changedFile}`);
};

/**
 * Watch src/app directory for file changes (dev mode only)
 */
if (process.env.NODE_ENV !== "production") {
  const appDir = join(process.cwd(), "src/app");
  const typesFile = join(
    process.cwd(),
    "src/framework/shared/routes.generated.ts"
  );
  let reloadTimeout: ReturnType<typeof setTimeout> | null = null;

  // Debounce reload to avoid multiple rapid reloads
  const debouncedReload = () => {
    if (reloadTimeout) {
      clearTimeout(reloadTimeout);
    }
    reloadTimeout = setTimeout(() => {
      reloadRoutes();
    }, 300); // 300ms debounce
  };

  try {
    // Watch app directory for route file changes
    watch(
      appDir,
      { recursive: true },
      (eventType: string, filename: string | null) => {
        if (!filename) {
          return;
        }

        // Watch for page.tsx, layout.tsx, and index.tsx files
        const isRouteFile =
          filename.endsWith("page.tsx") ||
          filename.endsWith("layout.tsx") ||
          filename.endsWith("index.tsx");

        if (isRouteFile) {
          if (eventType === "change") {
            console.log(`📝 Detected change in ${filename}`);
            debouncedReload();
            // Send HMR update for route files
            sendHMRUpdate(filename);
          } else if (eventType === "rename") {
            // File added or deleted
            console.log(`📝 Detected rename (add/delete) in ${filename}`);
            debouncedReload();
            // Send HMR update
            sendHMRUpdate(filename);
          }
        } else if (eventType === "change") {
          // For other files (components, etc.), just send HMR update
          sendHMRUpdate(filename);
        }
      }
    );

    // Watch the generated types file so TypeScript picks up changes
    try {
      watch(typesFile, { recursive: false }, (eventType: string) => {
        if (eventType === "change") {
          console.log(
            "📝 Route types file changed - TypeScript should pick this up"
          );
          // Send HMR update to trigger browser reload for type changes
          sendHMRUpdate("routes.generated.ts");
        }
      });
    } catch (error) {
      // Types file might not exist yet, that's okay
      console.warn("⚠️  Could not watch types file:", error);
    }

    console.log(`👀 Watching ${appDir} for route changes`);
  } catch (error) {
    console.warn("⚠️  Failed to set up file watcher:", error);
  }
}
