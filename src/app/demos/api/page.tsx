import { type FormEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CodeBlock,
  CodeBlockCopyButton,
  SystemThemeWrapper,
} from "@/components/ui/code-block";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "~/api";
import { apiClient } from "~/api-client";
import type { RouteMetadata } from "~/framework/shared/api";
import { clientComponent } from "~/framework/shared/rsc";

/**
 * Check if value is a Route
 */
const isRoute = (value: unknown): value is { _brand: "Route" } =>
  value !== null &&
  typeof value === "object" &&
  "_brand" in value &&
  value._brand === "Route";

/**
 * Check if object is method-grouped (GET, PUT, etc.)
 */
const isMethodGrouped = (
  value: Record<string, unknown>
): value is Record<string, { _brand: "Route" }> => {
  const methodNames = ["GET", "POST", "PUT", "PATCH", "DELETE"];
  const keys = Object.keys(value);
  if (keys.length === 0) {
    return false;
  }
  return (
    keys.every((k) => methodNames.includes(k)) &&
    keys.every((k) => isRoute(value[k]))
  );
};

/**
 * Find matching metadata for current path and method
 */
const findMetadata = (
  path: string,
  method?: string
): RouteMetadata | undefined =>
  api.clientMeta.find(
    (meta) => meta.path === path && (!method || meta.method === method)
  );

/**
 * Process a single route entry
 */
const processRouteEntry = (
  entry: {
    key: string;
    value: unknown;
    pathPrefix: string;
    callPrefix: string[];
  },
  map: Map<string, { callPath: string[]; metadata: RouteMetadata }>
): void => {
  const { key, value, pathPrefix, callPrefix } = entry;
  const currentPath = `${pathPrefix}/${key}`;
  const currentCallPath = [...callPrefix, key];

  if (isRoute(value)) {
    const routeValue = value as unknown as { config: { method: string } };
    const fullPath = `/api${currentPath}`;
    const metadata = findMetadata(fullPath, routeValue.config.method);
    if (metadata) {
      map.set(fullPath, { callPath: currentCallPath, metadata });
    }
    return;
  }

  if (typeof value !== "object" || value === null) {
    return;
  }

  const valueObj = value as Record<string, unknown>;
  if (isMethodGrouped(valueObj)) {
    const fullPath = `/api${currentPath}`;
    for (const methodKey of Object.keys(valueObj)) {
      const metadata = findMetadata(fullPath, methodKey);
      if (metadata) {
        // Use method + path as unique key for method-grouped routes
        const uniqueKey = `${methodKey} ${fullPath}`;
        map.set(uniqueKey, {
          callPath: [...callPrefix, key, methodKey],
          metadata,
        });
      }
    }
  } else {
    const nested = buildRouteCallMap(value, currentPath, currentCallPath);
    for (const [path, data] of nested) {
      map.set(path, data);
    }
  }
};

/**
 * Build path-to-client-call mapping from routes structure
 */
const buildRouteCallMap = (
  routes: unknown,
  pathPrefix = "",
  callPrefix: string[] = []
): Map<string, { callPath: string[]; metadata: RouteMetadata }> => {
  const map = new Map<
    string,
    { callPath: string[]; metadata: RouteMetadata }
  >();

  if (!routes || typeof routes !== "object") {
    return map;
  }

  const routesObj = routes as Record<string, unknown>;

  for (const [key, value] of Object.entries(routesObj)) {
    if (value) {
      processRouteEntry({ key, value, pathPrefix, callPrefix }, map);
    }
  }

  return map;
};

/**
 * Get nested value from object by path array
 */
const getNestedValue = (
  obj: unknown,
  path: string[]
): ((input?: unknown) => Promise<unknown>) | undefined => {
  let current: unknown = obj;
  for (const key of path) {
    if (current && typeof current === "object") {
      const currentObj = current as Record<string, unknown>;
      if (key in currentObj) {
        current = currentObj[key];
      } else {
        return;
      }
    } else {
      return;
    }
  }
  return typeof current === "function"
    ? (current as (input?: unknown) => Promise<unknown>)
    : undefined;
};

