/**
 * Client-side hydration entry point
 * This script hydrates the SSR-rendered content and enables interactivity
 */

import { StrictMode, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { RouterProvider } from "./lib/client-router";

// Static imports for all page components
// These are bundled at build time
import HomePage from "./app/page";
import AboutPage from "./app/about/page";
import DocsPage from "./app/docs/page";
import DocsLayout from "./app/docs/layout";
import GettingStartedPage from "./app/docs/getting-started/page";

/**
 * Route configuration with optional layout wrapper
 */
interface RouteConfig {
  component: React.ComponentType;
  layout?: React.ComponentType<{ children: ReactNode }>;
}

const routes: Record<string, RouteConfig> = {
  "/": { component: HomePage },
  "/about": { component: AboutPage },
  "/docs": { component: DocsPage, layout: DocsLayout },
  "/docs/getting-started": {
    component: GettingStartedPage,
    layout: DocsLayout,
  },
};

/**
 * Get route data embedded in the page
 */
const getRouteData = (): { routePath: string } => {
  const script = document.getElementById("__ROUTE_DATA__");
  if (script?.textContent) {
    try {
      return JSON.parse(script.textContent) as { routePath: string };
    } catch {
      // Ignore parse errors
    }
  }
  return { routePath: window.location.pathname };
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

  const { routePath } = getRouteData();
  const routeConfig = routes[routePath] || routes["/"]!;
  const PageComponent = routeConfig.component;
  const LayoutComponent = routeConfig.layout;

  // Build component tree with layout if needed
  let pageContent: ReactNode = <PageComponent />;
  if (LayoutComponent) {
    pageContent = <LayoutComponent>{pageContent}</LayoutComponent>;
  }

  const content = (
    <StrictMode>
      <RouterProvider>{pageContent}</RouterProvider>
    </StrictMode>
  );

  // Hydrate the existing HTML
  hydrateRoot(root, content);
};

// Run hydration
hydrate();
