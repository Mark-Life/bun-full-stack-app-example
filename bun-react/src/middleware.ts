/**
 * Middleware configuration
 * Define request/response middleware behavior
 */

import { defineMiddleware } from "~/framework/shared/middleware";

export default defineMiddleware({
  // Default: runs on all routes EXCEPT these
  exclude: [
    "/favicon.ico",
    "/manifest.json",
    "/robots.txt",
    "/*.svg",
    "/*.png",
    "/*.jpg",
    "/*.jpeg",
    "/*.gif",
    "/*.webp",
    "/index.css",
    "/hydrate.js",
  ],

  // OR: Only run on these (overrides exclude)
  // Example: Only run middleware on API routes
  // include: ["/api/**"],

  handler: async (request, next) => {
    // Log request
    console.log(`${request.method} ${request.url}`);

    // Example: Add CORS headers
    const response = await next();

    // Add CORS headers (example)
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Create new response with headers
    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
      newHeaders.set(key, value);
    }

    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });

    return newResponse;
  },
});
