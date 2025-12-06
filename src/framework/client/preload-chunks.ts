/**
 * Chunk preloading utilities for route navigation
 * Preloads JavaScript chunks needed for routes using modulepreload
 */

/**
 * Set to track already-loaded chunks to avoid duplicate preloads
 */
const loadedChunks = new Set<string>();

/**
 * Preload a single chunk using modulepreload link tag
 *
 * @param chunkPath - Path to the chunk file
 */
const preloadChunk = (chunkPath: string): void => {
  // Skip if already loaded
  if (loadedChunks.has(chunkPath)) {
    return;
  }

  // Check if link already exists
  const existingLink = document.querySelector(
    `link[rel="modulepreload"][href="${chunkPath}"]`
  );
  if (existingLink) {
    loadedChunks.add(chunkPath);
    return;
  }

  // Create modulepreload link
  const link = document.createElement("link");
  link.rel = "modulepreload";
  link.href = chunkPath;
  document.head.appendChild(link);

  // Track as loaded
  loadedChunks.add(chunkPath);
};

/**
 * Preload multiple chunks for a route
 * Uses modulepreload for modern browsers
 *
 * @param chunks - Array of chunk paths to preload
 */
export const preloadChunks = (chunks: string[]): void => {
  if (typeof document === "undefined") {
    return;
  }

  for (const chunk of chunks) {
    preloadChunk(chunk);
  }
};
