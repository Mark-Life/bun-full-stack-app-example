/**
 * React Server Components utilities
 * Handles detection of client components via type-safe wrapper
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ComponentType as ReactComponentType } from "react";

/**
 * Branded marker for client components
 */
const CLIENT_MARKER = Symbol.for("__isClient");

/**
 * Regex patterns for detecting client component usage
 */
const CLIENT_COMPONENT_REGEX = /clientComponent\s*\(/g;
const IMPORT_CLIENT_COMPONENT_REGEX =
  /import\s+.*\bclientComponent\b.*from\s+["'][^"']+["']/;
const EXPORT_CLIENT_COMPONENT_REGEX =
  /export\s+(?:default\s+)?(?:const|function|class)\s+\w+\s*=\s*clientComponent/;
const IMPORT_FROM_REGEX = /import\s+.*\s+from\s+["']([^"']+)["']/g;

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
  if (CLIENT_COMPONENT_REGEX.test(content)) {
    return true;
  }

  // Also check if file imports clientComponent (indicates it might be used)
  // This is a fallback for cases where the pattern might be more complex
  if (
    IMPORT_CLIENT_COMPONENT_REGEX.test(content) &&
    EXPORT_CLIENT_COMPONENT_REGEX.test(content)
  ) {
    return true;
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
 * Check if a relative import path is a client component
 */
const checkRelativeImport = (filePath: string, importPath: string): boolean => {
  const resolvedPath = join(dirname(filePath), importPath);
  const extensions = [".tsx", ".ts", ".jsx", ".js"];

  for (const ext of extensions) {
    const fullPath = resolvedPath.endsWith(ext)
      ? resolvedPath
      : `${resolvedPath}${ext}`;
    if (existsSync(fullPath) && hasUseClientDirective(fullPath)) {
      return true;
    }
  }

  return false;
};

/**
 * Extract import paths from file content
 */
const extractImportPaths = (content: string): string[] => {
  const importPaths: string[] = [];
  let match: RegExpExecArray | null = null;

  while (true) {
    match = IMPORT_FROM_REGEX.exec(content);
    if (match === null) {
      break;
    }
    const importPath = match[1];
    if (importPath) {
      importPaths.push(importPath);
    }
  }

  return importPaths;
};

/**
 * Scan imports in a file to find client component boundaries
 * Returns array of import paths that are client components
 */
export const findClientBoundaries = (filePath: string): string[] => {
  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, "utf-8");
  const importPaths = extractImportPaths(content);
  const clientImports: string[] = [];

  for (const importPath of importPaths) {
    if (importPath.startsWith(".")) {
      const isClient = checkRelativeImport(filePath, importPath);
      if (isClient) {
        clientImports.push(importPath);
      }
    }
  }

  return clientImports;
};

/**
 * Check if a relative import path is a client component (sync version)
 */
const checkRelativeImportSync = (
  filePath: string,
  importPath: string
): boolean => {
  const resolvedPath = join(dirname(filePath), importPath);
  const extensions = [".tsx", ".ts", ".jsx", ".js"];

  for (const ext of extensions) {
    const fullPath = resolvedPath.endsWith(ext)
      ? resolvedPath
      : `${resolvedPath}${ext}`;
    if (existsSync(fullPath) && hasUseClientDirective(fullPath)) {
      return true;
    }
  }

  return false;
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
  const importPaths = extractImportPaths(content);

  for (const importPath of importPaths) {
    if (importPath.startsWith(".")) {
      const isClient = checkRelativeImportSync(filePath, importPath);
      if (isClient) {
        return true;
      }
    }
  }

  return false;
};
