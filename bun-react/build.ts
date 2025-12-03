#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { setCache } from "./src/framework/server/cache";
import { discoverPublicAssets } from "./src/framework/server/public";
import {
  renderRouteToString,
  renderShellToString,
} from "./src/framework/server/render";
import { hasCacheConfig } from "./src/framework/shared/cache";
import { generateRouteTypes } from "./src/framework/shared/generate-route-types";
import { getPageConfig, hasPageConfig } from "./src/framework/shared/page";
import { discoverRoutes, type RouteInfo } from "./src/framework/shared/router";
import { routesPlugin } from "./src/framework/shared/routes-plugin";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
🏗️  Bun Build Script

Usage: bun run build.ts [options]

Common Options:
  --outdir <path>          Output directory (default: "dist")
  --minify                 Enable minification (or --minify.whitespace, --minify.syntax, etc)
  --sourcemap <type>      Sourcemap type: none|linked|inline|external
  --target <target>        Build target: browser|bun|node
  --format <format>        Output format: esm|cjs|iife
  --splitting              Enable code splitting
  --packages <type>        Package handling: bundle|external
  --public-path <path>     Public path for assets
  --env <mode>             Environment handling: inline|disable|prefix*
  --conditions <list>      Package.json export conditions (comma separated)
  --external <list>        External packages (comma separated)
  --banner <text>          Add banner text to output
  --footer <text>          Add footer text to output
  --define <obj>           Define global constants (e.g. --define.VERSION=1.0.0)
  --help, -h               Show this help message

Example:
  bun run build.ts --outdir=dist --minify --sourcemap=linked --external=react,react-dom
