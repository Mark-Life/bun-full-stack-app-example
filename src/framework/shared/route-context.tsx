/**
 * Shared route path context for SSR and client hydration
 * This context provides the current route path during server-side rendering
 * so client components can render correctly before hydration completes
 */
import { createContext, type ReactNode, useContext } from "react";

/**
 * Context for providing route path during SSR
 * Client components can use this to know the current path before RouterProvider mounts
 */
export const SSRRoutePathContext = createContext<string | null>(null);

/**
 * Hook to get the SSR route path
 * Returns null if not in SSR context
 */
export const useSSRRoutePath = (): string | null =>
  useContext(SSRRoutePathContext);

/**
 * Provider component for SSR route path
 * Wrap your component tree with this during server-side rendering
 */
interface SSRRoutePathProviderProps {
  children: ReactNode;
  routePath: string;
}

export const SSRRoutePathProvider = ({
  children,
  routePath,
}: SSRRoutePathProviderProps) => (
  <SSRRoutePathContext.Provider value={routePath}>
    {children}
  </SSRRoutePathContext.Provider>
);
