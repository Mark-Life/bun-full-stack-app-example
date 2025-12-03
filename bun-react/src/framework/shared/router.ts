import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import {
  extractPageType,
  extractRevalidate,
  hasGenerateParams,
  hasLoader,
  type PageType,
} from "~/framework/shared/page";
import {
  type ComponentType,
  hasClientBoundariesSync,
  hasUseClientDirective,
} from "~/framework/shared/rsc";
import { hasClientNavigation } from "./layout";

/**
 * Route file names that create routes
 */
const ROUTE_FILES = ["page.tsx", "index.tsx"];

/**
 * Route handler file names (Next.js-style route.ts)
 * These take precedence over page.tsx files
 */
const ROUTE_HANDLER_FILES = ["route.ts", "route.tsx", "route.js", "route.jsx"];

/**
 * Layout file name
 */
const LAYOUT_FILE = "layout.tsx";

/**
 * Regex patterns for dynamic route segments
 */
const CATCH_ALL_PATTERN = /^\[\.\.\.(\w+)\]$/;
const DYNAMIC_PATTERN = /^\[(\w+)\]$/;
const FILE_EXTENSION_PATTERN = /\.(tsx|ts|jsx|js)$/;
const TRAILING_SLASH_PATTERN = /\/$/;

export interface RouteInfo {
  path: string;
  filePath: string;
  layoutPath?: string;
  parentLayouts: string[];
  isDynamic?: boolean;
  dynamicSegments?: string[];
  /** Whether the page component is a client component ("use client") */
  isClientComponent: boolean;
  /** Whether each layout is a client component (parallel to parentLayouts + layoutPath) */
  layoutTypes: ComponentType[];
  /** Whether the page imports any client components (has client boundaries) */
  hasClientBoundaries: boolean;
  /** Page rendering type: static (build-time), dynamic (request-time) */
  pageType: PageType;
  /** Has generateParams for static dynamic routes */
  hasStaticParams: boolean;
  /** Has loader for build-time data fetching */
  hasLoader: boolean;
  /** Whether this route is in a client-navigable group (SPA-style navigation) */
  clientNavigable: boolean;
  /** ISR revalidation interval in seconds. Undefined = no ISR */
  revalidate?: number;
}

export interface RouteHandlerInfo {
  path: string;
  filePath: string;
  dynamicSegments?: string[];
  isDynamic?: boolean;
}

export interface RouteTree {
  routes: Map<string, RouteInfo>;
  routeHandlers: Map<string, RouteHandlerInfo>;
  layouts: Map<string, string>;
}

/**
 * Check if a file is a route file
 */
const isRouteFile = (filename: string): boolean =>
  ROUTE_FILES.includes(filename);

/**
 * Check if a file is a route handler file
 */
const isRouteHandlerFile = (filename: string): boolean =>
  ROUTE_HANDLER_FILES.includes(filename);

/**
 * Check if a file is a layout file
 */
const isLayoutFile = (filename: string): boolean => filename === LAYOUT_FILE;

/**
 * Extract dynamic segments from a path segment
 * Returns the param name and whether it's a catch-all
 */
const extractDynamicSegment = (
  segment: string
): { name: string; isCatchAll: boolean } | null => {
  const catchAllMatch = segment.match(CATCH_ALL_PATTERN);
  if (catchAllMatch?.[1]) {
    return { name: catchAllMatch[1], isCatchAll: true };
  }
  const dynamicMatch = segment.match(DYNAMIC_PATTERN);
  if (dynamicMatch?.[1]) {
    return { name: dynamicMatch[1], isCatchAll: false };
  }
  return null;
};

/**
 * Convert file path to URL route with dynamic segment support
 * app/page.tsx -> /
 * app/about/page.tsx -> /about
 * app/blog/[slug]/page.tsx -> /blog/:slug
 * app/docs/[...slug]/page.tsx -> /docs/*slug
 */
