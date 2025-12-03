/**
 * Client-side hydration entry point
 * This script hydrates the SSR-rendered content and enables interactivity
 *
 * RSC Support:
 * - Server components: Static HTML, no hydration needed
 * - Client components: Full hydration with React
 */

import { type RouteConfig, routes } from "virtual:routes";
import { type ReactNode, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import {
  ClientNavigationProvider,
  RouteParamsProvider,
  RouterProvider,
} from "./router";

// Validate routes are loaded
if (!routes || Object.keys(routes).length === 0) {
  console.error("No routes found! Routes object:", routes);
}

// Regex patterns defined at top level for performance
const TRAILING_SLASH_REGEX = /\/$/;
const COLON_PREFIX = ":";
const ASTERISK_PREFIX = "*";

/**
 * Match catch-all route pattern
 */
const matchCatchAll = (
  patternParts: string[],
  urlParts: string[]
): { matched: boolean; params: Record<string, string> } => {
  const params: Record<string, string> = {};
  const lastPatternPart = patternParts.at(-1);
  if (!lastPatternPart?.startsWith(ASTERISK_PREFIX)) {
    return { matched: false, params: {} };
  }

  const catchAllParam = lastPatternPart.slice(1);
  if (urlParts.length < patternParts.length - 1) {
    return { matched: false, params: {} };
  }

  const matchedParts = patternParts.slice(0, -1);
  for (let i = 0; i < matchedParts.length; i++) {
    const patternPart = matchedParts[i];
    const urlPart = urlParts[i];

    if (patternPart?.startsWith(COLON_PREFIX)) {
      params[patternPart.slice(1)] = urlPart || "";
    } else if (patternPart !== urlPart) {
      return { matched: false, params: {} };
    }
  }
  // Catch-all captures the rest
  params[catchAllParam] = urlParts.slice(matchedParts.length).join("/");
  return { matched: true, params };
};

/**
 * Match regular dynamic route pattern
 */
const matchRegular = (
  patternParts: string[],
  urlParts: string[]
): { matched: boolean; params: Record<string, string> } => {
  const params: Record<string, string> = {};

  if (patternParts.length !== urlParts.length) {
    return { matched: false, params: {} };
  }

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const urlPart = urlParts[i];

    if (patternPart?.startsWith(COLON_PREFIX)) {
      params[patternPart.slice(1)] = urlPart || "";
    } else if (patternPart !== urlPart) {
      return { matched: false, params: {} };
    }
  }

  return { matched: true, params };
};

/**
 * Match a route pattern against a URL path and extract params
 */
const matchPattern = (
  pattern: string,
  urlPath: string
): { matched: boolean; params: Record<string, string> } => {
  const patternParts = pattern.split("/").filter(Boolean);
  const urlParts = urlPath.split("/").filter(Boolean);

  // Handle catch-all routes
  if (patternParts.length > 0) {
    const catchAllResult = matchCatchAll(patternParts, urlParts);
    if (catchAllResult.matched) {
      return catchAllResult;
    }
  }

  // Regular dynamic route matching
  return matchRegular(patternParts, urlParts);
};

/**
 * Match a URL path to a route configuration
 */
const matchClientRoute = (
  urlPath: string,
  routeMap: Record<string, RouteConfig>
): { route: RouteConfig; params: Record<string, string> } | null => {
  // Normalize URL path
  const normalizedPath =
    urlPath === "/" ? "/" : urlPath.replace(TRAILING_SLASH_REGEX, "") || "/";

  // Exact match first
  const exactRoute = routeMap[normalizedPath];
  if (exactRoute) {
    return { route: exactRoute, params: {} };
  }

  // Try with trailing slash
  const withSlash = normalizedPath === "/" ? "/" : `${normalizedPath}/`;
  const routeWithSlash = routeMap[withSlash];
  if (routeWithSlash) {
    return { route: routeWithSlash, params: {} };
  }

  // Try dynamic route matching
  for (const [pattern, routeConfig] of Object.entries(routeMap)) {
    if (routeConfig.isDynamic) {
      const { matched, params } = matchPattern(pattern, normalizedPath);
      if (matched) {
        return { route: routeConfig, params };
      }
    }
  }

  return null;
};

/**
 * Get route data embedded in the page
 */
const getRouteData = (): {
  routePath: string;
  hasClientComponents: boolean;
  pageData?: unknown;
} => {
  const script = document.getElementById("__ROUTE_DATA__");
  if (script?.textContent) {
    try {
      return JSON.parse(script.textContent) as {
        routePath: string;
        hasClientComponents: boolean;
        pageData?: unknown;
      };
    } catch {
      // Ignore parse errors
    }
  }
  return { routePath: window.location.pathname, hasClientComponents: true };
};

/**
 * Check if a route needs hydration
 * Returns true if the page or any layout is a client component
 */
