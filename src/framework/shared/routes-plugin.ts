import { existsSync } from "node:fs";
import { join } from "node:path";
import type { BunPlugin } from "bun";
import { discoverRoutes } from "./router";
import type { ComponentType } from "./rsc";

// Regex patterns defined at top level for performance
const VIRTUAL_ROUTES_FILTER = /^virtual:routes$/;
const VIRTUAL_ROUTES_LOAD_FILTER = /.*/;
const SRC_IMPORT_FILTER = /^\.\/src\//;
const ALIAS_PREFIX_REGEX = /^~\//;
const SRC_APP_PREFIX_REGEX = /^\.\/src\/app\//;
const APP_PREFIX_REGEX = /^\.\/app\//;
const FILE_EXTENSION_REGEX = /\.(tsx|ts|jsx|js)$/;
const KEBAB_SNAKE_CASE_REGEX = /[-_]/;

/**
 * Generate a unique component name from path
 */
const generateComponentName = (
  path: string,
  type: "page" | "layout"
): string => {
  const parts = path
    .replace(ALIAS_PREFIX_REGEX, "") // Remove ~/ alias
    .replace(SRC_APP_PREFIX_REGEX, "") // Remove ./src/app/ prefix
    .replace(APP_PREFIX_REGEX, "") // Remove ./app/ prefix
    .replace(FILE_EXTENSION_REGEX, "")
    .split("/")
    .filter(Boolean);

  const name = parts
    .map((part) => {
      // Convert dynamic segments to PascalCase
      if (part.startsWith("[") && part.endsWith("]")) {
        let param = part.slice(1, -1);
        // Handle catch-all routes: [...param] -> extract just "param"
        if (param.startsWith("...")) {
          param = param.slice(3);
        }
        return param.charAt(0).toUpperCase() + param.slice(1);
      }
      // Convert kebab-case and snake_case to PascalCase
      return part
        .split(KEBAB_SNAKE_CASE_REGEX)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join("");
    })
    .join("");

  return `${name}${type === "layout" ? "Layout" : "Page"}`;
};

/**
 * Convert import path to be relative to project root
 * Handles ~/ alias (maps to ./src/) and other path formats
 * Ensures paths are relative and work correctly during bundling
 */
const toImportPath = (filePath: string): string => {
  // Handle ~/ alias (maps to ./src/)
  if (filePath.startsWith("~/")) {
    return filePath.replace("~/", "./src/");
  }
  // Handle @/ alias (maps to ./src/)
  if (filePath.startsWith("@/")) {
    return filePath.replace("@/", "./src/");
  }
  // Already correct format
  if (filePath.startsWith("./src/")) {
    return filePath;
  }
  // Handle ./app/ paths
  if (filePath.startsWith("./app/")) {
    return filePath.replace("./app/", "./src/app/");
  }
  // Handle absolute paths (shouldn't happen, but guard against it)
  if (filePath.startsWith("/")) {
    // Extract relative path from absolute path
    const srcIndex = filePath.indexOf("/src/");
    if (srcIndex !== -1) {
      return `.${filePath.slice(srcIndex)}`;
    }
    // Fallback: try to make it relative
    return `./src/${filePath.split("/").pop() || ""}`;
  }
  // Handle relative paths without ./
  if (!(filePath.startsWith("./") || filePath.startsWith("../"))) {
    return `./src/${filePath}`;
  }
  // Handle other relative paths
  return filePath.startsWith("./")
    ? `./src/${filePath.slice(2)}`
    : `./src/${filePath}`;
};

/**
 * Check if layout is the root layout (renders <html>)
 */
const isRootLayout = (layoutPath: string): boolean =>
  layoutPath === "./app/layout.tsx" ||
  layoutPath === "./src/app/layout.tsx" ||
  layoutPath === "~/app/layout.tsx" ||
  layoutPath.endsWith("/app/layout.tsx") ||
  layoutPath.endsWith("/src/app/layout.tsx");

type LayoutInfo = { name: string; type: ComponentType };

/**
 * Collect all layouts and determine types
 */