const APITester = clientComponent(() => {
  const responseInputRef = useRef<HTMLTextAreaElement>(null);
  const [selectedRoute, setSelectedRoute] = useState<string>("");
  const [paramsInput, setParamsInput] = useState<string>("{}");
  const [queryInput, setQueryInput] = useState<string>("{}");
  const [bodyInput, setBodyInput] = useState<string>("{}");

  const routeCallMap = buildRouteCallMap(api.routes);
  const routes = Array.from(routeCallMap.entries()).map(([path, data]) => ({
    path,
    ...data,
  }));

  const selectedRouteData = routes.find((r) => r.path === selectedRoute);

  /**
   * Set response text
   */
  const setResponse = (text: string): void => {
    if (responseInputRef.current) {
      responseInputRef.current.value = text;
    }
  };

  /**
   * Parse JSON input with error handling
   */
  const parseJsonInput = (input: string, fieldName: string): unknown => {
    try {
      return JSON.parse(input || "{}");
    } catch {
      throw new Error(`Invalid ${fieldName} JSON`);
    }
  };

  /**
   * Build input object from route requirements
   */
  const buildInput = (): Record<string, unknown> => {
    const input: Record<string, unknown> = {};

    if (selectedRouteData?.metadata.hasParams) {
      input["params"] = parseJsonInput(paramsInput, "params");
    }

    if (selectedRouteData?.metadata.hasQuery) {
      input["query"] = parseJsonInput(queryInput, "query");
    }

    if (selectedRouteData?.metadata.hasBody) {
      input["body"] = parseJsonInput(bodyInput, "body");
    }

    return input;
  };

  /**
   * Execute API call
   */
  const executeCall = async (): Promise<void> => {
    if (!selectedRouteData) {
      setResponse("Please select a route");
      return;
    }

    const clientCall = getNestedValue(apiClient, selectedRouteData.callPath);

    if (!clientCall) {
      throw new Error(`Route not found: ${selectedRouteData.path}`);
    }

    const input = buildInput();
    const result = await clientCall(
      Object.keys(input).length > 0 ? input : undefined
    );

    setResponse(JSON.stringify(result, null, 2));
  };

  const testEndpoint = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      await executeCall();
    } catch (error) {
      setResponse(String(error));
    }
  };

  // Update inputs when route changes
  const handleRouteChange = (path: string) => {
    setSelectedRoute(path);
    const foundRoute = routes.find((r) => r.path === path);
    if (foundRoute) {
      setParamsInput("{}");
      setQueryInput("{}");
      setBodyInput("{}");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-col gap-4" onSubmit={testEndpoint}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="route-select">Select API Route</Label>
          <Select onValueChange={handleRouteChange} value={selectedRoute}>
            <SelectTrigger className="w-full" id="route-select">
              <SelectValue placeholder="Select a route..." />
            </SelectTrigger>
            <SelectContent>
              {routes.map((route) => (
                <SelectItem key={route.path} value={route.path}>
                  <span className="font-mono text-sm">
                    {route.metadata.method} {route.metadata.path}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedRouteData ? (
          <>
            <div className="space-y-2 rounded-lg border p-4">
              <div className="font-semibold text-sm">Route Info</div>
              <div className="space-y-1 text-muted-foreground text-xs">
                <div>
                  <span className="font-mono">Method:</span>{" "}
                  {selectedRouteData.metadata.method}
                </div>
                <div>
                  <span className="font-mono">Path:</span>{" "}
                  {selectedRouteData.metadata.path}
                </div>
                <div>
                  <span className="font-mono">Requires:</span>{" "}
                  {[
                    selectedRouteData.metadata.hasParams ? "params" : null,
                    selectedRouteData.metadata.hasQuery ? "query" : null,
                    selectedRouteData.metadata.hasBody ? "body" : null,
                  ]
                    .filter((item): item is string => item !== null)
                    .join(", ") || "none"}
                </div>
              </div>
            </div>

            {selectedRouteData.metadata.hasParams ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="params">Params (JSON)</Label>
                <Textarea
                  className="font-mono text-sm"
                  id="params"
                  onChange={(e) => setParamsInput(e.target.value)}
                  placeholder='{"id": "123"}'
                  value={paramsInput}
                />
              </div>
            ) : null}

            {selectedRouteData.metadata.hasQuery ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="query">Query (JSON)</Label>
                <Textarea
                  className="font-mono text-sm"
                  id="query"
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder='{"limit": 10}'
                  value={queryInput}
                />
              </div>
            ) : null}

            {selectedRouteData.metadata.hasBody ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="body">Body (JSON)</Label>
                <Textarea
                  className="font-mono text-sm"
                  id="body"
                  onChange={(e) => setBodyInput(e.target.value)}
                  placeholder='{"name": "Test"}'
                  value={bodyInput}
                />
              </div>
            ) : null}
          </>
        ) : null}

        <Button disabled={!selectedRouteData} type="submit">
          Send Request
        </Button>
      </form>

      <div className="flex flex-col gap-2">
        <Label htmlFor="response">Response</Label>
        <Textarea
          className="min-h-[200px] resize-y font-mono text-sm"
          id="response"
          placeholder="Response will appear here..."
          readOnly
          ref={responseInputRef}
        />
      </div>
    </div>
  );
});

