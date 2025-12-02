import type { BunPlugin } from "bun";
import { discoverRoutes } from "./router";

/**
 * Bundler plugin that generates a virtual routes module
 * Scans the app directory and generates lazy-loaded route components
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

      // Helper to generate a unique component name
      const generateComponentName = (
        path: string,
        type: "page" | "layout"
      ): string => {
        const parts = path
          .replace(/^\.\/app\//, "")
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

      // Collect all unique layouts
      const layoutMap = new Map<string, string>();

      // Helper to convert import path - make it relative to project root
      // The entrypoint is src/hydrate.tsx, so imports need to be relative to that
      // Paths from discoverRoutes are like ./app/page.tsx (relative to src/)
      // But we need ./src/app/page.tsx (relative to project root) for the bundler
      const toImportPath = (filePath: string): string => {
        // If path already starts with ./src/, use it as-is
        if (filePath.startsWith("./src/")) {
          return filePath;
        }
        // If path starts with ./app/, convert to ./src/app/
        if (filePath.startsWith("./app/")) {
          return filePath.replace("./app/", "./src/app/");
        }
        // Otherwise, prepend ./src/
        return filePath.startsWith("./")
          ? `./src/${filePath.slice(2)}`
          : `./src/${filePath}`;
      };

      // Helper to check if a layout path is the root layout (app/layout.tsx)
      // Root layout wraps RootShell which renders <html> - skip during hydration
      const isRootLayout = (layoutPath: string): boolean => {
        return (
          layoutPath === "./app/layout.tsx" ||
          layoutPath === "./src/app/layout.tsx" ||
          layoutPath.endsWith("/app/layout.tsx") ||
          layoutPath.endsWith("/src/app/layout.tsx")
        );
      };

      for (const [, routeInfo] of routes.entries()) {
        // Generate page component import
        const pageComponentName = generateComponentName(
          routeInfo.filePath,
          "page"
        );
        const importPath = toImportPath(routeInfo.filePath);
        imports.push(
          `const ${pageComponentName} = lazy(() => import("${importPath}"));`
        );

        // Collect layouts (skip root layout - it renders <html> which is already in DOM)
        if (
          routeInfo.layoutPath &&
          !layoutMap.has(routeInfo.layoutPath) &&
          !isRootLayout(routeInfo.layoutPath)
        ) {
          const layoutComponentName = generateComponentName(
            routeInfo.layoutPath,
            "layout"
          );
          layoutMap.set(routeInfo.layoutPath, layoutComponentName);
          const layoutImportPath = toImportPath(routeInfo.layoutPath);
          imports.push(
            `const ${layoutComponentName} = lazy(() => import("${layoutImportPath}"));`
          );
        }

        for (const parentLayoutPath of routeInfo.parentLayouts) {
          // Skip root layout - it renders <html> which is already in the DOM
          if (
            !layoutMap.has(parentLayoutPath) &&
            !isRootLayout(parentLayoutPath)
          ) {
            const layoutComponentName = generateComponentName(
              parentLayoutPath,
              "layout"
            );
            layoutMap.set(parentLayoutPath, layoutComponentName);
            const parentLayoutImportPath = toImportPath(parentLayoutPath);
            imports.push(
              `const ${layoutComponentName} = lazy(() => import("${parentLayoutImportPath}"));`
            );
          }
        }
      }

      // Generate route entries
      for (const [routePath, routeInfo] of routes.entries()) {
        const pageComponentName = generateComponentName(
          routeInfo.filePath,
          "page"
        );

        // Skip root layout - it renders <html> which is already in the DOM
        const layoutComponentName =
          routeInfo.layoutPath && !isRootLayout(routeInfo.layoutPath)
            ? layoutMap.get(routeInfo.layoutPath)
            : undefined;

        // Filter out root layout from parent layouts
        const parentLayoutNames = routeInfo.parentLayouts
          .filter((path) => !isRootLayout(path))
          .map((path) => layoutMap.get(path));

        const routeConfig: string[] = [`component: ${pageComponentName}`];

        if (layoutComponentName) {
          routeConfig.push(`layout: ${layoutComponentName}`);
        }

        if (routeInfo.isDynamic) {
          routeConfig.push(`isDynamic: true`);
        }

        if (routeInfo.dynamicSegments && routeInfo.dynamicSegments.length > 0) {
          routeConfig.push(
            `dynamicSegments: ${JSON.stringify(routeInfo.dynamicSegments)}`
          );
        }

        if (parentLayoutNames.length > 0) {
          routeConfig.push(`parentLayouts: [${parentLayoutNames.join(", ")}]`);
        }

        routeEntries.push(`  "${routePath}": { ${routeConfig.join(", ")} }`);
      }

      const generatedCode = `import { lazy } from "react";

${imports.join("\n")}

export interface RouteConfig {
  component: React.LazyExoticComponent<React.ComponentType<any>>;
  layout?: React.LazyExoticComponent<React.ComponentType<{ children: React.ReactNode }>>;
  parentLayouts?: React.LazyExoticComponent<React.ComponentType<{ children: React.ReactNode }>>[];
  isDynamic?: boolean;
  dynamicSegments?: string[];
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
