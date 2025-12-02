/**
 * Middleware system for request/response interception
 * Supports include/exclude patterns for selective middleware application
 */

/**
 * Middleware handler function
 */
export type MiddlewareHandler = (
  request: Request,
  next: () => Promise<Response>
) => Promise<Response>;

/**
 * Middleware configuration
 */
export interface MiddlewareConfig {
  /**
   * Patterns to exclude from middleware (default behavior)
   * If include is specified, exclude is ignored
   */
  exclude?: string[];
  /**
   * Patterns to include for middleware (overrides exclude)
   * If specified, middleware only runs on matching paths
   */
  include?: string[];
  /**
   * Middleware handler function
   */
  handler: MiddlewareHandler;
}

/**
 * Middleware definition
 */
export interface MiddlewareDefinition {
  exclude?: string[];
  include?: string[];
  handler: MiddlewareHandler;
}

/**
 * Match pattern against path (simple glob-like)
 */
const matchPattern = (pattern: string, path: string): boolean => {
  // Convert glob pattern to regex
  // ** matches any number of directories
  // * matches any characters except /
  // ? matches single character
  const regexPattern = pattern
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".");
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
};

/**
 * Check if path matches any pattern in array
 */
const matchesAnyPattern = (path: string, patterns: string[]): boolean =>
  patterns.some((pattern) => matchPattern(pattern, path));

/**
 * Check if middleware should run for given path
 */
const shouldRunMiddleware = (
  path: string,
  config: MiddlewareDefinition
): boolean => {
  // If include is specified, only run on matching paths
  if (config.include && config.include.length > 0) {
    return matchesAnyPattern(path, config.include);
  }

  // If exclude is specified, skip matching paths
  if (config.exclude && config.exclude.length > 0) {
    return !matchesAnyPattern(path, config.exclude);
  }

  // Default: run on all paths
  return true;
};

/**
 * Define middleware configuration
 */
export const defineMiddleware = (
  config: MiddlewareConfig
): MiddlewareDefinition => {
  const result: MiddlewareDefinition = {
    handler: config.handler,
  };

  if (config.exclude !== undefined) {
    result.exclude = config.exclude;
  }

  if (config.include !== undefined) {
    result.include = config.include;
  }

  return result;
};

/**
 * Bun route handler type (can be function or method-specific object)
 */
type BunRouteHandler =
  | ((req: Request) => Promise<Response>)
  | Partial<Record<string, (req: Request) => Promise<Response>>>;

/**
 * Wrap a single handler with middleware
 */
const wrapSingleHandler = (
  middleware: MiddlewareDefinition,
  handler: (req: Request) => Promise<Response>
): ((req: Request) => Promise<Response>) => {
  return async (req: Request) => {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Check if middleware should run
    if (!shouldRunMiddleware(pathname, middleware)) {
      return handler(req);
    }

    // Wrap handler with middleware
    return await middleware.handler(req, async () => handler(req));
  };
};

/**
 * Apply middleware to route handlers
 * Handles both simple handlers and Bun's method-specific handlers
 */
export const applyMiddleware = (
  middleware: MiddlewareDefinition | undefined,
  handlers: Record<string, BunRouteHandler>
): Record<string, BunRouteHandler> => {
  if (!middleware) {
    return handlers;
  }

  const wrappedHandlers: Record<string, BunRouteHandler> = {};

  for (const [routePath, handler] of Object.entries(handlers)) {
    // Check if it's a method-specific object (not a function)
    const isMethodObject =
      typeof handler === "object" &&
      handler !== null &&
      typeof handler !== "function";

    if (isMethodObject) {
      // It's a method-specific object - wrap each method handler
      const methodHandlers: Partial<
        Record<string, (req: Request) => Promise<Response>>
      > = {};
      const handlerObj = handler as Partial<
        Record<string, (req: Request) => Promise<Response>>
      >;
      for (const [method, methodHandler] of Object.entries(handlerObj)) {
        if (typeof methodHandler === "function") {
          methodHandlers[method] = wrapSingleHandler(middleware, methodHandler);
        }
      }
      wrappedHandlers[routePath] = methodHandlers;
    } else if (typeof handler === "function") {
      // It's a simple function handler
      const handlerFn = handler as (req: Request) => Promise<Response>;
      wrappedHandlers[routePath] = wrapSingleHandler(middleware, handlerFn);
    } else {
      // Fallback - pass through as-is
      wrappedHandlers[routePath] = handler;
    }
  }

  return wrappedHandlers;
};

/**
 * Apply middleware to a single handler
 */
export const wrapHandler = (
  middleware: MiddlewareDefinition | undefined,
  handler: (req: Request) => Promise<Response>
): ((req: Request) => Promise<Response>) => {
  if (!middleware) {
    return handler;
  }

  return async (req: Request) => {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Check if middleware should run
    if (!shouldRunMiddleware(pathname, middleware)) {
      return handler(req);
    }

    // Wrap handler with middleware
    return await middleware.handler(req, async () => handler(req));
  };
};
