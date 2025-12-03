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
const USE_CLIENT_DIRECTIVE_REGEX = /^\s*["']use client["'];?\s*$/m;
const IMPORT_CLIENT_COMPONENT_REGEX =
  /import\s+.*\bclientComponent\b.*from\s+["'][^"']+["']/;
const EXPORT_CLIENT_COMPONENT_REGEX =
  /export\s+(?:default\s+)?(?:const|function|class)\s+\w+\s*=\s*clientComponent/;
// Use [\s\S]*? to match any character including newlines (non-greedy)
const IMPORT_FROM_REGEX = /import\s+[\s\S]*?\s+from\s+["']([^"']+)["']/g;

/**
 * Type-safe client component marker
 */
export type ClientComponent<P = Record<string, unknown>> =
  ReactComponentType<P> & { [CLIENT_MARKER]: true };

/**
 * Type-safe wrapper to mark a component as client-side
 * Components render fully on server (SSR) with initial hook values.
 * Then hydrate on client for interactivity.
 * Usage: export const MyComponent = clientComponent((props) => { ... });
 */
export const clientComponent = <P = Record<string, unknown>>(
  Component: ReactComponentType<P>
): ClientComponent<P> => {
  (Component as ClientComponent<P>)[CLIENT_MARKER] = true;
  return Component as ClientComponent<P>;
};

/**
 * Check if a file is a client component
 * Detects both "use client" directive (shadcn/ui convention) and clientComponent() wrapper
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
 * Check if content uses clientComponent wrapper OR "use client" directive
 * Looks for patterns like:
 * - "use client" directive at the top of the file (shadcn/ui convention)
 * - export const X = clientComponent(...)
 * - export default clientComponent(...)
 * - const X = clientComponent(...)
 */
const hasClientComponentUsage = (content: string): boolean => {
  // Check for "use client" directive (must be at start of file, before any imports)
  // Check first 200 characters to catch directive at the beginning
  const firstLines = content.slice(0, 200);
  if (USE_CLIENT_DIRECTIVE_REGEX.test(firstLines)) {
    return true;
  }

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
 * Checks if file uses "use client" directive or clientComponent wrapper
 */
export const getComponentType = (filePath: string): ComponentType =>
  hasUseClientDirective(filePath) ? "client" : "server";

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
 * Supports both relative imports (./...) and aliased imports (@/... and ~/...)
 */
export const findClientBoundaries = (filePath: string): string[] => {
  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, "utf-8");
  const importPaths = extractImportPaths(content);
  const clientImports: string[] = [];

  for (const importPath of importPaths) {
    // Check relative imports (./...) and aliased imports (@/... and ~/...)
    if (
      importPath.startsWith(".") ||
      importPath.startsWith("@/") ||
      importPath.startsWith("~/")
    ) {
      const isClient = checkImportSync(filePath, importPath);
      if (isClient) {
        clientImports.push(importPath);
      }
    }
  }

  return clientImports;
};

/**
 * Resolve aliased import path to actual file path
 * Handles @/ and ~/ aliases that map to src/
 */
const resolveAliasedImport = (
  filePath: string,
  importPath: string
): string | null => {
  // Extract project root (everything up to /src/)
  // filePath is like: /path/to/project/src/app/page.tsx
  // We need: /path/to/project/src/
  const srcIndex = filePath.indexOf("/src/");
  if (srcIndex === -1) {
    return null;
  }

  const srcDir = filePath.slice(0, srcIndex + 5); // +5 for "/src/"

  // Handle @/ alias -> src/
  if (importPath.startsWith("@/")) {
    return join(srcDir, importPath.slice(2));
  }

  // Handle ~/ alias -> src/
  if (importPath.startsWith("~/")) {
    return join(srcDir, importPath.slice(2));
  }

  return null;
};

/**
 * Check if an import path (relative or aliased) is a client component (sync version)
 */
const checkImportSync = (filePath: string, importPath: string): boolean => {
  let resolvedPath: string | null = null;

  // Handle relative imports
  if (importPath.startsWith(".")) {
    resolvedPath = join(dirname(filePath), importPath);
  }
  // Handle aliased imports (@/ and ~/)
  else if (importPath.startsWith("@/") || importPath.startsWith("~/")) {
    resolvedPath = resolveAliasedImport(filePath, importPath);
  }
  // Skip node_modules and other external imports
  else {
    return false;
  }

  if (!resolvedPath) {
    return false;
  }

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
 * Supports both relative imports (./...) and aliased imports (@/... and ~/...)
 */
export const hasClientBoundariesSync = (filePath: string): boolean => {
  if (!existsSync(filePath)) {
    return false;
  }

  const content = readFileSync(filePath, "utf-8");
  const importPaths = extractImportPaths(content);

  for (const importPath of importPaths) {
    // Check relative imports (./...) and aliased imports (@/... and ~/...)
    if (
      importPath.startsWith(".") ||
      importPath.startsWith("@/") ||
      importPath.startsWith("~/")
    ) {
      const isClient = checkImportSync(filePath, importPath);
      if (isClient) {
        return true;
      }
    }
  }

  return false;
};
