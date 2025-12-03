/**
 * Cache Components utilities
 * Handles component-level caching for Partial Prerendering (PPR)
 */

import {
  createElement,
  type ComponentType as ReactComponentType,
  type ReactNode,
} from "react";
import type { SerializedNode } from "./serialize";
import {
  generateComponentId,
  type RSCPayload,
  serializeJSX,
} from "./serialize";

/**
 * Cache configuration for cached components
 */
export interface CacheConfig {
  /** Seconds until cache is considered stale (default: 3600 = 1 hour) */
  stale?: number;
  /** Seconds until background revalidation occurs */
  revalidate?: number;
  /** Seconds until cache hard expires */
  expire?: number;
  /** Cache tag for invalidation */
  tag?: string;
}

/**
 * Branded marker for cached components
 */
const CACHE_MARKER = Symbol.for("__cacheConfig");

/**
 * Regex to extract inner HTML from wrapped div
 */
const RSC_CACHED_DIV_REGEX = /^<div[^>]*data-rsc-cached[^>]*>([\s\S]*)<\/div>$/;

/**
 * Persistent server-side cache for component HTML
 * This survives across requests (in-memory for now)
 */
const serverComponentCache = new Map<
  string,
  { html: string; timestamp: number; stale: number }
>();

/**
 * Get cached HTML for a component (server-side)
 */
const getServerCachedHtml = (
  compId: string,
  staleSeconds: number
): string | null => {
  const cached = serverComponentCache.get(compId);
  if (!cached) {
    return null;
  }

  const now = Date.now();
  const ageSeconds = (now - cached.timestamp) / 1000;

  // Return cached if not stale
  if (ageSeconds < staleSeconds) {
    return cached.html;
  }

  // Stale - remove from cache
  serverComponentCache.delete(compId);
  return null;
};

/**
 * Store HTML in server cache
 */
const setServerCachedHtml = (
  compId: string,
  html: string,
  staleSeconds: number
): void => {
  serverComponentCache.set(compId, {
    html,
    timestamp: Date.now(),
    stale: staleSeconds,
  });
};

/**
 * Type-safe cached component marker
 */
export type CachedComponent<P = Record<string, unknown>> =
  ReactComponentType<P> & {
    [CACHE_MARKER]: CacheConfig;
  };

/**
 * Type-safe wrapper to mark a component as cacheable
 * Components wrapped with this will be cached and included in static shells
 * Usage: export const MyComponent = cacheComponent(async (props) => { ... });
 *
 * Server behavior:
 * - Execute the async component
 * - Capture and serialize the rendered output
 * - Store in registry for RSC payload
 * - Return the original output
 *
 * Client behavior:
 * - Look up pre-serialized output from RSC payload
 * - Return deserialized output (no re-execution)
 *
 * @param Component - The component to wrap
 * @param config - Cache configuration options
 * @returns Component with cache marker attached
 */
export const cacheComponent = <
  P extends Record<string, unknown> = Record<string, unknown>,
