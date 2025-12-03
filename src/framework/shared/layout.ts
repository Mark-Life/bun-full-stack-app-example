/**
 * Layout configuration utilities
 * Handles layout configuration including client-side navigation opt-in
 */

import { readFileSync } from "node:fs";
import type { ComponentType as ReactComponentType, ReactNode } from "react";

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

// Regex pattern for defineLayout usage
const DEFINE_LAYOUT_REGEX = /defineLayout\s*\(/;

/**
 * Check if file uses defineLayout() by scanning source
 */
export const hasDefineLayoutUsage = (filePath: string): boolean => {
  try {
    const content = readFileSync(filePath, "utf-8");
    return DEFINE_LAYOUT_REGEX.test(content);
  } catch {
    return false;
  }
};

// Regex pattern for clientNavigation: true
const CLIENT_NAVIGATION_REGEX = /clientNavigation\s*:\s*true/;

/**
 * Check if layout has clientNavigation enabled
 * Returns true if clientNavigation: true is found in the file
 */
export const hasClientNavigation = (filePath: string): boolean => {
  try {
    const content = readFileSync(filePath, "utf-8");
    // Must have both defineLayout and clientNavigation: true
    return (
      DEFINE_LAYOUT_REGEX.test(content) && CLIENT_NAVIGATION_REGEX.test(content)
    );
  } catch {
    return false;
  }
};
