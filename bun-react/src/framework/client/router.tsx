import {
  useEffect,
  useState,
  type ReactNode,
  createContext,
  useContext,
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
}: RouteParamsProviderProps) => {
  return (
    <RouteParamsContext.Provider value={{ params }}>
      {children}
    </RouteParamsContext.Provider>
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
      // In a production setup, this could fetch and render components client-side
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