const filePathToRoute = (
  filePath: string,
  appDir: string
): {
  path: string;
  dynamicSegments: string[];
  isDynamic: boolean;
} => {
  const relativePath = relative(appDir, filePath);
  const dir = dirname(relativePath);
  const filename = relativePath.split("/").pop() || "";

  // Remove file extension
  const routeSegment = filename.replace(FILE_EXTENSION_PATTERN, "");

  // Build route path from directory segments
  const dirSegments = dir === "." ? [] : dir.split("/").filter(Boolean);
  const allSegments = [...dirSegments];

  // If it's not index.tsx or page.tsx, add the filename as a segment
  if (routeSegment !== "index" && routeSegment !== "page") {
    allSegments.push(routeSegment);
  }

  // Process segments and convert dynamic patterns
  const routeParts: string[] = [];
  const dynamicSegments: string[] = [];
  let isDynamic = false;

  for (const segment of allSegments) {
    const dynamicInfo = extractDynamicSegment(segment);
    if (dynamicInfo) {
      isDynamic = true;
      dynamicSegments.push(dynamicInfo.name);
      if (dynamicInfo.isCatchAll) {
        routeParts.push(`*${dynamicInfo.name}`);
      } else {
        routeParts.push(`:${dynamicInfo.name}`);
      }
    } else {
      routeParts.push(segment);
    }
  }

  const path = allSegments.length === 0 ? "/" : `/${routeParts.join("/")}`;

  return { path, dynamicSegments, isDynamic };
};

/**
 * Layout info with component type and client navigation flag
 */
interface LayoutInfo {
  path: string;
  isClient: boolean;
  hasClientNavigation: boolean;
}

/**
 * Find all layout files in the path hierarchy
 * Returns layouts in order from root to leaf (outermost to innermost)
 * Also determines if each layout is a client component and has client navigation
 */
const findLayouts = (
  filePath: string,
  appDir: string
): {
  layoutPath?: string;
  parentLayouts: string[];
  layoutTypes: ComponentType[];
  clientNavigable: boolean;
} => {
  const allLayouts: LayoutInfo[] = [];
  let currentDir = dirname(filePath);

  // Check root layout first
  const rootLayout = join(appDir, LAYOUT_FILE);
  if (existsSync(rootLayout)) {
    allLayouts.push({
      path: rootLayout,
      isClient: hasUseClientDirective(rootLayout),
      hasClientNavigation: hasClientNavigation(rootLayout),
    });
  }

  // Walk up the directory tree from route's directory to app directory
  const appDirParent = dirname(appDir);

  while (currentDir !== appDirParent && currentDir !== ".") {
    // Skip if we've reached the app directory itself
    if (currentDir === appDir) {
      currentDir = dirname(currentDir);
      continue;
    }

    const layoutFile = join(currentDir, LAYOUT_FILE);
    if (
      existsSync(layoutFile) &&
      !allLayouts.some((l) => l.path === layoutFile)
    ) {
      allLayouts.push({
        path: layoutFile,
        isClient: hasUseClientDirective(layoutFile),
        hasClientNavigation: hasClientNavigation(layoutFile),
      });
    }
    currentDir = dirname(currentDir);
  }

  // Build layout types array (maps to parentLayouts + layoutPath order)
  const layoutTypes: ComponentType[] = allLayouts.map((l) =>
    l.isClient ? "client" : "server"
  );

  // Check if any layout in the hierarchy has client navigation enabled
  // If so, all child routes are client-navigable
  const clientNavigable = allLayouts.some((l) => l.hasClientNavigation);

  // The last layout is the direct layout (closest to the route)
  // All others are parent layouts
  if (allLayouts.length === 0) {
    return { parentLayouts: [], layoutTypes: [], clientNavigable: false };
  }

  if (allLayouts.length === 1) {
    const layout = allLayouts[0];
    if (layout) {
      return {
        layoutPath: layout.path,
        parentLayouts: [],
        layoutTypes,
        clientNavigable,
      };
    }
  }

  const layoutPath = allLayouts.at(-1)?.path;
  const parentLayouts = allLayouts.slice(0, -1).map((l) => l.path);

  if (layoutPath) {
    return { layoutPath, parentLayouts, layoutTypes, clientNavigable };
  }
  return { parentLayouts, layoutTypes, clientNavigable };
};

/**
 * Process a route file and add it to the routes map
 */
