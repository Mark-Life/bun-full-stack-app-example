/**
 * Typesafe API route definition system
 * Provides tRPC-like type inference for API routes
 */

import { type ZodType, z } from "zod";

/**
 * HTTP methods supported by API routes
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Route configuration with Zod schemas
 */
export interface RouteConfig<
  TParams extends ZodType | undefined = undefined,
  TQuery extends ZodType | undefined = undefined,
  TBody extends ZodType | undefined = undefined,
  TResponse extends ZodType = ZodType,
> {
  method: HttpMethod;
  params?: TParams;
  query?: TQuery;
  body?: TBody;
  response: TResponse;
  handler: (ctx: {
    params: TParams extends ZodType ? z.infer<TParams> : undefined;
    query: TQuery extends ZodType ? z.infer<TQuery> : undefined;
    body: TBody extends ZodType ? z.infer<TBody> : undefined;
    request: Request;
  }) => Promise<z.infer<TResponse>> | z.infer<TResponse>;
}

/**
 * Branded route type for type inference
 */
export interface Route<
  TMethod extends HttpMethod = HttpMethod,
  TParams extends ZodType | undefined = undefined,
  TQuery extends ZodType | undefined = undefined,
  TBody extends ZodType | undefined = undefined,
  TResponse extends ZodType = ZodType,
> {
  _brand: "Route";
  _method: TMethod;
  _params: TParams;
  _query: TQuery;
  _body: TBody;
  _response: TResponse;
  config: RouteConfig<TParams, TQuery, TBody, TResponse>;
}

/**
 * Define a typed API route
 */
export const route = <
  TMethod extends HttpMethod,
  TParams extends ZodType | undefined = undefined,
  TQuery extends ZodType | undefined = undefined,
  TBody extends ZodType | undefined = undefined,
  TResponse extends ZodType = ZodType,
>(
  config: RouteConfig<TParams, TQuery, TBody, TResponse> & { method: TMethod }
): Route<TMethod, TParams, TQuery, TBody, TResponse> => ({
  _brand: "Route" as const,
  _method: config.method,
  _params: config.params as TParams,
  _query: config.query as TQuery,
  _body: config.body as TBody,
  _response: config.response,
  config,
});

/**
 * Router shape - nested object of routes
 * Routes can have any combination of params, query, body
 */
export type RouterShape = {
  [key: string]:
    | Route<
        HttpMethod,
        ZodType | undefined,
        ZodType | undefined,
        ZodType | undefined,
        ZodType
      >
    | RouterShape;
};

/**
 * Extract client call signature from a route
 */
type RouteClientFn<R extends Route> = R["_params"] extends ZodType
  ? R["_body"] extends ZodType
    ? (input: {
        params: z.infer<R["_params"]>;
        body: z.infer<R["_body"]>;
      }) => Promise<z.infer<R["_response"]>>
    : R["_query"] extends ZodType
      ? (input: {
          params: z.infer<R["_params"]>;
          query?: z.infer<R["_query"]>;
        }) => Promise<z.infer<R["_response"]>>
      : (input: {
          params: z.infer<R["_params"]>;
        }) => Promise<z.infer<R["_response"]>>
  : R["_body"] extends ZodType
    ? (input: z.infer<R["_body"]>) => Promise<z.infer<R["_response"]>>
    : R["_query"] extends ZodType
      ? (input?: {
          query?: z.infer<R["_query"]>;
        }) => Promise<z.infer<R["_response"]>>
      : () => Promise<z.infer<R["_response"]>>;

/**
 * Recursively transform router to client type
 */
export type RouterClient<T extends RouterShape> = {
  [K in keyof T]: T[K] extends Route
    ? RouteClientFn<T[K]>
    : T[K] extends RouterShape
      ? RouterClient<T[K]>
      : never;
};

/**
 * Route metadata for client bundle generation
 */
export interface RouteMetadata {
  path: string;
  method: HttpMethod;
  hasParams: boolean;
  hasQuery: boolean;
  hasBody: boolean;
}

/**
 * Flattened route map entry
 */
interface FlattenedRoute {
  path: string;
  route: Route;
}

/**
 * Bun.serve() route handler type
 */
type BunRouteHandler =
  | ((req: Request) => Promise<Response>)
  | Partial<Record<HttpMethod, (req: Request) => Promise<Response>>>;

