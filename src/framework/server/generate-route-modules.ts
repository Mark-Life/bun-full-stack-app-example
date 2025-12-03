import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RouteTree } from "@/framework/shared/router";

/**
 * Generate route-modules.generated.ts with static imports
 * This allows Bun --hot to properly track route modules
 * Only writes if content has changed to prevent hot reload loops
 */
export const generateRouteModulesFile = (routeTree: RouteTree): void => {
  const seenModules = new Set<string>();
  const seenLayouts = new Set<string>();

  const moduleImports: string[] = [];
  const moduleEntries: string[] = [];
  const layoutImports: string[] = [];
  const layoutEntries: string[] = [];

  let moduleIndex = 0;
  let layoutIndex = 0;

  // Process all route modules
  for (const [, routeInfo] of routeTree.routes.entries()) {
    // Process page module
    if (!seenModules.has(routeInfo.filePath)) {
      seenModules.add(routeInfo.filePath);
      const varName = `Module_${moduleIndex}`;
      moduleIndex += 1;
      // Convert ~/app/page.tsx to ../../app/page.tsx (relative to framework/server/)
      const importPath = routeInfo.filePath.replace("~/", "../../");
      moduleImports.push(`import * as ${varName} from "${importPath}";`);
      moduleEntries.push(`  ["${routeInfo.filePath}", ${varName}]`);
    }

    // Process parent layouts
    for (const layoutPath of routeInfo.parentLayouts) {
      if (!seenLayouts.has(layoutPath)) {
        seenLayouts.add(layoutPath);
        const varName = `Layout_${layoutIndex}`;
        layoutIndex += 1;
        const importPath = layoutPath.replace("~/", "../../");
        layoutImports.push(`import * as ${varName} from "${importPath}";`);
        layoutEntries.push(`  ["${layoutPath}", ${varName}]`);
      }
    }

    // Process direct layout
    if (routeInfo.layoutPath && !seenLayouts.has(routeInfo.layoutPath)) {
      seenLayouts.add(routeInfo.layoutPath);
      const varName = `Layout_${layoutIndex}`;
      layoutIndex += 1;
      const importPath = routeInfo.layoutPath.replace("~/", "../../");
      layoutImports.push(`import * as ${varName} from "${importPath}";`);
      layoutEntries.push(`  ["${routeInfo.layoutPath}", ${varName}]`);
    }
  }

  const code = `// AUTO-GENERATED - DO NOT EDIT
// Regenerated when routes change to enable Bun --hot tracking

${moduleImports.join("\n")}

${layoutImports.join("\n")}

export const routeModules = new Map<string, { default: unknown }>([
${moduleEntries.join(",\n")}
]);

export const layoutModules = new Map<string, { default: unknown }>([
${layoutEntries.join(",\n")}
]);
`;

  const outputPath = join(
    process.cwd(),
    "src/framework/server/route-modules.generated.ts"
  );

  // Only write if content changed to prevent Bun --hot reload loops
  if (existsSync(outputPath)) {
    const existingContent = readFileSync(outputPath, "utf-8");
    if (existingContent === code) {
      return; // No changes, skip write to prevent hot reload loop
    }
  }

  writeFileSync(outputPath, code);
};
