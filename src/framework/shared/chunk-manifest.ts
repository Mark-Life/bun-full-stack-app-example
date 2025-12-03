/**
 * Chunk manifest for route-specific chunk preloading
 * Maps route paths to their required chunks with sizes for prioritization
 */
export type ChunkManifest = Record<
  string,
  Array<{ path: string; size: number }>
>;

/**
 * Global chunk manifest (loaded at server startup in production)
 */
let chunkManifest: ChunkManifest | null = null;

/**
 * Set the chunk manifest (called from server/index.ts at startup)
 */
export const setChunkManifest = (manifest: ChunkManifest | null): void => {
  chunkManifest = manifest;
};

/**
 * Get chunks for a specific route path
 * Returns chunks sorted by size (largest first) for prioritization
 */
export const getRouteChunks = (
  routePath: string
): Array<{ path: string; size: number }> | undefined => {
  if (!chunkManifest) {
    return;
  }

  // Try exact match first
  const chunks = chunkManifest[routePath];
  if (chunks) {
    return chunks;
  }

  // Try with trailing slash
  const withSlash = routePath === "/" ? "/" : `${routePath}/`;
  return chunkManifest[withSlash];
};