const collectLayouts = (
  routes: Map<string, import("./router").RouteInfo>
): Map<string, LayoutInfo> => {
  const layoutMap = new Map<string, LayoutInfo>();

  for (const [, routeInfo] of routes.entries()) {
    // Get layout types array (parallel to parentLayouts + layoutPath)
    const layoutTypes = routeInfo.layoutTypes || [];
    let typeIndex = 0;

    // Parent layouts
    for (const parentLayoutPath of routeInfo.parentLayouts) {
      if (
        !(layoutMap.has(parentLayoutPath) || isRootLayout(parentLayoutPath))
      ) {
        const layoutType = layoutTypes[typeIndex] || "server";
        layoutMap.set(parentLayoutPath, {
          name: generateComponentName(parentLayoutPath, "layout"),
          type: layoutType,
        });
      }
      typeIndex += 1;
    }

    // Direct layout
    if (
      routeInfo.layoutPath &&
      !isRootLayout(routeInfo.layoutPath) &&
      !layoutMap.has(routeInfo.layoutPath)
    ) {
      const layoutType = layoutTypes[typeIndex] || "server";
      layoutMap.set(routeInfo.layoutPath, {
        name: generateComponentName(routeInfo.layoutPath, "layout"),
        type: layoutType,
      });
    }
  }

  return layoutMap;
};

/**
 * Generate import statements for pages and layouts
 * Note: We import ALL layouts (server and client) so they can be used
 * during hydration to match the SSR DOM structure.
 * Server layouts are safe to run on client - they're just wrapper components.
 */
const generateImports = (
  routes: Map<string, import("./router").RouteInfo>,
  layoutMap: Map<string, LayoutInfo>
): string[] => {
  const imports: string[] = [];

  // Import all pages
  for (const [, routeInfo] of routes.entries()) {
    const pageComponentName = generateComponentName(routeInfo.filePath, "page");
    const importPath = toImportPath(routeInfo.filePath);
    imports.push(
      `const ${pageComponentName} = lazy(() => import("${importPath}"));`
    );
  }

  // Import ALL layouts (server and client)
  // Server layouts are just wrapper components and can run on client
  for (const [layoutPath, layoutInfo] of layoutMap.entries()) {
    const layoutImportPath = toImportPath(layoutPath);
    imports.push(
      `const ${layoutInfo.name} = lazy(() => import("${layoutImportPath}"));`
    );
  }

  return imports;
};

/**
 * Generate route configuration for a single route
 */
const generateRouteConfig = (
  routePath: string,
  routeInfo: import("./router").RouteInfo,
  layoutMap: Map<string, LayoutInfo>
): string => {
  const pageComponentName = generateComponentName(routeInfo.filePath, "page");

  // Get layout info
  const layoutInfo =
    routeInfo.layoutPath && !isRootLayout(routeInfo.layoutPath)
      ? layoutMap.get(routeInfo.layoutPath)
      : undefined;

  // Get parent layout info (filter out root layout)
  const parentLayoutInfo = routeInfo.parentLayouts
    .filter((path) => !isRootLayout(path))
    .map((path) => layoutMap.get(path))
    .filter(Boolean);

  const routeConfig: string[] = [];

  // Always include the component reference (server or client)
  routeConfig.push(`component: ${pageComponentName}`);

  // Add component type so hydration knows how to handle it
  routeConfig.push(
    `componentType: "${routeInfo.isClientComponent ? "client" : "server"}"`
  );

  // Layout reference (include ALL layouts for hydration)
  // Server layouts are safe to run on client during hydration
  if (layoutInfo) {
    routeConfig.push(`layout: ${layoutInfo.name}`);
    routeConfig.push(`layoutType: "${layoutInfo.type}"`);
  }

  // Parent layouts (include ALL layouts for hydration)
  if (parentLayoutInfo.length > 0) {
    const allParentLayouts = parentLayoutInfo
      .filter(
        (info): info is NonNullable<typeof info> =>
          info !== null && info !== undefined
      )
      .map((info) => info.name);

    const parentLayoutTypes = parentLayoutInfo
      .filter(
        (info): info is NonNullable<typeof info> =>
          info !== null && info !== undefined
      )
      .map((info) => `"${info.type}"`);

    routeConfig.push(`parentLayouts: [${allParentLayouts.join(", ")}]`);
    routeConfig.push(`parentLayoutTypes: [${parentLayoutTypes.join(", ")}]`);
  }

  if (routeInfo.isDynamic) {
    routeConfig.push("isDynamic: true");
  }

  if (routeInfo.dynamicSegments && routeInfo.dynamicSegments.length > 0) {
    routeConfig.push(
      `dynamicSegments: ${JSON.stringify(routeInfo.dynamicSegments)}`
    );
  }

  // Add page type
  routeConfig.push(`pageType: "${routeInfo.pageType}"`);

  return `  "${routePath}": { ${routeConfig.join(", ")} }`;
};

