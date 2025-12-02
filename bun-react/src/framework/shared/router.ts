import { existsSync, readdirSync, statSync } from "fs";
import { dirname, join, relative } from "path";
import {
  type ComponentType,
  hasClientBoundariesSync,
  hasUseClientDirective,
} from "~/framework/shared/rsc";

/**
 * Route file names that create routes
 */
const ROUTE_FILES = ["page.tsx", "index.tsx"];

/**
 * Layout file name
 */
const LAYOUT_FILE = "layout.tsx";

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
}

export interface RouteTree {
  routes: Map<string, RouteInfo>;
  layouts: Map<string, string>;
}

/**
 * Check if a file is a route file
 */
const isRouteFile = (filename: string): boolean =>
  ROUTE_FILES.includes(filename);

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
  const catchAllMatch = segment.match(/^\[\.\.\.(\w+)\]$/);
  if (catchAllMatch) {
    return { name: catchAllMatch[1]!, isCatchAll: true };
  }
  const dynamicMatch = segment.match(/^\[(\w+)\]$/);
  if (dynamicMatch) {
    return { name: dynamicMatch[1]!, isCatchAll: false };
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
  const routeSegment = filename.replace(/\.(tsx|ts|jsx|js)$/, "");

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
 * Layout info with component type
 */
interface LayoutInfo {
  path: string;
  isClient: boolean;
}

/**
 * Find all layout files in the path hierarchy
 * Returns layouts in order from root to leaf (outermost to innermost)
 * Also determines if each layout is a client component
 */
const findLayouts = (
  filePath: string,
  appDir: string
): {
  layoutPath?: string;
  parentLayouts: string[];
  layoutTypes: ComponentType[];
} => {
  const allLayouts: LayoutInfo[] = [];
  let currentDir = dirname(filePath);

  // Check root layout first
  const rootLayout = join(appDir, LAYOUT_FILE);
  if (existsSync(rootLayout)) {
    allLayouts.push({
      path: rootLayout,
      isClient: hasUseClientDirective(rootLayout),
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
      });
    }
    currentDir = dirname(currentDir);
  }

  // Build layout types array (maps to parentLayouts + layoutPath order)
  const layoutTypes: ComponentType[] = allLayouts.map((l) =>
    l.isClient ? "client" : "server"
  );

  // The last layout is the direct layout (closest to the route)
  // All others are parent layouts
  if (allLayouts.length === 0) {
    return { parentLayouts: [], layoutTypes: [] };
  }

  if (allLayouts.length === 1) {
    return {
      layoutPath: allLayouts[0]!.path,
      parentLayouts: [],
      layoutTypes,
    };
  }

  const layoutPath = allLayouts[allLayouts.length - 1]?.path;
  const parentLayouts = allLayouts.slice(0, -1).map((l) => l.path);

  if (layoutPath) {
    return { layoutPath, parentLayouts, layoutTypes };
  }
  return { parentLayouts, layoutTypes };
};

/**
 * Recursively scan directory for routes
 */
const scanDirectory = (
  dir: string,
  appDir: string,
  routes: Map<string, RouteInfo>,
  layouts: Map<string, string>
): void => {
  if (!existsSync(dir)) {
    return;
  }

  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Recursively scan subdirectories
      scanDirectory(fullPath, appDir, routes, layouts);
    } else if (stat.isFile()) {
      if (isRouteFile(entry)) {
        const {
          path: routePath,
          dynamicSegments,
          isDynamic,
        } = filePathToRoute(fullPath, appDir);
        const { layoutPath, parentLayouts, layoutTypes } = findLayouts(
          fullPath,
          appDir
        );

        // Check if the page itself is a client component
        const isClientComponent = hasUseClientDirective(fullPath);

        // Check if the page imports any client components (has client boundaries)
        const hasClientBoundaries = hasClientBoundariesSync(fullPath);

        const routeInfo: RouteInfo = {
          path: routePath,
          filePath: fullPath,
          parentLayouts,
          isDynamic,
          isClientComponent,
          layoutTypes,
          hasClientBoundaries,
          ...(dynamicSegments.length > 0 && { dynamicSegments }),
        };
        if (layoutPath) {
          routeInfo.layoutPath = layoutPath;
        }
        routes.set(routePath, routeInfo);
      } else if (isLayoutFile(entry)) {
        const layoutDir = dirname(fullPath);
        const { path: layoutRoute } = filePathToRoute(
          join(layoutDir, "page.tsx"),
          appDir
        );
        layouts.set(layoutRoute, fullPath);
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
  const layouts = new Map<string, string>();

  const resolvedAppDir = join(process.cwd(), appDir);
  const srcDir = join(process.cwd(), "src");

  if (!existsSync(resolvedAppDir)) {
    return { routes, layouts };
  }

  scanDirectory(resolvedAppDir, resolvedAppDir, routes, layouts);

  // Convert absolute paths to import paths
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

  return { routes, layouts };
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

  const params: Record<string, string> = {};

  // Handle catch-all routes
  if (
    patternParts.length > 0 &&
    patternParts[patternParts.length - 1]?.startsWith("*")
  ) {
    const catchAllParam = patternParts[patternParts.length - 1]!.slice(1);
    if (urlParts.length >= patternParts.length - 1) {
      const matchedParts = patternParts.slice(0, -1);
      for (let i = 0; i < matchedParts.length; i++) {
        const patternPart = matchedParts[i]!;
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
    }
    return { matched: false, params: {} };
  }

  // Regular dynamic route matching
  if (patternParts.length !== urlParts.length) {
    return { matched: false, params: {} };
  }

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i]!;
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
 * Match a URL path to a route and extract params
 */
export const matchRoute = (
  urlPath: string,
  routes: Map<string, RouteInfo>
): { route: RouteInfo; params: Record<string, string> } | null => {
  // Normalize URL path
  const normalizedPath =
    urlPath === "/" ? "/" : urlPath.replace(/\/$/, "") || "/";

  // Exact match first
  if (routes.has(normalizedPath)) {
    const route = routes.get(normalizedPath)!;
    return { route, params: {} };
  }

  // Try with trailing slash
  const withSlash = normalizedPath === "/" ? "/" : `${normalizedPath}/`;
  if (routes.has(withSlash)) {
    const route = routes.get(withSlash)!;
    return { route, params: {} };
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
