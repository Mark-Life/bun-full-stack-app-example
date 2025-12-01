import { serve } from "bun";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { SSRComponent } from "./SSRComponent";
import index from "./index.html";

const server = serve({
  routes: {
    "/ssr": async () => {
      const stream = await renderToReadableStream(
        React.createElement(SSRComponent, { message: "Hello from server!" })
      );
      return new Response(stream, {
        headers: { "Content-Type": "text/html" },
      });
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

    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/hello": {
      async GET(req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(req) {
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
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
