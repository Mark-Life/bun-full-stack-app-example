/**
 * Navigation payload types for client-side navigation
 * Used by /__data/* endpoints to return route data for SPA navigation
 */

import type { PageType } from "./page";

/**
 * Head metadata for document head updates
 */
export interface HeadData {
  title?: string;
  description?: string;
  canonical?: string;
  openGraph?: Record<string, string>;
}

/**
 * Route metadata included in navigation payload
 */
export interface RouteMetadata {
  path: string;
  pageType: PageType;
  hasClientComponents: boolean;
  params: Record<string, string>;
}

/**
 * Navigation payload returned by /__data/* endpoints
 * Contains all data needed for client-side navigation
 */
export interface NavigationPayload {
  /** Page data from loader */
  data: unknown;

  /** Route metadata */
  route: RouteMetadata;

  /** Chunks to preload (JS only, CSS loaded globally) */
  chunks: string[];

  /** Head/meta updates */
  head: HeadData;

  /** Navigation signals */
  redirect?: string;
  notFound?: boolean;

  /** Security hash for payload verification */
  hash: string;
}
