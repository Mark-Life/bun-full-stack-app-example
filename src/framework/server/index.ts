import { existsSync, watch } from "node:fs";
import { join } from "node:path";
import { type ServerWebSocket, serve } from "bun";
import { routesPlugin } from "@/framework/shared/routes-plugin";
import { api } from "~/api";
import { generateRouteTypes } from "~/framework/shared/generate-route-types";
import { applyMiddleware } from "~/framework/shared/middleware";
import { getPageConfig, hasPageConfig } from "~/framework/shared/page";
import { matchRoute, type RouteInfo } from "~/framework/shared/router";
import middlewareConfig from "~/middleware";
import { formatCacheAge, getFromCache, isStale, setCache } from "./cache";
import { generateRouteModulesFile } from "./generate-route-modules";
import { discoverPublicAssets } from "./public";
import { clearModuleCache, renderRoute, renderRouteToString } from "./render";
import { queueRevalidation } from "./revalidate";
import {
  getNotFoundRouteInfo,
  getRouteTree,
  matchAndExecuteRouteHandler,
  matchAndRenderRoute,
  rediscoverRoutes,
} from "./routes";

/**
 * Simple logger that only logs in development
 */
const isDev = process.env.NODE_ENV !== "production";
// biome-ignore lint/suspicious/noEmptyBlockStatements: empty function is intentional for production
const log = isDev ? console.log : () => {};
const logError = console.error; // Always log errors
const logWarn = console.warn; // Always log warnings

/**
 * Build and cache the hydration bundle
 */
let hydrateBundleCache: string | null = null;

const buildHydrateBundle = async (): Promise<string> => {
  if (hydrateBundleCache && process.env.NODE_ENV === "production") {
    return hydrateBundleCache;
  }

  const tailwindPlugin = await import("bun-plugin-tailwind");
  const isProduction = process.env.NODE_ENV === "production";
  const nodeEnv = process.env.NODE_ENV || "development";

  // Create a process polyfill that will be injected at the start of the bundle
  const processPolyfill = `if(typeof process==="undefined"){var process={env:{NODE_ENV:"${nodeEnv}"}};}`;

  const result = await Bun.build({
    entrypoints: ["./src/framework/client/hydrate.tsx"],
    plugins: [tailwindPlugin.default || tailwindPlugin, routesPlugin],
    target: "browser",
    minify: isProduction,
    sourcemap: isProduction ? "none" : "inline",
    define: {
      "process.env.NODE_ENV": `"${nodeEnv}"`,
    },
    banner: processPolyfill,
  });

  if (!result.success) {
    logError("Failed to build hydrate bundle:", result.logs);
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
 * Build and cache the CSS bundle
 */
let cssBundleCache: string | null = null;

const buildCssBundle = async (): Promise<string> => {
  if (cssBundleCache && process.env.NODE_ENV === "production") {
    return cssBundleCache;
  }

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
        cssBundleCache = await output.text();
        return cssBundleCache;
      }
    }
  } catch (error) {
    logError("Failed to bundle CSS:", error);
  }

  // Fallback: return raw file if bundling fails
  const file = Bun.file("./src/index.css");
  return await file.text();
};

/**
 * Discover public assets at startup
 */
const publicAssets = await discoverPublicAssets("./src/public");
const publicAssetPaths = Object.keys(publicAssets);
if (publicAssetPaths.length > 0) {
  log(`📦 Discovered ${publicAssetPaths.length} public assets`);
}

/**
 * Get typed API handlers
 */
const apiHandlers = api.handlers();
log(`🔌 Loaded ${Object.keys(apiHandlers).length} API routes`);
log("API routes:", Object.keys(apiHandlers));

/**
 * Apply middleware to API handlers
 */
const wrappedApiHandlers = applyMiddleware(middlewareConfig, apiHandlers);

/**
 * Pre-loaded route modules cache
 */
let routeModulesRef: Map<string, { default: unknown }> | null = null;

/**
 * Get route modules (pre-loaded at startup)
 */
const getRouteModules = async (): Promise<
  Map<string, { default: unknown }>
> => {
  if (routeModulesRef) {
    return routeModulesRef;
  }

  try {
    const module = await import("./route-modules.generated");
    routeModulesRef = module.routeModules;
    return routeModulesRef;
  } catch {
    // Fallback: generate the file if it doesn't exist
    const routeTree = getRouteTree();
    generateRouteModulesFile(routeTree);
    const module = await import("./route-modules.generated");
    routeModulesRef = module.routeModules;
    return routeModulesRef;
  }
};

/**
 * Render and cache a route for ISR
 */
