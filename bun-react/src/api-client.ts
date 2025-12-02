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

  if (!(params || query)) {
    // Direct body input (shorthand for routes with only body)
    return { finalUrl, body: JSON.stringify(input) };
  }

  return { finalUrl };
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
 * Build client proxy from API routes
 * This creates a typed proxy that makes fetch calls
 */
const buildClientProxy = <T extends RouterShape>(
  routes: T,
  basePath = "/api",
  pathPrefix = ""
): unknown => {
  const proxy: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(routes)) {
    const currentPath = `${pathPrefix}/${key}`;

    if (isRoute(value)) {
      // Single route
      const method = value.config.method;
      const url = `${basePath}${currentPath}`;
      proxy[key] = createRouteHandler(url, method);
    } else if (isMethodGrouped(value)) {
      // Method-grouped routes (GET, PUT, etc.) - create method-specific handlers
      const methodHandlers: Record<
        string,
        (input?: unknown) => Promise<unknown>
      > = {};
      for (const [methodKey, routeValue] of Object.entries(value)) {
        if (isRoute(routeValue)) {
          const url = `${basePath}${pathPrefix}`; // Use prefix, not currentPath
          methodHandlers[methodKey] = createRouteHandler(url, methodKey);
        }
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
export const apiClient = buildClientProxy(api.routes, "/api") as RouterClient<
  typeof api.routes
>;
