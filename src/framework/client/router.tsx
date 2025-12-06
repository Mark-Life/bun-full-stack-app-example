import type { RouteConfig } from "virtual:routes";
import { routes } from "virtual:routes";
import React, {
  createContext,
  type ReactNode,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  fetchRouteData,
  prefetchRouteData,
  RouteNotFoundError,
  RouteRedirectError,
} from "./fetch-route-data";
import { updateHead } from "./head-manager";
import { getNavigationStore } from "./navigation-state";
import { preloadChunks } from "./preload-chunks";

/**
 * Navigation options
 */
export interface NavigateOptions {
  replace?: boolean;
  scroll?: boolean;
}

/**
 * Client-side router context
 */
interface RouterContext {
  currentPath: string;
  navigate: (path: string, options?: NavigateOptions) => void;
  replace: (path: string) => void;
  prefetch: (path: string) => void;
}

const RouterContext = createContext<RouterContext | null>(null);

/**
 * Route params context
 */
interface RouteParamsContext {
  params: Record<string, string>;
}

const RouteParamsContext = createContext<RouteParamsContext | null>(null);

// Import SSR route path hook from shared module
import { useSSRRoutePath } from "~/framework/shared/route-context";

/**
 * Client-side router hook
 * Returns a default router context if RouterProvider is not available
 * This allows components to work during SSR and before RouterProvider mounts
 */
export const useRouter = (): RouterContext => {
  const context = useContext(RouterContext);
  const ssrRoutePath = useSSRRoutePath();

  if (!context) {
    // Return a safe default context that allows links to work normally
    // During SSR, use the path from SSRRoutePathContext if available
    // After hydration with no RouterProvider, use window.location.pathname
    const currentPath =
      ssrRoutePath ??
      (typeof window !== "undefined" ? window.location.pathname : "/");

    return {
      currentPath,
      navigate: (path: string) => {
        // If window is available but no RouterProvider, use regular navigation
        if (typeof window !== "undefined") {
          window.location.href = path;
        }
      },
      replace: (path: string) => {
        if (typeof window !== "undefined") {
          window.location.replace(path);
        }
      },
      prefetch: () => {
        // No-op when RouterProvider is not available
      },
    };
  }
  return context;
};

/**
 * Hook to access route parameters
 */
export const useParams = (): Record<string, string> => {
  const context = useContext(RouteParamsContext);
  return context?.params ?? {};
};

/**
 * Route params provider component
 */
interface RouteParamsProviderProps {
  children: ReactNode;
  params: Record<string, string>;
}

export const RouteParamsProvider = ({
  children,
  params,
}: RouteParamsProviderProps) => (
  <RouteParamsContext.Provider value={{ params }}>
    {children}
  </RouteParamsContext.Provider>
);

// Regex patterns defined at top level for performance
const TRAILING_SLASH_REGEX = /\/$/;
const COLON_PREFIX = ":";
const ASTERISK_PREFIX = "*";
const NORMALIZE_PATH_REGEX = /\/$/;

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
 * Current route state for rendering
 */
interface CurrentRoute {
  route: RouteConfig;
  params: Record<string, string>;
  data?: unknown;
}

/**
 * Router provider component that handles client-side routing
 * Uses /__data/* endpoints for SPA-style navigation
 */
interface RouterProviderProps {
  children: ReactNode;
}

