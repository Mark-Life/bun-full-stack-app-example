import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import {
  extractPageType,
  hasGenerateParams,
  hasLoader,
  hasGenerateMetadata,
  hasRedirect,
} from "~/framework/shared/page";
import {
  discoverRoutes,
  matchRoute,
  matchRouteHandler,
  type RouteHandlerInfo,
  type RouteInfo,
  type RouteTree,
} from "~/framework/shared/router";
import {
  type ComponentType,
  hasClientBoundariesSync,
  hasUseClientDirective,
} from "~/framework/shared/rsc";
import { renderRoute } from "./render";

/**
 * Simple logger that only logs in development
 */
const isDev = process.env.NODE_ENV !== "production";
const log = isDev ? console.log : () => {};
const logError = console.error; // Always log errors

const LAYOUT_FILE = "layout.tsx";

/**
 * Mutable route tree that can be updated during development
 */
let routeTree: RouteTree | null = null;

/**
 * Initialize route tree (must be called at startup before server starts)
 */
export const initializeRouteTree = async (): Promise<void> => {
  if (routeTree) {
    return;
  }
  routeTree = await discoverRoutes("./src/app");
  log(`📁 Discovered ${routeTree.routes.size} routes`);
};

/**
 * Get the route tree (must be initialized first)
 */
export const getRouteTree = (): RouteTree => {
  if (!routeTree) {
    throw new Error(
      "Route tree not initialized. Call initializeRouteTree() at startup."
    );
  }
  return routeTree;
};

/**
 * Rediscover routes (useful for dev mode hot reloading)
 */
export const rediscoverRoutes = async (): Promise<RouteTree> => {
  routeTree = await discoverRoutes("./src/app");
  log(
    `🔄 Rediscovered ${routeTree.routes.size} routes, ${routeTree.routeHandlers.size} route handlers`
  );
  return routeTree;
};

/**
 * Build route handlers dynamically
 */
export const buildRouteHandlers = () => {
  const handlers: Record<string, () => Promise<Response>> = {};

  // Add handlers for each discovered route
  for (const [path, routeInfo] of routeTree.routes.entries()) {
    handlers[path] = async () => renderRoute(routeInfo);
  }

  return handlers;
};

/**
 * Convert absolute file path to import path using ~/ alias
 */
const toImportPath = (filePath: string, baseDir: string): string => {
  const relativePath = relative(baseDir, filePath);
  const cleanPath = relativePath.startsWith("./")
    ? relativePath.slice(2)
    : relativePath;
  return `~/${cleanPath}`;
};

/**
 * Find layouts for not-found page (only root layout)
 */
const findNotFoundLayouts = (
  appDir: string,
  srcDir: string
): {
  layoutPath?: string;
  parentLayouts: string[];
  layoutTypes: ComponentType[];
} => {
  const rootLayout = join(appDir, LAYOUT_FILE);
  if (existsSync(rootLayout)) {
    const isClient = hasUseClientDirective(rootLayout);
    return {
      layoutPath: toImportPath(rootLayout, srcDir),
      parentLayouts: [],
      layoutTypes: [isClient ? "client" : "server"],
    };
  }
  return { parentLayouts: [], layoutTypes: [] };
};

/**
 * Get RouteInfo for not-found.tsx if it exists
 */
export const getNotFoundRouteInfo = (): RouteInfo | null => {
  const appDir = join(process.cwd(), "src/app");
  const srcDir = join(process.cwd(), "src");
  const notFoundPath = join(appDir, "not-found.tsx");

  if (!existsSync(notFoundPath)) {
    return null;
  }

  const { layoutPath, parentLayouts, layoutTypes } =
    findNotFoundLayouts(appDir, srcDir);

  const isClientComponent = hasUseClientDirective(notFoundPath);
  const hasClientBoundaries = hasClientBoundariesSync(notFoundPath);
  const pageType = extractPageType(notFoundPath);
  const hasStaticParams = hasGenerateParams(notFoundPath);
  const hasLoaderFn = hasLoader(notFoundPath);
  const hasGenerateMetadataFn = hasGenerateMetadata(notFoundPath);
  const hasRedirectFn = hasRedirect(notFoundPath);

  const routeInfo: RouteInfo = {
    path: "/not-found", // Dummy path, not used for routing
    filePath: toImportPath(notFoundPath, srcDir),
    parentLayouts,
    isClientComponent,
    layoutTypes,
    hasClientBoundaries,
    pageType,
    hasStaticParams,
    hasLoader: hasLoaderFn,
    hasGenerateMetadata: hasGenerateMetadataFn,
    hasRedirect: hasRedirectFn,
  };

  if (layoutPath) {
    routeInfo.layoutPath = layoutPath;
  }

  return routeInfo;
};

/**
 * Execute a route handler (route.ts file)
 * Route handlers export HTTP method handlers (GET, POST, etc.)
 */
const executeRouteHandler = async (
  handlerInfo: RouteHandlerInfo,
  request: Request,
  params: Record<string, string>
): Promise<Response> => {
  try {
    // Import the route handler module
    const handlerModule = await import(handlerInfo.filePath);
    const method = request.method as
      | "GET"
      | "POST"
      | "PUT"
      | "PATCH"
      | "DELETE"
      | "HEAD"
      | "OPTIONS";

    // Check if the handler exports the requested method
    const handler = handlerModule[method] || handlerModule.default;
    if (!handler) {
      return new Response(`Method ${method} not allowed`, { status: 405 });
    }

    // Call the handler with request and params
    const response = await handler(request, { params });

    // Ensure it returns a Response
    if (response instanceof Response) {
      return response;
    }

    // If it returns something else, wrap it
    return Response.json(response);
  } catch (error) {
    logError(`Error executing route handler ${handlerInfo.filePath}:`, error);
    return new Response("Internal server error", { status: 500 });
  }
};

/**
 * Match a URL path to a route handler and execute it
 */
export const matchAndExecuteRouteHandler = async (
  pathname: string,
  request: Request
): Promise<Response | null> => {
  const matchResult = matchRouteHandler(pathname, routeTree.routeHandlers);
  if (matchResult) {
    return await executeRouteHandler(
      matchResult.handler,
      request,
      matchResult.params
    );
  }
  return null;
};

/**
 * Match a URL path to a route and render it
 */
export const matchAndRenderRoute = (
  pathname: string
): Promise<Response> | null => {
  const matchResult = matchRoute(pathname, routeTree.routes);
  if (matchResult) {
    return renderRoute(matchResult.route, matchResult.params);
  }
  return null;
};