/**
 * Generate the complete routes module code
 */
const generateRoutesCode = (
  imports: string[],
  routeEntries: string[]
): string => `import { lazy } from "react";

${imports.join("\n")}

export type ComponentType = "server" | "client";
export type PageType = "static" | "dynamic";

export interface RouteConfig {
  /** Lazy component - always defined, even for server components (they may contain client boundaries) */
  component: React.LazyExoticComponent<React.ComponentType<any>>;
  /** Whether this is a server or client component */
  componentType: ComponentType;
  /** Lazy layout component (server or client) */
  layout?: React.LazyExoticComponent<React.ComponentType<{ children: React.ReactNode }>>;
  /** Layout component type */
  layoutType?: ComponentType;
  /** All parent layouts (lazy loaded) */
  parentLayouts?: React.LazyExoticComponent<React.ComponentType<{ children: React.ReactNode }>>[];
  /** Types of parent layouts */
  parentLayoutTypes?: ComponentType[];
  isDynamic?: boolean;
  dynamicSegments?: string[];
  /** Page rendering type: static (build-time) or dynamic (request-time) */
  pageType: PageType;
}

export const routes: Record<string, RouteConfig> = {
${routeEntries.join(",\n")}
};
`;

/**
 * Bundler plugin that generates a virtual routes module
 * Scans the app directory and generates route components with RSC support
 *
 * Server components: Not bundled for client, rendered on server only
 * Client components: Lazy-loaded, hydrated on client
 */
export const routesPlugin: BunPlugin = {
  name: "virtual-routes",
  setup(build) {
    // Intercept imports of "virtual:routes"
    build.onResolve({ filter: VIRTUAL_ROUTES_FILTER }, () => ({
      path: "virtual:routes",
      namespace: "virtual-routes",
    }));

    // Intercept imports starting with ./src/ and resolve them relative to process.cwd()
    // This ensures paths resolve correctly even when working directory is different
    build.onResolve({ filter: SRC_IMPORT_FILTER }, (args) => {
      const cwd = process.cwd();
      const resolvedPath = join(cwd, args.path);

      // If file exists as-is, return it
      if (existsSync(resolvedPath)) {
        return { path: resolvedPath };
      }

      // Try adding .tsx extension
      const withTsxExt = `${resolvedPath}.tsx`;
      if (existsSync(withTsxExt)) {
        return { path: withTsxExt };
      }

      // Try adding .ts extension
      const withTsExt = `${resolvedPath}.ts`;
      if (existsSync(withTsExt)) {
        return { path: withTsExt };
      }

      // Return original path - let Bun handle the error
      return { path: resolvedPath };
    });

    // Generate the routes module when virtual:routes is loaded
    build.onLoad(
      { filter: VIRTUAL_ROUTES_LOAD_FILTER, namespace: "virtual-routes" },
      async () => {
        // Ensure we're resolving paths from the correct directory
        const cwd = process.cwd();

        // Verify src directory exists (sanity check)
        const srcPath = join(cwd, "src");
        if (!existsSync(srcPath)) {
          throw new Error(
            `src directory not found at ${srcPath}. Current working directory: ${cwd}`
          );
        }

        const routeTree = await discoverRoutes("./src/app");
        const routes = routeTree.routes;

        // First pass: collect all layouts and determine types
        const layoutMap = collectLayouts(routes);

        // Second pass: generate imports
        const imports = generateImports(routes, layoutMap);

        // Third pass: generate route entries
        const routeEntries = Array.from(routes.entries()).map(
          ([routePath, routeInfo]) =>
            generateRouteConfig(routePath, routeInfo, layoutMap)
        );

        // Generate the complete code
        const generatedCode = generateRoutesCode(imports, routeEntries);

        return {
          contents: generatedCode,
          loader: "tsx",
        };
      }
    );
  },
};
