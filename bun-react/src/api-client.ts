/**
 * Client-side typed API proxy
 * Provides type-safe API calls from client components
 */

import type { Route, RouterClient, RouterShape } from "~/framework/shared/api";
import { api } from "./api";

/**
 * Check if value is a Route
 */
const isRoute = (value: unknown): value is Route =>
  value !== null &&
  typeof value === "object" &&
  "_brand" in value &&
  value._brand === "Route";

/**
 * Check if object is method-grouped (GET, PUT, etc.)
 */
const isMethodGrouped = (value: unknown): value is Record<string, Route> => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const methodNames = ["GET", "POST", "PUT", "PATCH", "DELETE"];
  const keys = Object.keys(value);
  if (keys.length === 0) {
    return false;
  }

  // Check if all keys are method names and values are routes
  for (const key of keys) {
    if (!methodNames.includes(key)) {
      return false;
    }
    const val = (value as Record<string, unknown>)[key];
    if (!isRoute(val)) {
      return false;
    }
  }

  return true;
};

/**
 * Handle params replacement in URL
 */
const replaceParams = (url: string, params: Record<string, string>): string => {
  let result = url;
  for (const [k, v] of Object.entries(params)) {
    result = result.replace(`:${k}`, v);
  }
  return result;
};

/**
 * Build query string from query object
 */
const buildQueryString = (query: Record<string, string>): string => {
  const searchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    searchParams.set(k, String(v));
  }
  return searchParams.toString();
};

/**
 * Process input and build URL with params/query
 */
const processInput = (
  url: string,
  input: unknown
): { finalUrl: string; body?: string } => {
  let finalUrl = url;

  if (!input || typeof input !== "object") {
    return { finalUrl };
  }

  const inputObj = input as Record<string, unknown>;

  // Replace :param in URL
  const params = inputObj["params"];
  if (params && typeof params === "object") {
    finalUrl = replaceParams(finalUrl, params as Record<string, string>);
  }

  // Add query params
  const query = inputObj["query"];
  if (query && typeof query === "object") {
    const queryStr = buildQueryString(query as Record<string, string>);
    if (queryStr) {
      finalUrl = `${finalUrl}?${queryStr}`;
    }
  }

  // Body (for POST/PUT/PATCH)
  const bodyValue = inputObj["body"];
  if (bodyValue !== undefined) {
    return { finalUrl, body: JSON.stringify(bodyValue) };
  }

  // If there are params or query, extract body from remaining top-level fields
  if (params || query) {
    const bodyFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(inputObj)) {
      if (key !== "params" && key !== "query" && value !== undefined) {
        bodyFields[key] = value;
      }
    }
    if (Object.keys(bodyFields).length > 0) {
      return { finalUrl, body: JSON.stringify(bodyFields) };
    }
    return { finalUrl };
  }

  // Direct body input (shorthand for routes with only body)
  return { finalUrl, body: JSON.stringify(input) };
};

/**
 * Handle fetch response
 */
const handleResponse = async (res: Response): Promise<unknown> => {
  if (!res.ok) {
    const error = await res.json().catch(() => ({
      error: "Request failed",
    }));
    throw new Error(
      (error as { error?: string }).error || `HTTP ${res.status}`
    );
  }

  return res.json();
};

/**
 * Create fetch function for a route
 */
const createRouteHandler =
  (url: string, method: string): ((input?: unknown) => Promise<unknown>) =>
  async (input?: unknown) => {
    const { finalUrl, body } = processInput(url, input);

    const fetchOptions: RequestInit = {
      method,
    };

    if (body) {
      fetchOptions.headers = { "Content-Type": "application/json" };
      fetchOptions.body = body;
    }

    const res = await fetch(finalUrl, fetchOptions);
    return handleResponse(res);
  };

/**
 * Extract param names from route config (simplified version)
 */
const extractParamNames = (route: Route): string[] => {
  const config = route.config;
  if (!config.params) {
    return [];
  }
  // Try to extract param names from Zod schema
  const def = (config.params as { _def?: { shape?: Record<string, unknown> } })
    ._def;
  if (def?.shape) {
    return Object.keys(def.shape);
  }
  return [];
};