export const RouterProvider = ({ children }: RouterProviderProps) => {
  const navigationStore = getNavigationStore();
  const [currentPath, setCurrentPath] = useState(() => {
    if (typeof window !== "undefined") {
      return window.location.pathname;
    }
    return "/";
  });
  const [currentRoute, setCurrentRoute] = useState<CurrentRoute | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Ref to store latest navigate function for use in callbacks
  const navigateRef = useRef<
    ((path: string, options?: NavigateOptions) => Promise<void>) | undefined
  >(undefined);

  /**
   * Navigate to a new route
   */
  const navigate = useCallback(
    async (path: string, options: NavigateOptions = {}): Promise<void> => {
      if (typeof window === "undefined") {
        return;
      }

      const { replace: shouldReplace = false, scroll = true } = options;
      const normalizedPath =
        path === "/" ? "/" : path.replace(NORMALIZE_PATH_REGEX, "") || "/";

      // Update URL immediately (optimistic)
      if (shouldReplace) {
        window.history.replaceState(null, "", normalizedPath);
      } else {
        window.history.pushState(null, "", normalizedPath);
      }

      // Update navigation state
      navigationStore.setState({
        isNavigating: true,
        pendingPath: normalizedPath,
        error: null,
      });

      try {
        // Fetch route data
        const payload = await fetchRouteData(normalizedPath);

        // Handle redirect
        if (payload.redirect) {
          const navigateFn = navigateRef.current;
          if (navigateFn) {
            await navigateFn(payload.redirect, {
              replace: shouldReplace,
              scroll,
            });
          }
          return;
        }

        // Handle not found
        if (payload.notFound) {
          setNotFound(true);
          navigationStore.setState({
            currentPath: normalizedPath,
            currentParams: {},
            isNavigating: false,
            pendingPath: null,
          });
          return;
        }

        // Match route to get component
        const match = matchClientRoute(normalizedPath, routes);
        if (!match) {
          setNotFound(true);
          navigationStore.setState({
            currentPath: normalizedPath,
            currentParams: {},
            isNavigating: false,
            pendingPath: null,
          });
          return;
        }

        // Preload chunks
        preloadChunks(payload.chunks);

        // Update head
        updateHead(payload.head);

        // Update state
        setCurrentPath(normalizedPath);
        setCurrentRoute({
          route: match.route,
          params: payload.route.params,
          data: payload.data,
        });
        setNotFound(false);

        navigationStore.setState({
          currentPath: normalizedPath,
          currentParams: payload.route.params,
          isNavigating: false,
          pendingPath: null,
        });

        // Scroll to top
        if (scroll) {
          window.scrollTo(0, 0);
        }
      } catch (error) {
        if (error instanceof RouteRedirectError) {
          // Handle redirect error
          const navigateFn = navigateRef.current;
          if (navigateFn) {
            await navigateFn(error.redirectUrl, {
              replace: shouldReplace,
              scroll,
            });
          }
          return;
        }

        if (error instanceof RouteNotFoundError) {
          setNotFound(true);
          navigationStore.setState({
            currentPath: normalizedPath,
            currentParams: {},
            isNavigating: false,
            pendingPath: null,
            error,
          });
          return;
        }

        // Other errors
        navigationStore.setState({
          isNavigating: false,
          pendingPath: null,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    },
    [navigationStore]
  );

  // Update ref with latest navigate function
  navigateRef.current = navigate;

  /**
   * Replace current route (uses replaceState)
   */
  const replace = useCallback(
    (path: string): void => {
      navigate(path, { replace: true });
    },
    [navigate]
  );

  /**
   * Prefetch route data and chunks
   * Silently prefetches data and chunks for faster navigation
   *
   * @param path - Route path to prefetch
   */
  const prefetch = useCallback((path: string): void => {
    if (typeof window === "undefined") {
      return;
    }

    const normalizedPath =
      path === "/" ? "/" : path.replace(NORMALIZE_PATH_REGEX, "") || "/";

    // Prefetch route data (will cache it and preload chunks)
    prefetchRouteData(normalizedPath);
  }, []);

  /**
   * Handle browser back/forward navigation
   */
  const handlePopState = useCallback((event: PopStateEvent): void => {
    const path = event.state?.path ?? window.location.pathname;
    const navigateFn = navigateRef.current;
    if (navigateFn) {
      navigateFn(path, { replace: true, scroll: false }).catch(() => {
        // Ignore navigation errors
      });
    }
  }, []);

  /**
   * Initialize route on mount
   * Note: We don't initialize currentRoute here - we keep it null so that
   * renderContent() uses the SSR children (which have correct data from
   * __ROUTE_DATA__ script). currentRoute will only be set when user actually
   * navigates (which fetches fresh data from /__data/* endpoint).
   */
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // Listen to popstate for browser back/forward navigation
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [handlePopState]);

  /**
   * Render current route or not found
   */
  const renderContent = (): ReactNode => {
    if (notFound) {
      // TODO: Render 404 component when available
      return <div>404 - Page not found</div>;
    }

    // If we have a navigated route, render it
    // Otherwise use SSR children (for initial hydration)
    if (currentRoute) {
      const { route, params, data } = currentRoute;
      const PageComponent = route.component;
      const LayoutComponent = route.layout;
      const ParentLayouts = route.parentLayouts || [];

      // Build page props
      const pageProps: Record<string, unknown> = { params };
      if (data !== undefined) {
        pageProps["data"] = data;
      }

      let pageContent: ReactNode = (
        <Suspense fallback={<div>Loading...</div>}>
          {React.createElement(PageComponent, pageProps)}
        </Suspense>
      );

      // Apply direct layout
      if (LayoutComponent) {
        pageContent = (
          <Suspense fallback={<div>Loading...</div>}>
            <LayoutComponent>{pageContent}</LayoutComponent>
          </Suspense>
        );
      }

      // Apply parent layouts (outermost first)
      for (let i = ParentLayouts.length - 1; i >= 0; i--) {
        const ParentLayout = ParentLayouts[i];
        if (ParentLayout) {
          pageContent = (
            <Suspense fallback={<div>Loading...</div>}>
              <ParentLayout>{pageContent}</ParentLayout>
            </Suspense>
          );
        }
      }

      return (
        <RouteParamsProvider params={params}>{pageContent}</RouteParamsProvider>
      );
    }

    // Initial render - use SSR children for hydration
    return children;
  };

  const contextValue: RouterContext = {
    currentPath,
    navigate,
    replace,
    prefetch,
  };

  return (
    <RouterContext.Provider value={contextValue}>
      {renderContent()}
    </RouterContext.Provider>
  );
};
