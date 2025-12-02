/**
 * Client-side hydration entry point
 * This script hydrates the SSR-rendered content and enables interactivity
 *
 * RSC Support:
 * - Server components: Static HTML, no hydration needed
 * - Client components: Full hydration with React
 */

import { StrictMode, Suspense, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { RouterProvider, RouteParamsProvider } from "./router";
import { routes, type RouteConfig } from "virtual:routes";

// Validate routes are loaded
if (!routes || Object.keys(routes).length === 0) {
  console.error("No routes found! Routes object:", routes);
}

/**
 * Match a route pattern against a URL path and extract params
 */
const matchPattern = (
  pattern: string,
  urlPath: string
): { matched: boolean; params: Record<string, string> } => {
  const patternParts = pattern.split("/").filter(Boolean);
  const urlParts = urlPath.split("/").filter(Boolean);

  const params: Record<string, string> = {};

  // Handle catch-all routes
  if (
    patternParts.length > 0 &&
    patternParts[patternParts.length - 1]?.startsWith("*")
  ) {
    const catchAllParam = patternParts[patternParts.length - 1]!.slice(1);
    if (urlParts.length >= patternParts.length - 1) {
      const matchedParts = patternParts.slice(0, -1);
      for (let i = 0; i < matchedParts.length; i++) {
        const patternPart = matchedParts[i]!;
        const urlPart = urlParts[i];

        if (patternPart.startsWith(":")) {
          params[patternPart.slice(1)] = urlPart || "";
        } else if (patternPart !== urlPart) {
          return { matched: false, params: {} };
        }
      }
      // Catch-all captures the rest
      params[catchAllParam] = urlParts.slice(matchedParts.length).join("/");
      return { matched: true, params };
    }
    return { matched: false, params: {} };
  }

  // Regular dynamic route matching
  if (patternParts.length !== urlParts.length) {
    return { matched: false, params: {} };
  }

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i]!;
    const urlPart = urlParts[i];

    if (patternPart.startsWith(":")) {
      params[patternPart.slice(1)] = urlPart || "";
    } else if (patternPart !== urlPart) {
      return { matched: false, params: {} };
    }
  }

  return { matched: true, params };
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
    urlPath === "/" ? "/" : urlPath.replace(/\/$/, "") || "/";

  // Exact match first
  if (routeMap[normalizedPath]) {
    return { route: routeMap[normalizedPath]!, params: {} };
  }

  // Try with trailing slash
  const withSlash = normalizedPath === "/" ? "/" : `${normalizedPath}/`;
  if (routeMap[withSlash]) {
    return { route: routeMap[withSlash]!, params: {} };
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
} => {
  const script = document.getElementById("__ROUTE_DATA__");
  if (script?.textContent) {
    try {
      return JSON.parse(script.textContent) as {
        routePath: string;
        hasClientComponents: boolean;
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

  const { routePath, hasClientComponents } = getRouteData();
  const matchResult = matchClientRoute(routePath, routes);

  if (!matchResult) {
    console.error(`Route not found: ${routePath}`);
    console.error("Available routes:", Object.keys(routes));
    // Fallback to home page if available
    if (routes["/"]) {
      console.warn("Falling back to home page");
      const fallbackMatch = { route: routes["/"]!, params: {} };
      hydrateRoute(fallbackMatch.route, fallbackMatch.params, root);
      return;
    }
    return;
  }

  // Check if route needs hydration (has client components)
  // For server component pages with async components, we can't hydrate because
  // async components can't run on the client. Skip hydration if no client components.
  if (!needsHydration(matchResult.route)) {
    // Only hydrate if server explicitly marked it as having client components
    // This prevents trying to hydrate pure server component pages with async components
    if (!hasClientComponents) {
      console.log(
        `[RSC] Route "${routePath}" is a pure server component - no hydration needed`
      );
      return;
    }
    // If server says it has client components but route doesn't, it might have client boundaries
    // Try to hydrate, but React will handle any async component errors gracefully
  }

  hydrateRoute(matchResult.route, matchResult.params, root);
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
  root: HTMLElement
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
  let pageContent: ReactNode = <PageComponent />;

  // Apply direct layout if present and is a client component
  if (LayoutComponent && route.layoutType === "client") {
    pageContent = (
      <Suspense fallback={null}>
        <LayoutComponent>{pageContent}</LayoutComponent>
      </Suspense>
    );
  }

  // Apply parent layouts (outermost first) - only client layouts
  const parentLayoutTypes = route.parentLayoutTypes || [];
  for (let i = ParentLayouts.length - 1; i >= 0; i--) {
    const ParentLayout = ParentLayouts[i];
    const layoutType = parentLayoutTypes[i];

    if (ParentLayout && layoutType === "client") {
      pageContent = (
        <Suspense fallback={null}>
          <ParentLayout>{pageContent}</ParentLayout>
        </Suspense>
      );
    }
  }

  // Wrap with params provider and router
  const content = (
    <StrictMode>
      <RouterProvider>
        <RouteParamsProvider params={params}>{pageContent}</RouteParamsProvider>
      </RouterProvider>
    </StrictMode>
  );

  // Hydrate the existing HTML
  hydrateRoot(root, content);
};

// Run hydration
hydrate();