const renderAndCache = async (
  pathname: string,
  routeInfo: RouteInfo,
  params: Record<string, string>
): Promise<string> => {
  log(`[ISR] 🎨 RENDERING PAGE: ${pathname} | Params:`, params);

  // Get pre-loaded route modules
  const routeModules = await getRouteModules();
  const pageModule = routeModules.get(routeInfo.filePath);
  if (!pageModule) {
    throw new Error(`No module found for ${routeInfo.filePath}`);
  }
  const PageComponent = pageModule.default;
  if (!PageComponent) {
    throw new Error(`No default export found in ${routeInfo.filePath}`);
  }

  let pageData: unknown;
  if (hasPageConfig(PageComponent)) {
    const config = getPageConfig(PageComponent);
    if (config.loader) {
      log(`[ISR] 📥 Loading data for: ${pathname}`);
      pageData = await config.loader(params);
      log(`[ISR] ✅ Data loaded for: ${pathname}`);
    }
  }

  // Render the page (renderRouteToString uses the module registry)
  log(`[ISR] 🖼️  Rendering HTML for: ${pathname}`);
  const html = await renderRouteToString(routeInfo, pageData, params);
  log(
    `[ISR] ✅ HTML rendered for: ${pathname} (${Math.round(html.length / 1024)}KB)`
  );

  // Cache the result
  if (routeInfo.revalidate) {
    await setCache(pathname, {
      html,
      generatedAt: Date.now(),
      revalidate: routeInfo.revalidate,
    });
    log(`[ISR] 💾 Cached: ${pathname} | Revalidate: ${routeInfo.revalidate}s`);
  }

  return html;
};

/**
 * Try to serve with ISR (cache-aware serving)
 */
const tryServeWithISR = async (pathname: string): Promise<Response | null> => {
  // Check cache first
  const cached = await getFromCache(pathname);

  if (cached) {
    if (!isStale(cached)) {
      // Fresh - serve cached with HIT header
      const cacheAge = formatCacheAge(cached);
      log(
        `[ISR] ✅ CACHE HIT - Serving static (no rendering): ${pathname} | Age: ${cacheAge}`
      );
      return new Response(cached.html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Cache": "HIT",
        },
      });
    }

    // Stale - serve cached but queue background revalidation
    const cacheAge = formatCacheAge(cached);
    log(
      `[ISR] ⚠️  CACHE STALE - Serving static (no rendering), queuing background revalidation: ${pathname} | Age: ${cacheAge}`
    );
    queueRevalidation(pathname);
    return new Response(cached.html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Cache": "STALE",
      },
    });
  }

  // Cache miss - check if ISR-enabled route
  const routeTree = getRouteTree();
  const matchResult = matchRoute(pathname, routeTree.routes);

  if (
    matchResult?.route.pageType === "static" &&
    matchResult.route.revalidate
  ) {
    // ISR-enabled static route - render, cache, and serve
    log(
      `[ISR] 🔄 CACHE MISS - Rendering and caching: ${pathname} | Revalidate: ${matchResult.route.revalidate}s`
    );
    const html = await renderAndCache(
      pathname,
      matchResult.route,
      matchResult.params
    );
    log(`[ISR] ✅ Rendered and cached: ${pathname}`);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Cache": "MISS",
      },
    });
  }

  // Fall back to pre-rendered static HTML in production (non-ISR static pages)
  if (process.env.NODE_ENV === "production") {
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
  }

  return null; // Fall through to SSR
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
        logError("Error serving hydrate bundle:", error);
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
        const css = await buildCssBundle();
        return new Response(css, {
          headers: { "Content-Type": "text/css" },
        });
      } catch (error) {
        logError("Error serving CSS bundle:", error);
        // Fallback: return raw file if bundling fails
        const file = Bun.file("./src/index.css");
        return new Response(file, {
          headers: { "Content-Type": "text/css" },
        });
      }
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

      // Try route handler first (route.ts files take precedence over page.tsx)
      const routeHandlerResponse = await matchAndExecuteRouteHandler(
        pathname,
        req
      );
      if (routeHandlerResponse) {
        return routeHandlerResponse;
      }

      // Try ISR-aware serving (cache-first, then pre-rendered, then SSR)
      const isrResponse = await tryServeWithISR(pathname);
      if (isrResponse) {
        return isrResponse;
      }

      // Try to match route and render dynamically (SSR)
      const response = matchAndRenderRoute(pathname);
      if (response) {
        return await response;
      }

      // Try to render custom not-found component
      const notFoundRouteInfo = getNotFoundRouteInfo();
      if (notFoundRouteInfo) {
        const notFoundResponse = await renderRoute(notFoundRouteInfo);
        return new Response(notFoundResponse.body, {
          status: 404,
          headers: notFoundResponse.headers,
        });
      }

      // Fallback to 404 for unknown routes
      return new Response("Page not found", {
        status: 404,
        headers: { "Content-Type": "text/html" },
      });
    },
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

