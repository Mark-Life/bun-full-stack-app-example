import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import {
  discoverRoutes,
  matchRoute,
  type RouteInfo,
  type RouteTree,
} from "@/framework/shared/router";
import { hasClientNavigation } from "~/framework/shared/layout";
import {
  extractPageType,
  hasGenerateParams,
  hasLoader,
} from "~/framework/shared/page";
import {
  type ComponentType,
  hasClientBoundariesSync,
  hasUseClientDirective,
} from "~/framework/shared/rsc";
import { renderRoute } from "./render";

const LAYOUT_FILE = "layout.tsx";

/**
 * Mutable route tree that can be updated during development
 */
let routeTree = discoverRoutes("./src/app");
console.log(`📁 Discovered ${routeTree.routes.size} routes`);

/**
 * Get the route tree
 */
export const getRouteTree = (): RouteTree => routeTree;

/**
 * Rediscover routes (useful for dev mode hot reloading)
 */
export const rediscoverRoutes = (): RouteTree => {
  routeTree = discoverRoutes("./src/app");
  console.log(`🔄 Rediscovered ${routeTree.routes.size} routes`);
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
  clientNavigable: boolean;
} => {
  const rootLayout = join(appDir, LAYOUT_FILE);
  if (existsSync(rootLayout)) {
    const isClient = hasUseClientDirective(rootLayout);
    const clientNavigable = hasClientNavigation(rootLayout);
    return {
      layoutPath: toImportPath(rootLayout, srcDir),
      parentLayouts: [],
      layoutTypes: [isClient ? "client" : "server"],
      clientNavigable,
    };
  }
  return { parentLayouts: [], layoutTypes: [], clientNavigable: false };
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

  const { layoutPath, parentLayouts, layoutTypes, clientNavigable } =
    findNotFoundLayouts(appDir, srcDir);

  const isClientComponent = hasUseClientDirective(notFoundPath);
  const hasClientBoundaries = hasClientBoundariesSync(notFoundPath);
  const pageType = extractPageType(notFoundPath);
  const hasStaticParams = hasGenerateParams(notFoundPath);
  const hasLoaderFn = hasLoader(notFoundPath);

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
    clientNavigable,
  };

  if (layoutPath) {
    routeInfo.layoutPath = layoutPath;
  }

  return routeInfo;
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
