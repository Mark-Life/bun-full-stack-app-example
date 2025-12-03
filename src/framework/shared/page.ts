/**
 * Page configuration utilities
 * Handles static vs dynamic page rendering behavior
 */

import { readFileSync } from "node:fs";
import type { ComponentType as ReactComponentType } from "react";

/**
 * Page rendering type
 */
export type PageType = "static" | "dynamic";

/**
 * Static params generator for dynamic routes
 * Returns array of param objects to pre-render
 */
export type GenerateParamsFn<
  TParams extends Record<string, string> = Record<string, string>,
> = () => TParams[] | Promise<TParams[]>;

/**
 * Data loader for build-time data fetching
 * Returns data that will be passed to component as props.data
 * For dynamic routes, params are passed to the loader
 */
export type LoaderFn<
  TData = unknown,
  TParams extends Record<string, string> = Record<string, string>,
> = (params?: TParams) => TData | Promise<TData>;

/**
 * Page configuration attached to components
 */
export interface PageConfig<
  TParams extends Record<string, string> = Record<string, string>,
  TData = unknown,
> {
  type: PageType;
  generateParams?: GenerateParamsFn<TParams>;
  loader?: LoaderFn<TData, TParams>;
  /** ISR revalidation interval in seconds. Undefined = no ISR (pure static or dynamic) */
  revalidate?: number;
}

/**
 * Branded marker for configured pages
 */
const PAGE_CONFIG_MARKER = Symbol.for("__pageConfig");

/**
 * Configured page component type
 */
export type ConfiguredPage<
  P extends Record<string, unknown> = Record<string, unknown>,
> = ReactComponentType<P> & {
  [PAGE_CONFIG_MARKER]: PageConfig;
};

/**
 * Define a page with static/dynamic behavior
 *
 * @example Static page
 * ```tsx
 * export default definePage({
 *   type: 'static',
 *   component: () => <AboutPage />
 * });
 * ```
 *
 * @example Static page with loader
 * ```tsx
 * export default definePage({
 *   type: 'static',
 *   loader: async () => ({ posts: await fetchPosts() }),
 *   component: ({ data }) => <PostList posts={data.posts} />
 * });
 * ```
 *
 * @example Static dynamic route
 * ```tsx
 * export default definePage({
 *   type: 'static',
 *   generateParams: () => [{ slug: 'post-1' }, { slug: 'post-2' }],
 *   component: ({ params }) => <BlogPost slug={params.slug} />
 * });
 * ```
 *
 * @example Dynamic (explicit)
 * ```tsx
 * export default definePage({
 *   type: 'dynamic',
 *   component: Dashboard
 * });
 * ```
 */
export const definePage = <
  P extends Record<string, unknown> = Record<string, unknown>,
  TParams extends Record<string, string> = Record<string, string>,
  TData = unknown,
>(pageConfig: {
  component: ReactComponentType<P>;
  type?: PageType;
  generateParams?: GenerateParamsFn<TParams>;
  loader?: LoaderFn<TData, TParams>;
  revalidate?: number;
}): ConfiguredPage<P> => {
  const {
    component,
    type = "dynamic",
    generateParams,
    loader,
    revalidate,
  } = pageConfig;

  // Attach config to component
  const attachedConfig = {
    type,
    ...(generateParams && { generateParams }),
    ...(loader && { loader }),
    ...(revalidate !== undefined && { revalidate }),
  } as PageConfig<TParams, TData>;
  (component as ConfiguredPage<P>)[PAGE_CONFIG_MARKER] =
    attachedConfig as unknown as PageConfig;

  return component as ConfiguredPage<P>;
};

/**
 * Check if component has page configuration
 */
export const hasPageConfig = (
  component: unknown
): component is ConfiguredPage =>
  typeof component === "function" && PAGE_CONFIG_MARKER in component;

/**
 * Get page configuration from component
 */
export const getPageConfig = <
  TParams extends Record<string, string> = Record<string, string>,
  TData = unknown,
>(
  component: ConfiguredPage
): PageConfig<TParams, TData> =>
  component[PAGE_CONFIG_MARKER] as unknown as PageConfig<TParams, TData>;

// Regex pattern for definePage usage
const DEFINE_PAGE_REGEX = /definePage\s*\(/;

/**
 * Check if file uses definePage() by scanning source
 */
export const hasDefinePageUsage = (filePath: string): boolean => {
  try {
    const content = readFileSync(filePath, "utf-8");
    return DEFINE_PAGE_REGEX.test(content);
  } catch {
    return false;
  }
};

// Regex patterns defined at top level for performance
const STATIC_TYPE_REGEX = /type:\s*['"]static['"]/;
const GENERATE_PARAMS_REGEX = /generateParams\s*[:=]/;
const LOADER_REGEX = /loader\s*[:=]/;
const REVALIDATE_REGEX = /revalidate\s*:\s*(\d+)/;

/**
 * Extract page type from file content
 * Returns 'static' if type: 'static' is found, otherwise 'dynamic'
 */
export const extractPageType = (filePath: string): PageType => {
  try {
    const content = readFileSync(filePath, "utf-8");
    // Look for type: 'static' or type: "static"
    if (STATIC_TYPE_REGEX.test(content)) {
      return "static";
    }
    // Default to dynamic
    return "dynamic";
  } catch {
    return "dynamic";
  }
};

/**
 * Check if file has generateParams function
 */
export const hasGenerateParams = (filePath: string): boolean => {
  try {
    const content = readFileSync(filePath, "utf-8");
    // Look for generateParams: or generateParams =
    return GENERATE_PARAMS_REGEX.test(content);
  } catch {
    return false;
  }
};

/**
 * Check if file has loader function
 */
export const hasLoader = (filePath: string): boolean => {
  try {
    const content = readFileSync(filePath, "utf-8");
    // Look for loader: or loader =
    return LOADER_REGEX.test(content);
  } catch {
    return false;
  }
};

/**
 * Extract revalidate interval from file content
 * Returns the number of seconds, or undefined if not found
 */
export const extractRevalidate = (filePath: string): number | undefined => {
  try {
    const content = readFileSync(filePath, "utf-8");
    const match = content.match(REVALIDATE_REGEX);
    if (match?.[1]) {
      return Number.parseInt(match[1], 10);
    }
    return;
  } catch {
    return;
  }
};
