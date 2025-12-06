/**
 * Layout configuration utilities
 */

import { readFileSync } from "node:fs";
import type { ComponentType as ReactComponentType, ReactNode } from "react";

/**
 * Define a layout component
 * Client navigation is now automatic for all routes
 *
 * @example Basic layout
 * ```tsx
 * export default defineLayout(({ children }) => (
 *   <div>{children}</div>
 * ));
 * ```
 */
export const defineLayout = <P extends { children: ReactNode }>(
  component: ReactComponentType<P>
): ReactComponentType<P> => component;

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
