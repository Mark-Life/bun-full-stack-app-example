/**
 * Data endpoint handler for /__data/* routes
 * Returns JSON payloads for client-side navigation
 */

import { getRouteChunks } from "~/framework/shared/chunk-manifest";
import type {
  HeadData,
  NavigationPayload,
} from "~/framework/shared/navigation-payload";
import { getPageConfig, hasPageConfig } from "~/framework/shared/page";
import { matchRoute, type RouteInfo } from "~/framework/shared/router";
import { generatePayloadHash } from "./hash";
import { hasClientComponents } from "./render";
import { getRouteTree } from "./routes";

/**
 * Simple logger that only logs in development
 */
const isDev = process.env.NODE_ENV !== "production";
// biome-ignore lint/suspicious/noEmptyBlockStatements: empty function is intentional for production
const log = isDev ? console.log : () => {};
const logError = console.error; // Always log errors

/**
 * Resolve import path, converting ~/ alias to actual file path
 */
const resolveImportPath = (importPath: string): string => {
  if (importPath.startsWith("~/")) {
    const pathWithoutAlias = importPath.slice(2);
    return `../../${pathWithoutAlias}`;
  }
  return importPath;
};

/**
 * Get route module from registry or dynamic import
 */
const getRouteModule = async (
  filePath: string
): Promise<{ default: unknown }> => {
  // Try static registry first
  try {
    const module = await import("./route-modules.generated");
    const routeModules = module.routeModules;
    const cached = routeModules.get(filePath);
    if (cached) {
      return cached;
    }
  } catch {
    // Registry might not exist yet
  }

  // Fallback to dynamic import
  const resolvedPath = resolveImportPath(filePath);
  return await import(resolvedPath);
};

/**
 * Build navigation payload from route info and data
 */
const buildNavigationPayload = (
  routeInfo: RouteInfo,
  params: Record<string, string>,
  data: unknown,
  head: HeadData
): NavigationPayload => {
  // Get chunks for route
  const routeChunks = getRouteChunks(routeInfo.path);
  const chunks = routeChunks ? routeChunks.map((chunk) => chunk.path) : [];

  // Build route metadata
  const routeMetadata = {
    path: routeInfo.path,
    pageType: routeInfo.pageType,
    hasClientComponents: hasClientComponents(routeInfo),
    params,
  };

  // Build payload without hash first
  const payloadWithoutHash: Omit<NavigationPayload, "hash"> = {
    data,
    route: routeMetadata,
    chunks,
    head,
  };

  // Generate hash
  const hash = generatePayloadHash(payloadWithoutHash);

  // Return complete payload
  return {
    ...payloadWithoutHash,
    hash,
  };
};

/**
 * Handle data request for /__data/* endpoints
 */
export const handleDataRequest = async (req: Request): Promise<Response> => {
  try {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Strip /__data prefix to get actual route path
    if (!pathname.startsWith("/__data")) {
      return new Response("Invalid data endpoint", { status: 400 });
    }

    const routePath = pathname.slice("/__data".length) || "/";

    log(`[DATA] Handling request for: ${routePath}`);

    // Match route
    const routeTree = getRouteTree();
    const matchResult = matchRoute(routePath, routeTree.routes);

    if (!matchResult) {
      log(`[DATA] Route not found: ${routePath}`);
      return new Response(
        JSON.stringify({
          notFound: true,
          route: {
            path: routePath,
            pageType: "dynamic" as const,
            hasClientComponents: false,
            params: {},
          },
          chunks: [],
          head: {},
          data: null,
          hash: "",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const { route: routeInfo, params } = matchResult;

    // Load page module
    const pageModule = await getRouteModule(routeInfo.filePath);
    const PageComponent = pageModule.default;

    if (!PageComponent) {
      logError(`[DATA] No default export found in ${routeInfo.filePath}`);
      return new Response(
        JSON.stringify({ error: "Page component not found" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Check for redirect first
    if (hasPageConfig(PageComponent) && routeInfo.hasRedirect) {
      const config = getPageConfig(PageComponent);
      if (config.redirect) {
        const redirectUrl = await config.redirect(params);
        if (redirectUrl) {
          log(`[DATA] Redirect: ${routePath} -> ${redirectUrl}`);
          return new Response(
            JSON.stringify({
              redirect: redirectUrl,
              route: {
                path: routePath,
                pageType: routeInfo.pageType,
                hasClientComponents: hasClientComponents(routeInfo),
                params,
              },
              chunks: [],
              head: {},
              data: null,
              hash: "",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      }
    }

    // Execute loader if present
    let pageData: unknown;
    if (hasPageConfig(PageComponent) && routeInfo.hasLoader) {
      const config = getPageConfig(PageComponent);
      if (config.loader) {
        try {
          log(`[DATA] Executing loader for: ${routePath}`);
          pageData = await config.loader(params);
          log(`[DATA] Loader completed for: ${routePath}`);
        } catch (error) {
          logError(`[DATA] Loader error for ${routePath}:`, error);
          return new Response(
            JSON.stringify({
              error: "Loader failed",
              message: error instanceof Error ? error.message : String(error),
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      }
    }

    // Execute generateMetadata if present
    let head: HeadData = {};
    if (hasPageConfig(PageComponent) && routeInfo.hasGenerateMetadata) {
      const config = getPageConfig(PageComponent);
      if (config.generateMetadata) {
        try {
          log(`[DATA] Executing generateMetadata for: ${routePath}`);
          head = await config.generateMetadata({ params, data: pageData });
          log(`[DATA] generateMetadata completed for: ${routePath}`);
        } catch (error) {
          logError(`[DATA] generateMetadata error for ${routePath}:`, error);
          // Don't fail the request, just use empty head
          head = {};
        }
      }
    }

    // Build and return payload
    const payload = buildNavigationPayload(routeInfo, params, pageData, head);

    log(`[DATA] Returning payload for: ${routePath}`);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logError("[DATA] Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