/**
 * API instance returned by createAPI
 */
export interface APIInstance<T extends RouterShape> {
  routes: T;
  clientMeta: RouteMetadata[];
  handlers: () => Record<string, BunRouteHandler>;
}

/**
 * Extract param names from Zod object schema
 */
const extractParamNames = (schema: ZodType): string[] => {
  const def = (schema as { _def?: { shape?: Record<string, unknown> } })._def;
  if (def?.shape) {
    return Object.keys(def.shape);
  }
  return [];
};

/**
 * Build final path with param substitution
 */
const buildPathWithParams = (
  basePath: string,
  currentPath: string,
  routeConfig: RouteConfig
): string => {
  const fullPath = `${basePath}${currentPath}`;

  if (!routeConfig.params) {
    return fullPath;
  }

  const paramNames = extractParamNames(routeConfig.params);
  if (paramNames.length === 1) {
    const segments = fullPath.split("/");
    segments[segments.length - 1] = `:${paramNames[0]}`;
    return segments.join("/");
  }

  return fullPath;
};

/**
 * Create API from router definition
 */
export const createAPI = <T extends RouterShape>(
  routes: T,
  options?: { basePath?: string }
): APIInstance<T> => {
  const basePath = options?.basePath ?? "/api";

  /**
   * Check if object contains method-named routes (GET, POST, etc.)
   */
  const isMethodGrouped = (obj: RouterShape): boolean => {
    const methodNames: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      return false;
    }
    return (
      keys.every((key) => methodNames.includes(key as HttpMethod)) &&
      keys.every((key) => {
        const val = obj[key];
        return val && "_brand" in val && val._brand === "Route";
      })
    );
  };

  /**
   * Flatten method-grouped routes (same path, different methods)
   */
  const flattenMethodGrouped = (
    methodObj: RouterShape,
    currentPath: string,
    targetMap: Map<string, FlattenedRoute>
  ): void => {
    for (const [methodKey, methodRoute] of Object.entries(methodObj)) {
      if (
        methodRoute &&
        "_brand" in methodRoute &&
        methodRoute._brand === "Route"
      ) {
        const routeValue = methodRoute as Route;
        const finalPath = buildPathWithParams(
          basePath,
          currentPath, // Use currentPath which is the route path without method
          routeValue.config
        );

        // Store with method in the key for grouping later
        targetMap.set(`${currentPath}:${methodKey}`, {
          path: finalPath,
          route: routeValue,
        });
      }
    }
  };

  /**
   * Build path mapping from nested structure
   */
  const flattenRoutes = (
    obj: RouterShape,
    targetMap: Map<string, FlattenedRoute>,
    prefix = ""
  ): void => {
    for (const [key, value] of Object.entries(obj)) {
      if (!value) {
        continue;
      }

      const currentPath = `${prefix}/${key}`;

      if ("_brand" in value && value._brand === "Route") {
        // It's a single route
        const routeValue = value as Route;
        const finalPath = buildPathWithParams(
          basePath,
          currentPath,
          routeValue.config
        );

        targetMap.set(currentPath, { path: finalPath, route: routeValue });
      } else if (isMethodGrouped(value as RouterShape)) {
        // It's a method-grouped object (GET, PUT, etc.) - routes share the same path
        flattenMethodGrouped(value as RouterShape, currentPath, targetMap);
      } else {
        // Nested router shape - recurse
        flattenRoutes(value as RouterShape, targetMap, currentPath);
      }
    }
  };

  const routeMap = new Map<string, FlattenedRoute>();
  flattenRoutes(routes, routeMap);

  /**
   * Parse request params
   */
  const parseParams = (
    req: Request,
    paramsSchema?: ZodType
  ): unknown | undefined => {
    if (!paramsSchema) {
      return;
    }
    const rawParams =
      (req as Request & { params?: Record<string, string> }).params ?? {};
    return paramsSchema.parse(rawParams);
  };

  /**
   * Parse query params
   */
  const parseQuery = (url: URL, querySchema?: ZodType): unknown | undefined => {
    if (!querySchema) {
      return;
    }
    const queryObj = Object.fromEntries(url.searchParams);
    return querySchema.parse(queryObj);
  };

  /**
   * Parse request body
   */
  const parseBody = async (
    req: Request,
    bodySchema?: ZodType
  ): Promise<unknown | undefined> => {
    if (!bodySchema || req.method === "GET") {
      return;
    }
    const contentType = req.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      throw new Error("Content-Type must be application/json");
    }
    const json = await req.json();
    return bodySchema.parse(json);
  };

  /**
   * Handle API errors
   */
  const handleError = (error: unknown): Response => {
    if (error instanceof Response) {
      return error;
    }
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Validation failed", issues: error.issues },
        { status: 400 }
      );
    }
    console.error("API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  };

  /**
   * Build handler for a single route
   */
  const buildRouteHandler = (
    routeValue: Route
  ): ((req: Request) => Promise<Response>) => {
    return async (req: Request) => {
      const { config } = routeValue;

      // Only handle matching HTTP method
      if (req.method !== config.method) {
        return new Response("Method not allowed", { status: 405 });
      }

      try {
        const url = new URL(req.url);

        // Parse all inputs
        const params = parseParams(req, config.params);
        const query = parseQuery(url, config.query);
        const body = await parseBody(req, config.body).catch((error) => {
          if (
            error instanceof Error &&
            error.message.includes("Content-Type")
          ) {
            return Promise.reject(new Response(error.message, { status: 400 }));
          }
          return Promise.reject(error);
        });

        const handlerResult = await config.handler({
          params: params as never,
          query: query as never,
          body: body as never,
          request: req,
        });

        // Validate response in dev
        if (process.env.NODE_ENV !== "production") {
          config.response.parse(handlerResult);
        }

        return Response.json(handlerResult);
      } catch (error) {
        return handleError(error);
      }
    };
  };

  /**
   * Group routes by path
   * Handles method-grouped routes (routes with same path, different methods)
   */
  const groupRoutesByPath = (): Map<
    string,
    Map<HttpMethod, (req: Request) => Promise<Response>>
  > => {
    const routesByPath = new Map<
      string,
      Map<HttpMethod, (req: Request) => Promise<Response>>
    >();

    for (const [, { path: routePath, route: routeValue }] of routeMap) {
      const method = routeValue.config.method;

      if (!routesByPath.has(routePath)) {
        routesByPath.set(routePath, new Map());
      }
      const methodMap = routesByPath.get(routePath);
      if (methodMap) {
        methodMap.set(method, buildRouteHandler(routeValue));
      }
    }

    return routesByPath;
  };

  /**
   * Build handler for single method route
   */
  const buildSingleMethodHandler = (
    methods: Map<HttpMethod, (req: Request) => Promise<Response>>
  ): ((req: Request) => Promise<Response>) => {
    const handler = methods.values().next().value;
    if (!handler) {
      throw new Error("No handler found for route");
    }
    return handler;
  };

  /**
   * Build handler for multi-method route
   */
  const buildMultiMethodHandler = (
    methods: Map<HttpMethod, (req: Request) => Promise<Response>>
  ): Partial<Record<HttpMethod, (req: Request) => Promise<Response>>> => {
    const methodHandlers: Partial<
      Record<HttpMethod, (req: Request) => Promise<Response>>
    > = {};
    for (const [method, handler] of methods) {
      methodHandlers[method] = handler;
    }
    return methodHandlers;
  };

  /**
   * Build Bun.serve() handlers
   * Groups routes by path and creates method-specific handlers
   */
  const handlers = (): Record<string, BunRouteHandler> => {
    const routesByPath = groupRoutesByPath();
    const handlerMap: Record<string, BunRouteHandler> = {};

    for (const [path, methods] of routesByPath) {
      // If only one method, use simple handler
      if (methods.size === 1) {
        handlerMap[path] = buildSingleMethodHandler(methods);
      } else {
        // Multiple methods - create method-specific object
        handlerMap[path] = buildMultiMethodHandler(methods);
      }
    }

    return handlerMap;
  };

  /**
   * Build client metadata
   */
  const clientMeta: RouteMetadata[] = [];
  for (const [, { path: metaPath, route: metaRoute }] of routeMap) {
    clientMeta.push({
      path: metaPath,
      method: metaRoute.config.method,
      hasParams: metaRoute.config.params !== undefined,
      hasQuery: metaRoute.config.query !== undefined,
      hasBody: metaRoute.config.body !== undefined,
    });
  }

  return {
    routes,
    clientMeta,
    handlers,
  };
};
