import { existsSync, readdirSync, statSync } from "fs";
import { join, relative, dirname } from "path";

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
}

export interface RouteTree {
  routes: Map<string, RouteInfo>;
  layouts: Map<string, string>;
}

/**
 * Check if a file is a route file
 */
const isRouteFile = (filename: string): boolean => {
  return ROUTE_FILES.includes(filename);
};

/**
 * Check if a file is a layout file
 */
const isLayoutFile = (filename: string): boolean => {
  return filename === LAYOUT_FILE;
};

/**
 * Convert file path to URL route
 * app/page.tsx -> /
 * app/about/page.tsx -> /about
 * app/about/index.tsx -> /about
 */
const filePathToRoute = (filePath: string, appDir: string): string => {
  const relativePath = relative(appDir, filePath);
  const dir = dirname(relativePath);
  const filename = relativePath.split("/").pop() || "";

  // Remove file extension
  const routeSegment = filename.replace(/\.(tsx|ts|jsx|js)$/, "");

  // If it's index.tsx or page.tsx, use the directory as the route
  if (routeSegment === "index" || routeSegment === "page") {
    if (dir === ".") {
      return "/";
    }
    return `/${dir}`;
  }

  // Otherwise, use the filename as part of the route
  if (dir === ".") {
    return `/${routeSegment}`;
  }
  return `/${dir}/${routeSegment}`;
};

/**
 * Find all layout files in the path hierarchy
 * Returns layouts in order from root to leaf (outermost to innermost)
 */
const findLayouts = (
  filePath: string,
  appDir: string
): { layoutPath?: string; parentLayouts: string[] } => {
  const allLayouts: string[] = [];
  let currentDir = dirname(filePath);

  // Check root layout first
  const rootLayout = join(appDir, LAYOUT_FILE);
  if (existsSync(rootLayout)) {
    allLayouts.push(rootLayout);
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
    if (existsSync(layoutFile) && !allLayouts.includes(layoutFile)) {
      allLayouts.push(layoutFile);
    }
    currentDir = dirname(currentDir);
  }

  // The last layout is the direct layout (closest to the route)
  // All others are parent layouts
  if (allLayouts.length === 0) {
    return { parentLayouts: [] };
  }

  if (allLayouts.length === 1) {
    return { layoutPath: allLayouts[0]!, parentLayouts: [] };
  }

  const layoutPath = allLayouts[allLayouts.length - 1];
  const parentLayouts = allLayouts.slice(0, -1);

  if (layoutPath) {
    return { layoutPath, parentLayouts };
  }
  return { parentLayouts };
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
        const routePath = filePathToRoute(fullPath, appDir);
        const { layoutPath, parentLayouts } = findLayouts(fullPath, appDir);

        const routeInfo: RouteInfo = {
          path: routePath,
          filePath: fullPath,
          parentLayouts,
        };
        if (layoutPath) {
          routeInfo.layoutPath = layoutPath;
        }
        routes.set(routePath, routeInfo);
      } else if (isLayoutFile(entry)) {
        const layoutDir = dirname(fullPath);
        const layoutRoute = filePathToRoute(
          join(layoutDir, "page.tsx"),
          appDir
        );
        layouts.set(layoutRoute, fullPath);
      }
    }
  }
};

/**
 * Convert absolute file path to import path
 */
const toImportPath = (filePath: string, baseDir: string): string => {
  // Convert absolute path to relative path from src/
  const relativePath = relative(baseDir, filePath);
  // Remove leading ./ and ensure it starts with ./
  return relativePath.startsWith("./") ? relativePath : `./${relativePath}`;
};

/**
 * Discover all routes in the app directory
 */
export const discoverRoutes = (appDir: string = "./src/app"): RouteTree => {
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
    };
    if (routeInfo.layoutPath) {
      updatedRouteInfo.layoutPath = toImportPath(routeInfo.layoutPath, srcDir);
    }
    routes.set(path, updatedRouteInfo);
  }

  return { routes, layouts };
};

/**
 * Match a URL path to a route
 */
export const matchRoute = (
  urlPath: string,
  routes: Map<string, RouteInfo>
): RouteInfo | null => {
  // Exact match first
  if (routes.has(urlPath)) {
    return routes.get(urlPath)!;
  }

  // Try with trailing slash
  const withSlash = urlPath.endsWith("/")
    ? urlPath.slice(0, -1)
    : `${urlPath}/`;
  if (routes.has(withSlash)) {
    return routes.get(withSlash)!;
  }

  // Try without trailing slash
  const withoutSlash = urlPath.endsWith("/") ? urlPath.slice(0, -1) : urlPath;
  if (routes.has(withoutSlash)) {
    return routes.get(withoutSlash)!;
  }

  return null;
};
