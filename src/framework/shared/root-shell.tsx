/**
 * Root HTML shell component that wraps all pages
 * Handles metadata injection, default styles, and hydration script
 */
export interface Metadata {
  title?: string;
  description?: string;
  viewport?: string;
}

/**
 * Route data passed to the client for hydration
 */
export interface RouteData {
  routePath: string;
  /** Whether the page tree has any client components that need hydration */
  hasClientComponents: boolean;
  /** Page data from loader (for server component pages that need hydration) */
  pageData?: unknown;
}

/**
 * Cache for serialized route data (for static routes)
 * Key: routePath, Value: serialized JSON string
 */
const routeDataCache = new Map<string, string>();

/**
 * Serialize route data to JSON string, with caching for static routes
 * @param routeData - Route data to serialize
 * @param isStatic - Whether this route is static (can be cached)
 * @returns Serialized JSON string
 */
export const serializeRouteData = (
  routeData: RouteData,
  isStatic: boolean
): string => {
  if (isStatic) {
    const cached = routeDataCache.get(routeData.routePath);
    if (cached) {
      return cached;
    }
    const serialized = JSON.stringify(routeData);
    routeDataCache.set(routeData.routePath, serialized);
    return serialized;
  }
  return JSON.stringify(routeData);
};

/**
 * Clear cached route data (useful for HMR or route changes)
 */
export const clearRouteDataCache = (): void => {
  routeDataCache.clear();
};

interface RootShellProps {
  children: React.ReactNode;
  metadata?: Metadata;
  routePath?: string;
  /** Whether this route has client components needing hydration */
  hasClientComponents?: boolean;
  /** Page data from loader (for hydration) */
  pageData?: unknown;
  /** Whether this route is static (for caching serialized route data) */
  isStatic?: boolean;
  /** Whether to preload hydration script (for faster TTI) */
  preloadHydration?: boolean;
}

export const RootShell = ({
  children,
  metadata,
  routePath,
  hasClientComponents = true,
  pageData,
  isStatic = false,
  preloadHydration = true,
}: RootShellProps) => {
  const title = metadata?.title || "Bun + React";
  const description =
    metadata?.description ||
    "A full-stack application built with Bun and React";
  const viewport =
    metadata?.viewport || "width=device-width, initial-scale=1.0";

  const routeData: RouteData = {
    routePath: routePath || "/",
    hasClientComponents,
    ...(pageData !== undefined && { pageData }),
  };

  // Cache serialized route data for static routes
  const serializedRouteData = serializeRouteData(routeData, isStatic);

  // Determine if we should preload hydration script
  const shouldPreloadHydration = preloadHydration && hasClientComponents;

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta content={viewport} name="viewport" />
        <meta content={description} name="description" />
        <title>{title}</title>
        <link href="/logo.svg" rel="icon" type="image/svg+xml" />
        <link href="/index.css" rel="stylesheet" />
        {/* Preload hydration script for faster Time to Interactive */}
        {shouldPreloadHydration ? (
          <link href="/hydrate.js" rel="modulepreload" />
        ) : null}
      </head>
      <body>
        <div id="root">{children}</div>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: here we are setting the route data
          dangerouslySetInnerHTML={{
            __html: serializedRouteData,
          }}
          id="__ROUTE_DATA__"
          type="application/json"
        />
        {/* Hydration script is injected via bootstrapModules in renderToReadableStream */}
        {/* HMR script is injected by render.tsx via getHmrScript() */}
      </body>
    </html>
  );
};