const processRouteFile = (
  fullPath: string,
  appDir: string,
  routes: Map<string, RouteInfo>
): void => {
  const {
    path: routePath,
    dynamicSegments,
    isDynamic,
  } = filePathToRoute(fullPath, appDir);
  const { layoutPath, parentLayouts, layoutTypes, clientNavigable } =
    findLayouts(fullPath, appDir);

  // Check if the page itself is a client component
  const isClientComponent = hasUseClientDirective(fullPath);

  // Check if the page imports any client components (has client boundaries)
  // Also check if any layout imports client components
  const allLayoutPaths = [
    ...(layoutPath ? [layoutPath] : []),
    ...parentLayouts,
  ];
  const layoutHasClientBoundaries = allLayoutPaths.some((path) =>
    hasClientBoundariesSync(path)
  );
  const hasClientBoundaries =
    hasClientBoundariesSync(fullPath) || layoutHasClientBoundaries;

  // Detect page configuration
  const pageType = extractPageType(fullPath);
  const hasStaticParams = hasGenerateParams(fullPath);
  const hasLoaderFn = hasLoader(fullPath);
  const revalidateValue = extractRevalidate(fullPath);

  const routeInfo: RouteInfo = {
    path: routePath,
    filePath: fullPath,
    parentLayouts,
    isDynamic,
    isClientComponent,
    layoutTypes,
    hasClientBoundaries,
    pageType,
    hasStaticParams,
    hasLoader: hasLoaderFn,
    clientNavigable,
    ...(revalidateValue !== undefined && { revalidate: revalidateValue }),
    ...(dynamicSegments.length > 0 && { dynamicSegments }),
  };
  if (layoutPath) {
    routeInfo.layoutPath = layoutPath;
  }
  routes.set(routePath, routeInfo);
};

/**
 * Convert file path to URL route for route handlers (route.ts)
 * Similar to filePathToRoute but handles route.ts files
 */
const filePathToRouteHandler = (
  filePath: string,
  appDir: string
): {
  path: string;
  dynamicSegments: string[];
  isDynamic: boolean;
} => {
  const relativePath = relative(appDir, filePath);
  const dir = dirname(relativePath);

  // Build route path from directory segments (route.ts doesn't add a segment)
  const dirSegments = dir === "." ? [] : dir.split("/").filter(Boolean);

  // Process segments and convert dynamic patterns
  const routeParts: string[] = [];
  const dynamicSegments: string[] = [];
  let isDynamic = false;

  for (const segment of dirSegments) {
    const dynamicInfo = extractDynamicSegment(segment);
    if (dynamicInfo) {
      isDynamic = true;
      dynamicSegments.push(dynamicInfo.name);
      if (dynamicInfo.isCatchAll) {
        routeParts.push(`*${dynamicInfo.name}`);
      } else {
        routeParts.push(`:${dynamicInfo.name}`);
      }
    } else {
      routeParts.push(segment);
    }
  }

  const path = dirSegments.length === 0 ? "/" : `/${routeParts.join("/")}`;

  return { path, dynamicSegments, isDynamic };
};

/**
 * Process a route handler file and add it to the route handlers map
 */
const processRouteHandlerFile = (
  fullPath: string,
  appDir: string,
  routeHandlers: Map<string, RouteHandlerInfo>
): void => {
  const {
    path: routePath,
    dynamicSegments,
    isDynamic,
  } = filePathToRouteHandler(fullPath, appDir);

  const routeHandlerInfo: RouteHandlerInfo = {
    path: routePath,
    filePath: fullPath,
    ...(isDynamic !== undefined && { isDynamic }),
    ...(dynamicSegments.length > 0 && { dynamicSegments }),
  };

  routeHandlers.set(routePath, routeHandlerInfo);
};

/**
 * Process a layout file and add it to the layouts map
 */
const processLayoutFile = (
  fullPath: string,
  appDir: string,
  layouts: Map<string, string>
): void => {
  const layoutDir = dirname(fullPath);
  const { path: layoutRoute } = filePathToRoute(
    join(layoutDir, "page.tsx"),
    appDir
  );
  layouts.set(layoutRoute, fullPath);
};

/**
 * Options for scanning directories
 */
interface ScanDirectoryOptions {
  dir: string;
  appDir: string;
  routes: Map<string, RouteInfo>;
  routeHandlers: Map<string, RouteHandlerInfo>;
  layouts: Map<string, string>;
}

/**
 * Recursively scan directory for routes
 */