export default function APIDemoPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-4 font-bold text-4xl">Typesafe API Routes</h1>
        <p className="text-lg text-muted-foreground">
          End-to-end type safety from server to client. Define routes with Zod
          schemas and get full type inference.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>API Tester</CardTitle>
          <CardDescription>
            Test API endpoints with full type safety
          </CardDescription>
        </CardHeader>
        <CardContent>
          <APITester />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How Typesafe APIs Work</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-inside list-decimal space-y-2 text-muted-foreground">
            <li>
              Define routes with Zod schemas for params, query, body, and
              response
            </li>
            <li>
              Compose routes into an API object using{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                createAPI()
              </code>
            </li>
            <li>
              Generate typesafe client with{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                apiClient
              </code>
            </li>
            <li>
              Use the client in components - all types are inferred
              automatically
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Code Examples</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="server">
            <TabsList>
              <TabsTrigger value="server">Server</TabsTrigger>
              <TabsTrigger value="client">Client</TabsTrigger>
            </TabsList>
            <TabsContent className="mt-4" value="server">
              <SystemThemeWrapper>
                <CodeBlock
                  code={`// src/api/users.ts
import { z } from "zod";
import { route } from "~/framework/shared/api";

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

export const byId = route({
  method: "GET",
  params: z.object({ id: z.string() }),
  response: userSchema,
  handler: ({ params }) => getUser(params.id),
});

export const create = route({
  method: "POST",
  body: z.object({ 
    name: z.string(), 
    email: z.string().email() 
  }),
  response: userSchema,
  handler: ({ body }) => createUser(body),
});`}
                  language="typescript"
                >
                  <CodeBlockCopyButton
                    code={`// src/api/users.ts
import { z } from "zod";
import { route } from "~/framework/shared/api";

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

export const byId = route({
  method: "GET",
  params: z.object({ id: z.string() }),
  response: userSchema,
  handler: ({ params }) => getUser(params.id),
});

export const create = route({
  method: "POST",
  body: z.object({ 
    name: z.string(), 
    email: z.string().email() 
  }),
  response: userSchema,
  handler: ({ body }) => createUser(body),
});`}
                  />
                </CodeBlock>
              </SystemThemeWrapper>
            </TabsContent>
            <TabsContent className="mt-4" value="client">
              <SystemThemeWrapper>
                <CodeBlock
                  code={`// In client components
import { apiClient } from "~/api-client";

// Fully typed - no strings!
const user = await apiClient.users.byId({ 
  params: { id: "123" } 
});

const newUser = await apiClient.users.create({ 
  name: "John", 
  email: "john@example.com" 
});

// Method-grouped routes
const greeting = await apiClient.hello.GET();

// TypeScript knows the exact types!
// user: { id: string, name: string, email: string }
// newUser: { id: string, name: string, email: string }
// greeting: { message: string, timestamp: number }`}
                  language="typescript"
                >
                  <CodeBlockCopyButton
                    code={`// In client components
import { apiClient } from "~/api-client";

// Fully typed - no strings!
const user = await apiClient.users.byId({ 
  params: { id: "123" } 
});

const newUser = await apiClient.users.create({ 
  name: "John", 
  email: "john@example.com" 
});

// Method-grouped routes
const greeting = await apiClient.hello.GET();

// TypeScript knows the exact types!
// user: { id: string, name: string, email: string }
// newUser: { id: string, name: string, email: string }
// greeting: { message: string, timestamp: number }`}
                  />
                </CodeBlock>
              </SystemThemeWrapper>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Benefits</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-inside list-disc space-y-2 text-muted-foreground">
            <li>End-to-end type safety - catch errors at compile time</li>
            <li>Auto-completion in IDE - no guessing API shapes</li>
            <li>Runtime validation with Zod - invalid requests are rejected</li>
            <li>Single source of truth - define schema once, use everywhere</li>
            <li>Refactor-safe - changing schemas updates all usages</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