/**
 * Build path with params (same logic as createAPI)
 */
const buildPathWithParams = (
  basePath: string,
  currentPath: string,
  route: Route
): string => {
  const fullPath = `${basePath}${currentPath}`;
  const paramNames = extractParamNames(route);
  if (paramNames.length === 1) {
    const segments = fullPath.split("/");
    segments[segments.length - 1] = `:${paramNames[0]}`;
    return segments.join("/");
  }
  return fullPath;
};

/**
 * Build path map from routes structure (same logic as createAPI's flattenRoutes)
 * Maps nested key paths (e.g., "/products/update") to actual URL paths (e.g., "/api/products/:id")
 */
const buildPathMap = (
  routes: RouterShape,
  basePath = "/api",
  pathPrefix = ""
): Map<string, string> => {
  const pathMap = new Map<string, string>();

  const flattenRoutes = (obj: RouterShape, prefix: string): void => {
    for (const [key, value] of Object.entries(obj)) {
      if (!value) {
        continue;
      }

      const currentPath = `${prefix}/${key}`;

      if (isRoute(value)) {
        // Single route
        const finalPath = buildPathWithParams(basePath, currentPath, value);
        pathMap.set(currentPath, finalPath);
      } else if (isMethodGrouped(value)) {
        // Method-grouped routes share the same path
        for (const [methodKey, routeValue] of Object.entries(value)) {
          if (isRoute(routeValue)) {
            const finalPath = buildPathWithParams(basePath, prefix, routeValue);
            pathMap.set(`${prefix}:${methodKey}`, finalPath);
          }
        }
      } else if (value && typeof value === "object") {
        // Nested router shape - recurse
        flattenRoutes(value as RouterShape, currentPath);
      }
    }
  };

  flattenRoutes(routes, pathPrefix);
  return pathMap;
};

/**
 * Build client proxy from API routes using correct paths from route structure
 */
const buildClientProxy = <T extends RouterShape>(
  routes: T,
  basePath = "/api",
  pathPrefix = ""
): unknown => {
  const proxy: Record<string, unknown> = {};
  const pathMap = buildPathMap(routes, basePath, pathPrefix);

  for (const [key, value] of Object.entries(routes)) {
    if (!value) {
      continue;
    }

    const currentPath = `${pathPrefix}/${key}`;

    if (isRoute(value)) {
      // Single route - use path from map
      const method = value.config.method;
      const url = pathMap.get(currentPath) || `${basePath}${currentPath}`;
      proxy[key] = createRouteHandler(url, method);
    } else if (isMethodGrouped(value)) {
      // Method-grouped routes (GET, PUT, etc.) - create method-specific handlers
      const methodHandlers: Record<
        string,
        (input?: unknown) => Promise<unknown>
      > = {};
      for (const [methodKey] of Object.entries(value)) {
        const url =
          pathMap.get(`${pathPrefix}:${methodKey}`) ||
          `${basePath}${pathPrefix}`;
        methodHandlers[methodKey] = createRouteHandler(url, methodKey);
      }
      proxy[key] = methodHandlers;
    } else if (value && typeof value === "object") {
      // Recursively build nested proxies
      proxy[key] = buildClientProxy(
        value as RouterShape,
        basePath,
        currentPath
      );
    }
  }

  return proxy;
};

/**
 * Typed API client for use in client components
 * Usage: import { apiClient } from "~/api-client"
 */
let apiClient: RouterClient<typeof api.routes>;

try {
  // Access api.routes - build paths using same logic as createAPI
  const routes = api.routes;
  if (!routes) {
    console.error("[api-client] api.routes is undefined");
    throw new Error("api.routes is undefined");
  }
  apiClient = buildClientProxy(routes, "/api") as RouterClient<
    typeof api.routes
  >;
} catch (error) {
  console.error("[api-client] Failed to build client proxy:", error);
  // Create a fallback empty proxy to prevent crashes
  apiClient = {} as RouterClient<typeof api.routes>;
}

export { apiClient };