`);
  process.exit(0);
}

const toCamelCase = (str: string): string =>
  str.replace(/-([a-z])/g, (_, char) => char.toUpperCase());

// Regex patterns defined at top level for performance
const INTEGER_REGEX = /^\d+$/;
const FLOAT_REGEX = /^\d*\.\d+$/;

const parseValue = (value: string): string | number | boolean | string[] => {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  if (INTEGER_REGEX.test(value)) {
    return Number.parseInt(value, 10);
  }
  if (FLOAT_REGEX.test(value)) {
    return Number.parseFloat(value);
  }

  if (value.includes(",")) {
    return value.split(",").map((v) => v.trim());
  }

  return value;
};

/**
 * Handle --no- prefix argument
 */
const handleNoPrefix = (
  arg: string,
  config: Record<string, unknown>
): boolean => {
  if (arg.startsWith("--no-")) {
    const key = toCamelCase(arg.slice(5));
    config[key] = false;
    return true;
  }
  return false;
};

/**
 * Handle boolean flag argument (no value)
 */
const handleBooleanFlag = (
  arg: string,
  args: string[],
  index: number,
  config: Record<string, unknown>
): boolean => {
  if (
    !arg.includes("=") &&
    (index === args.length - 1 || args[index + 1]?.startsWith("--"))
  ) {
    const key = toCamelCase(arg.slice(2));
    config[key] = true;
    return true;
  }
  return false;
};

/**
 * Extract key and value from argument
 */
const extractKeyValue = (
  arg: string,
  args: string[],
  index: number
): { key: string; value: string; nextIndex: number } => {
  if (arg.includes("=")) {
    const parts = arg.slice(2).split("=", 2);
    return {
      key: parts[0] ?? "",
      value: parts[1] ?? "",
      nextIndex: index,
    };
  }
  const nextIndex = index + 1;
  const nextArg = args[nextIndex];
  return {
    key: arg.slice(2),
    value: nextArg ?? "",
    nextIndex,
  };
};

/**
 * Set nested config value (for dot notation like minify.whitespace)
 */
const setNestedConfig = (
  key: string,
  value: string | number | boolean | string[],
  config: Record<string, unknown>
): void => {
  const [parentKey, childKey] = key.split(".");
  if (parentKey && childKey) {
    const parent = (config[parentKey] as Record<string, unknown>) || {};
    parent[childKey] = parseValue(value as string);
    config[parentKey] = parent;
  }
};

/**
 * Parse a single argument and update config
 */
const parseSingleArg = (
  arg: string,
  args: string[],
  index: number,
  config: Record<string, unknown>
): number => {
  if (arg === undefined || !arg.startsWith("--")) {
    return index;
  }

  if (handleNoPrefix(arg, config)) {
    return index;
  }

  if (handleBooleanFlag(arg, args, index, config)) {
    return index;
  }

  const { key, value, nextIndex } = extractKeyValue(arg, args, index);
  const camelKey = toCamelCase(key);

  if (camelKey.includes(".")) {
    setNestedConfig(camelKey, value, config);
  } else {
    config[camelKey] = parseValue(value);
  }

  return nextIndex;
};

const parseArgs = (): Partial<Bun.BuildConfig> => {
  const config: Record<string, unknown> = {};
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }
    if (!arg.startsWith("--")) {
      continue;
    }
    i = parseSingleArg(arg, args, i, config);
  }

  return config as Partial<Bun.BuildConfig>;
};

const formatFileSize = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
};

console.log("\n🚀 Starting build process...\n");

const cliConfig = parseArgs();
const outdir = cliConfig.outdir || path.join(process.cwd(), "dist");

// Generate route types for type-safe Link component
console.log("📝 Generating route types...");
await generateRouteTypes();
console.log();

if (existsSync(outdir)) {
  console.log(`🗑️ Cleaning previous build at ${outdir}`);
  await rm(outdir, { recursive: true, force: true });
}

const start = performance.now();

const outputs: Array<{ File: string; Type: string; Size: string }> = [];

/**
 * Copy public assets from src/public to dist/ (root level, matching server behavior)
 */
const copyPublicAssets = async () => {
  const publicDir = path.join(process.cwd(), "src/public");

  if (!existsSync(publicDir)) {
    console.log("📦 No public directory found, skipping");
    return;
  }

  try {
    const publicAssets = await discoverPublicAssets("./src/public");
    const assetPaths = Object.keys(publicAssets);

    if (assetPaths.length === 0) {
      console.log("📦 No public assets found");
      return;
    }

    // Copy each asset to dist root (matching server route structure)
    for (const [urlPath, file] of Object.entries(publicAssets)) {
      // Remove leading slash and create full destination path in dist root
      const relativePath = urlPath.slice(1);
      const destPath = path.join(outdir, relativePath);
      const destDir = path.dirname(destPath);

      // Ensure destination directory exists
      await mkdir(destDir, { recursive: true });

      // Copy file
      await Bun.write(destPath, file);
      outputs.push({
        File: path.relative(process.cwd(), destPath),
        Type: "asset",
        Size: formatFileSize((await file.arrayBuffer()).byteLength),
      });
    }

    console.log(
      `📦 Copied ${assetPaths.length} public asset${assetPaths.length === 1 ? "" : "s"}\n`
    );
  } catch (error) {
    console.warn("⚠️  Failed to copy public assets:", error);
  }
};

/**
 * Build hydration bundle
 */
const buildHydrateBundle = async () => {
  console.log("🔨 Building hydration bundle...");
  const tailwindPlugin = await import("bun-plugin-tailwind");
  const result = await Bun.build({
    entrypoints: ["./src/framework/client/hydrate.tsx"],
    plugins: [tailwindPlugin.default || tailwindPlugin, routesPlugin],
    target: "browser",
    minify: true,
    sourcemap: cliConfig.sourcemap || "linked",
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      ...cliConfig.define,
    },
  });

  if (!result.success) {
    console.error("❌ Failed to build hydrate bundle:", result.logs);
    throw new Error("Failed to build hydrate bundle");
  }

  const output = result.outputs[0];
  if (!output) {
    throw new Error("No output from hydrate bundle build");
  }

  // Write hydrate.js to dist root
  const hydrateDest = path.join(outdir, "hydrate.js");
  const bundleContent = await output.text();
  await Bun.write(hydrateDest, bundleContent);
  outputs.push({
    File: path.relative(process.cwd(), hydrateDest),
    Type: output.kind,
    Size: formatFileSize(output.size),
  });

  console.log("✅ Hydration bundle built\n");
};

/**
 * Build CSS bundle
 */
const buildCssBundle = async () => {
  console.log("🎨 Building CSS bundle...");
  try {
    const tailwindPlugin = await import("bun-plugin-tailwind");
    const result = await Bun.build({
      entrypoints: ["./src/index.css"],
      plugins: [tailwindPlugin.default || tailwindPlugin],
      target: "browser",
      minify: true,
      sourcemap: cliConfig.sourcemap || "linked",
      define: {
        "process.env.NODE_ENV": JSON.stringify("production"),
        ...cliConfig.define,
      },
    });

    if (result.success && result.outputs && result.outputs.length > 0) {
      const output = result.outputs[0];
      if (output) {
        // Write index.css to dist root
        const cssDest = path.join(outdir, "index.css");
        const cssContent = await output.text();
        await Bun.write(cssDest, cssContent);
        outputs.push({
          File: path.relative(process.cwd(), cssDest),
          Type: output.kind,
          Size: formatFileSize(output.size),
        });
        console.log("✅ CSS bundle built\n");
        return;
      }
    }
  } catch (error) {
    console.warn("⚠️  Failed to bundle CSS:", error);
  }

  // Fallback: copy raw CSS file
  const cssFile = Bun.file("./src/index.css");
  if (await cssFile.exists()) {
    const cssDest = path.join(outdir, "index.css");
    await Bun.write(cssDest, cssFile);
    const size = (await cssFile.arrayBuffer()).byteLength;
    outputs.push({
      File: path.relative(process.cwd(), cssDest),
      Type: "asset",
      Size: formatFileSize(size),
    });
    console.log("✅ CSS file copied (fallback)\n");
  }
};

/**
 * Resolve import path for build-time rendering
 */
const resolveImportPath = (importPath: string): string => {
  if (importPath.startsWith("~/")) {
    const pathWithoutAlias = importPath.slice(2);
    return `./src/${pathWithoutAlias}`;
  }
  return importPath;
};

/**
 * Build concrete path from route pattern and params
 * /blog/:slug with { slug: 'post-1' } -> /blog/post-1
 */
const buildConcretePath = (
  routePath: string,
  params: Record<string, string>
): string => {
  let concretePath = routePath;
  for (const [key, value] of Object.entries(params)) {
    concretePath = concretePath.replace(`:${key}`, value);
    concretePath = concretePath.replace(`*${key}`, value);
  }
  return concretePath;
};

/**
 * Get parameter sets for a route (handles dynamic routes with generateParams)
 */
const getParamSets = async (
  routePath: string,
  routeInfo: RouteInfo,
  PageComponent: unknown
): Promise<Record<string, string>[] | null> => {
  if (!(routeInfo.isDynamic && routeInfo.hasStaticParams)) {
    return [{}];
  }

  if (!hasPageConfig(PageComponent)) {
    console.warn(
      `⚠️  Dynamic route ${routePath} marked as static but has no generateParams, skipping`
    );
    return null;
  }

  const config = getPageConfig(PageComponent);
  if (!config.generateParams) {
    console.warn(
      `⚠️  Dynamic route ${routePath} marked as static but has no generateParams, skipping`
    );
    return null;
  }

  const generatedParams = await config.generateParams();
  return generatedParams;
};

/**
 * Load page data if loader exists
 */
const loadPageData = async (
  routeInfo: RouteInfo,
  PageComponent: unknown,
  params: Record<string, string> = {}
): Promise<unknown> => {
  if (!(routeInfo.hasLoader && hasPageConfig(PageComponent))) {
    return;
  }

  const config = getPageConfig(PageComponent);
  if (!config.loader) {
    return;
  }

  return await config.loader(params);
};

/**
 * Render a single page with given params
 */
const renderSinglePage = async (
  routePath: string,
  routeInfo: RouteInfo,
  params: Record<string, string>,
  PageComponent: unknown
): Promise<void> => {
  const concretePath =
    routeInfo.isDynamic && Object.keys(params).length > 0
      ? buildConcretePath(routePath, params)
      : routePath;

  const pageData = await loadPageData(routeInfo, PageComponent, params);
  const html = await renderRouteToString(routeInfo, pageData, params);

  const htmlPath =
    concretePath === "/"
      ? path.join(outdir, "pages", "index.html")
      : path.join(outdir, "pages", concretePath.slice(1), "index.html");

  await mkdir(path.dirname(htmlPath), { recursive: true });
  await Bun.write(htmlPath, html);

  outputs.push({
    File: path.relative(process.cwd(), htmlPath),
    Type: "static page",
    Size: formatFileSize(html.length),
  });

  // Initialize cache entry for ISR-enabled pages
  if (routeInfo.revalidate) {
    await setCache(concretePath, {
      html,
      generatedAt: Date.now(),
      revalidate: routeInfo.revalidate,
    });
  }
};

/**
 * Process a single static route for pre-rendering
 */
const processStaticRoute = async (
  routePath: string,
  routeInfo: RouteInfo
): Promise<number> => {
  const resolvedPagePath = resolveImportPath(routeInfo.filePath);
  const pageModule = await import(resolvedPagePath);
  const PageComponent = pageModule.default;

  if (!PageComponent) {
    console.warn(
      `⚠️  No default export found in ${routeInfo.filePath}, skipping`
    );
    return 0;
  }

  const paramSets = await getParamSets(routePath, routeInfo, PageComponent);
  if (paramSets === null) {
    return 0;
  }

  let count = 0;
  for (const params of paramSets) {
    await renderSinglePage(routePath, routeInfo, params, PageComponent);
    count += 1;
  }

  return count;
};

/**
 * Extract shell for a route with cached components
 * This renders the static shell (with cached components executed) and saves it
 * Uses renderShellToString which captures Suspense fallbacks for PPR
 */
const extractShell = async (
  routePath: string,
  routeInfo: RouteInfo,
  params: Record<string, string>,
  PageComponent: unknown
): Promise<{ hasSuspense: boolean }> => {
  const concretePath =
    routeInfo.isDynamic && Object.keys(params).length > 0
      ? buildConcretePath(routePath, params)
      : routePath;

  // Use renderShellToString which captures Suspense fallbacks
  const pageData = await loadPageData(routeInfo, PageComponent, params);
  const { shell, hasSuspense } = await renderShellToString(
    routeInfo,
    pageData,
    params
  );

  // Save shell to dist/shells/
  const shellPath =
    concretePath === "/"
      ? path.join(outdir, "shells", "index.html")
      : path.join(outdir, "shells", concretePath.slice(1), "index.html");

  await mkdir(path.dirname(shellPath), { recursive: true });
  await Bun.write(shellPath, shell);

  outputs.push({
    File: path.relative(process.cwd(), shellPath),
    Type: "shell",
    Size: formatFileSize(shell.length),
  });

  return { hasSuspense };
};

/**
 * Check if a route has cached components (for PPR)
 * This is a simple check - full detection will be in render.tsx
 */
const hasCachedComponents = (
  _routeInfo: RouteInfo,
  PageComponent: unknown
): boolean => {
  // Check if page component itself is cached
  if (hasCacheConfig(PageComponent as never)) {
    return true;
  }

  // TODO: Walk component tree to find cached components
  // For now, return false - will be enhanced in Phase 4
  return false;
};

/**
 * Extract shell for a single route with params
 */
const extractShellForRoute = async (
  routePath: string,
  routeInfo: RouteInfo,
  PageComponent: unknown
): Promise<{ count: number; hasSuspense: boolean }> => {
  const paramSets = await getParamSets(routePath, routeInfo, PageComponent);
  if (paramSets === null) {
    return { count: 0, hasSuspense: false };
  }

  let count = 0;
  let hasSuspense = false;
  for (const params of paramSets) {
    const result = await extractShell(
      routePath,
      routeInfo,
      params,
      PageComponent
    );
    hasSuspense = hasSuspense || result.hasSuspense;
    count += 1;
  }
  return { count, hasSuspense };
};

/**
 * Extract shells for routes with cached components (PPR)
 */
const extractShells = async () => {
  console.log("🔨 Extracting shells for PPR routes...");

  const { routes } = discoverRoutes("./src/app");
  let shellCount = 0;

  for (const [routePath, routeInfo] of routes.entries()) {
    try {
      const resolvedPagePath = resolveImportPath(routeInfo.filePath);
      const pageModule = await import(resolvedPagePath);
      const PageComponent = pageModule.default;

      if (!PageComponent) {
        continue;
      }

      // Check if route has cached components
      const hasCached = hasCachedComponents(routeInfo, PageComponent);
      if (!hasCached) {
        continue;
      }

      const result = await extractShellForRoute(
        routePath,
        routeInfo,
        PageComponent
      );
      shellCount += result.count;
    } catch (error) {
      console.warn(
        `⚠️  Failed to extract shell for ${routePath}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  if (shellCount > 0) {
    console.log(`✅ Extracted ${shellCount} shell(s)\n`);
  } else {
    console.log("🔨 No shells to extract\n");
  }
};

/**
 * Pre-render static pages at build time
 */
const preRenderStaticPages = async () => {
  console.log("📄 Pre-rendering static pages...");

  const { routes } = discoverRoutes("./src/app");
  let staticCount = 0;

  for (const [routePath, routeInfo] of routes.entries()) {
    if (routeInfo.pageType !== "static") {
      continue;
    }

    try {
      const count = await processStaticRoute(routePath, routeInfo);
      staticCount += count;
    } catch (error) {
      console.error(
        `❌ Failed to pre-render ${routePath}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  if (staticCount > 0) {
    console.log(`✅ Pre-rendered ${staticCount} static page(s)\n`);
  } else {
    console.log("📄 No static pages to pre-render\n");
  }
};

// Build all assets
await buildHydrateBundle();
await buildCssBundle();
await copyPublicAssets();
await preRenderStaticPages();
await extractShells();

const end = performance.now();

if (outputs.length > 0) {
  console.table(outputs);
}

const buildTime = (end - start).toFixed(2);
console.log(`\n✅ Build completed in ${buildTime}ms\n`);
