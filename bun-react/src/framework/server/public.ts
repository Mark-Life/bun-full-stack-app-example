import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { BunFile } from "bun";

/**
 * Recursively discover all files in the public directory
 * and create route mappings for them
 *
 * @param dir - The public directory path (e.g., "./src/public")
 * @returns Record mapping URL paths to BunFile instances
 */
export const discoverPublicAssets = async (
	dir: string,
): Promise<Record<string, BunFile>> => {
	const assets: Record<string, BunFile> = {};

	/**
	 * Recursively scan directory for files
	 */
	const scanDirectory = async (currentDir: string, baseDir: string) => {
		try {
			const entries = await readdir(currentDir, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = join(currentDir, entry.name);

				if (entry.isDirectory()) {
					// Recursively scan subdirectories
					await scanDirectory(fullPath, baseDir);
				} else if (entry.isFile()) {
					// Create URL path by removing baseDir prefix and normalizing separators
					const relativePath = relative(baseDir, fullPath);
					// Convert path separators to URL slashes
					const urlPath = `/${relativePath.split(sep).join("/")}`;

					// Create File instance for the asset
					assets[urlPath] = Bun.file(fullPath);
				}
			}
		} catch (error) {
			// Directory doesn't exist or can't be read - silently skip
			// This allows the server to start even if public/ doesn't exist yet
			if (
				error instanceof Error &&
				"code" in error &&
				error.code !== "ENOENT"
			) {
				console.warn(`Failed to scan public directory ${currentDir}:`, error);
			}
		}
	};

	await scanDirectory(dir, dir);

	return assets;
};
