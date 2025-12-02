import type { RouteConfig } from "virtual:routes";
import { routes } from "virtual:routes";
import React, {
  createContext,
  type LazyExoticComponent,
  type ComponentType as ReactComponentType,
  type ReactNode,
  Suspense,
  useContext,
  useEffect,
  useState,
} from "react";

/**
 * Client-side router context
 */
interface RouterContext {
  currentPath: string;
  navigate: (path: string) => void;
}

const RouterContext = createContext<RouterContext | null>(null);

/**
 * Route params context
 */
interface RouteParamsContext {
  params: Record<string, string>;
}

const RouteParamsContext = createContext<RouteParamsContext | null>(null);

/**
 * Client-side router hook
 * Returns a default router context if RouterProvider is not available
 * This allows components to work during SSR and before RouterProvider mounts
 */
export const useRouter = (): RouterContext => {
  const context = useContext(RouterContext);
  if (!context) {
    // Return a safe default context that allows links to work normally
    // During SSR or when RouterProvider isn't available, links will use regular navigation
    return {
      currentPath:
        typeof window !== "undefined" ? window.location.pathname : "/",
      navigate: (path: string) => {
        // If window is available but no RouterProvider, use regular navigation
        if (typeof window !== "undefined") {
          window.location.href = path;
        }
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
 * Client navigation context for SPA-style navigation within client-navigable groups
 */
interface ClientNavigationContext {
  currentPath: string;
  navigate: (path: string) => void;
  isClientNavigable: boolean;
}

const ClientNavigationContext = createContext<ClientNavigationContext | null>(
  null
);

/**
 * Hook to check if current route is in a client-navigable group
 */
export const useClientNavigation = (): ClientNavigationContext | null =>
  useContext(ClientNavigationContext);

/**
 * Client navigation provider that enables SPA-style navigation
 * for routes within a client-navigable group
 */
interface ClientNavigationProviderProps {
  children: ReactNode;
  initialPath: string;
  initialParams: Record<string, string>;
  initialPageComponent: LazyExoticComponent<
    ReactComponentType<Record<string, unknown>>
  >;
  layoutComponent?: LazyExoticComponent<
    ReactComponentType<{ children: ReactNode }>
  > | null;
  parentLayouts?:
    | LazyExoticComponent<ReactComponentType<{ children: ReactNode }>>[]
    | undefined;
}

export const ClientNavigationProvider = ({
  children,
  initialPath,
  initialParams,
  initialPageComponent: _initialPageComponent,
  layoutComponent,
  parentLayouts = [],
}: ClientNavigationProviderProps) => {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [currentParams, setCurrentParams] = useState(initialParams);
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigatedPage, setNavigatedPage] = useState<LazyExoticComponent<
    ReactComponentType<Record<string, unknown>>
  > | null>(null);

  const navigate = (path: string) => {
    if (typeof window === "undefined") {
      return;
    }

    const match = matchClientRoute(path, routes);
    if (!match) {
      // Route not found in client routes, fall back to full page navigation
      window.location.href = path;
      return;
    }

    // Check if target route is also client-navigable
    if (!match.route.clientNavigable) {
      // Leaving client-navigable group, use full page navigation
      window.location.href = path;
      return;
    }

    // Update URL with pushState
    window.history.pushState({ path }, "", path);

    // Update state
    setCurrentPath(path);
    setCurrentParams(match.params);
    setIsNavigating(true);
    setNavigatedPage(match.route.component);
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handlePopState = (event: PopStateEvent) => {
      const path = event.state?.path ?? window.location.pathname;
      const match = matchClientRoute(path, routes);

      if (match?.route.clientNavigable) {
        setCurrentPath(path);
        setCurrentParams(match.params);
        setIsNavigating(true);
        setNavigatedPage(match.route.component);
      } else {
        // Fall back to full page reload if route is not client-navigable
        window.location.reload();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // On initial render, use SSR content (children) for hydration
  // Only replace content when navigating client-side
  let pageContent: ReactNode = children;

  // If navigating client-side, render the new page component
  if (isNavigating && navigatedPage) {
    let newPageContent: ReactNode = (
      <Suspense fallback={<div>Loading...</div>}>
        {React.createElement(navigatedPage, { params: currentParams })}
      </Suspense>
    );

    // Apply layouts for the new page
    if (layoutComponent) {
      const Layout = layoutComponent;
      newPageContent = (
        <Suspense fallback={<div>Loading...</div>}>
          <Layout>{newPageContent}</Layout>
        </Suspense>
      );
    }

    // Apply parent layouts (outermost first)
    for (let i = parentLayouts.length - 1; i >= 0; i--) {
      const ParentLayout = parentLayouts[i];
      if (ParentLayout) {
        const Layout = ParentLayout;
        newPageContent = (
          <Suspense fallback={<div>Loading...</div>}>
            <Layout>{newPageContent}</Layout>
          </Suspense>
        );
      }
    }

    // When navigating, wrap with RouteParamsProvider for the new route
    pageContent = (
      <RouteParamsProvider params={currentParams}>
        {newPageContent}
      </RouteParamsProvider>
    );
  }

  const contextValue: ClientNavigationContext = {
    currentPath,
    navigate,
    isClientNavigable: true,
  };

  // For initial hydration, don't add RouteParamsProvider wrapper
  // The SSR content already has params passed as props
  // Only wrap with ClientNavigationContext for navigation functionality
  return (
    <ClientNavigationContext.Provider value={contextValue}>
      {pageContent}
    </ClientNavigationContext.Provider>
  );
};

/**
 * Router provider component that handles client-side routing
 * For navigation, it triggers a full page navigation to let the server handle routing
 */
interface RouterProviderProps {
  children: ReactNode;
}

export const RouterProvider = ({ children }: RouterProviderProps) => {
  const [currentPath, setCurrentPath] = useState(() => {
    if (typeof window !== "undefined") {
      return window.location.pathname;
    }
    return "/";
  });

  const navigate = (path: string) => {
    if (typeof window !== "undefined") {
      // For now, use full page navigation
      // ClientNavigationProvider will handle client-navigable routes
      window.location.href = path;
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const contextValue: RouterContext = {
    currentPath,
    navigate,
  };

  return (
    <RouterContext.Provider value={contextValue}>
      {children}
    </RouterContext.Provider>
  );
};