>(
  OriginalComponent: ReactComponentType<P>,
  config: CacheConfig = {}
): CachedComponent<P> => {
  const defaultConfig: CacheConfig = {
    stale: 3600, // Default 1 hour
    ...config,
  };

  const componentName =
    OriginalComponent.displayName ||
    OriginalComponent.name ||
    "CachedComponent";

  // Create wrapper component that handles server/client behavior
  // IMPORTANT: Client path must be SYNCHRONOUS for hydration to work
  const CachedWrapper = (props: P): ReactNode | Promise<ReactNode> => {
    const compId = generateComponentId(
      componentName,
      props as Record<string, unknown>
    );

    // Client: SYNCHRONOUS path - must not use await
    if (!isServer()) {
      const cachedHtml = getClientCachedOutput(compId);
      if (
        cachedHtml &&
        typeof cachedHtml === "object" &&
        "__type" in cachedHtml
      ) {
        const node = cachedHtml as { __type: string; value?: string };
        if (node.__type === "text" && typeof node.value === "string") {
          // Extract inner HTML (remove outer div wrapper)
          const innerHtml = node.value.replace(RSC_CACHED_DIV_REGEX, "$1");
          return createElement("div", {
            "data-rsc-cached": compId,
            style: { display: "contents" },
            // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for RSC hydration
            dangerouslySetInnerHTML: { __html: innerHtml },
          });
        }
      }

      // Fallback: return null to prevent async execution during hydration
      console.warn(`[CacheComponent] No cached output for ${compId}`);
      return null;
    }

    // Server: Check persistent cache first
    const staleSeconds = defaultConfig.stale ?? 3600;
    const cachedHtmlFromServer = getServerCachedHtml(compId, staleSeconds);

    if (cachedHtmlFromServer) {
      // Cache HIT - return cached HTML without re-executing
      console.log(`[CacheComponent] ✅ CACHE HIT for ${compId}`);

      // Register for RSC payload
      registerCachedOutput(
        compId,
        componentName,
        props as Record<string, unknown>,
        cachedHtmlFromServer
      );

      // Return the cached HTML wrapped in a div
      // Using dangerouslySetInnerHTML to inject pre-rendered content
      const innerHtml = cachedHtmlFromServer.replace(
        RSC_CACHED_DIV_REGEX,
        "$1"
      );
      return createElement("div", {
        "data-rsc-cached": compId,
        style: { display: "contents" },
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for cached component
        dangerouslySetInnerHTML: { __html: innerHtml },
      });
    }

    // Cache MISS - execute component and cache result
    return (async () => {
      console.log(
        `[CacheComponent] ❌ CACHE MISS for ${compId} - executing...`
      );

      // Execute the original component
      type ComponentFn = (p: P) => Promise<ReactNode>;
      const rendered = await (OriginalComponent as ComponentFn)(props);

      // Wrap in a marker div and render to HTML
      const { renderToStaticMarkup } = await import("react-dom/server");
      const wrapped = createElement(
        "div",
        { "data-rsc-cached": compId, style: { display: "contents" } },
        rendered
      );
      const htmlString = renderToStaticMarkup(wrapped);

      // Store in persistent cache
      setServerCachedHtml(compId, htmlString, staleSeconds);
      console.log(`[CacheComponent] 💾 Cached HTML for ${compId}`);

      // Register for RSC payload
      registerCachedOutput(
        compId,
        componentName,
        props as Record<string, unknown>,
        htmlString
      );

      // Return the wrapped element for server rendering
      return wrapped;
    })();
  };

  // Preserve display name
  CachedWrapper.displayName = `Cached(${componentName})`;

  // Attach cache marker
  (CachedWrapper as unknown as CachedComponent<P>)[CACHE_MARKER] =
    defaultConfig;

  return CachedWrapper as unknown as CachedComponent<P>;
};

/**
 * Check if component has cache configuration
 */
export const hasCacheConfig = (
  component: unknown
): component is CachedComponent<unknown> =>
  typeof component === "function" && CACHE_MARKER in component;

/**
 * Get cache configuration from component
 */
export const getCacheConfig = (
  component: CachedComponent<unknown>
): CacheConfig => component[CACHE_MARKER] as CacheConfig;

// ============================================================================
// RSC Payload Registry for cached component output
// ============================================================================

/**
 * Cached output entry
 */
export interface CachedOutput {
  componentId: string;
  componentName: string;
  props: Record<string, unknown>;
  serialized: SerializedNode;
}

/**
 * Server-side registry to collect cached outputs during render
 * Reset before each render
 */
let cachedOutputRegistry = new Map<string, CachedOutput>();

/**
 * Get all cached outputs from registry
 */
export const getCachedOutputs = (): Map<string, CachedOutput> =>
  cachedOutputRegistry;

/**
 * Clear cached output registry (call before each render)
 */
export const clearCachedOutputRegistry = (): void => {
  cachedOutputRegistry = new Map();
};

/**
 * Register a cached component's output
 */
