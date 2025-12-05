/**
 * Layout configuration utilities
 * Handles layout configuration including client-side navigation opt-in
 */

import { readFileSync } from "node:fs";
import type { ComponentType as ReactComponentType, ReactNode } from "react";

/**
 * Get transpiler instance lazily (only in Bun environment)
 * This is only used server-side for code analysis
 */
const getTranspiler = (): Bun.Transpiler | null => {
  if (typeof Bun === "undefined") {
    return null;
  }
  // Create transpiler lazily to avoid issues in browser context
  if (!getTranspiler.transpiler) {
    getTranspiler.transpiler = new Bun.Transpiler({ loader: "tsx" });
  }
  return getTranspiler.transpiler;
};
// Store transpiler instance on function to persist across calls
getTranspiler.transpiler = null as Bun.Transpiler | null;

/**
 * Layout configuration attached to components
 */
export interface LayoutConfig {
  clientNavigation?: boolean;
}

/**
 * Branded marker for configured layouts
 */
const LAYOUT_CONFIG_MARKER = Symbol.for("__layoutConfig");

/**
 * Configured layout component type
 */
export type ConfiguredLayout<
  P extends { children: ReactNode } = { children: ReactNode },
> = ReactComponentType<P> & {
  [LAYOUT_CONFIG_MARKER]: LayoutConfig;
};

/**
 * Define a layout with optional client-side navigation
 *
 * @example Basic layout
 * ```tsx
 * export default defineLayout({
 *   component: ({ children }) => <div>{children}</div>
 * });
 * ```
 *
 * @example Layout with client navigation
 * ```tsx
 * export default defineLayout({
 *   clientNavigation: true,
 *   component: ({ children }) => (
 *     <div className="dashboard-shell">
 *       <Sidebar />
 *       <main>{children}</main>
 *     </div>
 *   ),
 * });
 * ```
 */
export const defineLayout = <P extends { children: ReactNode }>(layoutConfig: {
  component: ReactComponentType<P>;
  clientNavigation?: boolean;
}): ConfiguredLayout<P> => {
  const { component, clientNavigation = false } = layoutConfig;

  // Attach config to component
  const attachedConfig: LayoutConfig = {
    ...(clientNavigation && { clientNavigation: true }),
  };
  (component as ConfiguredLayout<P>)[LAYOUT_CONFIG_MARKER] = attachedConfig;

  return component as ConfiguredLayout<P>;
};

/**
 * Check if component has layout configuration
 */
export const hasLayoutConfig = (
  component: unknown
): component is ConfiguredLayout =>
  typeof component === "function" && LAYOUT_CONFIG_MARKER in component;

/**
 * Get layout configuration from component
 */
export const getLayoutConfig = (component: ConfiguredLayout): LayoutConfig =>
  component[LAYOUT_CONFIG_MARKER] as LayoutConfig;

/**
 * Check if file uses defineLayout() by scanning imports and content
 */
export const hasDefineLayoutUsage = (filePath: string): boolean => {
  try {
    const content = readFileSync(filePath, "utf-8");

    // Check if defineLayout is imported from layout module
    // Only in server/Bun environment
    const transpiler = getTranspiler();
    if (transpiler) {
      try {
        const { imports } = transpiler.scan(content);
        const hasDefineLayoutImport = imports.some(
          (imp) =>
            imp.path.includes("layout") ||
            imp.path.includes("defineLayout") ||
            (imp.kind === "import-statement" &&
              imp.path.includes("framework/shared/layout"))
        );
        
        // Also check for direct usage in content
        if (hasDefineLayoutImport && DEFINE_LAYOUT_USAGE_REGEX.test(content)) {
          return true;
        }
      } catch {
        // If parsing fails, fall back to regex-only check
      }
    }

    // Fallback: simple regex check for defineLayout( usage
    return DEFINE_LAYOUT_USAGE_REGEX.test(content);
  } catch {
    return false;
  }
};

// Regex patterns defined at top level for performance
const CLIENT_NAVIGATION_REGEX = /clientNavigation\s*:\s*true/;
const DEFINE_LAYOUT_USAGE_REGEX = /defineLayout\s*\(/;

/**
 * Check if layout has clientNavigation enabled
 * Returns true if clientNavigation: true is found in the file
 */
export const hasClientNavigation = (filePath: string): boolean => {
  try {
    const content = readFileSync(filePath, "utf-8");
    // Must have both defineLayout and clientNavigation: true
    return (
      hasDefineLayoutUsage(filePath) && CLIENT_NAVIGATION_REGEX.test(content)
    );
  } catch {
    return false;
  }
};
