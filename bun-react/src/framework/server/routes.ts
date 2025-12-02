import {
  discoverRoutes,
  matchRoute,
  type RouteTree,
} from "@/framework/shared/router";
import { renderRoute } from "./render";

/**
 * Discover routes on startup
 */
const routeTree = discoverRoutes("./src/app");
console.log(`📁 Discovered ${routeTree.routes.size} routes`);

/**
 * Get the route tree
 */
export const getRouteTree = (): RouteTree => routeTree;

/**
 * Build route handlers dynamically
 */
export const buildRouteHandlers = () => {
  const handlers: Record<string, () => Promise<Response>> = {};

  // Add handlers for each discovered route
  for (const [path, routeInfo] of routeTree.routes.entries()) {
    handlers[path] = async () => renderRoute(routeInfo);
  }

  return handlers;
};

/**
 * Match a URL path to a route and render it
 */
export const matchAndRenderRoute = (
  pathname: string
): Promise<Response> | null => {
  const matchResult = matchRoute(pathname, routeTree.routes);
  if (matchResult) {
    return renderRoute(matchResult.route);
  }
  return null;
};
