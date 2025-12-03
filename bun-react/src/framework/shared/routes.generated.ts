// This file is auto-generated. Do not edit manually.
// Generated at: 2025-12-03T13:16:22.895Z

/**
 * Union type of all valid route paths in the application.
 * Use this type for type-safe navigation with the Link component.
 * 
 * @example
 * ```tsx
 * import { Link } from "~/components/link";
 * 
 * <Link href="/about" />        // ✓ Valid
 * <Link href="/nonexistent" />  // ✗ Type error
 * ```
 */
export type ValidRoutes =
  | "/"
  | "/demos/api"
  | "/demos/client-nav"
  | "/demos/client-nav/analytics"
  | "/demos/client-nav/profile"
  | "/demos/client-nav/settings"
  | "/demos/isr"
  | "/demos/isr/admin"
  | "/demos/ssr"
  | "/demos/static"
  | "/demos/suspense"
  | "/docs"
  | "/docs/getting-started"
  | `/demos/isr/${string}`;