const needsHydration = (route: RouteConfig): boolean => {
  // If page is a client component, needs hydration
  if (route.componentType === "client") {
    return true;
  }

  // If any layout is a client component, needs hydration
  if (route.layoutType === "client") {
    return true;
  }

  // Check parent layout types
  if (route.parentLayoutTypes?.some((type) => type === "client")) {
    return true;
  }

  return false;
};

/**
 * Hydrate the application
 */
const hydrate = () => {
  const root = document.getElementById("root");
  if (!root) {
    console.error("Root element not found");
    return;
  }

  const { routePath, hasClientComponents, pageData } = getRouteData();
  const matchResult = matchClientRoute(routePath, routes);

  if (!matchResult) {
    console.error(`Route not found: ${routePath}`);
    console.error("Available routes:", Object.keys(routes));
    // Fallback to home page if available
    const homeRoute = routes["/"];
    if (homeRoute) {
      console.warn("Falling back to home page");
      hydrateRoute(homeRoute, {}, root, pageData);
      return;
    }
    return;
  }

  // Check if route needs hydration (has client components)
  // For server component pages with async components, we can't hydrate because
  // async components can't run on the client. Skip hydration if no client components.
  if (!(needsHydration(matchResult.route) || hasClientComponents)) {
    console.log(
      `[RSC] Route "${routePath}" is a pure server component - no hydration needed`
    );
    return;
  }

  hydrateRoute(matchResult.route, matchResult.params, root, pageData);
};

/**
 * Hydrate a specific route
 *
 * RSC Strategy:
 * - All pages are bundled for the client (server and client components)
 * - Server component pages may contain client component imports (boundaries)
 * - We hydrate the full tree - React will match the server-rendered HTML
 * - Client components within server components will become interactive
 *
 * The componentType flag indicates the page's own type, but even server
 * component pages need hydration for their client component children.
 */
const hydrateRoute = (
  route: RouteConfig,
  params: Record<string, string>,
  root: HTMLElement,
  pageData?: unknown
) => {
  const PageComponent = route.component;
  const LayoutComponent = route.layout;
  const ParentLayouts = route.parentLayouts || [];

  if (route.componentType === "server") {
    console.log(
      "[RSC] Server component page - hydrating for client boundaries"
    );
  }

  // Build component tree with layouts
  // Apply layouts from outermost to innermost (parentLayouts -> layout -> page)
  // Note: Root layout (app/layout.tsx) is excluded from routes by the plugin
  // since it wraps RootShell which renders <html> - already in the DOM
  // For server component pages, don't wrap in Suspense - Suspense boundaries
  // are already in the component tree and wrapping causes hydration mismatches
  // For server component pages, pass the same props (including data) that were used during SSR
  // so React can properly match the existing HTML
  const pageProps: Record<string, unknown> = { params };
  if (pageData !== undefined) {
    pageProps["data"] = pageData;
  }
  let pageContent: ReactNode = <PageComponent {...pageProps} />;

  // Apply direct layout if present
  // Include ALL layouts (server and client) so the DOM structure matches SSR
  // Server layouts are just wrapper components - they can run on client
  if (LayoutComponent) {
    pageContent = <LayoutComponent>{pageContent}</LayoutComponent>;
  }

  // Apply parent layouts (outermost first) - include all layouts
  for (let i = ParentLayouts.length - 1; i >= 0; i--) {
    const ParentLayout = ParentLayouts[i];

    if (ParentLayout) {
      pageContent = <ParentLayout>{pageContent}</ParentLayout>;
    }
  }

  // Check if route is client-navigable
  const isClientNavigable = route.clientNavigable === true;

  // Get current path for client navigation
  const currentPath =
    typeof window !== "undefined" ? window.location.pathname : "/";

  // Wrap with appropriate provider
  let content: ReactNode;

  if (isClientNavigable) {
    // Use ClientNavigationProvider for SPA-style navigation
    // It will manage route state and handle client-side navigation
    // Pass the SSR content (pageContent) as children so it hydrates properly
    content = (
      <StrictMode>
        <RouterProvider>
          <ClientNavigationProvider
            initialPageComponent={PageComponent}
            initialParams={params}
            initialPath={currentPath}
            layoutComponent={LayoutComponent || null}
            {...(ParentLayouts.length > 0 && { parentLayouts: ParentLayouts })}
          >
            {pageContent}
          </ClientNavigationProvider>
        </RouterProvider>
      </StrictMode>
    );
  } else {
    // Use regular RouterProvider for non-client-navigable routes
    content = (
      <StrictMode>
        <RouterProvider>
          <RouteParamsProvider params={params}>
            {pageContent}
          </RouteParamsProvider>
        </RouterProvider>
      </StrictMode>
    );
  }

  // Hydrate the existing HTML
  hydrateRoot(root, content);
};

// Run hydration
hydrate();
