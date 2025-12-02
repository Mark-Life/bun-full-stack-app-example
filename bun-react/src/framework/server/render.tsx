import React from "react";
import { renderToReadableStream } from "react-dom/server";
import type { RouteInfo } from "@/framework/shared/router";

/**
 * Resolve import path, converting ~/ alias to actual file path
 * ~/ maps to ./src/ relative to project root
 * Since we're in framework/server/, we need to go up to src/
 */
const resolveImportPath = (importPath: string): string => {
  if (importPath.startsWith("~/")) {
    // Convert ~/app/page.tsx to ../../app/page.tsx (from framework/server/ to src/)
    const pathWithoutAlias = importPath.slice(2); // Remove ~/
    return `../../${pathWithoutAlias}`;
  }
  return importPath;
};

/**
 * Check if a route has any client components (page, layouts, or imported)
 *
 * Returns true if:
 * - The page itself is a client component ("use client")
 * - Any layout is a client component
 * - The page imports any client components (client boundaries)
 */
export const hasClientComponents = (routeInfo: RouteInfo): boolean => {
  // Check if page is a client component
  if (routeInfo.isClientComponent) {
    return true;
  }

  // Check if any layout is a client component
  if (routeInfo.layoutTypes.some((type) => type === "client")) {
    return true;
  }

  // Check if page imports any client components (has client boundaries)
  if (routeInfo.hasClientBoundaries) {
    return true;
  }

  // Return false for pure server component pages with no client imports
  return false;
};

/**
 * Render a route with its layout hierarchy
 */
export const renderRoute = async (routeInfo: RouteInfo): Promise<Response> => {
  try {
    // Import the page component
    const resolvedPagePath = resolveImportPath(routeInfo.filePath);
    const pageModule = await import(resolvedPagePath);
    const PageComponent = pageModule.default;

    if (!PageComponent) {
      throw new Error(`No default export found in ${routeInfo.filePath}`);
    }

    // Build layout hierarchy
    // Layouts should be applied from root to leaf (outermost to innermost)
    // So we collect: [root, parent1, parent2, ..., direct]
    const layouts: Array<{
      component: React.ComponentType<Record<string, unknown>>;
      props?: Record<string, unknown>;
    }> = [];

    // Add parent layouts first (root to direct parent)
    for (const layoutPath of routeInfo.parentLayouts) {
      try {
        const resolvedLayoutPath = resolveImportPath(layoutPath);
        const layoutModule = await import(resolvedLayoutPath);
        const LayoutComponent = layoutModule.default;
        if (LayoutComponent) {
          layouts.push({ component: LayoutComponent });
        }
      } catch (error) {
        console.warn(`Failed to load layout ${layoutPath}:`, error);
      }
    }

    // Add direct layout last (closest to the page)
    if (routeInfo.layoutPath) {
      try {
        const resolvedLayoutPath = resolveImportPath(routeInfo.layoutPath);
        const layoutModule = await import(resolvedLayoutPath);
        const LayoutComponent = layoutModule.default;
        if (LayoutComponent) {
          layouts.push({ component: LayoutComponent });
        }
      } catch (error) {
        console.warn(`Failed to load layout ${routeInfo.layoutPath}:`, error);
      }
    }

    // Check if route has any client components
    const needsHydration = hasClientComponents(routeInfo);

    // Build the component tree
    // Apply layouts in reverse order (innermost first, then wrap with outer layouts)
    // So we wrap: page -> direct -> parent2 -> parent1 -> root
    let component: React.ReactElement = React.createElement(PageComponent);
    for (let i = layouts.length - 1; i >= 0; i--) {
      const layout = layouts[i];
      if (layout) {
        // Pass routePath and hasClientComponents to the root layout (first layout, which is at index 0)
        const props =
          i === 0
            ? {
                ...layout.props,
                routePath: routeInfo.path,
                hasClientComponents: needsHydration,
              }
            : layout.props || {};
        component = React.createElement(layout.component, props, component);
      }
    }

    // Render to stream with Suspense support
    // bootstrapModules injects scripts after content streams (for hydration)
    // onError handles errors during Suspense resolution
    const streamOptions: {
      bootstrapModules?: string[];
      onError: (error: unknown) => void;
    } = {
      onError: (error: unknown) => {
        // Ignore abort errors - these are normal when clients disconnect
        if (
          error instanceof Error &&
          (error.message.includes("aborted") ||
            error.message.includes("abort") ||
            error.name === "AbortError")
        ) {
          // Client disconnected - this is expected, don't log as error
          return;
        }
        // Log actual errors
        console.error("Error during Suspense streaming:", error);
        // Let React handle error boundaries
      },
    };

    if (needsHydration) {
      streamOptions.bootstrapModules = ["/hydrate.js"];
    }

    // Render to stream - React will handle Suspense boundaries automatically
    // For async Server Components with Suspense, React streams fallbacks first,
    // then streams resolved content as promises resolve. The key is that React
    // needs the stream to be actively consumed for it to continue streaming.
    const stream = await renderToReadableStream(component, streamOptions);

    // Create a wrapper stream that ensures React's stream is consumed actively
    // This is necessary for React to continue resolving Suspense boundaries
    // and stream content progressively. Without active consumption, React
    // may wait for all promises to resolve before streaming.
    const wrappedStream = new ReadableStream({
      async start(controller) {
        const reader = stream.getReader();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Immediately forward chunks to ensure React continues streaming
            controller.enqueue(value);
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });

    return new Response(wrappedStream, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    console.error(`Error rendering route ${routeInfo.path}:`, error);
    return new Response(
      `Error rendering route: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { status: 500 }
    );
  }
};
