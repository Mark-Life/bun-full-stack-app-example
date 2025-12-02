import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { discoverRoutes } from "./router";

/**
 * Convert a route path to a TypeScript type
 * Static routes: "/about" -> "/about"
 * Dynamic routes: "/users/:id" -> `/users/${string}`
 * Catch-all routes: "/docs/*slug" -> `/docs/${string}`
 */
const routePathToType = (routePath: string): string => {
  // Handle root route
  if (routePath === "/") {
    return '"/"';
  }

  // Check for dynamic segments
  const hasDynamic = routePath.includes(":") || routePath.includes("*");

  if (!hasDynamic) {
    // Static route - return as literal type
    return `"${routePath}"`;
  }

  // Build template literal type for dynamic routes
  const parts = routePath.split("/").filter(Boolean);
  const typeParts: string[] = [];

  for (const part of parts) {
    if (part.startsWith(":")) {
      // Regular dynamic segment: :id -> ${string}
      // biome-ignore lint/suspicious/noTemplateCurlyInString: its expected
      typeParts.push("${string}");
    } else if (part.startsWith("*")) {
      // Catch-all segment: *slug -> ${string}
      // biome-ignore lint/suspicious/noTemplateCurlyInString: its expected
      typeParts.push("${string}");
    } else {
      // Static segment
      typeParts.push(part);
    }
  }

  // Reconstruct the path with template literal syntax
  const typeString =
    typeParts.length === 0 ? '"/"' : `\`/${typeParts.join("/")}\``;

  return typeString;
};

/**
 * Generate TypeScript type definitions for all routes
 */
export const generateRouteTypes = async (
  outputPath?: string
): Promise<void> => {
  const routeTree = discoverRoutes("./src/app");
  const routes = routeTree.routes;

  // Convert all route paths to TypeScript types
  const routeTypes = Array.from(routes.keys())
    .map((routePath) => routePathToType(routePath))
    .sort(); // Sort for consistent output

  // Generate the TypeScript file content
  const typeDefinitions = `// This file is auto-generated. Do not edit manually.
// Generated at: ${new Date().toISOString()}

/**
 * Union type of all valid route paths in the application.
 * Use this type for type-safe navigation with the Link component.
 * 
 * @example
 * \`\`\`tsx
 * import { Link } from "~/components/link";
 * 
 * <Link href="/about" />        // ✓ Valid
 * <Link href="/nonexistent" />  // ✗ Type error
 * \`\`\`
 */
export type ValidRoutes =
${routeTypes.map((type) => `  | ${type}`).join("\n")};
`;

  // Write to the specified path or default location
  const finalPath =
    outputPath ||
    join(process.cwd(), "src/framework/shared/routes.generated.ts");

  await writeFile(finalPath, typeDefinitions, "utf-8");

  console.log(
    `✅ Generated route types: ${routes.size} route(s) -> ${finalPath}`
  );
};