const scanDirectory = (options: ScanDirectoryOptions): void => {
  const { dir, appDir, routes, routeHandlers, layouts } = options;

  if (!existsSync(dir)) {
    return;
  }

  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Recursively scan subdirectories
      scanDirectory({ dir: fullPath, appDir, routes, routeHandlers, layouts });
    } else if (stat.isFile()) {
      if (isRouteHandlerFile(entry)) {
        processRouteHandlerFile(fullPath, appDir, routeHandlers);
      } else if (isRouteFile(entry)) {
        processRouteFile(fullPath, appDir, routes);
      } else if (isLayoutFile(entry)) {
        processLayoutFile(fullPath, appDir, layouts);
      }
    }
  }
};

/**
 * Convert absolute file path to import path using ~/ alias
 * This allows imports to work from any location in the codebase
 */
const toImportPath = (filePath: string, baseDir: string): string => {
  // Convert absolute path to relative path from src/
  const relativePath = relative(baseDir, filePath);
  // Remove leading ./ if present
  const cleanPath = relativePath.startsWith("./")
    ? relativePath.slice(2)
    : relativePath;
  // Use ~/ alias which maps to ./src/* in tsconfig
  return `~/${cleanPath}`;
};

/**
 * Discover all routes in the app directory
 */
export const discoverRoutes = (appDir = "./src/app"): RouteTree => {
  const routes = new Map<string, RouteInfo>();
  const routeHandlers = new Map<string, RouteHandlerInfo>();
  const layouts = new Map<string, string>();

  // Guard against running in browser environment
  if (typeof process === "undefined" || typeof process.cwd !== "function") {
    // Return empty route tree if running in browser (should never happen, but guard against it)
    return { routes, routeHandlers, layouts };
  }

  const resolvedAppDir = join(process.cwd(), appDir);
  const srcDir = join(process.cwd(), "src");

  if (!existsSync(resolvedAppDir)) {
    return { routes, routeHandlers, layouts };
  }

  scanDirectory({
    dir: resolvedAppDir,
    appDir: resolvedAppDir,
    routes,
    routeHandlers,
    layouts,
  });

  // Convert absolute paths to import paths for routes
  for (const [path, routeInfo] of routes.entries()) {
    const updatedRouteInfo: RouteInfo = {
      path: routeInfo.path,
      filePath: toImportPath(routeInfo.filePath, srcDir),
      parentLayouts: routeInfo.parentLayouts.map((layoutPath) =>
        toImportPath(layoutPath, srcDir)
      ),
      isClientComponent: routeInfo.isClientComponent,
      layoutTypes: routeInfo.layoutTypes,
      hasClientBoundaries: routeInfo.hasClientBoundaries,
      pageType: routeInfo.pageType,
      hasStaticParams: routeInfo.hasStaticParams,
      hasLoader: routeInfo.hasLoader,
      clientNavigable: routeInfo.clientNavigable,
      ...(routeInfo.revalidate !== undefined && {
        revalidate: routeInfo.revalidate,
      }),
    };
    if (routeInfo.layoutPath) {
      updatedRouteInfo.layoutPath = toImportPath(routeInfo.layoutPath, srcDir);
    }
    if (routeInfo.isDynamic !== undefined) {
      updatedRouteInfo.isDynamic = routeInfo.isDynamic;
    }
    if (routeInfo.dynamicSegments !== undefined) {
      updatedRouteInfo.dynamicSegments = routeInfo.dynamicSegments;
    }
    routes.set(path, updatedRouteInfo);
  }

  // Convert absolute paths to import paths for route handlers
  for (const [path, handlerInfo] of routeHandlers.entries()) {
    const updatedHandlerInfo: RouteHandlerInfo = {
      path: handlerInfo.path,
      filePath: toImportPath(handlerInfo.filePath, srcDir),
      ...(handlerInfo.isDynamic !== undefined && {
        isDynamic: handlerInfo.isDynamic,
      }),
      ...(handlerInfo.dynamicSegments !== undefined && {
        dynamicSegments: handlerInfo.dynamicSegments,
      }),
    };
    routeHandlers.set(path, updatedHandlerInfo);
  }

  return { routes, routeHandlers, layouts };
};

/**
 * Match catch-all route pattern
 */
