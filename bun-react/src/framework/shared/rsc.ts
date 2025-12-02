/**
 * React Server Components utilities
 * Handles detection of "use client" directive and component classification
 */

import { existsSync, readFileSync } from "fs";

/**
 * Check if a file has the "use client" directive at the top
 * The directive must be at the very beginning of the file (after optional comments)
 */
export const hasUseClientDirective = (filePath: string): boolean => {
  if (!existsSync(filePath)) {
    return false;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    return isClientDirective(content);
  } catch {
    return false;
  }
};

/**
 * Check if content has "use client" directive
 * Supports both single and double quotes
 */
export const isClientDirective = (content: string): boolean => {
  // Remove leading whitespace and comments to find the directive
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Skip single-line comments
    if (trimmed.startsWith("//")) continue;

    // Skip multi-line comment start (simplified - doesn't handle all cases)
    if (trimmed.startsWith("/*")) continue;
    if (trimmed.startsWith("*")) continue;

    // Check for "use client" directive
    if (trimmed === '"use client";' || trimmed === "'use client';") {
      return true;
    }
    if (trimmed === '"use client"' || trimmed === "'use client'") {
      return true;
    }

    // If we hit any other code, the directive wasn't at the top
    break;
  }

  return false;
};

/**
 * Component type classification
 */
export type ComponentType = "server" | "client";

/**
 * Determine component type from file path
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
  let match;

  while ((match = importRegex.exec(content)) !== null) {
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
  let match;

  const { dirname, join } = require("path");

  while ((match = importRegex.exec(content)) !== null) {
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