export const registerCachedOutput = (
  componentId: string,
  componentName: string,
  props: Record<string, unknown>,
  output: ReactNode
): void => {
  cachedOutputRegistry.set(componentId, {
    componentId,
    componentName,
    props,
    serialized: serializeJSX(output),
  });
};

/**
 * Build RSC payload from registry
 */
export const buildRSCPayload = (): RSCPayload => {
  const components: Record<string, SerializedNode> = {};

  for (const [id, entry] of cachedOutputRegistry.entries()) {
    components[id] = entry.serialized;
  }

  return {
    components,
    generatedAt: Date.now(),
  };
};

// ============================================================================
// Client-side RSC Payload access
// ============================================================================

/**
 * Client-side RSC payload (loaded from window.__RSC_PAYLOAD__)
 */
let clientPayload: RSCPayload | null = null;

/**
 * Set client-side payload (called during hydration)
 */
export const setClientPayload = (payload: RSCPayload): void => {
  clientPayload = payload;
};

/**
 * Get cached output for a component from client payload
 * Checks both the module-level cache and the global window variable
 */
export const getClientCachedOutput = (
  compId: string
): SerializedNode | null => {
  // Try module-level cache first
  if (clientPayload) {
    return clientPayload.components[compId] || null;
  }

  // Fall back to global variable (set by hydrate.tsx before module imports complete)
  if (typeof window !== "undefined") {
    const globalPayload = (
      window as unknown as { __RSC_LOADED_PAYLOAD__?: RSCPayload }
    ).__RSC_LOADED_PAYLOAD__;
    if (globalPayload) {
      return globalPayload.components[compId] || null;
    }
  }

  return null;
};

/**
 * Check if we're running on the server
 */
export const isServer = (): boolean => typeof window === "undefined";

/**
 * Wrap a dynamic async component for proper SSR + hydration
 * Similar to cacheComponent but without persistent caching
 * Server: executes and serializes output to RSC payload
 * Client: returns serialized output (no re-execution)
 */
export const dynamicComponent = <
  P extends Record<string, unknown> = Record<string, unknown>,
>(
  Component: (props: P) => Promise<ReactNode>
): ((props: P) => ReactNode | Promise<ReactNode>) => {
  const componentName = Component.name || "DynamicComponent";

  const DynamicWrapper = (props: P): ReactNode | Promise<ReactNode> => {
    const compId = generateComponentId(
      `dynamic_${componentName}`,
      props as Record<string, unknown>
    );

    // Client: return serialized output from RSC payload
    if (!isServer()) {
      const cachedHtml = getClientCachedOutput(compId);
      if (
        cachedHtml &&
        typeof cachedHtml === "object" &&
        "__type" in cachedHtml
      ) {
        const node = cachedHtml as { __type: string; value?: string };
        if (node.__type === "text" && typeof node.value === "string") {
          const innerHtml = node.value.replace(RSC_CACHED_DIV_REGEX, "$1");
          return createElement("div", {
            "data-rsc-dynamic": compId,
            style: { display: "contents" },
            // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for hydration
            dangerouslySetInnerHTML: { __html: innerHtml },
          });
        }
      }
      // Fallback: return null (shouldn't happen if payload is correct)
      console.warn(`[DynamicComponent] No output for ${compId}`);
      return null;
    }

    // Server: execute and register output for RSC payload
    return (async () => {
      const rendered = await Component(props);

      // Serialize to HTML
      const { renderToStaticMarkup } = await import("react-dom/server");
      const wrapped = createElement(
        "div",
        { "data-rsc-dynamic": compId, style: { display: "contents" } },
        rendered
      );
      const htmlString = renderToStaticMarkup(wrapped);

      // Register for RSC payload (request-scoped, not persistent)
      registerCachedOutput(
        compId,
        componentName,
        props as Record<string, unknown>,
        htmlString
      );

      return wrapped;
    })();
  };

  DynamicWrapper.displayName = `Dynamic(${componentName})`;
  return DynamicWrapper;
};