// Generate route modules on startup (enables Bun --hot tracking)
const initialRouteTree = getRouteTree();
generateRouteModulesFile(initialRouteTree);

// Pre-load route modules at startup
await getRouteModules();

log(`🚀 Server running at ${server.url}`);

/**
 * Reload routes and regenerate types (for dev mode hot reloading)
 */
const reloadRoutes = async (): Promise<void> => {
  try {
    // Rediscover routes first
    const newRouteTree = rediscoverRoutes();

    // Regenerate static imports module (enables Bun --hot tracking)
    generateRouteModulesFile(newRouteTree);

    // Clear module cache so fresh modules are loaded
    clearModuleCache();
    // Clear route modules reference to force reload
    routeModulesRef = null;
    // Pre-load fresh route modules
    await getRouteModules();

    // Regenerate route types (for client-side typesafe links)
    await generateRouteTypes();

    // Invalidate hydrate bundle cache
    hydrateBundleCache = null;
    // Invalidate CSS bundle cache
    cssBundleCache = null;

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
            logError("Error serving hydrate bundle:", error);
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
            const css = await buildCssBundle();
            return new Response(css, {
              headers: { "Content-Type": "text/css" },
            });
          } catch (error) {
            logError("Error serving CSS bundle:", error);
            // Fallback: return raw file if bundling fails
            const file = Bun.file("./src/index.css");
            return new Response(file, {
              headers: { "Content-Type": "text/css" },
            });
          }
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

          // Try to render custom not-found component
          const notFoundRouteInfo = getNotFoundRouteInfo();
          if (notFoundRouteInfo) {
            const notFoundResponse = await renderRoute(notFoundRouteInfo);
            return new Response(notFoundResponse.body, {
              status: 404,
              headers: notFoundResponse.headers,
            });
          }

          // Fallback to 404 for unknown routes
          return new Response("Page not found", {
            status: 404,
            headers: { "Content-Type": "text/html" },
          });
        },
      },
    });

    log("✅ Routes reloaded with fresh modules");
  } catch (error) {
    logError("❌ Failed to reload routes:", error);
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
  log(`🔄 HMR: File changed - ${changedFile}`);
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

        // Watch for page.tsx, layout.tsx, index.tsx, and not-found.tsx files
        const isRouteFile =
          filename.endsWith("page.tsx") ||
          filename.endsWith("layout.tsx") ||
          filename.endsWith("index.tsx") ||
          filename.endsWith("not-found.tsx");

        if (isRouteFile) {
          log(`📝 Detected change in route file: ${filename}`);
          // Schedule reload (generates modules, updates routes, reloads server)
          debouncedReload();
          // Send HMR signal after reload completes
          setTimeout(() => sendHMRUpdate(filename), 350);
        } else if (eventType === "change") {
          // For other files (components, etc.), just send HMR update
          sendHMRUpdate(filename);
        }
      }
    );

    // Watch components directory for "use client" changes
    const componentsDir = join(process.cwd(), "src/components");
    try {
      watch(
        componentsDir,
        { recursive: true },
        (eventType: string, filename: string | null) => {
          if (!filename || eventType !== "change") {
            return;
          }

          // Only watch .tsx and .ts files
          if (filename.endsWith(".tsx") || filename.endsWith(".ts")) {
            log(`📝 Detected change in component: ${filename}`);
            // Rediscover routes in case "use client" was added/removed
            rediscoverRoutes();
            generateRouteModulesFile(getRouteTree());
            clearModuleCache();
            hydrateBundleCache = null;
            cssBundleCache = null;
            // Send HMR signal
            sendHMRUpdate(filename);
          }
        }
      );
      log(`👀 Watching ${componentsDir} for component changes`);
    } catch (error) {
      // Components directory might not exist
      logWarn("⚠️  Could not watch components directory:", error);
    }

    // Watch the generated types file so TypeScript picks up changes
    try {
      watch(typesFile, { recursive: false }, (eventType: string) => {
        if (eventType === "change") {
          log("📝 Route types file changed - TypeScript should pick this up");
          // Send HMR update to trigger browser reload for type changes
          sendHMRUpdate("routes.generated.ts");
        }
      });
    } catch (error) {
      // Types file might not exist yet, that's okay
      logWarn("⚠️  Could not watch types file:", error);
    }

    log(`👀 Watching ${appDir} for route changes`);
  } catch (error) {
    logWarn("⚠️  Failed to set up file watcher:", error);
  }
}
