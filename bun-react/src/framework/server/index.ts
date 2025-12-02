import { serve } from "bun";
import { routesPlugin } from "@/framework/shared/routes-plugin";
import { discoverPublicAssets } from "./public";
import { buildRouteHandlers, matchAndRenderRoute } from "./routes";

/**
 * Build and cache the hydration bundle
 */
let hydrateBundleCache: string | null = null;

const buildHydrateBundle = async (): Promise<string> => {
	if (hydrateBundleCache && process.env.NODE_ENV === "production") {
		return hydrateBundleCache;
	}

	const tailwindPlugin = await import("bun-plugin-tailwind");
	const result = await Bun.build({
		entrypoints: ["./src/framework/client/hydrate.tsx"],
		plugins: [tailwindPlugin.default || tailwindPlugin, routesPlugin],
		target: "browser",
		minify: process.env.NODE_ENV === "production",
		sourcemap: process.env.NODE_ENV !== "production" ? "inline" : "none",
	});

	if (!result.success) {
		console.error("Failed to build hydrate bundle:", result.logs);
		throw new Error("Failed to build hydrate bundle");
	}

	const output = result.outputs[0];
	if (!output) {
		throw new Error("No output from hydrate bundle build");
	}

	const bundle = await output.text();
	hydrateBundleCache = bundle;
	return bundle;
};

/**
 * Discover public assets at startup
 */
const publicAssets = await discoverPublicAssets("./src/public");
const publicAssetPaths = Object.keys(publicAssets);
if (publicAssetPaths.length > 0) {
	console.log(`📦 Discovered ${publicAssetPaths.length} public assets`);
}

const server = serve({
	routes: {
		"/hydrate.js": async () => {
			try {
				const bundle = await buildHydrateBundle();
				return new Response(bundle, {
					headers: { "Content-Type": "application/javascript" },
				});
			} catch (error) {
				console.error("Error serving hydrate bundle:", error);
				return new Response(
					"console.error('Failed to load hydration bundle')",
					{
						headers: { "Content-Type": "application/javascript" },
						status: 500,
					},
				);
			}
		},

		"/index.css": async () => {
			try {
				const tailwindPlugin = await import("bun-plugin-tailwind");
				const bundled = await Bun.build({
					entrypoints: ["./src/index.css"],
					plugins: [tailwindPlugin.default || tailwindPlugin],
					target: "browser",
				});

				if (bundled.success && bundled.outputs && bundled.outputs.length > 0) {
					const output = bundled.outputs[0];
					if (output) {
						const css = await output.text();
						return new Response(css, {
							headers: { "Content-Type": "text/css" },
						});
					}
				}
			} catch (error) {
				console.error("Failed to bundle CSS:", error);
			}

			// Fallback: return raw file if bundling fails
			const file = Bun.file("./src/index.css");
			return new Response(file, {
				headers: { "Content-Type": "text/css" },
			});
		},

		// Public assets (discovered from src/public/)
		...publicAssets,

		// API routes
		"/api/hello": {
			async GET() {
				return Response.json({
					message: "Hello, world!",
					method: "GET",
				});
			},
			async PUT() {
				return Response.json({
					message: "Hello, world!",
					method: "PUT",
				});
			},
		},

		"/api/hello/:name": async (req) => {
			const name = req.params.name;
			return Response.json({
				message: `Hello, ${name}!`,
			});
		},

		// App routes - try to match discovered routes first
		"/*": async (req) => {
			const url = new URL(req.url);
			const pathname = url.pathname;

			// Skip paths handled by other routes (API and static assets)
			// These are handled by their specific route handlers above
			const skipPaths = [
				"/api/",
				"/index.css",
				"/hydrate.js",
				...publicAssetPaths,
			];
			if (skipPaths.some((p) => pathname.startsWith(p))) {
				// Let other handlers deal with these
				return new Response("Not found", { status: 404 });
			}

			// Try to match route
			const response = matchAndRenderRoute(pathname);
			if (response) {
				return response;
			}

			// Fallback to 404 for unknown routes
			return new Response("Page not found", {
				status: 404,
				headers: { "Content-Type": "text/html" },
			});
		},

		// Add discovered route handlers
		...buildRouteHandlers(),
	},

	development: process.env.NODE_ENV !== "production" && {
		// Enable browser hot reloading in development
		hmr: true,

		// Echo console logs from the browser to the server
		console: true,
	},
});

console.log(`🚀 Server running at ${server.url}`);