const matchCatchAll = (
  patternParts: string[],
  urlParts: string[]
): { matched: boolean; params: Record<string, string> } => {
  const params: Record<string, string> = {};
  const lastPatternPart = patternParts.at(-1);
  if (!lastPatternPart?.startsWith("*")) {
    return { matched: false, params: {} };
  }

  const catchAllParam = lastPatternPart.slice(1);
  if (urlParts.length < patternParts.length - 1) {
    return { matched: false, params: {} };
  }

  const matchedParts = patternParts.slice(0, -1);
  for (let i = 0; i < matchedParts.length; i++) {
    const patternPart = matchedParts[i];
    if (!patternPart) {
      continue;
    }
    const urlPart = urlParts[i];

    if (patternPart.startsWith(":")) {
      params[patternPart.slice(1)] = urlPart || "";
    } else if (patternPart !== urlPart) {
      return { matched: false, params: {} };
    }
  }
  // Catch-all captures the rest
  params[catchAllParam] = urlParts.slice(matchedParts.length).join("/");
  return { matched: true, params };
};

/**
 * Match regular dynamic route pattern
 */
const matchRegular = (
  patternParts: string[],
  urlParts: string[]
): { matched: boolean; params: Record<string, string> } => {
  const params: Record<string, string> = {};

  if (patternParts.length !== urlParts.length) {
    return { matched: false, params: {} };
  }

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    if (!patternPart) {
      continue;
    }
    const urlPart = urlParts[i];

    if (patternPart.startsWith(":")) {
      params[patternPart.slice(1)] = urlPart || "";
    } else if (patternPart !== urlPart) {
      return { matched: false, params: {} };
    }
  }

  return { matched: true, params };
};

/**
 * Match a route pattern against a URL path and extract params
 */
const matchPattern = (
  pattern: string,
  urlPath: string
): { matched: boolean; params: Record<string, string> } => {
  const patternParts = pattern.split("/").filter(Boolean);
  const urlParts = urlPath.split("/").filter(Boolean);

  // Handle catch-all routes
  if (patternParts.length > 0) {
    const catchAllResult = matchCatchAll(patternParts, urlParts);
    if (catchAllResult.matched) {
      return catchAllResult;
    }
  }

  // Regular dynamic route matching
  return matchRegular(patternParts, urlParts);
};

/**
 * Match a URL path to a route handler and extract params
 */
export const matchRouteHandler = (
  urlPath: string,
  routeHandlers: Map<string, RouteHandlerInfo>
): { handler: RouteHandlerInfo; params: Record<string, string> } | null => {
  // Normalize URL path
  const normalizedPath =
    urlPath === "/" ? "/" : urlPath.replace(TRAILING_SLASH_PATTERN, "") || "/";

  // Exact match first
  const exactHandler = routeHandlers.get(normalizedPath);
  if (exactHandler) {
    return { handler: exactHandler, params: {} };
  }

  // Try with trailing slash
  const withSlash = normalizedPath === "/" ? "/" : `${normalizedPath}/`;
  const handlerWithSlash = routeHandlers.get(withSlash);
  if (handlerWithSlash) {
    return { handler: handlerWithSlash, params: {} };
  }

  // Try dynamic route matching
  for (const [pattern, handlerInfo] of routeHandlers.entries()) {
    if (handlerInfo.isDynamic) {
      const { matched, params } = matchPattern(pattern, normalizedPath);
      if (matched) {
        return { handler: handlerInfo, params };
      }
    }
  }

  return null;
};

/**
 * Match a URL path to a route and extract params
 */
export const matchRoute = (
  urlPath: string,
  routes: Map<string, RouteInfo>
): { route: RouteInfo; params: Record<string, string> } | null => {
  // Normalize URL path
  const normalizedPath =
    urlPath === "/" ? "/" : urlPath.replace(TRAILING_SLASH_PATTERN, "") || "/";

  // Exact match first
  const exactRoute = routes.get(normalizedPath);
  if (exactRoute) {
    return { route: exactRoute, params: {} };
  }

  // Try with trailing slash
  const withSlash = normalizedPath === "/" ? "/" : `${normalizedPath}/`;
  const routeWithSlash = routes.get(withSlash);
  if (routeWithSlash) {
    return { route: routeWithSlash, params: {} };
  }

  // Try dynamic route matching
  for (const [pattern, routeInfo] of routes.entries()) {
    if (routeInfo.isDynamic) {
      const { matched, params } = matchPattern(pattern, normalizedPath);
      if (matched) {
        return { route: routeInfo, params };
      }
    }
  }

  return null;
};
