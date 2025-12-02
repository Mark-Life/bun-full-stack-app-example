// This file is auto-generated. Do not edit manually.
// Generated at: 2025-12-02T13:49:36.722Z

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
  | "/about"
  | "/admin/products"
  | "/dashboard"
  | "/dashboard/analytics"
  | "/dashboard/profile"
  | "/dashboard/settings"
  | "/docs"
  | "/docs/getting-started"
  | "/landing"
  | "/products"
  | "/suspense-demo"
  | `/catch-all/${string}`
  | `/products/${string}`;
