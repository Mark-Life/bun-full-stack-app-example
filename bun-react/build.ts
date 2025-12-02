#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { discoverPublicAssets } from "./src/framework/server/public";
import { renderRouteToString } from "./src/framework/server/render";
import { getPageConfig, hasPageConfig } from "./src/framework/shared/page";
import { discoverRoutes } from "./src/framework/shared/router";
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

const parseValue = (value: string): string | number | boolean | string[] => {
  if (value === "true") return true;
  if (value === "false") return false;

  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^\d*\.\d+$/.test(value)) return Number.parseFloat(value);

  if (value.includes(",")) return value.split(",").map((v) => v.trim());

  return value;
};

function parseArgs(): Partial<Bun.BuildConfig> {
  const config: Record<string, unknown> = {};
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (!arg.startsWith("--")) continue;

    if (arg.startsWith("--no-")) {
      const key = toCamelCase(arg.slice(5));
      config[key] = false;
      continue;
    }

    if (
      !arg.includes("=") &&
      (i === args.length - 1 || args[i + 1]?.startsWith("--"))
    ) {
      const key = toCamelCase(arg.slice(2));
      config[key] = true;
      continue;
    }

    let key: string;
    let value: string;

    if (arg.includes("=")) {
      const parts = arg.slice(2).split("=", 2);
      key = parts[0] ?? "";
      value = parts[1] ?? "";
    } else {
      key = arg.slice(2);
      const nextArg = args[++i];
      value = nextArg ?? "";
    }

    key = toCamelCase(key);

    if (key.includes(".")) {
      const [parentKey, childKey] = key.split(".");
      if (parentKey && childKey) {
        const parent = (config[parentKey] as Record<string, unknown>) || {};
        parent[childKey] = parseValue(value);
        config[parentKey] = parent;
      }
    } else {
      config[key] = parseValue(value);
    }
  }

  return config as Partial<Bun.BuildConfig>;
}

const formatFileSize = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
};

console.log("\n🚀 Starting build process...\n");

const cliConfig = parseArgs();
const outdir = cliConfig.outdir || path.join(process.cwd(), "dist");

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
 * Pre-render static pages at build time
 */
const preRenderStaticPages = async () => {
  console.log("📄 Pre-rendering static pages...");

  const { routes } = discoverRoutes("./src/app");
  let staticCount = 0;

  for (const [routePath, routeInfo] of routes.entries()) {
    // Only pre-render static pages
    if (routeInfo.pageType !== "static") {
      continue;
    }

    try {
      // Import the page component to access config
      const resolvedPagePath = resolveImportPath(routeInfo.filePath);
      const pageModule = await import(resolvedPagePath);
      const PageComponent = pageModule.default;

      if (!PageComponent) {
        console.warn(
          `⚠️  No default export found in ${routeInfo.filePath}, skipping`
        );
        continue;
      }

      // Check if page has generateParams (for dynamic routes)
      let paramSets: Record<string, string>[] = [{}];
      if (routeInfo.isDynamic && routeInfo.hasStaticParams) {
        if (hasPageConfig(PageComponent)) {
          const config = getPageConfig(PageComponent);
          if (config.generateParams) {
            const generatedParams = await config.generateParams();
            paramSets = generatedParams;
          } else {
            console.warn(
              `⚠️  Dynamic route ${routePath} marked as static but has no generateParams, skipping`
            );
            continue;
          }
        } else {
          console.warn(
            `⚠️  Dynamic route ${routePath} marked as static but has no generateParams, skipping`
          );
          continue;
        }
      }

      // Render each param combination
      for (const params of paramSets) {
        // Build concrete path for this param set
        const concretePath =
          routeInfo.isDynamic && Object.keys(params).length > 0
            ? buildConcretePath(routePath, params)
            : routePath;

        // Load data if loader exists
        let pageData: unknown;
        if (routeInfo.hasLoader && hasPageConfig(PageComponent)) {
          const config = getPageConfig(PageComponent);
          if (config.loader) {
            pageData = await config.loader();
          }
        }

        // Render to HTML string
        const html = await renderRouteToString(routeInfo, params, pageData);

        // Determine output path
        // / -> dist/pages/index.html
        // /about -> dist/pages/about/index.html
        // /blog/post-1 -> dist/pages/blog/post-1/index.html
        const htmlPath =
          concretePath === "/"
            ? path.join(outdir, "pages", "index.html")
            : path.join(outdir, "pages", concretePath.slice(1), "index.html");

        // Ensure directory exists
        await mkdir(path.dirname(htmlPath), { recursive: true });

        // Write HTML file
        await Bun.write(htmlPath, html);
        staticCount++;

        outputs.push({
          File: path.relative(process.cwd(), htmlPath),
          Type: "static page",
          Size: formatFileSize(html.length),
        });
      }
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

const end = performance.now();

if (outputs.length > 0) {
  console.table(outputs);
}

const buildTime = (end - start).toFixed(2);
console.log(`\n✅ Build completed in ${buildTime}ms\n`);
