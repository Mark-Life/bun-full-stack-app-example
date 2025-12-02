import type { BunPlugin } from "bun";
import { discoverRoutes } from "./router";
import type { ComponentType } from "./rsc";

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
    build.onResolve({ filter: /^virtual:routes$/ }, () => ({
      path: "virtual:routes",
      namespace: "virtual-routes",
    }));

    // Generate the routes module when virtual:routes is loaded
    build.onLoad({ filter: /.*/, namespace: "virtual-routes" }, async () => {
      const { routes } = discoverRoutes("./src/app");

      // Generate import statements and route configuration
      const imports: string[] = [];
      const routeEntries: string[] = [];

      /**
       * Generate a unique component name from path
       */
      const generateComponentName = (
        path: string,
        type: "page" | "layout"
      ): string => {
        const parts = path
          .replace(/^~\//, "") // Remove ~/ alias
          .replace(/^\.\/src\/app\//, "") // Remove ./src/app/ prefix
          .replace(/^\.\/app\//, "") // Remove ./app/ prefix
          .replace(/\.(tsx|ts|jsx|js)$/, "")
          .split("/")
          .filter(Boolean);

        const name = parts
          .map((part) => {
            // Convert dynamic segments to PascalCase
            if (part.startsWith("[") && part.endsWith("]")) {
              const param = part.slice(1, -1);
              return param.charAt(0).toUpperCase() + param.slice(1);
            }
            // Convert kebab-case and snake_case to PascalCase
            return part
              .split(/[-_]/)
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join("");
          })
          .join("");

        return `${name}${type === "layout" ? "Layout" : "Page"}`;
      };

      // Track unique layouts and their types
      const layoutMap = new Map<
        string,
        { name: string; type: ComponentType }
      >();

      /**
       * Convert import path to be relative to project root
       * Handles ~/ alias (maps to ./src/) and other path formats
       */
      const toImportPath = (filePath: string): string => {
        // Handle ~/ alias (maps to ./src/)
        if (filePath.startsWith("~/")) {
          return filePath.replace("~/", "./src/");
        }
        if (filePath.startsWith("./src/")) {
          return filePath;
        }
        if (filePath.startsWith("./app/")) {
          return filePath.replace("./app/", "./src/app/");
        }
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

      // First pass: collect all layouts and determine types
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
          typeIndex++;
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

      // Second pass: generate imports
      // Note: We bundle ALL pages (server and client) because server component pages
      // may contain client component imports that need to be available for hydration.
      // The componentType flag tells the client which components need full hydration.
      for (const [, routeInfo] of routes.entries()) {
        const pageComponentName = generateComponentName(
          routeInfo.filePath,
          "page"
        );
        const importPath = toImportPath(routeInfo.filePath);

        // Always import pages - even server component pages may contain client boundaries
        imports.push(
          `const ${pageComponentName} = lazy(() => import("${importPath}"));`
        );
      }

      // Generate layout imports (only for client layouts)
      // Server layouts don't need client-side code
      for (const [layoutPath, layoutInfo] of layoutMap.entries()) {
        if (layoutInfo.type === "client") {
          const layoutImportPath = toImportPath(layoutPath);
          imports.push(
            `const ${layoutInfo.name} = lazy(() => import("${layoutImportPath}"));`
          );
        }
      }

      // Third pass: generate route entries
      for (const [routePath, routeInfo] of routes.entries()) {
        const pageComponentName = generateComponentName(
          routeInfo.filePath,
          "page"
        );

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
        // Server component pages may contain client component imports
        routeConfig.push(`component: ${pageComponentName}`);

        // Add component type so hydration knows how to handle it
        routeConfig.push(
          `componentType: "${
            routeInfo.isClientComponent ? "client" : "server"
          }"`
        );

        // Layout reference (only for client layouts)
        if (layoutInfo) {
          if (layoutInfo.type === "client") {
            routeConfig.push(`layout: ${layoutInfo.name}`);
          } else {
            routeConfig.push("layout: null");
          }
          routeConfig.push(`layoutType: "${layoutInfo.type}"`);
        }

        // Parent layouts (only client ones)
        if (parentLayoutInfo.length > 0) {
          const clientParentLayouts = parentLayoutInfo
            .filter((info) => info!.type === "client")
            .map((info) => info!.name);

          const parentLayoutTypes = parentLayoutInfo.map(
            (info) => `"${info!.type}"`
          );

          if (clientParentLayouts.length > 0) {
            routeConfig.push(
              `parentLayouts: [${clientParentLayouts.join(", ")}]`
            );
          } else {
            routeConfig.push("parentLayouts: []");
          }
          routeConfig.push(
            `parentLayoutTypes: [${parentLayoutTypes.join(", ")}]`
          );
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

        routeEntries.push(`  "${routePath}": { ${routeConfig.join(", ")} }`);
      }

      const generatedCode = `import { lazy } from "react";

${imports.join("\n")}

export type ComponentType = "server" | "client";
export type PageType = "static" | "dynamic";

export interface RouteConfig {
  /** Lazy component - always defined, even for server components (they may contain client boundaries) */
  component: React.LazyExoticComponent<React.ComponentType<any>>;
  /** Whether this is a server or client component */
  componentType: ComponentType;
  /** Lazy layout for client layouts, null for server layouts */
  layout?: React.LazyExoticComponent<React.ComponentType<{ children: React.ReactNode }>> | null;
  /** Layout component type */
  layoutType?: ComponentType;
  /** Client parent layouts (lazy loaded) */
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

      return {
        contents: generatedCode,
        loader: "tsx",
      };
    });
  },
};
