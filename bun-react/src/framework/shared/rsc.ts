/**
 * React Server Components utilities
 * Handles detection of client components via type-safe wrapper
 */

import { existsSync, readFileSync } from "fs";
import type { ComponentType as ReactComponentType } from "react";

/**
 * Branded marker for client components
 */
const CLIENT_MARKER = Symbol.for("__isClient");

/**
 * Type-safe client component marker
 */
export type ClientComponent<P = Record<string, unknown>> =
  ReactComponentType<P> & { [CLIENT_MARKER]: true };

/**
 * Type-safe wrapper to mark a component as client-side
 * Usage: export const MyComponent = clientComponent((props) => { ... });
 */
export const clientComponent = <P = Record<string, unknown>>(
  Component: ReactComponentType<P>
): ClientComponent<P> => {
  (Component as ClientComponent<P>)[CLIENT_MARKER] = true;
  return Component as ClientComponent<P>;
};

/**
 * Check if a file uses clientComponent wrapper
 * Scans source code for clientComponent( usage patterns
 */
export const hasUseClientDirective = (filePath: string): boolean => {
  if (!existsSync(filePath)) {
    return false;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    return hasClientComponentUsage(content);
  } catch {
    return false;
  }
};

/**
 * Check if content uses clientComponent wrapper
 * Looks for patterns like:
 * - export const X = clientComponent(...)
 * - export default clientComponent(...)
 * - const X = clientComponent(...)
 */
const hasClientComponentUsage = (content: string): boolean => {
  // Check for clientComponent( usage
  // Matches: clientComponent(, clientComponent (with optional whitespace)
  const clientComponentRegex = /clientComponent\s*\(/g;

  if (clientComponentRegex.test(content)) {
    return true;
  }

  // Also check if file imports clientComponent (indicates it might be used)
  // This is a fallback for cases where the pattern might be more complex
  const importRegex = /import\s+.*\bclientComponent\b.*from\s+["'][^"']+["']/;
  if (importRegex.test(content)) {
    // If it imports clientComponent, check if it's actually used
    // Look for export statements that might use it
    const exportRegex =
      /export\s+(?:default\s+)?(?:const|function|class)\s+\w+\s*=\s*clientComponent/;
    if (exportRegex.test(content)) {
      return true;
    }
  }

  return false;
};

/**
 * Component type classification
 */
export type ComponentType = "server" | "client";

/**
 * Determine component type from file path
 * Checks if file uses clientComponent wrapper
 */
export const getComponentType = (filePath: string): ComponentType =>
  hasUseClientDirective(filePath) ? "client" : "server";

/**
 * Scan imports in a file to find client component boundaries
 * Returns array of import paths that are client components
 */
export const findClientBoundaries = async (
  filePath: string
): Promise<string[]> => {
  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, "utf-8");
  const clientImports: string[] = [];

  // Simple regex to find imports (doesn't handle all edge cases)
  const importRegex = /import\s+.*\s+from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null = null;

  while (true) {
    match = importRegex.exec(content);
    if (match === null) break;
    const importPath = match[1];
    if (importPath) {
      // Resolve relative imports
      if (importPath.startsWith(".")) {
        const { dirname, join } = await import("path");
        const resolvedPath = join(dirname(filePath), importPath);

        // Try common extensions
        const extensions = [".tsx", ".ts", ".jsx", ".js"];
        for (const ext of extensions) {
          const fullPath = resolvedPath.endsWith(ext)
            ? resolvedPath
            : `${resolvedPath}${ext}`;
          if (existsSync(fullPath) && hasUseClientDirective(fullPath)) {
            clientImports.push(importPath);
            break;
          }
        }
      }
    }
  }

  return clientImports;
};

/**
 * Sync version of findClientBoundaries for use during route discovery
 * Returns true if the file imports any client components
 */
export const hasClientBoundariesSync = (filePath: string): boolean => {
  if (!existsSync(filePath)) {
    return false;
  }

  const content = readFileSync(filePath, "utf-8");

  // Simple regex to find imports
  const importRegex = /import\s+.*\s+from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null = null;

  const { dirname, join } = require("path");

  while (true) {
    match = importRegex.exec(content);
    if (match === null) break;
    const importPath = match[1];
    if (importPath) {
      // Resolve relative imports
      if (importPath.startsWith(".")) {
        const resolvedPath = join(dirname(filePath), importPath);

        // Try common extensions
        const extensions = [".tsx", ".ts", ".jsx", ".js"];
        for (const ext of extensions) {
          const fullPath = resolvedPath.endsWith(ext)
            ? resolvedPath
            : `${resolvedPath}${ext}`;
          if (existsSync(fullPath) && hasUseClientDirective(fullPath)) {
            return true;
          }
        }
      }
    }
  }

  return false;
};
